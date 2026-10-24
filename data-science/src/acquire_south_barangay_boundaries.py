"""Acquire candidate OSM geometries for the barangay-based South scope.

The scope is intentionally explicit: Barangays 1 through 164. The resulting
OSM relations are candidate geometry inputs, not a legal boundary certification.
"""

from __future__ import annotations

import json
from urllib.error import URLError
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_ROOT = PROJECT_ROOT / "data-science" / "data"
INDEX_PATH = DATA_ROOT / "raw" / "osm" / "south_caloocan_admin10_relations.json"
GEOMETRY_PATH = DATA_ROOT / "raw" / "osm" / "south_caloocan_barangay_relations_geom.json"
SCOPE_PATH = DATA_ROOT / "metadata" / "south_caloocan_barangay_scope.json"
OVERPASS_URLS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
)


def main() -> None:
    index = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
    selected: dict[str, dict[str, object]] = {}
    excluded: list[dict[str, object]] = []
    for element in index.get("elements", []):
        tags = element.get("tags", {})
        name = str(tags.get("name", ""))
        if not name.startswith("Barangay "):
            continue
        suffix = name.removeprefix("Barangay ")
        if not suffix.isdigit():
            continue
        number = int(suffix)
        reference = str(tags.get("ref", ""))
        record = {
            "relation_id": element.get("id"),
            "name": tags.get("name"),
            "center": element.get("center"),
            "ref": reference,
        }
        if number <= 164 and reference.startswith("137501"):
            # The OSM index can contain duplicate relations for the same
            # barangay name. Keep one candidate relation per named barangay.
            existing = selected.get(name)
            if existing is None or not str(existing.get("ref", "")):
                selected[name] = record
        else:
            excluded.append(record)

    relation_ids = sorted(int(record["relation_id"]) for record in selected.values())
    if not relation_ids:
        raise ValueError("No Barangay 1-164 relations found in the OSM index")
    elements: list[dict[str, object]] = []
    selected_ids = set(relation_ids)
    if GEOMETRY_PATH.exists():
        existing_payload = json.loads(GEOMETRY_PATH.read_text(encoding="utf-8"))
        existing_by_id = {
            int(element["id"]): element
            for element in existing_payload.get("elements", [])
            if "id" in element and int(element["id"]) in selected_ids
        }
        elements.extend(existing_by_id[element_id] for element_id in relation_ids if element_id in existing_by_id)
    missing_ids = [element_id for element_id in relation_ids if element_id not in {int(element["id"]) for element in elements}]
    batch_size = 20
    for start in range(0, len(missing_ids), batch_size):
        batch = missing_ids[start : start + batch_size]
        query = f"[out:json][timeout:120];rel(id:{','.join(map(str, batch))});out body geom;"
        batch_payload = None
        for endpoint in OVERPASS_URLS:
            request = Request(
                endpoint,
                data=urlencode({"data": query}).encode("utf-8"),
                headers={"User-Agent": "RESQ-ROUTE-capstone-data-acquisition/1.0"},
                method="POST",
            )
            try:
                with urlopen(request, timeout=180) as response:
                    batch_payload = json.load(response)
                break
            except (TimeoutError, URLError):
                continue
        if batch_payload is None:
            raise RuntimeError(f"All Overpass endpoints failed for batch starting at index {start}")
        elements.extend(
            element
            for element in batch_payload.get("elements", [])
            if int(element.get("id", -1)) in selected_ids
        )
    payload = {"version": 0.6, "generator": "RESQ-ROUTE", "elements": elements}
    GEOMETRY_PATH.write_text(json.dumps(payload), encoding="utf-8")
    scope = {
        "definition": "Barangays 1 through 164",
        "relation_count_requested": len(relation_ids),
        "relation_ids": relation_ids,
        "selected_relations": list(selected.values()),
        "excluded_northern_named_relations": excluded,
        "source": list(OVERPASS_URLS),
        "status": "candidate_osm_geometry_requires_validation",
        "notes": [
            "OSM relation names and boundaries require comparison with official PSGC/barangay records.",
            "This file is not a legal or authoritative administrative boundary.",
        ],
    }
    SCOPE_PATH.write_text(json.dumps(scope, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
