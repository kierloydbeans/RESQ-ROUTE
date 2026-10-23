"""Versioned prediction contract for the provisional NOAH flood layer."""

from __future__ import annotations

import csv
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field


router = APIRouter()
FEATURES_PATH = Path(__file__).resolve().parents[4] / "data-science" / "data" / "derived" / "south_caloocan_real_hazard_features.csv"
MODEL_VERSION = "noah-static-flood-v1"
FEATURE_VERSION = "real-hazard-features-v1"


class FloodPrediction(BaseModel):
    grid_id: str
    barangay_name: Optional[str] = None
    latitude: float
    longitude: float
    flood_susceptibility_score: float = Field(ge=0.0, le=1.0)
    hazard_class: str


class FloodPredictionResponse(BaseModel):
    contract_version: str
    model_version: str
    feature_version: str
    scope: str
    generated_at: datetime
    calibration_status: str
    is_operational: bool
    disclaimer: str
    predictions: list[FloodPrediction]


def _read_predictions() -> list[FloodPrediction]:
    if not FEATURES_PATH.exists():
        raise HTTPException(status_code=503, detail="Prediction feature artifact is unavailable")
    try:
        with FEATURES_PATH.open(newline="", encoding="utf-8") as file:
            rows = list(csv.DictReader(file))
        predictions = []
        for row in rows:
            score = float(row["flood_susceptibility_score"])
            hazard_class = "high" if score >= 2 / 3 else "medium" if score >= 1 / 3 else "low"
            predictions.append(
                FloodPrediction(
                    grid_id=row["grid_id"],
                    barangay_name=row.get("barangay_name") or None,
                    latitude=(float(row["min_lat"]) + float(row["max_lat"])) / 2,
                    longitude=(float(row["min_lon"]) + float(row["max_lon"])) / 2,
                    flood_susceptibility_score=score,
                    hazard_class=hazard_class,
                )
            )
        return predictions
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=503, detail="Prediction feature artifact failed schema validation") from exc


@router.get("/flood", response_model=FloodPredictionResponse)
async def get_flood_predictions(
    grid_id: Optional[str] = Query(default=None, description="Return one grid prediction when supplied"),
) -> FloodPredictionResponse:
    predictions = _read_predictions()
    if grid_id is not None:
        predictions = [prediction for prediction in predictions if prediction.grid_id == grid_id]
        if not predictions:
            raise HTTPException(status_code=404, detail="Grid prediction not found")
    return FloodPredictionResponse(
        contract_version="1.0",
        model_version=MODEL_VERSION,
        feature_version=FEATURE_VERSION,
        scope="South Caloocan grid",
        generated_at=datetime.now(timezone.utc),
        calibration_status="not_calibrated",
        is_operational=False,
        disclaimer="Static NOAH susceptibility estimate; not a real-time flood forecast or emergency alert.",
        predictions=predictions,
    )
