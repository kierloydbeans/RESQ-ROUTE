"""Detect route interceptions and resolve them with cardinal escape waypoints.

Road hazards are currently stored as a center point plus a radius.  This module
projects those circles (and optional GeoJSON polygons) into a local metre-based
coordinate system before doing the intersection math.  Shapely is used when it
is installed; the circle/segment fallback keeps the routing service usable in
minimal deployments.
"""

from dataclasses import dataclass
import logging
import math
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from app.models.road_hazard import RoadHazardReport

try:  # Optional dependency: PostGIS/GeoPandas deployments can provide Shapely.
    from shapely.geometry import LineString, Point, Polygon
except ImportError:  # pragma: no cover - exercised only in minimal deployments.
    LineString = Point = Polygon = None  # type: ignore[assignment,misc]

Coordinate = Tuple[float, float]  # latitude, longitude
logger = logging.getLogger(__name__)
CARDINAL_DIRECTIONS: Dict[str, Tuple[float, float]] = {
    "N": (0.0, 1.0),
    "S": (0.0, -1.0),
    "E": (1.0, 0.0),
    "W": (-1.0, 0.0),
}
CARDINAL_SWEEP_DISTANCES_METERS = (30.0, 45.0, 60.0, 90.0)


@dataclass(frozen=True)
class NetworkBounds:
    min_latitude: float
    min_longitude: float
    max_latitude: float
    max_longitude: float

    def contains(self, coordinate: Coordinate) -> bool:
        latitude, longitude = coordinate
        return (
            self.min_latitude <= latitude <= self.max_latitude
            and self.min_longitude <= longitude <= self.max_longitude
        )


@dataclass(frozen=True)
class HazardInterception:
    hazard_id: int
    checkpoint: Coordinate
    route_distance_meters: float
    segment_index: int
    hazard_radius_meters: float


@dataclass(frozen=True)
class CardinalEscapeCandidate:
    direction: str
    coordinate: Coordinate
    safe: bool
    offset_meters: float
    distance_to_destination_meters: float
    blocked_by: Tuple[int, ...] = ()


@dataclass(frozen=True)
class CardinalEscape:
    checkpoint: Coordinate
    direction: str
    waypoint: Coordinate
    candidates: Tuple[CardinalEscapeCandidate, ...]


def _meters_per_degree(latitude: float) -> Tuple[float, float]:
    return 111_320.0 * math.cos(math.radians(latitude)), 111_320.0


def _to_xy(reference: Coordinate, coordinate: Coordinate) -> Tuple[float, float]:
    meters_per_longitude, meters_per_latitude = _meters_per_degree(reference[0])
    return (
        (coordinate[1] - reference[1]) * meters_per_longitude,
        (coordinate[0] - reference[0]) * meters_per_latitude,
    )


def _from_xy(reference: Coordinate, point: Tuple[float, float]) -> Coordinate:
    meters_per_longitude, meters_per_latitude = _meters_per_degree(reference[0])
    return (
        reference[0] + point[1] / meters_per_latitude,
        reference[1] + point[0] / meters_per_longitude,
    )


def _circle_coordinates(center: Coordinate, radius_meters: float, steps: int = 64) -> List[Tuple[float, float]]:
    return [
        (
            center[0] + radius_meters * math.cos(2 * math.pi * index / steps),
            center[1] + radius_meters * math.sin(2 * math.pi * index / steps),
        )
        for index in range(steps)
    ]


def _hazard_polygon(hazard: RoadHazardReport, reference: Coordinate) -> Any:
    geometry = getattr(hazard, "geometry", None)
    if geometry and geometry.get("type") == "Polygon":
        ring = geometry.get("coordinates", [[]])[0]
        return Polygon([_to_xy(reference, (float(point[1]), float(point[0]))) for point in ring])
    center = (float(hazard.latitude), float(hazard.longitude))
    return Polygon(_circle_coordinates(_to_xy(reference, center), max(1.0, float(hazard.radius_meters))))


