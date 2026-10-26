import json
import math
from typing import Any, Awaitable, Callable, Dict, List, Optional, Sequence, Tuple

import httpx

from app.core.config import settings
from app.models.hazard_map_layer import HazardMapLayer
from app.models.road_hazard import RoadHazardReport
from app.services.greedy_escape import find_escape_plan, haversine_meters
from app.services.groq_spatial_fallback import choose_ai_escape_waypoint
from app.services.mid_route_hazard import first_hazard_interception, resolve_cardinal_escape
from app.services.valhalla_routing import decode_polyline6, request_valhalla_route

Coordinate = Tuple[float, float]


def haversine_meters(latitude_a: float, longitude_a: float, latitude_b: float, longitude_b: float) -> float:
    earth_radius = 6371000
    latitude_delta = math.radians(latitude_b - latitude_a)
    longitude_delta = math.radians(longitude_b - longitude_a)
    a = (
        math.sin(latitude_delta / 2) ** 2
        + math.cos(math.radians(latitude_a))
        * math.cos(math.radians(latitude_b))
        * math.sin(longitude_delta / 2) ** 2
    )
    return earth_radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def decode_polyline5(encoded: str) -> List[List[float]]:
    coordinates: List[List[float]] = []
    index = 0
    latitude = 0
    longitude = 0

    while index < len(encoded):
        for component in ("lat", "lon"):
            shift = 0
            result = 0
            while True:
                byte = ord(encoded[index]) - 63
                index += 1
                result |= (byte & 0x1F) << shift
                shift += 5
                if byte < 0x20:
                    break
            delta = ~(result >> 1) if result & 1 else (result >> 1)
            if component == "lat":
                latitude += delta
            else:
                longitude += delta
        coordinates.append([longitude / 1e5, latitude / 1e5])

    return coordinates


def destination_point(latitude: float, longitude: float, distance_meters: float, bearing_radians: float) -> Coordinate:
    earth_radius = 6371000
    angular_distance = distance_meters / earth_radius
    latitude_rad = math.radians(latitude)
    longitude_rad = math.radians(longitude)

    destination_latitude = math.asin(
        math.sin(latitude_rad) * math.cos(angular_distance)
        + math.cos(latitude_rad) * math.sin(angular_distance) * math.cos(bearing_radians)
    )
    destination_longitude = longitude_rad + math.atan2(
        math.sin(bearing_radians) * math.sin(angular_distance) * math.cos(latitude_rad),
        math.cos(angular_distance) - math.sin(latitude_rad) * math.sin(destination_latitude),
    )
    return math.degrees(destination_latitude), math.degrees(destination_longitude)


def exclusion_polygon(latitude: float, longitude: float, radius_meters: float, steps: int = 16) -> List[List[float]]:
    ring = []
    for step in range(steps):
        bearing = 2 * math.pi * step / steps
        point_latitude, point_longitude = destination_point(latitude, longitude, radius_meters, bearing)
        ring.append([point_longitude, point_latitude])  # GeoJSON expects [lon, lat]
    return ring


def layer_polygon(layer: HazardMapLayer) -> Optional[List[List[float]]]:
    geometry = layer.geometry or {}
    if geometry.get("type") != "Polygon":
        return None
    coordinates = geometry.get("coordinates") or []
    if not coordinates or not coordinates[0] or len(coordinates[0]) < 4:
        return None
    ring = [[float(point[0]), float(point[1])] for point in coordinates[0] if len(point) >= 2]
    if ring and ring[0] != ring[-1]:
        ring.append(ring[0])
    return ring if len(ring) >= 4 else None


def build_hazard_exclusion_model(
    road_hazards: Sequence[RoadHazardReport],
    noah_layers: Sequence[HazardMapLayer],
) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    area_features: List[Dict[str, Any]] = []
    excluded_zones: List[Dict[str, Any]] = []

    for hazard in road_hazards:
        name = f"road_hazard_{hazard.id}"
        polygon = exclusion_polygon(hazard.latitude, hazard.longitude, max(1, hazard.radius_meters))
        area_features.append({
            "type": "Feature",
            "id": name,
            "properties": {},
            "geometry": {"type": "Polygon", "coordinates": [polygon]},
        })
        excluded_zones.append({"type": "road_hazard", "id": hazard.id, "area": name})

    for layer in noah_layers:
        polygon = layer_polygon(layer)
        if not polygon:
            continue
        name = f"noah_high_{layer.id}"
        area_features.append({
            "type": "Feature",
            "id": name,
            "properties": {},
            "geometry": {"type": "Polygon", "coordinates": [polygon]},
        })
        excluded_zones.append({
            "type": "noah_high_risk_zone",
            "id": layer.id,
            "source_grid_id": layer.source_grid_id,
            "hazard_score": layer.hazard_score,
            "area": name,
        })

    priority_rules = [
        {"if": f"in_{area_feature['id']}", "multiply_by": "0"}
        for area_feature in area_features
    ]
    return {
        "priority": priority_rules,
        "areas": {"type": "FeatureCollection", "features": area_features},
    }, excluded_zones


def build_valhalla_exclusion_polygons(
    road_hazards: Sequence[RoadHazardReport],
    noah_layers: Sequence[HazardMapLayer],
) -> List[List[List[float]]]:
    polygons: List[List[List[float]]] = []
    for hazard in road_hazards:
        polygons.append(exclusion_polygon(
            hazard.latitude,
            hazard.longitude,
            max(1, hazard.radius_meters),
        ))
    for layer in noah_layers:
        polygon = layer_polygon(layer)
        if polygon:
            polygons.append(polygon)
    return polygons


