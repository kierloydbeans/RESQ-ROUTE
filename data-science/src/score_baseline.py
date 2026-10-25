"""Generate a transparent, provisional multi-hazard baseline score.

Only flood rainfall and urban-form fire proxies are available in the current
feature table. Missing earthquake and vulnerability components are excluded
from the denominator and reported explicitly; the output is not a probability
and must not drive operational alerts.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_ROOT = PROJECT_ROOT / "data-science" / "data"
FEATURES_PATH = DATA_ROOT / "derived" / "south_caloocan_grid_features.csv"
OUTPUT_PATH = DATA_ROOT / "derived" / "south_caloocan_baseline_scores.csv"
REPORT_PATH = DATA_ROOT / "derived" / "baseline_score_report.json"
CONFIG_PATH = PROJECT_ROOT / "data-science" / "configs" / "baseline_risk_config.json"


def load_config() -> dict[str, Any]:
    with CONFIG_PATH.open("r", encoding="utf-8") as handle:
        config = json.load(handle)
    if not isinstance(config, dict):
        raise ValueError("Baseline configuration must be a JSON object")
    return config


def number(row: dict[str, str], key: str) -> float:
    try:
        value = float(row[key])
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError(f"Invalid numeric feature {key!r}") from exc
    if value < 0:
        raise ValueError(f"Feature {key!r} cannot be negative")
    return value


def min_max(values: list[float]) -> list[float]:
    minimum = min(values)
    maximum = max(values)
    if maximum == minimum:
        return [0.0 for _ in values]
    return [(value - minimum) / (maximum - minimum) for value in values]


def main() -> None:
    config = load_config()
    with FEATURES_PATH.open("r", newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    if not rows:
        raise ValueError("Prepared feature table is empty")

    building_counts = [number(row, "building_count") for row in rows]
    road_lengths = [number(row, "road_length_m") for row in rows]
    rain_values = [number(row, "rain_24h_total_mm") for row in rows]
    building_density_score = min_max(building_counts)
    road_access_score = min_max(road_lengths)

    flood_threshold = float(config["flood"]["rain_24h_threshold_mm"])
    flood_scores = [min(value / flood_threshold, 1.0) for value in rain_values]
    fire_scores = [
        0.7 * density + 0.3 * (1.0 - access)
        for density, access in zip(building_density_score, road_access_score)
    ]

    weights = config["weights"]
    available_components = {"flood": flood_scores, "fire": fire_scores}
    available_weight = sum(float(weights[name]) for name in available_components)
    if available_weight <= 0:
        raise ValueError("Available component weights must sum to a positive value")

    output_rows: list[dict[str, Any]] = []
    for index, row in enumerate(rows):
        score = sum(
            float(weights[name]) * components[index]
            for name, components in available_components.items()
        ) / available_weight
        output = dict(row)
        output.update(
            {
                "flood_score": round(flood_scores[index], 6),
                "fire_score": round(fire_scores[index], 6),
                "earthquake_score": "",
                "vulnerability_score": "",
                "baseline_score": round(score, 6),
                "available_component_weight": round(available_weight, 6),
                "score_status": "provisional_partial_components",
                "is_probability": "false",
            }
        )
        output_rows.append(output)

    with OUTPUT_PATH.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(output_rows[0]))
        writer.writeheader()
        writer.writerows(output_rows)

    scores = [float(row["baseline_score"]) for row in output_rows]
    report = {
        "method": "weighted_partial_component_baseline",
        "input_rows": len(rows),
        "output_rows": len(output_rows),
        "weights": weights,
        "available_components": ["flood", "fire"],
        "excluded_components": ["earthquake", "vulnerability"],
        "available_component_weight": available_weight,
        "flood_threshold_mm_24h": flood_threshold,
        "score_range": {"min": min(scores), "max": max(scores)},
        "is_probability": False,
        "limitations": [
            "The study area is a provisional bounding box, not an authoritative South Caloocan boundary.",
            "Rainfall threshold is an uncalibrated configuration assumption.",
            "Building density and inverse road length are proxies, not incident labels.",
            "Earthquake and vulnerability components are unavailable and excluded from the denominator.",
        ],
    }
    with REPORT_PATH.open("w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)
        handle.write("\n")


if __name__ == "__main__":
    main()
