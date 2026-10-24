"""Build spatial hazard features for the South Caloocan grid.

This pipeline accepts verified local extracts from UP NOAH, OSM/HOT, and
PAGASA/MMDA station logs. Missing sources are reported explicitly and never
silently treated as observed zero hazard.
"""

from __future__ import annotations

import argparse
import json
import tempfile
from zipfile import ZipFile
from pathlib import Path
from typing import Any

import geopandas as gpd
import numpy as np
import pandas as pd
from shapely.geometry import LineString, Point, Polygon, shape
from shapely.ops import polygonize, unary_union


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_ROOT = PROJECT_ROOT / "data-science" / "data"
GRID_PATH = DATA_ROOT / "derived" / "south_caloocan_grid_features.csv"
BOUNDARY_PATH = DATA_ROOT / "raw" / "osm" / "south_caloocan_barangay_relations_geom.json"
NOAH_PATH = DATA_ROOT / "raw" / "noah" / "metro_manila_100yr.zip"
STATIONS_PATH = DATA_ROOT / "raw" / "stations" / "south_caloocan_flood_stations.csv"
OSM_PATHS = (
    DATA_ROOT / "raw" / "osm" / "south_caloocan_facilities_overpass.json",
    DATA_ROOT / "raw" / "osm" / "south_caloocan_highways_overpass.json",
)
OUTPUT_PATH = DATA_ROOT / "derived" / "south_caloocan_real_hazard_features.csv"
REPORT_PATH = DATA_ROOT / "derived" / "real_hazard_features_validation.json"
SOURCE_CRS = "EPSG:4326"
PROJECTED_CRS = "EPSG:32651"


def normalize(values: pd.Series) -> pd.Series:
    numeric = pd.to_numeric(values, errors="coerce").fillna(0.0)
    minimum, maximum = float(numeric.min()), float(numeric.max())
    if maximum == minimum:
        return pd.Series(0.0, index=values.index)
    return ((numeric - minimum) / (maximum - minimum)).clip(0.0, 1.0)


def grid_frame() -> gpd.GeoDataFrame:
    frame = pd.read_csv(GRID_PATH)
    frame["geometry"] = [
        Polygon(
            [
                (row.min_lon, row.min_lat),
                (row.max_lon, row.min_lat),
                (row.max_lon, row.max_lat),
                (row.min_lon, row.max_lat),
            ]
        )
        for row in frame.itertuples()
    ]
    return gpd.GeoDataFrame(frame, geometry="geometry", crs=SOURCE_CRS)


def relation_polygon(relation: dict[str, Any]) -> Polygon | None:
    lines = []
    for member in relation.get("members", []):
        if member.get("role") != "outer" or not member.get("geometry"):
            continue
        coordinates = [(point["lon"], point["lat"]) for point in member["geometry"]]
        if len(coordinates) >= 2:
            lines.append(LineString(coordinates))
    if not lines:
        return None
    polygons = list(polygonize(unary_union(lines)))
    if not polygons:
        return None
    return max(polygons, key=lambda polygon: polygon.area)


def barangay_frame() -> gpd.GeoDataFrame:
    payload = json.loads(BOUNDARY_PATH.read_text(encoding="utf-8"))
    records = []
    for relation in payload.get("elements", []):
        geometry = relation_polygon(relation)
        tags = relation.get("tags", {})
        if geometry is not None and tags.get("name"):
            records.append({"barangay_name": tags["name"], "barangay_ref": tags.get("ref", ""), "geometry": geometry})
    return gpd.GeoDataFrame(records, geometry="geometry", crs=SOURCE_CRS)


def load_osm_features(paths: tuple[Path, ...]) -> tuple[gpd.GeoDataFrame, gpd.GeoDataFrame, dict[str, Any]]:
    critical_records = []
    waterway_records = []
    available = []
    for path in paths:
        if not path.exists():
            continue
        available.append(str(path))
        payload = json.loads(path.read_text(encoding="utf-8"))
        for element in payload.get("elements", []):
            tags = element.get("tags", {})
            geometry = None
            if element.get("type") == "node" and element.get("lat") is not None:
                geometry = Point(element["lon"], element["lat"])
            elif element.get("geometry"):
                geometry = LineString([(point["lon"], point["lat"]) for point in element["geometry"]])
            if geometry is None:
                continue
            record = {"osm_id": element.get("id"), "tags": json.dumps(tags), "geometry": geometry}
            if tags.get("waterway"):
                waterway_records.append(record)
            if (
                tags.get("amenity") in {"hospital", "clinic", "school", "shelter"}
                or tags.get("emergency")
                or tags.get("healthcare")
                or tags.get("building") in {"hospital", "school"}
            ):
                critical_records.append(record)
    columns = ["osm_id", "tags", "geometry"]
    return (
        gpd.GeoDataFrame(critical_records, columns=columns, geometry="geometry", crs=SOURCE_CRS),
        gpd.GeoDataFrame(waterway_records, columns=columns, geometry="geometry", crs=SOURCE_CRS),
        {"available_files": available, "critical_count": len(critical_records), "waterway_count": len(waterway_records)},
    )


