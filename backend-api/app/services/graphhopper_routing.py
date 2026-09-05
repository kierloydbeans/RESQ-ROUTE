import json
import math
from typing import Any, Dict, List, Optional, Sequence, Tuple

import httpx

from app.core.config import settings
from app.models.road_hazard import RoadHazardReport

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
    avoid_polygons: Optional[List[List[List[float]]]] = None,
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
    
    if avoid_polygons:
        # GraphHopper expects avoid_polygons as GeoJSON Polygon format
        # Format: {"polygons": [[[[lon, lat], [lon, lat], ...]]]}
        geojson_polygons = []
        for polygon in avoid_polygons:
            # polygon is already [lon, lat] format from exclusion_polygon
            geojson_polygons.append([polygon])
        
        payload["avoid_polygons"] = {"polygons": geojson_polygons}
        print(f"Sending avoid_polygons to GraphHopper: {payload['avoid_polygons']}")

    timeout = httpx.Timeout(60.0, connect=30.0)
    headers = {
        "User-Agent": "RESQ-Route/1.0 (evacuation-routing)",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    
    api_key = (settings.GRAPHHOPPER_API_KEY or "").strip()
    
    # Build URL with API key as query parameter
    route_url = f"{url}/route"
    if api_key:
        route_url = f"{route_url}?key={api_key}"

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
) -> Dict[str, Any]:
    active_hazards = [
        hazard for hazard in hazards
        if hazard.is_active and not hazard.is_resolved
    ]

    try:
        initial_route = await request_graphhopper_route(
            origin_latitude,
            origin_longitude,
            destination_latitude,
            destination_longitude,
        )
        
        initial_coordinates = extract_geometry(initial_route)
        distance_meters = initial_route.get("distance", 0)
        duration_seconds = initial_route.get("time", 0) / 1000  # GraphHopper returns milliseconds
        
        blocking_hazards = hazards_on_route(initial_coordinates, active_hazards)
        
        if not blocking_hazards:
            return {
                "engine": "graphhopper",
                "algorithm": "dijkstra",
                "costing": "pedestrian",
                "rerouted": False,
                "fallback": False,
                "distance_meters": distance_meters,
                "duration_seconds": duration_seconds,
                "geometry": {"type": "LineString", "coordinates": initial_coordinates},
                "avoided_hazards": [],
                "message": "Walking route calculated with GraphHopper.",
            }

        # GraphHopper's avoid_polygons doesn't work reliably on free tier
        # Return route with hazard warning instead
        return {
            "engine": "graphhopper",
            "algorithm": "dijkstra",
            "costing": "pedestrian",
            "rerouted": False,
            "fallback": False,
            "distance_meters": distance_meters,
            "duration_seconds": duration_seconds,
            "geometry": {"type": "LineString", "coordinates": initial_coordinates},
            "avoided_hazards": [serialize_hazard(hazard) for hazard in blocking_hazards],
            "message": f"Route calculated with {len(blocking_hazards)} hazard(s) detected on path. Manual avoidance recommended.",
        }
        
    except (httpx.HTTPError, ValueError, OSError) as error:
        geometry = straight_line_geometry(
            origin_latitude,
            origin_longitude,
            destination_latitude,
            destination_longitude,
        )
        blocking = hazards_on_route(geometry["coordinates"], active_hazards)
        return {
            "engine": "graphhopper",
            "algorithm": "dijkstra",
            "costing": "pedestrian",
            "rerouted": False,
            "fallback": True,
            "distance_meters": haversine_meters(
                origin_latitude, origin_longitude, destination_latitude, destination_longitude
            ),
            "duration_seconds": None,
            "geometry": geometry,
            "avoided_hazards": [serialize_hazard(hazard) for hazard in blocking],
            "message": f"GraphHopper was unavailable ({format_routing_error(error)}). Direct path used as fallback.",
        }
