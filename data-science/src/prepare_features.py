"""Prepare provisional South Caloocan spatial and rainfall features.

This module intentionally uses only the Python standard library. It creates
reviewable derived tables from the acquired OSM and Open-Meteo JSON files while
the authoritative study boundary and PHIVOLCS vector source remain unresolved.
"""

from __future__ import annotations

import csv
import json
import math
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_ROOT = PROJECT_ROOT / "data-science" / "data"
RAW_ROOT = DATA_ROOT / "raw"
DERIVED_ROOT = DATA_ROOT / "derived"

SOUTH = 14.6000
WEST = 120.9500
NORTH = 14.6900
EAST = 121.0300
GRID_STEP = 0.005
EARTH_RADIUS_M = 6_371_008.8


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError(f"Expected a JSON object in {path}")
    return value


def in_bbox(lat: float, lon: float) -> bool:
    return SOUTH <= lat <= NORTH and WEST <= lon <= EAST


def as_float(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def valid_point(lat: Any, lon: Any) -> tuple[float, float] | None:
    latitude = as_float(lat)
    longitude = as_float(lon)
    if latitude is None or longitude is None:
        return None
    if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
        return None
    return latitude, longitude


def geometry_points(element: dict[str, Any]) -> list[tuple[float, float]]:
    points: list[tuple[float, float]] = []
    for item in element.get("geometry", []):
        if not isinstance(item, dict):
            continue
        point = valid_point(item.get("lat"), item.get("lon"))
        if point is not None:
            points.append(point)
    if not points:
        center = element.get("center")
        if isinstance(center, dict):
            point = valid_point(center.get("lat"), center.get("lon"))
            if point is not None:
                points.append(point)
    if not points:
        point = valid_point(element.get("lat"), element.get("lon"))
        if point is not None:
            points.append(point)
    return points


def centroid(points: list[tuple[float, float]]) -> tuple[float, float] | None:
    bounded = [point for point in points if in_bbox(*point)]
    if not bounded:
        return None
    return (
        sum(point[0] for point in bounded) / len(bounded),
        sum(point[1] for point in bounded) / len(bounded),
    )


def grid_id(lat: float, lon: float) -> tuple[str, int, int] | None:
    if not in_bbox(lat, lon):
        return None
    row_count = round((NORTH - SOUTH) / GRID_STEP)
    column_count = round((EAST - WEST) / GRID_STEP)
    row = min(int((lat - SOUTH) / GRID_STEP), row_count - 1)
    column = min(int((lon - WEST) / GRID_STEP), column_count - 1)
    return f"sc-r{row:02d}-c{column:02d}", row, column


def haversine_m(first: tuple[float, float], second: tuple[float, float]) -> float:
    lat1, lon1 = map(math.radians, first)
    lat2, lon2 = map(math.radians, second)
    delta_lat = lat2 - lat1
    delta_lon = lon2 - lon1
    value = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lon / 2) ** 2
    )
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(value))


def polygon_area_m2(points: list[tuple[float, float]]) -> float:
    if len(points) < 3:
        return 0.0
    mean_lat = math.radians(sum(point[0] for point in points) / len(points))
    projected = [
        (
            math.radians(lon) * EARTH_RADIUS_M * math.cos(mean_lat),
            math.radians(lat) * EARTH_RADIUS_M,
        )
        for lat, lon in points
    ]
    area = 0.0
    for first, second in zip(projected, projected[1:] + projected[:1]):
        area += first[0] * second[1] - second[0] * first[1]
    return abs(area) / 2


def polyline_length_m(points: list[tuple[float, float]]) -> float:
    return sum(haversine_m(first, second) for first, second in zip(points, points[1:]))


def blank_grid() -> dict[str, dict[str, Any]]:
    grid: dict[str, dict[str, Any]] = {}
    row_count = round((NORTH - SOUTH) / GRID_STEP)
    column_count = round((EAST - WEST) / GRID_STEP)
    for row in range(row_count):
        for column in range(column_count):
            identifier = f"sc-r{row:02d}-c{column:02d}"
            grid[identifier] = {
                "grid_id": identifier,
                "row": row,
                "column": column,
                "min_lat": SOUTH + row * GRID_STEP,
                "min_lon": WEST + column * GRID_STEP,
                "max_lat": SOUTH + (row + 1) * GRID_STEP,
                "max_lon": WEST + (column + 1) * GRID_STEP,
                "building_count": 0,
                "building_area_m2": 0.0,
                "road_count": 0,
                "road_length_m": 0.0,
                "facility_count": 0,
                "hospital_count": 0,
                "clinic_count": 0,
                "doctor_count": 0,
                "school_count": 0,
                "shelter_count": 0,
                "ambulance_station_count": 0,
            }
    return grid


def aggregate_buildings(grid: dict[str, dict[str, Any]], report: dict[str, Any]) -> None:
    path = RAW_ROOT / "osm" / "south_caloocan_buildings_overpass.json"
    elements = load_json(path).get("elements", [])
    if not isinstance(elements, list):
        raise ValueError("OSM buildings payload has no elements list")
    accepted = 0
    invalid = 0
    outside = 0
    for element in elements:
        if not isinstance(element, dict):
            invalid += 1
            continue
        points = geometry_points(element)
        center = centroid(points)
        if center is None:
            outside += 1
            continue
        cell = grid_id(*center)
        if cell is None:
            outside += 1
            continue
        grid[cell[0]]["building_count"] += 1
        grid[cell[0]]["building_area_m2"] += polygon_area_m2(points)
        accepted += 1
    report["buildings"] = {"input": len(elements), "accepted": accepted, "invalid": invalid, "outside": outside}