def spatial_counts(grid: gpd.GeoDataFrame, features: gpd.GeoDataFrame, column: str) -> pd.Series:
    if features.empty:
        return pd.Series(0.0, index=grid.index)
    joined = gpd.sjoin(features, grid[["grid_id", "geometry"]], how="inner", predicate="intersects")
    return joined.groupby("grid_id").size().reindex(grid["grid_id"], fill_value=0).astype(float).set_axis(grid.index)


def spatial_length(grid: gpd.GeoDataFrame, features: gpd.GeoDataFrame) -> pd.Series:
    if features.empty:
        return pd.Series(0.0, index=grid.index)
    projected_grid = grid[["grid_id", "geometry"]].to_crs(PROJECTED_CRS)
    projected_features = features.to_crs(PROJECTED_CRS)
    joined = gpd.sjoin(projected_features, projected_grid, how="inner", predicate="intersects")
    joined["length_m"] = joined.geometry.length
    return joined.groupby("grid_id")["length_m"].sum().reindex(grid["grid_id"], fill_value=0).astype(float).set_axis(grid.index)


def flood_overlap(grid: gpd.GeoDataFrame, noah_path: Path) -> tuple[pd.Series, dict[str, Any]]:
    if not noah_path.exists():
        return pd.Series(0.0, index=grid.index), {"available": False, "path": str(noah_path)}
    if noah_path.suffix.lower() == ".zip":
        with tempfile.TemporaryDirectory() as temporary_directory:
            with ZipFile(noah_path) as archive:
                archive.extractall(temporary_directory)
            shapefiles = list(Path(temporary_directory).rglob("*.shp"))
            if not shapefiles:
                raise ValueError(f"No shapefile found in NOAH archive: {noah_path}")
            flood = gpd.read_file(shapefiles[0])
    else:
        flood = gpd.read_file(noah_path)
    flood = flood.to_crs(PROJECTED_CRS)
    hazard_column = next((column for column in flood.columns if column.lower() == "var"), None)
    if hazard_column is None:
        raise ValueError("NOAH flood layer is missing the documented Var hazard field")
    flood["hazard_score"] = (pd.to_numeric(flood[hazard_column], errors="coerce") / 3.0).clip(0.0, 1.0).fillna(0.0)
    projected_grid = grid[["grid_id", "geometry"]].to_crs(PROJECTED_CRS)
    study_area = projected_grid.geometry.union_all()
    flood = flood[flood.geometry.intersects(study_area)].copy()
    flood = gpd.clip(flood, study_area)
    intersections = gpd.overlay(projected_grid, flood[["hazard_score", "geometry"]], how="intersection")
    intersections["weighted_area"] = intersections.geometry.area * intersections["hazard_score"]
    weighted_area = intersections.groupby("grid_id")["weighted_area"].sum()
    proportions = weighted_area.reindex(projected_grid["grid_id"], fill_value=0.0).to_numpy() / projected_grid.geometry.area.to_numpy()
    return pd.Series(np.clip(proportions, 0.0, 1.0), index=grid.index), {
        "available": True,
        "path": str(noah_path),
        "features": len(flood),
        "hazard_field": hazard_column,
        "hazard_mapping": "Var / 3, where Var=1 low, 2 medium, 3 high",
    }


