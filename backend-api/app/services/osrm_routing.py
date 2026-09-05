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


async def request_osrm_route(
    origin_latitude: float,
    origin_longitude: float,
    destination_latitude: float,
    destination_longitude: float,
) -> Dict[str, Any]:
    url = (settings.OSRM_URL or "").strip()
    if not url:
        raise ValueError("OSRM_URL is empty")

    # OSRM format: /route/v1/foot/{lon},{lat};{lon},{lat}?overview=full&geometries=geojson
    coordinates = f"{origin_longitude},{origin_latitude};{destination_longitude},{destination_latitude}"
    full_url = f"{url}/route/v1/foot/{coordinates}?overview=full&geometries=geojson"

    timeout = httpx.Timeout(60.0, connect=30.0)
    headers = {"User-Agent": "RESQ-Route/1.0 (evacuation-routing)", "Accept": "application/json"}

    async with httpx.AsyncClient(timeout=timeout, headers=headers, follow_redirects=True) as client:
        try:
            response = await client.get(full_url)
            response.raise_for_status()
            data = response.json()
            
            if not data.get("routes"):
                raise ValueError("OSRM returned no routes")
            
            return data["routes"][0]
        except (httpx.HTTPError, ValueError, OSError) as error:
            raise ValueError(f"{url} unreachable: {format_routing_error(error)}") from error


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
        route = await request_osrm_route(
            origin_latitude,
            origin_longitude,
            destination_latitude,
            destination_longitude,
        )
        
        # Extract geometry from OSRM response
        geometry = route.get("geometry", {})
        coordinates = geometry.get("coordinates", [])
        
        # OSRM returns distance in meters and duration in seconds
        distance_meters = route.get("distance", 0)
        duration_seconds = route.get("duration", 0)
        
        # Check for hazards on route
        blocking_hazards = hazards_on_route(coordinates, active_hazards)
        
        if not blocking_hazards:
            return {
                "engine": "osrm",
                "algorithm": "dijkstra",
                "costing": "pedestrian",
                "rerouted": False,
                "fallback": False,
                "distance_meters": distance_meters,
                "duration_seconds": duration_seconds,
                "geometry": geometry,
                "avoided_hazards": [],
                "message": "Walking route calculated with OSRM.",
            }
        
        # OSRM doesn't support exclusion polygons like Valhalla
        # Return the route with hazard warnings
        return {
            "engine": "osrm",
            "algorithm": "dijkstra",
            "costing": "pedestrian",
            "rerouted": False,
            "fallback": False,
            "distance_meters": distance_meters,
            "duration_seconds": duration_seconds,
            "geometry": geometry,
            "avoided_hazards": [serialize_hazard(hazard) for hazard in blocking_hazards],
            "message": "Route calculated with OSRM. Hazards detected on route - manual avoidance recommended.",
        }
        
    except (httpx.HTTPError, ValueError, OSError) as error:
        # Fallback to straight line
        geometry = straight_line_geometry(
            origin_latitude,
            origin_longitude,
            destination_latitude,
            destination_longitude,
        )
        blocking = hazards_on_route(geometry["coordinates"], active_hazards)
        return {
            "engine": "osrm",
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
            "message": f"OSRM was unavailable ({format_routing_error(error)}). Direct path used as fallback.",
        }
