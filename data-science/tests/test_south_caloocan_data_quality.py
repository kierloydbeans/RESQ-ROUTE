"""Lightweight QA checks for the provisional South Caloocan data outputs."""

from __future__ import annotations

import csv
import json
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]
GRID_PATH = ROOT / "data" / "derived" / "south_caloocan_real_hazard_features.csv"
BOUNDARY_PATH = ROOT / "data" / "metadata" / "south_caloocan_barangay_boundary_validation.json"
REAL_HAZARD_PATH = ROOT / "data" / "derived" / "south_caloocan_real_hazard_features.csv"
EXPECTED_GRID_ROWS = 288
BOUNDS = {"lat": (14.6000, 14.6900), "lon": (120.9500, 121.0300)}
PRIMARY_COLUMNS = {"grid_id", "min_lat", "min_lon", "max_lat", "max_lon"}
NORMALIZED_HINTS = ("score", "risk", "probability", "normalized")


@pytest.fixture(scope="module")
def grid_rows() -> list[dict[str, str]]:
    with GRID_PATH.open(newline="", encoding="utf-8") as file:
        return list(csv.DictReader(file))


def test_boundary_validation_has_164_barangays() -> None:
    data = json.loads(BOUNDARY_PATH.read_text(encoding="utf-8"))
    assert data.get("valid") is True, "Boundary validation report is not valid"
    assert data.get("requested_relation_count") == 164, "Expected 164 requested barangays"
    assert data.get("returned_relation_count") == 164, "Expected 164 returned barangays"
    assert not data.get("missing_relation_ids"), "Boundary relations are missing"
    assert not data.get("extra_relation_ids"), "Boundary contains unexpected relations"


def test_grid_row_count(grid_rows: list[dict[str, str]]) -> None:
    assert len(grid_rows) == EXPECTED_GRID_ROWS, f"Expected {EXPECTED_GRID_ROWS} grid rows, got {len(grid_rows)}"


def test_required_columns_and_primary_values(grid_rows: list[dict[str, str]]) -> None:
    columns = set(grid_rows[0]) if grid_rows else set()
    missing = PRIMARY_COLUMNS - columns
    assert not missing, f"Missing required columns: {sorted(missing)}"
    for index, row in enumerate(grid_rows, start=2):
        for column in PRIMARY_COLUMNS:
            assert row.get(column, "").strip() != "", f"Null primary value: {column} at CSV line {index}"


def test_coordinates_within_south_caloocan_wgs84(grid_rows: list[dict[str, str]]) -> None:
    for index, row in enumerate(grid_rows, start=2):
        for column in ("min_lat", "max_lat"):
            value = float(row[column])
            assert BOUNDS["lat"][0] <= value <= BOUNDS["lat"][1], f"{column} out of bounds at line {index}: {value}"
        for column in ("min_lon", "max_lon"):
            value = float(row[column])
            assert BOUNDS["lon"][0] <= value <= BOUNDS["lon"][1], f"{column} out of bounds at line {index}: {value}"


def test_normalized_features_are_unit_interval(grid_rows: list[dict[str, str]]) -> None:
    columns = set(grid_rows[0]) if grid_rows else set()
    normalized = sorted(column for column in columns if any(hint in column.lower() for hint in NORMALIZED_HINTS))
    if not normalized:
        pytest.skip("No normalized score columns are present in the grid feature table")
    for column in normalized:
        for index, row in enumerate(grid_rows, start=2):
            value = float(row[column])
            assert 0.0 <= value <= 1.0, f"{column} must be in [0, 1] at line {index}: {value}"


def test_real_hazard_output_has_expected_rows_and_scores() -> None:
    with REAL_HAZARD_PATH.open(newline="", encoding="utf-8") as file:
        rows = list(csv.DictReader(file))
    required = {
        "grid_id",
        "flood_susceptibility_score",
        "osm_critical_infrastructure_score",
        "osm_waterway_score",
        "station_threshold_proxy_score",
        "real_hazard_score",
    }
    assert len(rows) == EXPECTED_GRID_ROWS, f"Expected {EXPECTED_GRID_ROWS} real-hazard rows, got {len(rows)}"
    assert required <= set(rows[0]), f"Missing real-hazard columns: {sorted(required - set(rows[0]))}"
    for line_number, row in enumerate(rows, start=2):
        for column in required - {"grid_id"}:
            value = float(row[column])
            assert 0.0 <= value <= 1.0, f"{column} out of [0, 1] at line {line_number}: {value}"


def test_noah_flood_scores_are_present() -> None:
    with REAL_HAZARD_PATH.open(newline="", encoding="utf-8") as file:
        rows = list(csv.DictReader(file))
    scores = [float(row["flood_susceptibility_score"]) for row in rows]
    assert any(score > 0.0 for score in scores), "NOAH flood scores are all zero"
