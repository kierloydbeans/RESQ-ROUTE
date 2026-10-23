# South Caloocan Dataset Acquisition Manifest

Acquisition date: 2026-10-23

Status: initial raw-data acquisition complete with source and geographic caveats documented below.

Study area: provisional South Caloocan bounding box `14.6000,120.9500,14.6900,121.0300` in WGS 84 (`south,west,north,east`). This is an acquisition envelope, not an approved administrative boundary. It must be replaced or clipped to a verified South Caloocan boundary before feature generation or modeling.

Guide coordinate used for point weather data: latitude `14.6507`, longitude `120.9830`.

## Acquired files

| Domain | Local file | Source | Coverage / contents | SHA-256 |
| --- | --- | --- | --- | --- |
| Earthquake | `data/raw/earthquake/distribution-of-active-faults-in-the-philippines_mar2019.kmz` | [HDX Philippines - GeoHazards Data](https://data.humdata.org/dataset/philippines-geohazards-data) / PHIVOLCS | KMZ downloaded from the guide’s resource URL | `7FFA7782607C8B780BC3F2A9559253999F0CA853A191EEFD092E3B1E7772DE7E` |
| OSM buildings | `data/raw/osm/south_caloocan_buildings_overpass.json` | [OpenStreetMap Overpass](https://overpass.kumi.systems/) | `way[building]`, provisional bounding box, geometry included; 233,716 elements validated by JSON parsing | `DFAE5F277B1F538865D0CE342596A24EFE4DEFEEF49373A05AC967D46375603E` |
| OSM roads | `data/raw/osm/south_caloocan_highways_overpass.json` | [OpenStreetMap Overpass](https://overpass.kumi.systems/) | Main road classes (`primary`, `secondary`, `tertiary`, `residential`, `unclassified`, `service`), provisional bounding box, geometry included; 23,122 elements validated by JSON parsing | `6ACBAFF00878CC3C384078A64B7F4532886D156B36C7841E7C3AB32DD16C30D8` |
| OSM facilities | `data/raw/osm/south_caloocan_facilities_overpass.json` | [OpenStreetMap Overpass](https://overpass.kumi.systems/) | Hospitals, clinics, doctors, schools, shelters, and ambulance stations; provisional bounding box; 658 elements validated by JSON parsing | `C86D753A38809DD329AEB3BEF48E144573CD6AF54D02CDFA65585BD5C5052664` |
| Weather forecast | `data/raw/weather/south_caloocan_open_meteo_forecast.json` | [Open-Meteo Forecast API](https://api.open-meteo.com/v1/forecast) | Seven-day hourly `precipitation` and `rain` series at the guide coordinate; 168 hourly records validated by JSON parsing | `57184BCB4F400BE0A60933347CCF2F0E07EC685D259987B7E57DFAC622ED29B7` |
| Historical weather | `data/raw/weather/south_caloocan_open_meteo_historical_2021_2025.json` | [Open-Meteo Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api) | Hourly `precipitation` and `rain`, 2021-01-01 through 2025-12-31 at the guide coordinate; 43,824 hourly records validated by JSON parsing | `0CFBD08DF85C6946313042CA9917437CBC668869FAEC1AD6560BDB437E6BF002` |

## Provenance and licensing notes

- The HDX package identifies PHIVOLCS as the source and reports the resource license as `Other`; the downloaded resource must not be redistributed or used beyond its applicable terms without reviewing the provider’s conditions.
- OpenStreetMap data is © OpenStreetMap contributors and is available under the ODbL. Preserve attribution and review the ODbL obligations before publishing derived datasets.
- Open-Meteo’s documentation identifies its historical API data licensing as CC BY 4.0. Preserve attribution and verify the current terms before deployment or redistribution.
- The guide specifies HOT Export, but its API requires OpenStreetMap OAuth. The OSM files here were acquired through a public Overpass mirror as a non-interactive equivalent and must be labeled accordingly.
- No BFP incident labels, PSA population tables, Project NOAH flood layers, or verified medical incident labels were acquired because the guide does not provide direct machine-download URLs for them. These remain required inputs for supervised prediction or validated vulnerability scoring.

## Validation findings and blockers

### PHIVOLCS KMZ is not yet modeling-ready

The HDX resource metadata reports a preview bounding box near `127–128°E, 3–5°N`, which does not cover South Caloocan. Inspection of the KMZ archive shows a tile/image-based `doc.kml` rather than an obvious vector fault-line layer. Do not compute distance-to-fault features from this file until its geographic coverage and vector extraction method are confirmed with PHIVOLCS/HDX.

### South Caloocan boundary remains provisional

The Nominatim lookup did not return a reliable South Caloocan administrative polygon. The current OSM acquisitions use the documented bounding envelope and may include areas outside the intended study area. Obtain an authoritative boundary or approved barangay list before clipping and modeling.

### Weather data is a feature source, not a target label

Open-Meteo precipitation and rain values are suitable candidate predictors, but they do not establish flood events or emergency outcomes. Pair them with time-stamped historical flood, fire, earthquake, and medical incident labels before fitting supervised models.

## Next acquisition steps

1. Obtain and verify an authoritative South Caloocan boundary.
2. Resolve the PHIVOLCS active-fault source mismatch and obtain a vector layer covering Metro Manila if available.
3. Identify permitted sources and direct downloads for flood susceptibility/extent, BFP fire incidents, PSA population/vulnerability, and historical medical events.
4. Decide whether the first feature table should use a regular grid or barangay units.
5. Keep raw downloads ignored by Git; generate derived, reviewable summaries only after source validation.

## Phase 1 preparation result

Preparation was executed with Python 3.12.10 using the standard library only. The reproducible script is [prepare_features.py](../../src/prepare_features.py).

Generated outputs:

- `data/derived/south_caloocan_grid_features.csv`: 288 provisional grid cells using a 0.005-degree grid across the acquisition envelope.
- `data/derived/data_quality_report.json`: source counts, accepted/outside records, weather summaries, boundary status, and excluded PHIVOLCS rationale.

Validated accepted records:

- Buildings: 233,716 of 233,716.
- Roads: 23,122 of 23,122.
- Facilities: 577 of 658; 81 were outside the provisional envelope.
- Forecast weather: 168 hourly records.
- Historical weather: 43,824 hourly records from 2021-01-01 through 2025-12-31.

The generated features remain provisional. They use the bounding envelope rather than an authoritative South Caloocan boundary, and they do not include earthquake proximity, flood labels, fire incident labels, or population vulnerability features.

## Phase 2 baseline result

A transparent partial-component baseline was generated with [score_baseline.py](../../src/score_baseline.py) and [baseline_risk_config.json](../../configs/baseline_risk_config.json).

Generated outputs:

- `data/derived/south_caloocan_baseline_scores.csv`: 288 provisional grid scores.
- `data/derived/baseline_score_report.json`: method, weights, score range, excluded components, and limitations.

The baseline uses rainfall normalization and urban-form proxies only:

- Flood proxy: latest 24-hour forecast rainfall divided by a configurable 50 mm threshold, capped at 1.0.
- Fire proxy: 70% relative building density plus 30% inverse relative road length.
- Earthquake and vulnerability components: excluded because verified source data is unavailable.
- Active component weight: 0.70; available components are renormalized before calculating the score.
- Score range in this run: 0.07905 to 0.475469.

These values are comparative screening scores, not probabilities, calibrated forecasts, or operational alerts. The rainfall threshold and urban-form proxies require historical incident labels and expert review before they can support prediction or response decisions.

## Phase 2 evaluation result

Label-free diagnostics were generated with [evaluate_baseline.py](../../src/evaluate_baseline.py) and saved to `data/derived/baseline_evaluation_report.json`.

- 288 scores evaluated; all are within `[0, 1]`.
- Score minimum: `0.07905`; median: `0.237124`; maximum: `0.475469`.
- 229 cells exceed `0.2`, 46 exceed `0.3`, 14 exceed `0.4`, and none exceed `0.5`.
- The flood component is spatially constant because the current weather source is a single point; spatial variation comes from the urban-form fire proxy.
- Predictive metrics, calibration, and holdout performance were not computed because no verified hazard labels are available.

This completes the label-free portion of Phase 2. Supervised baseline training and meaningful evaluation remain blocked on time-stamped flood, fire, earthquake, and vulnerability labels plus the verified barangay boundary.

## Boundary acquisition follow-up

The selected boundary definition is the barangay-based South Caloocan scope, represented provisionally as Barangays 1 through 164. The Philippine Statistics Authority provides the current Caloocan PSGC/barangay reference, and Republic Act No. 11545 provides the legislative barangay composition reference. The public PSGC-based map repository documents 2023 barangay map outputs, but it is not itself an official boundary authority.

The OSM administrative-relation index contains candidate barangay relations. The candidate geometry payload has now been normalized to the selected 164 named barangays and validated locally: 164 requested relation IDs, 164 returned relation IDs, 164 unique barangay names, and no missing or extra relations. The reproducible acquisition and validation scripts are [acquire_south_barangay_boundaries.py](../../src/acquire_south_barangay_boundaries.py) and [validate_south_barangay_boundaries.py](../../src/validate_south_barangay_boundaries.py); the validation report is [south_caloocan_barangay_boundary_validation.json](./south_caloocan_barangay_boundary_validation.json).

This remains candidate OSM geometry, not an authoritative legal boundary. Compare the 164 names and geometries against the official PSGC/barangay reference before replacing the provisional bounding-box grid or baseline scores. After that comparison, regenerate spatial features using the approved barangay analysis unit.

## Project NOAH flood layer acquisition

The Metro Manila 100-year flood archive was acquired from the [BetterGov.PH Project NOAH Hazard Maps dataset](https://huggingface.co/datasets/bettergovph/project-noah-hazard-maps), path `Flood/100yr/Metro Manila.zip`. Local archive size is `24,855,864` bytes with SHA-256 `7F92B0E079FF611907ADC4B102B5EBDA45331A819109F9CBB97F56F42889B3E2`. The archive contains `MetroManila_Flood_100year.shp` and companion files in WGS 84 / EPSG:4326. Its documented `Var` classes are mapped to normalized hazard scores as `Var / 3`.

The reproducible spatial pipeline is [build_real_hazard_features.py](../../src/build_real_hazard_features.py). It generated 288 grid rows and [real_hazard_features_validation.json](../derived/real_hazard_features_validation.json). The report records the NOAH layer as available, OSM as a current-snapshot proxy, and PAGASA/MMDA station logs as unavailable.

## NOAH-labeled model and QA result

The QA suite [test_south_caloocan_data_quality.py](../../tests/test_south_caloocan_data_quality.py) passes 7 tests. [train_noah_flood_model.py](../../src/train_noah_flood_model.py) trained a logistic-regression prototype against a binary static NOAH label (`flood_susceptibility_score >= 1/3`), excluding the target score and combined hazard score from predictors. A spatial row-group holdout produced accuracy `0.4531` and balanced accuracy `0.4498` on 64 test rows. This is a static susceptibility classification result, not a temporal flood-event forecast, and is not operationally ready.

Boundary normalization remains incomplete: 164 OSM relations were returned, but 157 were polygonized successfully. The seven unresolved geometries must be replaced or repaired from an authoritative boundary source before treating all barangay joins as complete.

## Synthetic training prototype

Because no observed hazard labels are available, [train_synthetic_baseline.py](../../src/train_synthetic_baseline.py) was run only as a pipeline demonstration. It creates low/medium/high quantile classes from the provisional `baseline_score`, trains an interpretable logistic-regression pipeline, and writes [synthetic_baseline_model_report.json](../derived/synthetic_baseline_model_report.json). The holdout accuracy was `0.9138` on 58 rows. This is not evidence of hazard-prediction performance, calibration, or operational readiness; observed time-stamped labels are still required.
