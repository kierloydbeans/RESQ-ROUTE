"""Directional escape planning for origins trapped inside circular hazard zones."""

from dataclasses import dataclass
import math
from typing import Dict, Iterable, Optional

from app.models.road_hazard import RoadHazardReport

EARTH_RADIUS_METERS = 6_371_000.0
ESCAPE_MARGIN_METERS = 10.0


@dataclass(frozen=True)
class DirectionalDistances:
    north: float
    south: float
    east: float
    west: float

    def as_dict(self) -> Dict[str, float]:
        return {
            "N": round(self.north, 1),
            "S": round(self.south, 1),
            "E": round(self.east, 1),
            "W": round(self.west, 1),
        }

    def shortest(self) -> tuple[str, float]:
        return min(self.as_dict().items(), key=lambda item: item[1])


@dataclass(frozen=True)
class EscapePlan:
    hazard_id: int
    direction: str
    distance_meters: float
    distances: DirectionalDistances
    waypoint_latitude: float
    waypoint_longitude: float


def haversine_meters(latitude_a: float, longitude_a: float, latitude_b: float, longitude_b: float) -> float:
    latitude_delta = math.radians(latitude_b - latitude_a)
    longitude_delta = math.radians(longitude_b - longitude_a)
    a = (
        math.sin(latitude_delta / 2) ** 2
        + math.cos(math.radians(latitude_a))
        * math.cos(math.radians(latitude_b))
        * math.sin(longitude_delta / 2) ** 2
    )
    return EARTH_RADIUS_METERS * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _local_offsets_meters(
    center_latitude: float,
    center_longitude: float,
    latitude: float,
    longitude: float,
) -> tuple[float, float]:
    """Return east/north offsets using a local tangent-plane approximation."""
    north = math.radians(latitude - center_latitude) * EARTH_RADIUS_METERS
    east = (
        math.radians(longitude - center_longitude)
        * EARTH_RADIUS_METERS
        * math.cos(math.radians(center_latitude))
    )
    return east, north


def _coordinate_from_offsets(
    center_latitude: float,
    center_longitude: float,
    east_meters: float,
    north_meters: float,
) -> tuple[float, float]:
    latitude = center_latitude + math.degrees(north_meters / EARTH_RADIUS_METERS)
    longitude = center_longitude + math.degrees(
        east_meters / (EARTH_RADIUS_METERS * math.cos(math.radians(center_latitude)))
    )
    return latitude, longitude


def directional_distances(
    origin_latitude: float,
    origin_longitude: float,
    hazard: RoadHazardReport,
) -> Optional[DirectionalDistances]:
    """Measure cardinal distances from an origin to a hazard circle boundary."""
    east, north = _local_offsets_meters(
        hazard.latitude,
        hazard.longitude,
        origin_latitude,
        origin_longitude,
    )
    radius = max(1.0, float(hazard.radius_meters))
    center_distance = math.hypot(east, north)
    if center_distance > radius:
        return None

    horizontal_half_chord = math.sqrt(max(0.0, radius * radius - east * east))
    vertical_half_chord = math.sqrt(max(0.0, radius * radius - north * north))
    return DirectionalDistances(
        north=max(0.0, horizontal_half_chord - north),
        south=max(0.0, horizontal_half_chord + north),
        east=max(0.0, vertical_half_chord - east),
        west=max(0.0, vertical_half_chord + east),
    )


def _waypoint_for_direction(
    origin_latitude: float,
    origin_longitude: float,
    direction: str,
    distance_meters: float,
    margin_meters: float,
) -> tuple[float, float]:
    distance = distance_meters + margin_meters
    offsets = {"N": (0.0, distance), "S": (0.0, -distance), "E": (distance, 0.0), "W": (-distance, 0.0)}
    east, north = offsets[direction]
    return _coordinate_from_offsets(origin_latitude, origin_longitude, east, north)


def find_escape_plan(
    origin_latitude: float,
    origin_longitude: float,
    hazards: Iterable[RoadHazardReport],
    margin_meters: float = ESCAPE_MARGIN_METERS,
) -> Optional[EscapePlan]:
    """Choose the shortest cardinal exit whose waypoint clears active hazards."""
    hazards = list(hazards)
    candidates = []
    for hazard in hazards:
        distances = directional_distances(origin_latitude, origin_longitude, hazard)
        if distances is None:
            continue
        for direction, distance in sorted(distances.as_dict().items(), key=lambda item: item[1]):
            waypoint_latitude, waypoint_longitude = _waypoint_for_direction(
                origin_latitude, origin_longitude, direction, distance, margin_meters
            )
            candidates.append((distance, direction, hazard, distances, waypoint_latitude, waypoint_longitude))

    for distance, direction, hazard, distances, waypoint_latitude, waypoint_longitude in sorted(candidates, key=lambda item: item[0]):
        still_trapped = any(
            directional_distances(waypoint_latitude, waypoint_longitude, other) is not None
            for other in hazards
        )
        if not still_trapped:
            return EscapePlan(
                hazard_id=int(hazard.id),
                direction=direction,
                distance_meters=float(distance),
                distances=distances,
                waypoint_latitude=waypoint_latitude,
                waypoint_longitude=waypoint_longitude,
            )
    return None
