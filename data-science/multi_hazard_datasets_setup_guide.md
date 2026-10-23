# RESQ-ROUTE: Multi-Hazard Dataset Setup Guide

This guide outlines the datasets, download sources, and backend processing steps required to implement multi-hazard risk predictions (Flood, Earthquake, Urban Fire, Medical Emergency) for the **RESQ-ROUTE** capstone project.

---

## 1. Summary of Hazards & Data Sources

| Hazard Domain | Primary Metrics / Features | Data Source / Provider | Format |
| :--- | :--- | :--- | :--- |
| **Earthquake & Seismic** | Active fault lines, liquefaction, ground shaking risk | PHIVOLCS / GeoRiskPH via HDX | GeoJSON / KMZ / SHP |
| **Flood & Inundation** | Inundation depth, historical flood extent, rainfall | Project NOAH / Open-Meteo API | GeoJSON / GeoTIFF / JSON API |
| **Urban & Structural Fire**| Building density, narrow streets, historical incidents | OpenStreetMap (HOT Export) / BFP | GeoJSON / CSV |
| **Medical & Vulnerability**| EMS access, population density, facility locations | PSA Census / OpenStreetMap | CSV / GeoJSON |

---

## 2. Direct Dataset Download Locations

### A. Earthquake & Seismic Data (PHIVOLCS)
* **Active Fault Lines in the Philippines:**
  * **Source:** Humanitarian Data Exchange (HDX) / PHIVOLCS
  * **Link:** [data.humdata.org/dataset/philippines-geohazards-data](https://data.humdata.org/dataset/philippines-geohazards-data)
  * **Files to Download:** `Distribution of Active Faults in the Philippines.kmz`
  * **Usage:** Convert `.kmz` to `.geojson` to compute coordinate distance ($d_{\text{fault}}$) to active fault traces.

### B. Urban Building Footprints & Infrastructure (OpenStreetMap)
* **Building Footprints & Narrow Roads:**
  * **Source:** HOT Export Tool (Humanitarian OpenStreetMap Team)
  * **Link:** [export.hotosm.org](https://export.hotosm.org/)
  * **Extraction Steps:**
    1. Select Target Area (e.g., Metro Manila / Caloocan / Quezon City).
    2. Check features: `Buildings` (density analysis) and `Highways` (road widths).
    3. Export format: **GeoJSON**.

### C. Live & Forecasted Rainfall (PAGASA / Meteorological)
* **Real-time Precipitation API:**
  * **Source:** Open-Meteo Weather API
  * **Link:** [open-meteo.com](https://open-meteo.com/)
  * **Endpoint Example:**
    ```text
    https://api.open-meteo.com/v1/forecast?latitude=14.6507&longitude=120.9830&hourly=precipitation,rain
    ```
  * **Usage:** Triggers dynamic flood and landslide warnings in FastAPI when hourly rainfall surpasses threshold limits ($mm/hr$).

---

## 3. Database Schema & PostGIS Setup (Supabase)

Run the following SQL setup in your Supabase SQL Editor to enable PostGIS spatial queries:

```sql
-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- 1. Table for Active Fault Lines
CREATE TABLE IF NOT EXISTS active_faults (
    id SERIAL PRIMARY KEY,
    fault_name VARCHAR(255),
    geom GEOMETRY(LineString, 4326)
);

-- 2. Table for Dynamic Hazard Polygons (Flood, Fire, Landslide)
CREATE TABLE IF NOT EXISTS hazard_zones (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    hazard_type VARCHAR(50) NOT NULL, -- 'flood', 'fire', 'earthquake_damage', 'landslide'
    severity_level INT CHECK (severity_level BETWEEN 1 AND 5),
    geom GEOMETRY(Polygon, 4326),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Spatial index for high-speed routing queries
CREATE INDEX IF NOT EXISTS idx_active_faults_geom ON active_faults USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_hazard_zones_geom ON hazard_zones USING GIST (geom);
```

---

## 4. Multi-Hazard Risk Scoring Formula

Combine multi-hazard datasets into a single weighted score ($0.0 - 1.0$) inside your FastAPI prediction engine:

$$\text{Hazard Risk Score} = (w_1 \cdot H_{\text{Flood}}) + (w_2 \cdot H_{\text{Quake}}) + (w_3 \cdot H_{\text{Fire}}) + (w_4 \cdot V_{\text{Vulnerability}})$$

### Variable Definitions:
* $H_{\text{Flood}}$: Real-time rainfall intensity ($mm/hr$) + NOAH flood susceptibility score.
* $H_{\text{Quake}}$: Inverse distance proximity score ($1 / d_{\text{fault}}$) to the nearest active fault line.
* $H_{\text{Fire}}$: Spatial building footprint density per $100m^2$ + road accessibility factor.
* $V_{\text{Vulnerability}}$: Population density / distribution of high-vulnerability facilities (e.g., hospitals, schools).

---

## 5. FastAPI Hazard Avoidance Pipeline

When requested, FastAPI aggregates active hazard polygons from Supabase and passes them directly to Valhalla or MapLibre:

```python
from fastapi import FastAPI
import requests

app = FastAPI()

VALHALLA_URL = "http://localhost:8002/route"

@app.post("/api/v1/reroute")
def calculate_hazard_free_route(origin: dict, destination: dict, hazard_polygons: list):
    """
    Formulates a Valhalla routing request containing 'avoid_polygons' extracted from Supabase.
    """
    payload = {
        "locations": [
            {"lat": origin["lat"], "lon": origin["lon"]},
            {"lat": destination["lat"], "lon": destination["lon"]}
        ],
        "costing": "auto",
        "avoid_polygons": hazard_polygons # Array of [[lon, lat], [lon, lat], ...] coordinates
    }
    
    response = requests.post(VALHALLA_URL, json=payload)
    return response.json()
```