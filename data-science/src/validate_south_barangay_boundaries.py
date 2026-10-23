"""Validate the candidate OSM geometry against the explicit South scope."""

from __future__ import annotations

import json
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_ROOT = PROJECT_ROOT / "data-science" / "data"
SCOPE_PATH = DATA_ROOT / "metadata" / "south_caloocan_barangay_scope.json"
GEOMETRY_PATH = DATA_ROOT / "raw" / "osm" / "south_caloocan_barangay_relations_geom.json"
REPORT_PATH = DATA_ROOT / "metadata" / "south_caloocan_barangay_boundary_validation.json"


def main() -> None:
    scope = json.loads(SCOPE_PATH.read_text(encoding="utf-8"))
    geometry = json.loads(GEOMETRY_PATH.read_text(encoding="utf-8"))
    requested_ids = {int(value) for value in scope["relation_ids"]}
    returned = {
        int(element["id"]): element
        for element in geometry.get("elements", [])
        if element.get("type") == "relation" and "id" in element
    }
    selected_names = {str(record["name"]) for record in scope["selected_relations"]}
    returned_names = {
        str(element.get("tags", {}).get("name", ""))
        for element in returned.values()
        if int(element["id"]) in requested_ids
    }
    report = {
        "requested_relation_count": len(requested_ids),
        "returned_relation_count": len(returned),
        "missing_relation_ids": sorted(requested_ids - set(returned)),
        "extra_relation_ids": sorted(set(returned) - requested_ids),
        "requested_barangay_name_count": len(selected_names),
        "returned_barangay_name_count": len(returned_names),
        "missing_barangay_names": sorted(selected_names - returned_names),
        "geometry_type_counts": {
            geometry_type: sum(1 for element in geometry.get("elements", []) if element.get("type") == geometry_type)
            for geometry_type in sorted({str(element.get("type")) for element in geometry.get("elements", [])})
        },
        "valid": (
            len(requested_ids) == 164
            and len(returned) == 164
            and not (requested_ids - set(returned))
            and not (set(returned) - requested_ids)
            and len(selected_names) == 164
            and len(returned_names) == 164
        ),
        "status": "candidate_osm_geometry_requires_official_boundary_validation",
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
