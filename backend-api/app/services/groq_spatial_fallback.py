"""Groq-assisted spatial bypass selection used only after deterministic routing fails."""

import asyncio
import json
import math
import os
from typing import Any, Dict, Mapping, Optional

from groq import Groq
from app.core.config import settings


GROQ_API_KEY = os.environ.get("GROQ_API_KEY") or settings.GROQ_API_KEY
# llama3-70b-8192 was decommissioned by Groq. Keep the model configurable so
# a provider lifecycle change only requires an environment update.
GROQ_MODEL = (
    os.environ.get("GROQ_MODEL")
    or settings.GROQ_MODEL
    or "openai/gpt-oss-120b"
)
groq_client = Groq(api_key=GROQ_API_KEY, timeout=15.0) if GROQ_API_KEY else None


def _validate_response(content: str) -> Dict[str, Any]:
    payload = json.loads(content)
    if not isinstance(payload, dict):
        raise ValueError("Groq spatial response was not a JSON object")
    expected_keys = {"selected_direction", "waypoint_lat", "waypoint_lon", "reasoning"}
    if set(payload) != expected_keys:
        raise ValueError("Groq spatial response did not match the required JSON schema")

    direction = str(payload.get("selected_direction", "")).lower()
    if direction not in {"north", "south", "east", "west"}:
        raise ValueError("Groq returned an invalid cardinal direction")

    latitude = float(payload["waypoint_lat"])
    longitude = float(payload["waypoint_lon"])
    if not math.isfinite(latitude) or not math.isfinite(longitude):
        raise ValueError("Groq returned non-finite waypoint coordinates")
    if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
        raise ValueError("Groq returned out-of-range waypoint coordinates")

    reasoning = payload.get("reasoning")
    if not isinstance(reasoning, str) or not reasoning.strip():
        raise ValueError("Groq did not return waypoint reasoning")

    return {
        "selected_direction": direction,
        "waypoint_lat": latitude,
        "waypoint_lon": longitude,
        "reasoning": reasoning.strip(),
    }


def _request_waypoint(context: Mapping[str, Any]) -> Dict[str, Any]:
    if groq_client is None:
        raise RuntimeError("GROQ_API_KEY is not configured")

    response = groq_client.chat.completions.create(
        model=GROQ_MODEL,
        temperature=0.1,
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a conservative pedestrian spatial-routing assistant. "
                    "Choose one intermediate bypass waypoint outside all active hazard radiuses. "
                    "Never choose a point inside a hazard radius. Return only the requested JSON object."
                ),
            },
            {
                "role": "user",
                "content": (
                    "Analyze this routing context and select a safe non-hazardous intermediate "
                    "bypass waypoint. The waypoint must be between the start and destination when "
                    "possible, and should favor an open cardinal detour. Exact response schema: "
                    '{"selected_direction":"north|south|east|west",'
                    '"waypoint_lat":float,"waypoint_lon":float,"reasoning":"string"}.\n\n'
                    f"SPATIAL_CONTEXT={json.dumps(context, separators=(',', ':'))}"
                ),
            },
        ],
    )
    content = response.choices[0].message.content if response.choices else None
    if not content:
        raise ValueError("Groq returned an empty spatial response")
    return _validate_response(content)


async def choose_ai_escape_waypoint(context: Mapping[str, Any]) -> Dict[str, Any]:
    """Ask Groq off the event loop and validate its strict waypoint response."""

    return await asyncio.to_thread(_request_waypoint, context)
