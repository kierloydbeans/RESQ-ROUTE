import json
import math
from typing import Any, Dict, List, Optional, Sequence, Tuple

import httpx

from app.core.config import settings
from app.models.hazard_map_layer import HazardMapLayer
from app.models.road_hazard import RoadHazardReport
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
    legs = trip.get("legs") or []
    shape = legs[0].get("shape") if legs else None
    return decode_polyline6(shape) if shape else []


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

    timeout = httpx.Timeout(60.0, connect=30.0)
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
) -> Dict[str, Any]:
    active_hazards = [
        hazard for hazard in hazards
        if hazard.is_active and not hazard.is_resolved
    ]

    custom_model, excluded_zones = build_hazard_exclusion_model(active_hazards, noah_layers)

    try:
        path = await request_graphhopper_route(
            origin_latitude,
            origin_longitude,
            destination_latitude,
            destination_longitude,
            custom_model=custom_model if excluded_zones else None,
        )
        coordinates = extract_geometry(path)
        if len(coordinates) < 2:
            raise ValueError("GraphHopper returned no route geometry")
        return {
            "engine": "graphhopper",
            "algorithm": "dijkstra",
            "costing": "pedestrian",
            "rerouted": bool(excluded_zones),
            "fallback": False,
            "distance_meters": path.get("distance", 0),
            "duration_seconds": path.get("time", 0) / 1000,
            "geometry": {"type": "LineString", "coordinates": coordinates},
            "avoided_hazards": excluded_zones,
            "message": f"Route calculated with {len(excluded_zones)} active hazard exclusion zone(s).",
        }
    except (httpx.HTTPError, ValueError, OSError):
        # Free GraphHopper plans reject custom models. Use a normal road route
        # to identify only the hazards this trip actually needs to avoid.
        baseline = await request_graphhopper_route(
            origin_latitude,
            origin_longitude,
            destination_latitude,
            destination_longitude,
        )
        baseline_coordinates = extract_geometry(baseline)
        if len(baseline_coordinates) < 2:
            raise ValueError("GraphHopper returned no road route geometry")
        blocking_roads = hazards_on_route(baseline_coordinates, active_hazards)
        blocking_layers = [layer for layer in noah_layers if layer_near_route(baseline_coordinates, layer)]
        if not blocking_roads and not blocking_layers:
            return {
                "engine": "graphhopper",
                "algorithm": "dijkstra",
                "costing": "pedestrian",
                "rerouted": False,
                "fallback": False,
                "distance_meters": baseline.get("distance", 0),
                "duration_seconds": baseline.get("time", 0) / 1000,
                "geometry": {"type": "LineString", "coordinates": baseline_coordinates},
                "avoided_hazards": [],
                "message": "No active hazard intersects this road route.",
            }

        valhalla_trip = await request_valhalla_route(
            origin_latitude,
            origin_longitude,
            destination_latitude,
            destination_longitude,
            exclude_polygons=build_valhalla_exclusion_polygons(blocking_roads, blocking_layers),
        )
        coordinates = extract_valhalla_geometry(valhalla_trip)
        if len(coordinates) < 2:
            raise ValueError("Valhalla returned no road route geometry")
        if hazards_on_route(coordinates, active_hazards) or any(
            layer_near_route(coordinates, layer) for layer in noah_layers
        ):
            raise ValueError("No route avoiding all active hazards was found")
        _, avoided = build_hazard_exclusion_model(blocking_roads, blocking_layers)
        summary = valhalla_trip.get("summary") or {}
        return {
            "engine": "valhalla",
            "algorithm": "dijkstra_astar",
            "costing": "pedestrian",
            "rerouted": True,
            "fallback": False,
            "distance_meters": float(summary.get("length") or 0) * 1000,
            "duration_seconds": float(summary.get("time") or 0),
            "geometry": {"type": "LineString", "coordinates": coordinates},
            "avoided_hazards": avoided,
            "original_route_hazard": bool(blocking_roads),
            "message": "Road route calculated with active hazard polygons excluded.",
        }
