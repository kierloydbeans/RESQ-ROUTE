"""Train and evaluate a non-leaky model against NOAH flood labels.

The target is a static hazard label derived from the area-weighted NOAH score,
not a time-stamped flood incident or operational forecast.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, balanced_accuracy_score, classification_report, confusion_matrix
from sklearn.model_selection import GroupShuffleSplit, train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_ROOT = PROJECT_ROOT / "data-science" / "data"
INPUT_PATH = DATA_ROOT / "derived" / "south_caloocan_real_hazard_features.csv"
REPORT_PATH = DATA_ROOT / "derived" / "noah_flood_model_report.json"
FEATURE_COLUMNS = (
    "min_lat",
    "min_lon",
    "max_lat",
    "max_lon",
    "building_count",
    "building_area_m2",
    "road_count",
    "road_length_m",
    "facility_count",
    "hospital_count",
    "clinic_count",
    "doctor_count",
    "school_count",
    "shelter_count",
    "ambulance_station_count",
    "latest_rain_mm",
    "rain_6h_total_mm",
    "rain_24h_total_mm",
    "osm_critical_count",
    "osm_waterway_length_m",
)


def main() -> None:
    with INPUT_PATH.open(newline="", encoding="utf-8") as file:
        rows = list(csv.DictReader(file))
    if not rows:
        raise ValueError("No real-hazard rows found")

    scores = np.array([float(row["flood_susceptibility_score"]) for row in rows])
    target = (scores >= (1.0 / 3.0)).astype(int)
    features = np.array([[float(row[column] or 0.0) for column in FEATURE_COLUMNS] for row in rows])
    groups = np.array([int(row["row"]) for row in rows])
    if len(np.unique(target)) < 2:
        raise ValueError("NOAH flood labels contain only one class")

    splitter = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=42)
    train_indices, test_indices = next(splitter.split(features, target, groups=groups))
    split_strategy = "spatial_row_group_holdout"
    if len(np.unique(target[test_indices])) < 2 or len(np.unique(target[train_indices])) < 2:
        train_indices, test_indices = train_test_split(
            np.arange(len(rows)), test_size=0.2, random_state=42, stratify=target
        )
        split_strategy = "stratified_random_fallback"

    model = make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000, class_weight="balanced", random_state=42))
    model.fit(features[train_indices], target[train_indices])
    predictions = model.predict(features[test_indices])
    report = {
        "status": "noah_static_hazard_model",
        "warning": "This predicts a static NOAH susceptibility label; it is not a temporal flood-event forecast.",
        "input_rows": len(rows),
        "feature_columns": list(FEATURE_COLUMNS),
        "excluded_target_columns": ["flood_susceptibility_score", "real_hazard_score"],
        "target_definition": {
            "source_column": "flood_susceptibility_score",
            "positive_class": "score >= 1/3",
            "class_counts": {str(label): int((target == label).sum()) for label in np.unique(target)},
        },
        "split": {
            "strategy": split_strategy,
            "random_state": 42,
            "train_rows": len(train_indices),
            "test_rows": len(test_indices),
        },
        "metrics": {
            "accuracy": float(accuracy_score(target[test_indices], predictions)),
            "balanced_accuracy": float(balanced_accuracy_score(target[test_indices], predictions)),
            "classification_report": classification_report(target[test_indices], predictions, output_dict=True),
            "confusion_matrix": confusion_matrix(target[test_indices], predictions).tolist(),
        },
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