def aggregate_roads(grid: dict[str, dict[str, Any]], report: dict[str, Any]) -> None:
    path = RAW_ROOT / "osm" / "south_caloocan_highways_overpass.json"
    elements = load_json(path).get("elements", [])
    if not isinstance(elements, list):
        raise ValueError("OSM highways payload has no elements list")
    accepted = 0
    invalid = 0
    outside = 0
    for element in elements:
        if not isinstance(element, dict):
            invalid += 1
            continue
        points = geometry_points(element)
        center = centroid(points)
        if center is None:
            outside += 1
            continue
        cell = grid_id(*center)
        if cell is None:
            outside += 1
            continue
        grid[cell[0]]["road_count"] += 1
        grid[cell[0]]["road_length_m"] += polyline_length_m(points)
        accepted += 1
    report["roads"] = {"input": len(elements), "accepted": accepted, "invalid": invalid, "outside": outside}


def aggregate_facilities(grid: dict[str, dict[str, Any]], report: dict[str, Any]) -> None:
    path = RAW_ROOT / "osm" / "south_caloocan_facilities_overpass.json"
    elements = load_json(path).get("elements", [])
    if not isinstance(elements, list):
        raise ValueError("OSM facilities payload has no elements list")
    accepted = 0
    invalid = 0
    outside = 0
    for element in elements:
        if not isinstance(element, dict):
            invalid += 1
            continue
        center = centroid(geometry_points(element))
        if center is None:
            outside += 1
            continue
        cell = grid_id(*center)
        if cell is None:
            outside += 1
            continue
        tags = element.get("tags", {})
        amenity = tags.get("amenity") if isinstance(tags, dict) else None
        amenity_feature = {"doctors": "doctor_count"}.get(amenity, f"{amenity}_count")
        if amenity in {"hospital", "clinic", "doctors", "school", "shelter"}:
            grid[cell[0]][amenity_feature] += 1
        elif isinstance(tags, dict) and tags.get("emergency") == "ambulance_station":
            grid[cell[0]]["ambulance_station_count"] += 1
        else:
            continue
        grid[cell[0]]["facility_count"] += 1
        accepted += 1
    report["facilities"] = {"input": len(elements), "accepted": accepted, "invalid": invalid, "outside": outside}


def hourly_features(path: Path) -> dict[str, Any]:
    payload = load_json(path)
    hourly = payload.get("hourly")
    if not isinstance(hourly, dict):
        raise ValueError(f"Missing hourly object in {path}")
    times = hourly.get("time", [])
    rain = hourly.get("rain", [])
    precipitation = hourly.get("precipitation", [])
    if not isinstance(times, list) or not isinstance(rain, list) or not isinstance(precipitation, list):
        raise ValueError(f"Invalid hourly arrays in {path}")
    if not len(times) == len(rain) == len(precipitation):
        raise ValueError(f"Hourly arrays have different lengths in {path}")
    values = [as_float(value) for value in rain]
    values = [value for value in values if value is not None]
    if not values:
        raise ValueError(f"No numeric rainfall values in {path}")
    latest = values[-1]
    return {
        "record_count": len(times),
        "first_timestamp": times[0] if times else None,
        "last_timestamp": times[-1] if times else None,
        "latest_rain_mm": latest,
        "rain_6h_total_mm": round(sum(values[-6:]), 3),
        "rain_24h_total_mm": round(sum(values[-24:]), 3),
        "rain_mean_mm": round(sum(values) / len(values), 3),
        "rain_max_mm": round(max(values), 3),
        "nonzero_rain_hours": sum(value > 0 for value in values),
    }


def write_csv(grid: dict[str, dict[str, Any]], weather: dict[str, Any]) -> None:
    output = DERIVED_ROOT / "south_caloocan_grid_features.csv"
    rows = []
    for value in grid.values():
        row = dict(value)
        row.update(
            {
                "weather_source": "open_meteo",
                "weather_first_timestamp": weather["first_timestamp"],
                "weather_last_timestamp": weather["last_timestamp"],
                "latest_rain_mm": weather["latest_rain_mm"],
                "rain_6h_total_mm": weather["rain_6h_total_mm"],
                "rain_24h_total_mm": weather["rain_24h_total_mm"],
            }
        )
        rows.append(row)
    with output.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    DERIVED_ROOT.mkdir(parents=True, exist_ok=True)
    grid = blank_grid()
    quality: dict[str, Any] = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "study_area": {
            "south": SOUTH,
            "west": WEST,
            "north": NORTH,
            "east": EAST,
            "grid_step_degrees": GRID_STEP,
            "grid_cells": len(grid),
            "boundary_status": "provisional_bbox",
        },
        "excluded_sources": {
            "phivolcs_kmz": "Excluded: metadata coverage mismatch and tile/image-based KML; no verified vector fault layer."
        },
    }
    aggregate_buildings(grid, quality)
    aggregate_roads(grid, quality)
    aggregate_facilities(grid, quality)
    forecast = hourly_features(RAW_ROOT / "weather" / "south_caloocan_open_meteo_forecast.json")
    historical = hourly_features(RAW_ROOT / "weather" / "south_caloocan_open_meteo_historical_2021_2025.json")
    quality["weather"] = {"forecast": forecast, "historical": historical}
    write_csv(grid, forecast)
    with (DERIVED_ROOT / "data_quality_report.json").open("w", encoding="utf-8") as handle:
        json.dump(quality, handle, indent=2)
        handle.write("\n")


if __name__ == "__main__":
    main()
