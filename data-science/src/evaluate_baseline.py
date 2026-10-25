"""Produce label-free diagnostics for the provisional baseline scores."""

from __future__ import annotations

import csv
import json
import statistics
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_ROOT = PROJECT_ROOT / "data-science" / "data"
SCORES_PATH = DATA_ROOT / "derived" / "south_caloocan_baseline_scores.csv"
OUTPUT_PATH = DATA_ROOT / "derived" / "baseline_evaluation_report.json"


def number(row: dict[str, str], field: str) -> float:
    value = float(row[field])
    if not 0.0 <= value <= 1.0:
        raise ValueError(f"{field} must be within [0, 1], got {value}")
    return value


def percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    position = (len(ordered) - 1) * fraction
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    interpolation = position - lower
    return ordered[lower] + (ordered[upper] - ordered[lower]) * interpolation


def main() -> None:
    with SCORES_PATH.open("r", newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    if not rows:
        raise ValueError("Baseline score table is empty")

    scores = [number(row, "baseline_score") for row in rows]
    flood_scores = [number(row, "flood_score") for row in rows]
    fire_scores = [number(row, "fire_score") for row in rows]
    sorted_rows = sorted(rows, key=lambda row: float(row["baseline_score"]), reverse=True)
    top_decile_size = max(1, round(len(rows) * 0.1))
    top_decile = [float(row["baseline_score"]) for row in sorted_rows[:top_decile_size]]
    threshold_counts = {
        str(threshold): {
            "count": sum(score >= threshold for score in scores),
            "proportion": round(sum(score >= threshold for score in scores) / len(scores), 6),
        }
        for threshold in (0.2, 0.3, 0.4, 0.5)
    }
    report: dict[str, Any] = {
        "evaluation_type": "label_free_baseline_diagnostics",
        "input_rows": len(rows),
        "score_bounds_valid": all(0.0 <= score <= 1.0 for score in scores),
        "score_distribution": {
            "min": min(scores),
            "p25": percentile(scores, 0.25),
            "median": statistics.median(scores),
            "p75": percentile(scores, 0.75),
            "max": max(scores),
            "mean": statistics.mean(scores),
        },
        "component_distribution": {
            "flood": {"min": min(flood_scores), "max": max(flood_scores), "mean": statistics.mean(flood_scores)},
            "fire": {"min": min(fire_scores), "max": max(fire_scores), "mean": statistics.mean(fire_scores)},
        },
        "threshold_counts": threshold_counts,
        "top_decile": {
            "cell_count": top_decile_size,
            "mean_score": statistics.mean(top_decile),
            "grid_ids": [row["grid_id"] for row in sorted_rows[:top_decile_size]],
        },
        "unavailable_evaluation": [
            "No precision, recall, F1, ROC-AUC, PR-AUC, calibration, MAE, or RMSE: no verified hazard labels are available.",
            "No temporal or geographic holdout evaluation: the current table is a single provisional snapshot.",
        ],
        "limitations": [
            "Scores use a provisional bounding box rather than a verified barangay boundary.",
            "The rainfall threshold and OSM urban-form proxies are not calibrated to observed incidents.",
            "Earthquake and vulnerability components are absent.",
        ],
    }
    with OUTPUT_PATH.open("w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)
        handle.write("\n")


if __name__ == "__main__":
    main()
