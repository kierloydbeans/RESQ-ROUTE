# RESQ-ROUTE Data Science Plan

## Purpose

Design a reproducible Python data-science workflow for multi-hazard prediction and risk scoring in South Caloocan. The first implementation should support analysis and prototyping without changing the database or presenting model estimates as confirmed incidents.

This plan is based on the [multi-hazard dataset setup guide](./multi_hazard_datasets_setup_guide.md).

## Scope and boundaries

### Initial geographic scope

- South Caloocan, Philippines.
- Use a consistent coordinate reference system for all spatial operations, retaining WGS 84 / EPSG:4326 for interchange and transforming to a suitable projected CRS for distance, area, density, and buffering calculations.
- Define the exact boundary before feature extraction and record its source and version.

### Initial hazard domains

1. Flood and rainfall exposure.
2. Earthquake and active-fault proximity.
3. Urban fire susceptibility.
4. Medical and population vulnerability.

### Explicitly out of scope for the planning phase

- Downloading or licensing datasets.
- Installing Python or GIS dependencies.
- Applying Supabase/PostGIS SQL or changing migrations.
- Training a production model without confirmed labels and representative historical observations.
- Automatically triggering public warnings or emergency dispatch decisions.

## Data acquisition and governance

Create a data inventory before processing any source. Each entry should record the provider, URL, license or usage terms, retrieval timestamp, geographic coverage, temporal coverage, format, coordinate system, resolution, update frequency, and known limitations.

| Domain | Candidate inputs | Intended use | Key validation |
| --- | --- | --- | --- |
| Earthquake | PHIVOLCS/GeoRiskPH active faults and available seismic hazard layers | Distance to nearest fault and optional ground-shaking indicators | Confirm official source, geometry validity, coverage of South Caloocan, and units |
| Flood | Project NOAH or equivalent susceptibility/extent layers; Open-Meteo precipitation | Baseline flood exposure plus recent rainfall features | Check timestamp alignment, rainfall units, missing hours, and whether historical layers are predictive or descriptive only |
| Fire | OpenStreetMap buildings, roads, and historical BFP incidents if available | Building density, road accessibility, and incident history | Check OSM completeness, road classification, duplicate geometries, and incident geocoding quality |
| Medical/vulnerability | PSA population data and OSM hospitals, clinics, schools, and evacuation facilities | Population exposure and access/vulnerability features | Check aggregation level, publication date, facility completeness, and privacy constraints |

Do not infer labels from the same live indicators used as model features. Historical incident records must be time-stamped and separated from future prediction windows to reduce leakage.

## Proposed data pipeline

### 1. Ingest and stage

- Keep raw source files immutable under a clearly named local data directory that is excluded from version control when appropriate.
- Store source metadata and checksums in a manifest.
- Parse GeoJSON, SHP/KMZ-derived data, CSV, GeoTIFF, and weather API responses into documented intermediate formats.
- Reject malformed geometries, invalid coordinates, impossible timestamps, and unrecognized units with actionable validation messages.

### 2. Normalize spatial data

- Standardize longitude/latitude field names and geometry types.
- Repair or quarantine invalid geometries rather than silently dropping them.
- Clip analysis layers to South Caloocan only after preserving source-level provenance.
- Use spatial joins and projected geometries for distances, areas, buffers, and density calculations.
- Retain the original source identifiers so every derived feature can be traced back to source records.

### 3. Build an analysis unit

Use a consistent prediction unit before training. The preferred initial option is a regular grid or barangay-level unit with a documented identifier, centroid, geometry, and time window. The choice must match the available labels:

- Use a grid when spatial variation and routing proximity are important.
- Use barangays when labels and population data are only available at administrative level.
- Use point-level records only for event-level modeling with suitable privacy and deduplication controls.

### 4. Create features

Candidate feature groups include:

- Rainfall totals and intensity over 1-hour, 6-hour, 24-hour, and multi-day windows.
- Historical flood exposure or susceptibility, with source resolution and confidence retained.
- Distance to active faults and, when available, seismic hazard indicators.
- Building count, building density, estimated built-up area, and road-network accessibility.
- Distance and travel-time proxies to hospitals, clinics, schools, shelters, and emergency facilities.
- Population density and vulnerability indicators at the smallest legally and practically usable aggregation level.
- Temporal fields such as hour, day, month, season, and recent incident counts, with leakage checks.

Every feature should have a definition, unit, source, transformation, missing-value policy, and valid time window.

## Modeling strategy

Begin with a transparent risk-index baseline before supervised prediction:

```text
combined_score =
    w_flood * flood_score +
    w_quake * earthquake_score +
    w_fire * fire_score +
    w_vulnerability * vulnerability_score
```