def _point_inside_circle(coordinate: Coordinate, hazard: RoadHazardReport) -> bool:
    meters_per_longitude, meters_per_latitude = _meters_per_degree(hazard.latitude)
    east = (coordinate[1] - hazard.longitude) * meters_per_longitude
    north = (coordinate[0] - hazard.latitude) * meters_per_latitude
    return math.hypot(east, north) <= max(1.0, float(hazard.radius_meters))


def _ray_enters_hazard(start: Coordinate, end: Coordinate, hazard: RoadHazardReport) -> bool:
    """Return true when the checkpoint-to-waypoint ray crosses hazard interior."""
    if Polygon is not None:
        reference = start
        line = LineString([_to_xy(reference, start), _to_xy(reference, end)])
        polygon = _hazard_polygon(hazard, reference)
        intersection = line.intersection(polygon)
        # A tangent or a boundary touch is not an interior crossing. A positive
        # line intersection length means the ray actually travels through it.
        return polygon.contains(Point(*line.coords[-1])) or intersection.length > 0.01

    # Dependency-free fallback: sample the ray in small increments. This is
    # sufficient for the short 30-90 m cardinal sweep distances.
    for index in range(1, 25):
        fraction = index / 24
        point = (
            start[0] + fraction * (end[0] - start[0]),
            start[1] + fraction * (end[1] - start[1]),
        )
        if _point_inside_circle(point, hazard):
            return True
    return False


def _segment_circle_intersection(
    start: Coordinate,
    end: Coordinate,
    hazard: RoadHazardReport,
) -> Optional[Tuple[float, Coordinate]]:
    """Return the first segment distance and coordinate entering a radius circle."""
    # Keep the projection local to the hazard center for stable metre math.
    sx, sy = _to_xy((hazard.latitude, hazard.longitude), start)
    ex, ey = _to_xy((hazard.latitude, hazard.longitude), end)
    dx, dy = ex - sx, ey - sy
    radius = max(1.0, float(hazard.radius_meters))
    a = dx * dx + dy * dy
    if a == 0:
        return None
    b = 2 * (sx * dx + sy * dy)
    c = sx * sx + sy * sy - radius * radius
    discriminant = b * b - 4 * a * c
    if discriminant < 0:
        return None
    roots = sorted(((-b - math.sqrt(discriminant)) / (2 * a), (-b + math.sqrt(discriminant)) / (2 * a)))
    for fraction in roots:
        if 0 <= fraction <= 1:
            point = (start[0] + fraction * (end[0] - start[0]), start[1] + fraction * (end[1] - start[1]))
            before_fraction = max(0.0, fraction - 1e-7)
            before = (start[0] + before_fraction * (end[0] - start[0]), start[1] + before_fraction * (end[1] - start[1]))
            after_fraction = min(1.0, fraction + 1e-7)
            after = (start[0] + after_fraction * (end[0] - start[0]), start[1] + after_fraction * (end[1] - start[1]))
            if not _point_inside_circle(before, hazard) and _point_inside_circle(after, hazard):
                return fraction, point
    return None


def _intersection_points(geometry: Any) -> Iterable[Any]:
    if geometry is None or geometry.is_empty:
        return ()
    if geometry.geom_type == "Point":
        return (geometry,)
    points: List[Any] = []
    for child in getattr(geometry, "geoms", ()):
        points.extend(_intersection_points(child))
    return points