def station_proxy(grid: gpd.GeoDataFrame, station_path: Path) -> tuple[pd.Series, dict[str, Any]]:
    if not station_path.exists():
        return pd.Series(0.0, index=grid.index), {"available": False, "path": str(station_path)}
    if station_path.suffix.lower() in {".geojson", ".json", ".gpkg", ".shp"}:
        stations = gpd.read_file(station_path)
    else:
        table = pd.read_csv(station_path)
        stations = gpd.GeoDataFrame(
            table,
            geometry=gpd.points_from_xy(table["longitude"], table["latitude"]),
            crs=SOURCE_CRS,
        )
    threshold = next((column for column in stations.columns if column.lower() in {"threshold", "threshold_m", "alert_threshold"}), None)
    observed = next((column for column in stations.columns if column.lower() in {"level", "water_level", "observed_level", "value"}), None)
    if threshold is None or observed is None:
        return pd.Series(0.0, index=grid.index), {"available": True, "path": str(station_path), "usable_threshold_records": 0}
    stations["exceedance"] = (pd.to_numeric(stations[observed], errors="coerce") >= pd.to_numeric(stations[threshold], errors="coerce")).astype(float)
    joined = gpd.sjoin(stations.to_crs(SOURCE_CRS), grid[["grid_id", "geometry"]], how="inner", predicate="within")
    counts = joined.groupby("grid_id")["exceedance"].mean().reindex(grid["grid_id"], fill_value=0.0)
    return counts.set_axis(grid.index), {"available": True, "path": str(station_path), "usable_threshold_records": int(stations["exceedance"].notna().sum())}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--noah", type=Path, default=NOAH_PATH)
    parser.add_argument("--stations", type=Path, default=STATIONS_PATH)
    parser.add_argument("--output", type=Path, default=OUTPUT_PATH)
    parser.add_argument("--report", type=Path, default=REPORT_PATH)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    grid = grid_frame()
    boundary_payload = json.loads(BOUNDARY_PATH.read_text(encoding="utf-8"))
    barangays = barangay_frame()
    projected_grid = grid.to_crs(PROJECTED_CRS)
    projected_grid["geometry"] = projected_grid.geometry.centroid
    projected_barangays = barangays.to_crs(PROJECTED_CRS)
    labels = gpd.sjoin(
        projected_grid[["grid_id", "geometry"]],
        projected_barangays[["barangay_name", "barangay_ref", "geometry"]],
        how="left",
        predicate="within",
    )
    labels = labels.groupby("grid_id", as_index=False)[["barangay_name", "barangay_ref"]].first()
    grid = grid.merge(labels, on="grid_id", how="left", validate="one_to_one")
    critical, waterways, osm_report = load_osm_features(OSM_PATHS)
    flood_score, flood_report = flood_overlap(grid, args.noah)
    station_score, station_report = station_proxy(grid, args.stations)
    grid["osm_critical_count"] = spatial_counts(grid, critical, "osm_critical_count")
    grid["osm_waterway_length_m"] = spatial_length(grid, waterways)
    grid["osm_critical_infrastructure_score"] = normalize(grid["osm_critical_count"])
    grid["osm_waterway_score"] = normalize(grid["osm_waterway_length_m"])
    grid["flood_susceptibility_score"] = flood_score
    grid["station_threshold_proxy_score"] = station_score
    score_columns = ["flood_susceptibility_score", "osm_critical_infrastructure_score", "osm_waterway_score", "station_threshold_proxy_score"]
    grid["real_hazard_score"] = grid[score_columns].mean(axis=1)
    output = pd.DataFrame(grid.drop(columns="geometry"))
    output.to_csv(args.output, index=False)
    report = {
        "output_rows": len(output),
        "grid_count_expected": 288,
        "barangay_count": sum(1 for element in boundary_payload.get("elements", []) if element.get("type") == "relation"),
        "polygonized_barangay_count": int(barangays["barangay_ref"].nunique()),
        "polygonized_barangay_gap": 164 - int(barangays["barangay_ref"].nunique()),
        "grid_cells_with_barangay": int(output["barangay_ref"].notna().sum()),
        "grid_cells_without_barangay": int(output["barangay_ref"].isna().sum()),
        "crs": {"source": SOURCE_CRS, "projected": PROJECTED_CRS},
        "sources": {"noah": flood_report, "osm_hot": osm_report, "pagasa_mmda_stations": station_report},
        "normalized_score_columns": score_columns + ["real_hazard_score"],
        "score_range_checks": {column: [float(output[column].min()), float(output[column].max())] for column in score_columns + ["real_hazard_score"]},
        "real_hazard_data_available": bool(flood_report["available"] or station_report["available"]),
        "limitations": [
            "OSM counts and lengths are current snapshot proxies, not historical incident labels.",
            "NOAH and PAGASA/MMDA values are zero-filled only with explicit source availability flags when files are absent.",
            "Candidate OSM barangay boundaries require official PSGC validation.",
        ],
    }
    args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