Weights must be configuration values documented with their rationale, not hidden constants. Normalize component scores consistently to `[0, 1]`, preserve component scores alongside the combined score, and avoid calling the result a probability unless it has been calibrated against observed outcomes.

For supervised models, select the target separately for each hazard. Possible targets include an event in the next time window, severity category, or expected event count. Compare a simple baseline with an interpretable model such as logistic regression, calibrated tree-based models, or regularized regression before considering more complex algorithms.

Use pandas and scikit-learn by default. Put preprocessing, imputation, encoding, scaling, and model fitting inside a single pipeline so training and inference apply identical transformations.

## Validation and evaluation

- Prefer time-based holdouts for forecasting and geographic holdouts when the model must generalize to unseen areas.
- Use random splits only when the data-generating process supports that assumption and document the justification.
- Compare against naive and risk-index baselines.
- For classification, report precision, recall, F1, PR-AUC, ROC-AUC where meaningful, confusion matrices, calibration, and threshold tradeoffs.
- For regression or counts, report MAE, RMSE, and error distributions by hazard and area.
- Report performance separately for each hazard, time period, and relevant vulnerability group where sample sizes permit.
- Assess false-negative impact explicitly because missed hazards can be more harmful than excess alerts.
- Test robustness to missing weather data, incomplete map features, boundary changes, and delayed incident records.

## Interpretability, uncertainty, and safety

- Provide feature importance or coefficient summaries with clear caveats about correlation and causation.
- Record prediction confidence, calibration status, and the input data timestamp.
- Distinguish risk estimates, forecasts, alerts, and confirmed incidents in names, API responses, and UI text.
- Define a fallback response when required inputs are missing or stale; do not silently substitute zero risk.
- Avoid exposing sensitive household or resident-level information in training artifacts, logs, exports, or visualizations.
- Keep human review in the loop for operational decisions until the model is validated against representative historical outcomes.

## Planned Python project structure

The exact paths should be confirmed after repository inspection. A possible structure is:

```text
data-science/
├── data_science_plan.md
├── configs/                  # feature, boundary, and scoring configuration
├── notebooks/                # exploratory analysis only
├── src/
│   ├── ingest.py             # source loading and manifest validation
│   ├── spatial_features.py   # geometry normalization and spatial features
│   ├── temporal_features.py  # rainfall and event-window features
│   ├── scoring.py            # transparent multi-hazard baseline
│   ├── train.py              # reproducible model training
│   └── evaluate.py           # time/geographic validation and reports
├── tests/                    # unit and data-contract tests
└── artifacts/                # local ignored outputs and model metadata
```

Do not commit raw resident data, secrets, database credentials, or generated model artifacts unless a specific reviewable artifact is required.

## Integration plan

1. Produce offline feature and evaluation outputs first.
2. Define a versioned prediction input/output contract for the FastAPI service.
3. Add backend inference only after schema validation, error handling, and model artifact loading are tested.
4. Expose predictions to the dashboard with timestamp, scope, confidence/calibration status, and a clear estimate disclaimer.
5. Consider PostGIS storage and spatial indexes only after the data model and retention policy are approved.
6. Add monitoring for input freshness, missingness, feature drift, prediction distribution, and realized outcomes.

## Deliverables by phase

### Phase 0: Discovery and approval

- Confirm South Caloocan boundary and prediction unit.
- Complete the source inventory and licensing review.
- Define target events, forecast horizons, and acceptable false-negative/false-positive tradeoffs.

### Phase 1: Dataset preparation

- Add a reproducible acquisition manifest.
- Validate and normalize each dataset.
- Generate a documented spatial/temporal feature table without database changes.

### Phase 2: Baselines and evaluation

- Implement the weighted risk-index baseline.
- Train hazard-specific baseline models where labels are available.
- Produce evaluation, calibration, error, and data-quality reports.

### Phase 3: Service integration

- Freeze a model and feature version.
- Add tested FastAPI inference endpoints and safe fallback behavior.
- Integrate dashboard display and operational disclaimers.

### Phase 4: Monitoring and iteration

- Track drift, data freshness, calibration, and realized incidents.
- Reassess weights and retraining cadence using observed performance.
- Review privacy, access control, and retention requirements at each release.

## Immediate next decisions

1. Confirm the exact South Caloocan boundary source and prediction unit.
2. Confirm whether the first deliverable is a transparent risk score, supervised event prediction, or both.
3. Identify available historical flood, fire, earthquake, and medical incident labels.
4. Confirm permitted public-data sources and acceptable retrieval/storage locations.
5. Define the initial forecast horizon and minimum acceptable validation evidence.
