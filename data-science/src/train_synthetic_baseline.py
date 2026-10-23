"""Train a clearly non-operational synthetic-label prototype.

The target is derived from the existing provisional baseline score. It is not
an observed hazard label and must not be used for operational prediction.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, balanced_accuracy_score, classification_report, confusion_matrix
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_ROOT = PROJECT_ROOT / "data-science" / "data"
INPUT_PATH = DATA_ROOT / "derived" / "south_caloocan_baseline_scores.csv"
REPORT_PATH = DATA_ROOT / "derived" / "synthetic_baseline_model_report.json"
FEATURE_COLUMNS = (
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
)
CLASS_NAMES = ("low", "medium", "high")


def main() -> None:
    with INPUT_PATH.open(newline="", encoding="utf-8") as file:
        rows = list(csv.DictReader(file))
    if not rows:
        raise ValueError("No baseline rows found")

    scores = np.array([float(row["baseline_score"]) for row in rows])
    features = np.array([[float(row[column] or 0.0) for column in FEATURE_COLUMNS] for row in rows])
    lower, upper = np.quantile(scores, [1 / 3, 2 / 3])
    target = np.digitize(scores, bins=[lower, upper], right=False)

    x_train, x_test, y_train, y_test = train_test_split(
        features,
        target,
        test_size=0.2,
        random_state=42,
        stratify=target,
    )
    model = make_pipeline(
        StandardScaler(),
        LogisticRegression(max_iter=1000, random_state=42),
    )
    model.fit(x_train, y_train)
    predictions = model.predict(x_test)

    report = {
        "status": "synthetic_prototype_only",
        "warning": "Target labels are quantile bins derived from provisional baseline_score; no observed hazard labels were used.",
        "input_rows": len(rows),
        "feature_columns": list(FEATURE_COLUMNS),
        "target_definition": {
            "source_column": "baseline_score",
            "class_names": list(CLASS_NAMES),
            "quantile_cutoffs": {"low_medium": float(lower), "medium_high": float(upper)},
        },
        "split": {"test_size": 0.2, "random_state": 42, "train_rows": len(x_train), "test_rows": len(x_test)},
        "metrics": {
            "accuracy": float(accuracy_score(y_test, predictions)),
            "balanced_accuracy": float(balanced_accuracy_score(y_test, predictions)),
            "classification_report": classification_report(y_test, predictions, target_names=CLASS_NAMES, output_dict=True),
            "confusion_matrix": confusion_matrix(y_test, predictions).tolist(),
        },
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
