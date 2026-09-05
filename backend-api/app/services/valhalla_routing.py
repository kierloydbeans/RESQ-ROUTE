import json
import math
import socket
from contextlib import contextmanager
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


def decode_polyline6(encoded: str, precision: float = 1e-6) -> List[List[float]]:
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
        coordinates.append([longitude * precision, latitude * precision])

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


def exclusion_polygon(latitude: float, longitude: float, radius_meters: float, steps: int = 16) -> List[Dict[str, float]]:
    ring = []
    for step in range(steps):
        bearing = 2 * math.pi * step / steps
        point_latitude, point_longitude = destination_point(latitude, longitude, radius_meters, bearing)
        ring.append({"lat": point_latitude, "lon": point_longitude})
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


def extract_geometry(trip: Dict[str, Any]) -> List[List[float]]:
    coordinates: List[List[float]] = []
    for leg in trip.get("legs") or []:
        shape = leg.get("shape")
        if isinstance(shape, dict):
            coordinates.extend(shape.get("coordinates") or [])
        elif isinstance(shape, str):
            coordinates.extend(decode_polyline6(shape))
    return coordinates


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


@contextmanager
def prefer_ipv4_dns():
    original = socket.getaddrinfo

    def ipv4_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
        try:
            return original(host, port, socket.AF_INET, type, proto, flags)
        except OSError:
            return original(host, port, family, type, proto, flags)

    socket.getaddrinfo = ipv4_getaddrinfo
    try:
        yield
    finally:
        socket.getaddrinfo = original


def trip_from_response(response: httpx.Response) -> Dict[str, Any]:
    try:
        data = response.json()
    except ValueError as error:
        body = (response.text or "").strip().replace("\n", " ")[:180]
        raise ValueError(f"HTTP {response.status_code} non-JSON response: {body or 'empty body'}") from error

    if response.status_code >= 400:
        raise ValueError(data.get("error") or f"HTTP {response.status_code} from Valhalla")
    if not data.get("trip"):
        raise ValueError(data.get("error") or "Valhalla returned no trip")
    return data["trip"]


async def request_valhalla_route(
    origin_latitude: float,
    origin_longitude: float,
    destination_latitude: float,
    destination_longitude: float,
    exclude_polygons: Optional[List[List[Dict[str, float]]]] = None,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "locations": [
            {"lat": origin_latitude, "lon": origin_longitude, "type": "break"},
            {"lat": destination_latitude, "lon": destination_longitude, "type": "break"},
        ],
        "costing": "pedestrian",
        "directions_options": {"units": "kilometers"},
        "shape_format": "polyline6",
    }
    if exclude_polygons:
        payload["exclude_polygons"] = exclude_polygons

    url = (settings.VALHALLA_URL or "").strip()
    if not url:
        raise ValueError("VALHALLA_URL is empty")

    timeout = httpx.Timeout(60.0, connect=30.0)
    headers = {"User-Agent": "RESQ-Route/1.0 (evacuation-routing)", "Accept": "application/json"}
    errors: List[str] = []

    with prefer_ipv4_dns():
        async with httpx.AsyncClient(timeout=timeout, headers=headers, follow_redirects=True) as client:
            try:
                response = await client.post(url, json=payload)
                return trip_from_response(response)
            except (httpx.HTTPError, ValueError, OSError) as error:
                errors.append(f"POST {format_routing_error(error)}")

            try:
                response = await client.get(url, params={"json": json.dumps(payload, separators=(",", ":"))})
                return trip_from_response(response)
            except (httpx.HTTPError, ValueError, OSError) as error:
                errors.append(f"GET {format_routing_error(error)}")

    raise ValueError(f"{url} unreachable. " + " | ".join(errors))


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
        initial_trip = await request_valhalla_route(
            origin_latitude,
            origin_longitude,
            destination_latitude,
            destination_longitude,
        )
    except (httpx.HTTPError, ValueError, OSError) as error:
        geometry = straight_line_geometry(
            origin_latitude,
            origin_longitude,
            destination_latitude,
            destination_longitude,
        )
        blocking = hazards_on_route(geometry["coordinates"], active_hazards)
        return {
            "engine": "valhalla",
            "algorithm": "dijkstra_astar",
            "costing": "pedestrian",
            "rerouted": False,
            "fallback": True,
            "distance_meters": haversine_meters(
                origin_latitude, origin_longitude, destination_latitude, destination_longitude
            ),
            "duration_seconds": None,
            "geometry": geometry,
            "avoided_hazards": [serialize_hazard(hazard) for hazard in blocking],
            "message": f"Valhalla was unavailable ({format_routing_error(error)}). Direct path used as fallback.",
        }

    initial_coordinates = extract_geometry(initial_trip)
    blocking_hazards = hazards_on_route(initial_coordinates, active_hazards)
    summary = initial_trip.get("summary") or {}

    if not blocking_hazards:
        return {
            "engine": "valhalla",
            "algorithm": "dijkstra_astar",
            "costing": "pedestrian",
            "rerouted": False,
            "fallback": False,
            "distance_meters": float(summary.get("length") or 0) * 1000,
            "duration_seconds": float(summary.get("time") or 0),
            "geometry": {"type": "LineString", "coordinates": initial_coordinates},
            "avoided_hazards": [],
            "message": "Walking route calculated with Valhalla.",
        }

    exclude_polygons = [
        exclusion_polygon(hazard.latitude, hazard.longitude, hazard.radius_meters)
        for hazard in blocking_hazards
    ]

    try:
        rerouted_trip = await request_valhalla_route(
            origin_latitude,
            origin_longitude,
            destination_latitude,
            destination_longitude,
            exclude_polygons=exclude_polygons,
        )
        rerouted_coordinates = extract_geometry(rerouted_trip)
        rerouted_summary = rerouted_trip.get("summary") or {}
        remaining = hazards_on_route(rerouted_coordinates, active_hazards)
        return {
            "engine": "valhalla",
            "algorithm": "dijkstra_astar",
            "costing": "pedestrian",
            "rerouted": True,
            "fallback": False,
            "distance_meters": float(rerouted_summary.get("length") or 0) * 1000,
            "duration_seconds": float(rerouted_summary.get("time") or 0),
            "geometry": {"type": "LineString", "coordinates": rerouted_coordinates},
            "avoided_hazards": [serialize_hazard(hazard) for hazard in blocking_hazards],
            "message": (
                "Route recalculated to avoid road hazards."
                if not remaining
                else "Route recalculated; some hazards could not be fully avoided."
            ),
        }
    except (httpx.HTTPError, ValueError):
        return {
            "engine": "valhalla",
            "algorithm": "dijkstra_astar",
            "costing": "pedestrian",
            "rerouted": False,
            "fallback": False,
            "distance_meters": float(summary.get("length") or 0) * 1000,
            "duration_seconds": float(summary.get("time") or 0),
            "geometry": {"type": "LineString", "coordinates": initial_coordinates},
            "avoided_hazards": [serialize_hazard(hazard) for hazard in blocking_hazards],
            "message": "Hazards were detected but Valhalla could not compute an avoidance route.",
        }