def extract_valhalla_geometry(trip: Dict[str, Any]) -> List[List[float]]:
    coordinates: List[List[float]] = []
    for leg in trip.get("legs") or []:
        shape = leg.get("shape")
        if not shape:
            continue
        leg_coordinates = decode_polyline6(shape)
        if coordinates and leg_coordinates and coordinates[-1] == leg_coordinates[0]:
            coordinates.extend(leg_coordinates[1:])
        else:
            coordinates.extend(leg_coordinates)
    return coordinates


def point_to_segment_meters(
    point_latitude: float,
    point_longitude: float,
    start: Sequence[float],
    end: Sequence[float],
) -> float:
    start_longitude, start_latitude = start
    end_longitude, end_latitude = end
    mean_latitude = math.radians((start_latitude + end_latitude) / 2)
    meters_per_degree_latitude = 111320
    meters_per_degree_longitude = 111320 * math.cos(mean_latitude)

    start_x = start_longitude * meters_per_degree_longitude
    start_y = start_latitude * meters_per_degree_latitude
    end_x = end_longitude * meters_per_degree_longitude
    end_y = end_latitude * meters_per_degree_latitude
    point_x = point_longitude * meters_per_degree_longitude
    point_y = point_latitude * meters_per_degree_latitude

    delta_x = end_x - start_x
    delta_y = end_y - start_y
    if delta_x == 0 and delta_y == 0:
        return math.hypot(point_x - start_x, point_y - start_y)

    projection = ((point_x - start_x) * delta_x + (point_y - start_y) * delta_y) / (delta_x ** 2 + delta_y ** 2)
    projection = max(0, min(1, projection))
    closest_x = start_x + projection * delta_x
    closest_y = start_y + projection * delta_y
    return math.hypot(point_x - closest_x, point_y - closest_y)


def route_intersects_hazard(coordinates: List[List[float]], hazard: RoadHazardReport) -> bool:
    if not coordinates:
        return False
    if len(coordinates) == 1:
        longitude, latitude = coordinates[0]
        return haversine_meters(latitude, longitude, hazard.latitude, hazard.longitude) <= hazard.radius_meters

    for index in range(len(coordinates) - 1):
        distance = point_to_segment_meters(
            hazard.latitude,
            hazard.longitude,
            coordinates[index],
            coordinates[index + 1],
        )
        if distance <= hazard.radius_meters:
            return True
    return False


def hazards_on_route(coordinates: List[List[float]], hazards: Sequence[RoadHazardReport]) -> List[RoadHazardReport]:
    return [hazard for hazard in hazards if route_intersects_hazard(coordinates, hazard)]


def layer_near_route(coordinates: List[List[float]], layer: HazardMapLayer) -> bool:
    ring = layer_polygon(layer)
    if not ring or len(coordinates) < 2:
        return False
    vertices = ring[:-1]
    center_longitude = sum(point[0] for point in vertices) / len(vertices)
    center_latitude = sum(point[1] for point in vertices) / len(vertices)
    radius = max(
        haversine_meters(center_latitude, center_longitude, latitude, longitude)
        for longitude, latitude in vertices
    )
    return any(
        point_to_segment_meters(center_latitude, center_longitude, start, end) <= radius
        for start, end in zip(coordinates, coordinates[1:])
    )


def extract_geometry(path: Dict[str, Any]) -> List[List[float]]:
    points = path.get("points")
    if points:
        # If points is a GeoJSON dict with coordinates
        if isinstance(points, dict) and points.get("type") == "LineString":
            return points.get("coordinates", [])
        # If points_encoded is false, points is already an array of [lon, lat]
        elif isinstance(points, list) and len(points) > 0:
            return points
        # If points_encoded is true, decode the polyline
        elif isinstance(points, str):
            return decode_polyline5(points)
    # Fallback: check if coordinates are directly in the response
    coordinates = path.get("coordinates")
    if coordinates and isinstance(coordinates, list):
        return coordinates
    return []


def serialize_hazard(hazard: RoadHazardReport) -> Dict[str, Any]:
    return {
        "id": hazard.id,
        "hazard_type": hazard.hazard_type,
        "description": hazard.description,
        "latitude": hazard.latitude,
        "longitude": hazard.longitude,
        "radius_meters": hazard.radius_meters,
        "severity": hazard.severity,
        "road_name": hazard.road_name,
    }


def format_routing_error(error: Exception) -> str:
    text = str(error).strip()
    cause = error.__cause__ or getattr(error, "__context__", None)
    if text:
        return f"{type(error).__name__}: {text}"
    if cause:
        return f"{type(error).__name__}: {type(cause).__name__}: {cause}"
    return f"{type(error).__name__}: routing host did not respond (connection timed out)"


EMERGENCY_ROUTE_WARNING = "PLEASE TAKE CAUTION. YOU ARE GOING THROUGH A HAZARDOUS AREA."
ROUTE_TIER_COLORS = {
    1: "#10b981",
    2: "#f59e0b",
    3: "#ef4444",
}


def _route_variant(
    *,
    route_id: str,
    label: str,
    tier: int,
    route_status: str,
    intersects_hazard: bool,
    geometry: Dict[str, Any],
    distance_meters: Optional[float],
    duration_seconds: Optional[float],
    engine: str,
    algorithm: str,
    avoided_hazards: Sequence[Dict[str, Any]] = (),
    warning_message: Optional[str] = None,
    route_color: str = "#2563eb",
) -> Dict[str, Any]:
    return {
        "id": route_id,
        "label": label,
        "tier": tier,
        "route_status": route_status,
        "intersects_hazard": intersects_hazard,
        "warning_message": warning_message,
        "route_color": route_color,
        "engine": engine,
        "algorithm": algorithm,
        "costing": "pedestrian",
        "distance_meters": distance_meters,
        "duration_seconds": duration_seconds,
        "geometry": geometry,
        "avoided_hazards": list(avoided_hazards),
    }


