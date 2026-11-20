"""Prepare NOAH flood polygons clipped to the existing publication grid."""

import json
from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely.geometry import box, mapping


ROOT = Path(__file__).resolve().parents[2]
GRID = ROOT / "data-science/data/derived/south_caloocan_grid_features.csv"
SOURCE = ROOT / "data-science/data/raw/noah/metro_manila_100yr.zip"
OUTPUT = ROOT / "dashboard-web/public/noah_flood_100yr.geojson"
LEVELS = {1: "low", 2: "medium", 3: "high"}


def main():
    grid = pd.read_csv(GRID)
    bounds = (grid.min_lon.min(), grid.min_lat.min(), grid.max_lon.max(), grid.max_lat.max())
    flood = gpd.read_file(f"zip://{SOURCE.as_posix()}", bbox=bounds).to_crs("EPSG:4326")
    features = []
    for row in grid.itertuples():
        cell = box(row.min_lon, row.min_lat, row.max_lon, row.max_lat)
        for hazard in flood.itertuples():
            level = LEVELS.get(hazard.Var)
            if level is None or not hazard.geometry.intersects(cell):
                continue
            clipped = hazard.geometry.intersection(cell)
            if clipped.is_empty:
                continue
            features.append({
                "type": "Feature",
                "properties": {"source_grid_id": row.grid_id, "hazard_level": level},
                "geometry": mapping(clipped),
            })
    OUTPUT.write_text(json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(features)} clipped features to {OUTPUT}")


if __name__ == "__main__":
    main()