def first_hazard_interception(
    route_coordinates: Sequence[Sequence[float]],
    hazards: Iterable[RoadHazardReport],
) -> Optional[HazardInterception]:
    """Find the earliest route point that enters any active hazard."""
    if len(route_coordinates) < 2:
        return None
    route = [(float(point[1]), float(point[0])) for point in route_coordinates]
    hazards = [hazard for hazard in hazards if hazard.is_active and not hazard.is_resolved]
    best: Optional[HazardInterception] = None
    travelled = 0.0
    for segment_index, (start, end) in enumerate(zip(route, route[1:])):
        segment_length = math.hypot(*(_to_xy(start, end)))
        for hazard in hazards:
            crossing: Optional[Tuple[float, Coordinate]] = None
            if Polygon is not None:
                reference = start
                line = LineString([_to_xy(reference, start), _to_xy(reference, end)])
                polygon = _hazard_polygon(hazard, reference)
                if polygon.contains(Point(*line.coords[0])):
                    crossing = (0.0, start)
                else:
                    points = _intersection_points(line.intersection(polygon.boundary))
                    first = min(points, key=lambda point: line.project(point), default=None)
                    if first is not None:
                        fraction = line.project(first) / max(line.length, 1e-9)
                        before = start[0] + max(0.0, fraction - 1e-7) * (end[0] - start[0]), start[1] + max(0.0, fraction - 1e-7) * (end[1] - start[1])
                        after = start[0] + min(1.0, fraction + 1e-7) * (end[0] - start[0]), start[1] + min(1.0, fraction + 1e-7) * (end[1] - start[1])
                        if not polygon.contains(Point(*_to_xy(reference, before))) and polygon.contains(Point(*_to_xy(reference, after))):
                            crossing = (fraction, _from_xy(reference, (first.x, first.y)))
            else:
                crossing = _segment_circle_intersection(start, end, hazard)
            if crossing:
                distance = travelled + segment_length * crossing[0]
                if best is None or distance < best.route_distance_meters:
                    best = HazardInterception(int(hazard.id), crossing[1], distance, segment_index, float(hazard.radius_meters))
        travelled += segment_length
    return best


def resolve_cardinal_escape(
    interception: HazardInterception,
    destination: Coordinate,
    hazards: Iterable[RoadHazardReport],
    network_bounds: Optional[NetworkBounds] = None,
) -> Optional[CardinalEscape]:
    """Sweep cardinal offsets and select the safe candidate closest to destination."""
    hazards = [hazard for hazard in hazards if hazard.is_active and not hazard.is_resolved]
    candidates: List[CardinalEscapeCandidate] = []
    for direction, (east_unit, north_unit) in CARDINAL_DIRECTIONS.items():
        selected_candidate: Optional[CardinalEscapeCandidate] = None
        last_candidate: Optional[CardinalEscapeCandidate] = None
        for offset_meters in CARDINAL_SWEEP_DISTANCES_METERS:
            candidate = _from_xy(
                interception.checkpoint,
                (east_unit * offset_meters, north_unit * offset_meters),
            )
            blocked_by = tuple(
                int(hazard.id)
                for hazard in hazards
                if _ray_enters_hazard(interception.checkpoint, candidate, hazard)
            )
            safe = not blocked_by and (network_bounds is None or network_bounds.contains(candidate))
            current = CardinalEscapeCandidate(
                direction=direction,
                coordinate=candidate,
                safe=safe,
                offset_meters=offset_meters,
                distance_to_destination_meters=math.hypot(*_to_xy(candidate, destination)),
                blocked_by=blocked_by,
            )
            last_candidate = current
            if safe:
                selected_candidate = current
                break
        candidate = selected_candidate or last_candidate
        if candidate is None:
            continue
        logger.info(
            "[cardinal] direction=%s coordinate=(%.7f, %.7f) safety=%s blocked_by=%s offset_m=%.1f",
            candidate.direction,
            candidate.coordinate[0],
            candidate.coordinate[1],
            1 if candidate.safe else 0,
            list(candidate.blocked_by),
            candidate.offset_meters,
        )
        candidates.append(candidate)
    safe_candidates = [candidate for candidate in candidates if candidate.safe]
    if not safe_candidates:
        return None
    selected = min(safe_candidates, key=lambda candidate: candidate.distance_to_destination_meters)
    return CardinalEscape(interception.checkpoint, selected.direction, selected.coordinate, tuple(candidates))