def _route_response(primary: Dict[str, Any], variants: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    return {
        **primary,
        "routes": list(variants),
        "rerouted": primary["id"] in {
            "safe-reroute",
            "greedy-escape-reroute",
            "mid-route-escape-reroute",
        },
        "fallback": primary["route_status"] == "fallback",
        "message": primary.get("message") or "Walking route calculated.",
        "route_status": primary["route_status"],
        "intersects_hazard": primary["intersects_hazard"],
        "warning_message": primary["warning_message"],
        "selected_route_id": primary["id"],
    }


async def _try_ai_dynamic_bypass(
    *,
    origin_latitude: float,
    origin_longitude: float,
    destination_latitude: float,
    destination_longitude: float,
    active_hazards: Sequence[RoadHazardReport],
    noah_layers: Sequence[HazardMapLayer],
    cardinal_scan: Sequence[Dict[str, Any]],
) -> Optional[Tuple[Dict[str, Any], Dict[str, Any], List[float]]]:
    """Return an AI route variant only when it is snapped and hazard-free."""

    if not active_hazards:
        return None

    context = {
        "start": [origin_latitude, origin_longitude],
        "destination": [destination_latitude, destination_longitude],
        "hazards": [
            {
                "id": int(hazard.id),
                "center": [float(hazard.latitude), float(hazard.longitude)],
                "radius_meters": float(hazard.radius_meters),
            }
            for hazard in active_hazards
        ],
        "cardinal_vectors": list(cardinal_scan),
    }
    try:
        ai_waypoint = await choose_ai_escape_waypoint(context)
        snap_path = await request_graphhopper_route(
            ai_waypoint["waypoint_lat"],
            ai_waypoint["waypoint_lon"],
            destination_latitude,
            destination_longitude,
        )
        snap_coordinates = extract_geometry(snap_path)
        if len(snap_coordinates) < 2:
            raise ValueError("AI waypoint could not be snapped to a road node")

        snapped_waypoint = snap_coordinates[0]
        ai_trip = await request_valhalla_route(
            origin_latitude,
            origin_longitude,
            destination_latitude,
            destination_longitude,
            exclude_polygons=build_valhalla_exclusion_polygons(active_hazards, noah_layers),
            locations=[
                {"lat": origin_latitude, "lon": origin_longitude, "type": "break"},
                {
                    "lat": snapped_waypoint[1],
                    "lon": snapped_waypoint[0],
                    "type": "through",
                    "radius": 100,
                    "node_snap_tolerance": 75,
                },
                {"lat": destination_latitude, "lon": destination_longitude, "type": "break"},
            ],
        )
        ai_coordinates = extract_valhalla_geometry(ai_trip)
        if len(ai_coordinates) < 2 or first_hazard_interception(ai_coordinates, active_hazards):
            raise ValueError("AI bypass remained inside an active hazard")

        summary = ai_trip.get("summary") or {}
        variant = _route_variant(
            route_id="ai-optimized-dynamic-bypass",
            label="AI-Optimized Dynamic Bypass",
            tier=2,
            route_status="safe",
            intersects_hazard=False,
            warning_message=None,
            geometry={"type": "LineString", "coordinates": ai_coordinates},
            distance_meters=float(summary.get("length") or 0) * 1000,
            duration_seconds=float(summary.get("time") or 0),
            engine="valhalla",
            algorithm="groq_spatial_bypass",
            avoided_hazards=[serialize_hazard(hazard) for hazard in active_hazards],
            route_color=ROUTE_TIER_COLORS[2],
        )
        variant["ai_reasoning"] = ai_waypoint["reasoning"]
        return variant, ai_waypoint, snapped_waypoint
    except Exception as error:  # AI is advisory; deterministic fallback remains authoritative.
        print(f"[groq-spatial] AI bypass failed: {type(error).__name__}: {error}")
        return None


async def request_graphhopper_route(
    origin_latitude: float,
    origin_longitude: float,
    destination_latitude: float,
    destination_longitude: float,
    custom_model: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    url = (settings.GRAPHHOPPER_URL or "").strip()
    if not url:
        raise ValueError("GRAPHHOPPER_URL is empty")

    # GraphHopper API uses POST with JSON body
    payload = {
        "points": [
            [origin_longitude, origin_latitude],
            [destination_longitude, destination_latitude]
        ],
        "snap_preventions": ["motorway", "ferry", "tunnel"],
        "profile": "foot",
        "locale": "en",
        "instructions": False,
        "calc_points": True,
        "points_encoded": False,
    }
    
    if custom_model:
        payload["custom_model"] = custom_model

    timeout = httpx.Timeout(10.0, connect=5.0)
    headers = {
        "User-Agent": "RESQ-Route/1.0 (evacuation-routing)",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    
    api_key = (settings.GRAPHHOPPER_API_KEY or "").strip()
    
    # Build URL with API key as query parameter
    route_url = f"{url}/route"
    query_parameters = []
    if api_key:
        query_parameters.append(f"key={api_key}")
    # GraphHopper requires contraction hierarchies to be disabled when a
    # request supplies a custom model, otherwise it rejects the JSON payload.
    if custom_model:
        query_parameters.append("ch.disable=true")
    if query_parameters:
        route_url = f"{route_url}?{'&'.join(query_parameters)}"

    async with httpx.AsyncClient(timeout=timeout, headers=headers, follow_redirects=True) as client:
        try:
            response = await client.post(route_url, json=payload)
            response.raise_for_status()
            data = response.json()
            
            if not data.get("paths"):
                raise ValueError("GraphHopper returned no paths")
            
            path = data["paths"][0]
            return path
        except httpx.HTTPStatusError as error:
            error_body = error.response.text
            raise ValueError(f"GraphHopper API error {error.response.status_code}: {error_body}") from error
        except (httpx.HTTPError, ValueError, OSError) as error:
            raise ValueError(f"{url} unreachable: {format_routing_error(error)}") from error


def straight_line_geometry(
    origin_latitude: float,
    origin_longitude: float,
    destination_latitude: float,
    destination_longitude: float,
) -> Dict[str, Any]:
    return {
        "type": "LineString",
        "coordinates": [
            [origin_longitude, origin_latitude],
            [destination_longitude, destination_latitude],
        ],
    }


async def route_citizen(
    origin_latitude: float,
    origin_longitude: float,
    destination_latitude: float,
    destination_longitude: float,
    hazards: Sequence[RoadHazardReport],
    noah_layers: Sequence[HazardMapLayer] = (),
    status_callback: Optional[Callable[[str, Dict[str, Any]], Awaitable[None]]] = None,
) -> Dict[str, Any]:
    active_hazards = [
        hazard for hazard in hazards
        if hazard.is_active and not hazard.is_resolved
    ]
    cardinal_scan: List[Dict[str, Any]] = []

    custom_model, excluded_zones = build_hazard_exclusion_model(active_hazards, noah_layers)

    async def emit(message: str, **data: Any) -> None:
        if status_callback:
            await status_callback(message, data)

    escape_plan = find_escape_plan(origin_latitude, origin_longitude, active_hazards)
    if escape_plan:
        await emit("You're within a hazard zone.", hazard_id=escape_plan.hazard_id)
        await emit("Calculating distance to hazard boundary in all directions...")
        await emit(
            "N: {N}m | S: {S}m | E: {E}m | W: {W}m".format(**escape_plan.distances.as_dict()),
            distances_meters=escape_plan.distances.as_dict(),
        )
        await emit(
            f"{escape_plan.direction} has the shortest route out of the hazard ({round(escape_plan.distance_meters, 1)}m).",
            direction=escape_plan.direction,
            distance_meters=round(escape_plan.distance_meters, 1),
            waypoint={"latitude": escape_plan.waypoint_latitude, "longitude": escape_plan.waypoint_longitude},
        )
        await emit("Checking if the escape route is safe...")

        escape_hazards = [hazard for hazard in active_hazards if int(hazard.id) != escape_plan.hazard_id]
        escape_polygons = [
            exclusion_polygon(hazard.latitude, hazard.longitude, hazard.radius_meters)
            for hazard in escape_hazards
        ]
        waypoint_locations = [
            {"lat": origin_latitude, "lon": origin_longitude, "type": "break"},
            {
                "lat": escape_plan.waypoint_latitude,
                "lon": escape_plan.waypoint_longitude,
                "type": "through",
                "radius": 100,
                "node_snap_tolerance": 75,
            },
            {"lat": destination_latitude, "lon": destination_longitude, "type": "break"},
        ]
        try:
            escape_trip = await request_valhalla_route(
                origin_latitude,
                origin_longitude,
                destination_latitude,
                destination_longitude,
                exclude_polygons=escape_polygons,
                locations=waypoint_locations,
            )
            escape_coordinates = extract_valhalla_geometry(escape_trip)
            if len(escape_coordinates) < 2:
                raise ValueError("Valhalla returned no escape route geometry")
            summary = escape_trip.get("summary") or {}
            await emit("Rerouting done. Generating final path options...")
            escape_variant = _route_variant(
                route_id="greedy-escape-reroute",
                label="Greedy hazard escape route",
                tier=1,
                route_status="safe",
                intersects_hazard=False,
                warning_message=None,
                geometry={"type": "LineString", "coordinates": escape_coordinates},
                distance_meters=float(summary.get("length") or 0) * 1000,
                duration_seconds=float(summary.get("time") or 0),
                engine="valhalla",
                algorithm="greedy_escape_waypoint",
                avoided_hazards=[serialize_hazard(hazard) for hazard in escape_hazards],
                route_color=ROUTE_TIER_COLORS[1],
            )
            response = _route_response(escape_variant, [escape_variant])
            response.update({
                "message": "A safe route was generated from inside the hazard zone.",
                "escape": {
                    "hazard_id": escape_plan.hazard_id,
                    "direction": escape_plan.direction,
                    "distance_meters": round(escape_plan.distance_meters, 1),
                    "waypoint": {"latitude": escape_plan.waypoint_latitude, "longitude": escape_plan.waypoint_longitude},
                },
            })
            return response
        except (httpx.HTTPError, ValueError, OSError):
            await emit("Rerouting done. Generating final path options...")
            ai_result = await _try_ai_dynamic_bypass(
                origin_latitude=origin_latitude,
                origin_longitude=origin_longitude,
                destination_latitude=destination_latitude,
                destination_longitude=destination_longitude,
                active_hazards=active_hazards,
                noah_layers=noah_layers,
                cardinal_scan=[
                    {"direction": direction, "safe": False, "distance_meters": distance}
                    for direction, distance in escape_plan.distances.as_dict().items()
                ],
            )
            if ai_result:
                ai_variant, ai_waypoint, snapped_waypoint = ai_result
                response = _route_response(ai_variant, [ai_variant])
                response.update({
                    "message": "An AI-assisted bypass route was generated after deterministic routing failed.",
                    "ai_reasoning": ai_waypoint["reasoning"],
                    "ai_spatial_bypass": {
                        "selected_direction": ai_waypoint["selected_direction"],
                        "requested_waypoint": {
                            "latitude": ai_waypoint["waypoint_lat"],
                            "longitude": ai_waypoint["waypoint_lon"],
                        },
                        "snapped_waypoint": {
                            "latitude": snapped_waypoint[1],
                            "longitude": snapped_waypoint[0],
                        },
                    },
                    "rerouted": True,
                    "fallback": False,
                    "original_route_hazard": True,
                })
                return response

            fallback_coordinates: List[List[float]] = []
            try:
                escape_path = await request_graphhopper_route(
                    escape_plan.waypoint_latitude,
                    escape_plan.waypoint_longitude,
                    destination_latitude,
                    destination_longitude,
                )
                escape_geometry = extract_geometry(escape_path)
                if len(escape_geometry) >= 2:
                    snapped_waypoint = escape_geometry[0]
                    origin_path = await request_graphhopper_route(
                        origin_latitude,
                        origin_longitude,
                        snapped_waypoint[1],
                        snapped_waypoint[0],
                    )
                    origin_geometry = extract_geometry(origin_path)
                    if len(origin_geometry) >= 2:
                        fallback_coordinates = origin_geometry
                        fallback_coordinates.extend(
                            point for point in escape_geometry
                            if point != fallback_coordinates[-1]
                        )
                        await emit(
                            "Escape waypoint snapped to the pedestrian road graph.",
                            raw_waypoint={"latitude": escape_plan.waypoint_latitude, "longitude": escape_plan.waypoint_longitude},
                            snapped_waypoint={"longitude": snapped_waypoint[0], "latitude": snapped_waypoint[1]},
                        )
            except (httpx.HTTPError, ValueError, OSError):
                fallback_coordinates = []
            if not fallback_coordinates:
                await emit("No road-snapped escape geometry was available.")
            fallback = _route_variant(
                route_id="greedy-escape-fallback",
                label="Emergency escape fallback",
                tier=3,
                route_status="fallback",
                intersects_hazard=True,
                warning_message=EMERGENCY_ROUTE_WARNING,
                geometry={"type": "LineString", "coordinates": fallback_coordinates},
                distance_meters=None,
                duration_seconds=None,
                engine="fallback",
                algorithm="greedy_escape_vector",
                route_color="#ef4444",
            )
            response = _route_response(fallback, [fallback])
            response.update({
                "message": "Routing was unavailable; a directional escape path is shown.",
                "escape": {
                    "hazard_id": escape_plan.hazard_id,
                    "direction": escape_plan.direction,
                    "distance_meters": round(escape_plan.distance_meters, 1),
                    "waypoint": {"latitude": escape_plan.waypoint_latitude, "longitude": escape_plan.waypoint_longitude},
                },
            })
            return response

    try:
        direct = await request_graphhopper_route(
            origin_latitude, origin_longitude, destination_latitude, destination_longitude
        )
        direct_coordinates = extract_geometry(direct)
        if len(direct_coordinates) < 2:
            raise ValueError("GraphHopper returned no road route geometry")
    except (httpx.HTTPError, ValueError, OSError):
        await emit("Routing request failed. Preparing a safe fallback path...")
        road_geometry: List[List[float]] = []
        try:
            valhalla_trip = await request_valhalla_route(
                origin_latitude,
                origin_longitude,
                destination_latitude,
                destination_longitude,
            )
            road_geometry = extract_valhalla_geometry(valhalla_trip)
        except (httpx.HTTPError, ValueError, OSError):
            await emit("No road routing engine returned a valid snapped geometry.")
        geometry = {"type": "LineString", "coordinates": road_geometry}
        fallback = _route_variant(
            route_id="routing-unavailable",
            label="Road route unavailable",
            tier=3,
            route_status="fallback",
            intersects_hazard=bool(active_hazards or noah_layers),
            warning_message=EMERGENCY_ROUTE_WARNING if active_hazards or noah_layers else None,
            geometry=geometry,
            distance_meters=None,
            duration_seconds=None,
            engine="fallback",
            algorithm="no_road_geometry",
            route_color="#ef4444",
        )
        response = _route_response(fallback, [fallback])
        response["message"] = "Routing was unavailable; a fallback path is shown."
        return response

    blocking_roads = hazards_on_route(direct_coordinates, active_hazards)
    blocking_layers = [layer for layer in noah_layers if layer_near_route(direct_coordinates, layer)]
    direct_geometry = {"type": "LineString", "coordinates": direct_coordinates}
    direct_variant = _route_variant(
        route_id="direct-hazardous" if blocking_roads or blocking_layers else "safe-direct",
        label="Direct hazardous route" if blocking_roads or blocking_layers else "Safe direct route",
        tier=3 if blocking_roads or blocking_layers else 1,
        route_status="hazardous" if blocking_roads or blocking_layers else "safe",
        intersects_hazard=bool(blocking_roads or blocking_layers),
        warning_message=EMERGENCY_ROUTE_WARNING if blocking_roads or blocking_layers else None,
        geometry=direct_geometry,
        distance_meters=direct.get("distance", 0),
        duration_seconds=direct.get("time", 0) / 1000,
        engine="graphhopper",
        algorithm="dijkstra",
        route_color=ROUTE_TIER_COLORS[3] if blocking_roads or blocking_layers else ROUTE_TIER_COLORS[1],
    )
    if not blocking_roads and not blocking_layers:
        return _route_response(direct_variant, [direct_variant])

    safe_variant = None
    try:
        safe_path = await request_graphhopper_route(
            origin_latitude, origin_longitude, destination_latitude, destination_longitude,
            custom_model=custom_model if excluded_zones else None,
        )
        safe_coordinates = extract_geometry(safe_path)
        if len(safe_coordinates) >= 2 and not hazards_on_route(safe_coordinates, active_hazards) and not any(
            layer_near_route(safe_coordinates, layer) for layer in noah_layers
        ):
            safe_variant = _route_variant(
                route_id="safe-reroute", label="Safe perimeter route", tier=1,
                route_status="safe", intersects_hazard=False, warning_message=None,
                geometry={"type": "LineString", "coordinates": safe_coordinates},
                distance_meters=safe_path.get("distance", 0), duration_seconds=safe_path.get("time", 0) / 1000,
                engine="graphhopper", algorithm="dijkstra", avoided_hazards=excluded_zones,
                route_color=ROUTE_TIER_COLORS[1],
            )
    except (httpx.HTTPError, ValueError, OSError):
        safe_variant = None

    if safe_variant is None:
        try:
            valhalla_trip = await request_valhalla_route(
                origin_latitude, origin_longitude, destination_latitude, destination_longitude,
                exclude_polygons=build_valhalla_exclusion_polygons(blocking_roads, blocking_layers),
            )
            coordinates = extract_valhalla_geometry(valhalla_trip)
            if len(coordinates) >= 2 and not hazards_on_route(coordinates, active_hazards) and not any(
                layer_near_route(coordinates, layer) for layer in noah_layers
            ):
                _, avoided = build_hazard_exclusion_model(blocking_roads, blocking_layers)
                summary = valhalla_trip.get("summary") or {}
                safe_variant = _route_variant(
                    route_id="safe-reroute", label="Safe perimeter route", tier=1,
                    route_status="safe", intersects_hazard=False, warning_message=None,
                    geometry={"type": "LineString", "coordinates": coordinates},
                    distance_meters=float(summary.get("length") or 0) * 1000,
                    duration_seconds=float(summary.get("time") or 0),
                    engine="valhalla", algorithm="dijkstra_astar", avoided_hazards=avoided,
                    route_color=ROUTE_TIER_COLORS[1],
                )
            elif len(coordinates) >= 2:
                interception = first_hazard_interception(coordinates, active_hazards)
                if interception:
                    await emit(
                        "Hazard intersection detected on the calculated route.",
                        hazard_id=interception.hazard_id,
                        checkpoint={"latitude": interception.checkpoint[0], "longitude": interception.checkpoint[1]},
                        route_distance_meters=round(interception.route_distance_meters, 1),
                    )
                    await emit("Scanning cardinal directions for a safe escape vector...")
                    escape = resolve_cardinal_escape(
                        interception,
                        (destination_latitude, destination_longitude),
                        active_hazards,
                    )
                    cardinal_scan = [
                        {
                            "direction": candidate.direction,
                            "safe": candidate.safe,
                            "offset_meters": candidate.offset_meters,
                            "coordinate": {
                                "latitude": candidate.coordinate[0],
                                "longitude": candidate.coordinate[1],
                            },
                            "blocked_by": list(candidate.blocked_by),
                        }
                        for candidate in (escape.candidates if escape else ())
                    ]
                    await emit(
                        "Cardinal safety scan complete.",
                        directions=cardinal_scan,
                    )
                    if escape:
                        await emit(
                            f"{escape.direction} escape vector found; preparing a safe waypoint.",
                            direction=escape.direction,
                            waypoint={"latitude": escape.waypoint[0], "longitude": escape.waypoint[1]},
                        )
                        locations = [
                            {"lat": origin_latitude, "lon": origin_longitude, "type": "break"},
                            {
                                "lat": interception.checkpoint[0],
                                "lon": interception.checkpoint[1],
                                "type": "through",
                                "radius": 100,
                                "node_snap_tolerance": 75,
                            },
                            {
                                "lat": escape.waypoint[0],
                                "lon": escape.waypoint[1],
                                "type": "through",
                                "radius": 100,
                                "node_snap_tolerance": 75,
                            },
                            {"lat": destination_latitude, "lon": destination_longitude, "type": "break"},
                        ]
                        try:
                            dynamic_trip = await request_valhalla_route(
                                origin_latitude,
                                origin_longitude,
                                destination_latitude,
                                destination_longitude,
                                exclude_polygons=build_valhalla_exclusion_polygons(
                                    [hazard for hazard in active_hazards if hazard.id != interception.hazard_id],
                                    noah_layers,
                                ),
                                locations=locations,
                            )
                            dynamic_coordinates = extract_valhalla_geometry(dynamic_trip)
                            if len(dynamic_coordinates) >= 2 and not first_hazard_interception(dynamic_coordinates, active_hazards):
                                await emit("Mid-route hazard rerouting complete.")
                                dynamic_summary = dynamic_trip.get("summary") or {}
                                dynamic_variant = _route_variant(
                                    route_id="mid-route-escape-reroute",
                                    label="Mid-route hazard escape route",
                                    tier=1,
                                    route_status="safe",
                                    intersects_hazard=False,
                                    warning_message=None,
                                    geometry={"type": "LineString", "coordinates": dynamic_coordinates},
                                    distance_meters=float(dynamic_summary.get("length") or 0) * 1000,
                                    duration_seconds=float(dynamic_summary.get("time") or 0),
                                    engine="valhalla",
                                    algorithm="cardinal_escape_waypoint",
                                    avoided_hazards=[serialize_hazard(hazard) for hazard in active_hazards],
                            route_color=ROUTE_TIER_COLORS[1],
                                )
                                response = _route_response(dynamic_variant, [dynamic_variant])
                                response.update({
                                    "message": "Route rerouted around a mid-route hazard.",
                                    "interception": {
                                        "hazard_id": interception.hazard_id,
                                        "checkpoint": {"latitude": interception.checkpoint[0], "longitude": interception.checkpoint[1]},
                                        "route_distance_meters": round(interception.route_distance_meters, 1),
                                    },
                                    "escape": {
                                        "direction": escape.direction,
                                        "waypoint": {"latitude": escape.waypoint[0], "longitude": escape.waypoint[1]},
                                        "cardinal_scan": [
                                            {"direction": candidate.direction, "safe": candidate.safe}
                                            for candidate in escape.candidates
                                        ],
                                    },
                                })
                                return response
                            await emit("Cardinal waypoint route still intersects a hazard; using the escape waypoint fallback.")
                        except (httpx.HTTPError, ValueError, OSError):
                            await emit("Cardinal escape reroute failed; using the escape waypoint fallback.")

                        ai_result = await _try_ai_dynamic_bypass(
                            origin_latitude=origin_latitude,
                            origin_longitude=origin_longitude,
                            destination_latitude=destination_latitude,
                            destination_longitude=destination_longitude,
                            active_hazards=active_hazards,
                            noah_layers=noah_layers,
                            cardinal_scan=cardinal_scan,
                        )
                        if ai_result:
                            ai_variant, ai_waypoint, snapped_waypoint = ai_result
                            response = _route_response(ai_variant, [ai_variant, direct_variant])
                            response.update({
                                "message": "An AI-assisted bypass route was generated after deterministic routing failed.",
                                "ai_reasoning": ai_waypoint["reasoning"],
                                "ai_spatial_bypass": {
                                    "selected_direction": ai_waypoint["selected_direction"],
                                    "requested_waypoint": {
                                        "latitude": ai_waypoint["waypoint_lat"],
                                        "longitude": ai_waypoint["waypoint_lon"],
                                    },
                                    "snapped_waypoint": {
                                        "latitude": snapped_waypoint[1],
                                        "longitude": snapped_waypoint[0],
                                    },
                                },
                                "rerouted": True,
                                "fallback": False,
                                "original_route_hazard": True,
                            })
                            return response

                        snapped_fallback_coordinates: List[List[float]] = []
                        try:
                            # GraphHopper snaps both endpoints to its pedestrian graph.
                            # Route the checkpoint-to-waypoint connector first, use its
                            # snapped endpoint, then route that endpoint to the destination.
                            connector_path = await request_graphhopper_route(
                                interception.checkpoint[0],
                                interception.checkpoint[1],
                                escape.waypoint[0],
                                escape.waypoint[1],
                            )
                            connector_geometry = extract_geometry(connector_path)
                            if len(connector_geometry) >= 2:
                                snapped_waypoint = connector_geometry[-1]
                                escape_path = await request_graphhopper_route(
                                    snapped_waypoint[1],
                                    snapped_waypoint[0],
                                    destination_latitude,
                                    destination_longitude,
                                )
                                escape_geometry = extract_geometry(escape_path)
                            else:
                                escape_geometry = []
                            if len(connector_geometry) >= 2 and len(escape_geometry) >= 2:
                                prefix = coordinates[: interception.segment_index + 1]
                                prefix.append([interception.checkpoint[1], interception.checkpoint[0]])
                                snapped_fallback_coordinates = prefix
                                for point in connector_geometry + escape_geometry:
                                    if point != snapped_fallback_coordinates[-1]:
                                        snapped_fallback_coordinates.append(point)
                                await emit(
                                    "Escape waypoint snapped to the pedestrian road graph.",
                                    raw_waypoint={"latitude": escape.waypoint[0], "longitude": escape.waypoint[1]},
                                    snapped_waypoint={"longitude": snapped_waypoint[0], "latitude": snapped_waypoint[1]},
                                )
                        except (httpx.HTTPError, ValueError, OSError):
                            snapped_fallback_coordinates = []

                        # The Valhalla polyline is already road-snapped. It is the
                        # last non-diagonal representation if both reroute attempts fail.
                        fallback_coordinates = snapped_fallback_coordinates or coordinates
                        fallback = _route_variant(
                            route_id="mid-route-escape-fallback",
                            label="Cardinal escape waypoint fallback",
                            tier=3,
                            route_status="fallback",
                            intersects_hazard=True,
                            warning_message=EMERGENCY_ROUTE_WARNING,
                            geometry={"type": "LineString", "coordinates": fallback_coordinates},
                            distance_meters=sum(
                                haversine_meters(
                                    fallback_coordinates[index][1], fallback_coordinates[index][0],
                                    fallback_coordinates[index + 1][1], fallback_coordinates[index + 1][0],
                                )
                                for index in range(len(fallback_coordinates) - 1)
                            ),
                            duration_seconds=None,
                            engine="fallback",
                            algorithm="cardinal_escape_waypoint",
                            avoided_hazards=[serialize_hazard(hazard) for hazard in active_hazards],
                            route_color=ROUTE_TIER_COLORS[3],
                        )
                        response = _route_response(fallback, [fallback])
                        response.update({
                            "message": (
                                "Valhalla could not complete the reroute; a road-snapped escape path is shown."
                                if snapped_fallback_coordinates
                                else "No clean road reroute was available; the last road-snapped route is shown."
                            ),
                            "interception": {
                                "hazard_id": interception.hazard_id,
                                "checkpoint": {"latitude": interception.checkpoint[0], "longitude": interception.checkpoint[1]},
                                "route_distance_meters": round(interception.route_distance_meters, 1),
                            },
                            "escape": {
                                "direction": escape.direction,
                                "waypoint": {"latitude": escape.waypoint[0], "longitude": escape.waypoint[1]},
                            },
                        })
                        return response
        except (httpx.HTTPError, ValueError, OSError):
            safe_variant = None

    if safe_variant is not None:
        response = _route_response(safe_variant, [safe_variant, direct_variant])
        response["message"] = "Safe reroute and direct hazardous route are available for comparison."
        response["rerouted"] = True
        response["fallback"] = False
        response["original_route_hazard"] = True
        return response

    # Deterministic graph routing and cardinal escape have both failed. Give the
    # AI provider one bounded opportunity to suggest a different bypass, then
    # snap that suggestion back onto the pedestrian graph before routing it.
    if active_hazards:
        ai_context = {
            "start": [origin_latitude, origin_longitude],
            "destination": [destination_latitude, destination_longitude],
            "hazards": [
                {
                    "id": int(hazard.id),
                    "center": [float(hazard.latitude), float(hazard.longitude)],
                    "radius_meters": float(hazard.radius_meters),
                }
                for hazard in active_hazards
            ],
            "cardinal_vectors": cardinal_scan,
        }
        try:
            ai_waypoint = await choose_ai_escape_waypoint(ai_context)
            snap_path = await request_graphhopper_route(
                ai_waypoint["waypoint_lat"],
                ai_waypoint["waypoint_lon"],
                destination_latitude,
                destination_longitude,
            )
            snap_coordinates = extract_geometry(snap_path)
            if len(snap_coordinates) < 2:
                raise ValueError("AI waypoint could not be snapped to a road node")

            snapped_waypoint = snap_coordinates[0]
            ai_trip = await request_valhalla_route(
                origin_latitude,
                origin_longitude,
                destination_latitude,
                destination_longitude,
                exclude_polygons=build_valhalla_exclusion_polygons(active_hazards, noah_layers),
                locations=[
                    {"lat": origin_latitude, "lon": origin_longitude, "type": "break"},
                    {
                        "lat": snapped_waypoint[1],
                        "lon": snapped_waypoint[0],
                        "type": "through",
                        "radius": 100,
                        "node_snap_tolerance": 75,
                    },
                    {"lat": destination_latitude, "lon": destination_longitude, "type": "break"},
                ],
            )
            ai_coordinates = extract_valhalla_geometry(ai_trip)
            if len(ai_coordinates) < 2 or first_hazard_interception(ai_coordinates, active_hazards):
                raise ValueError("AI bypass remained inside an active hazard")

            ai_summary = ai_trip.get("summary") or {}
            ai_variant = _route_variant(
                route_id="ai-optimized-dynamic-bypass",
                label="AI-Optimized Dynamic Bypass",
                tier=2,
                route_status="safe",
                intersects_hazard=False,
                warning_message=None,
                geometry={"type": "LineString", "coordinates": ai_coordinates},
                distance_meters=float(ai_summary.get("length") or 0) * 1000,
                duration_seconds=float(ai_summary.get("time") or 0),
                engine="valhalla",
                algorithm="groq_spatial_bypass",
                avoided_hazards=[serialize_hazard(hazard) for hazard in active_hazards],
                route_color=ROUTE_TIER_COLORS[2],
            )
            ai_variant["ai_reasoning"] = ai_waypoint["reasoning"]
            response = _route_response(ai_variant, [ai_variant, direct_variant])
            response.update({
                "message": "An AI-assisted bypass route was generated after deterministic routing failed.",
                "ai_reasoning": ai_waypoint["reasoning"],
                "ai_spatial_bypass": {
                    "selected_direction": ai_waypoint["selected_direction"],
                    "requested_waypoint": {
                        "latitude": ai_waypoint["waypoint_lat"],
                        "longitude": ai_waypoint["waypoint_lon"],
                    },
                    "snapped_waypoint": {
                        "latitude": snapped_waypoint[1],
                        "longitude": snapped_waypoint[0],
                    },
                },
                "rerouted": True,
                "fallback": False,
                "original_route_hazard": True,
            })
            return response
        except Exception as error:  # AI is advisory; deterministic fallback remains authoritative.
            print(f"[groq-spatial] AI bypass failed: {type(error).__name__}: {error}")

    fallback = _route_variant(
        route_id="emergency-fallback", label="Emergency fallback route", tier=3,
        route_status="fallback", intersects_hazard=True, warning_message=EMERGENCY_ROUTE_WARNING,
        geometry=direct_geometry, distance_meters=direct.get("distance", 0),
        duration_seconds=direct.get("time", 0) / 1000, engine="graphhopper",
        algorithm="dijkstra", route_color="#ef4444",
    )
    response = _route_response(fallback, [fallback])
    response["message"] = "No clean reroute was available. Emergency fallback route shown."
    response["rerouted"] = False
    response["fallback"] = True
    response["original_route_hazard"] = True
    return response
