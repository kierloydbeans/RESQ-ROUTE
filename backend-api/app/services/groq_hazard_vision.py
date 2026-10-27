"""Groq vision analysis for autofilling disaster and road-hazard reports."""

import asyncio
import json
import os
from typing import Any, Dict

from groq import Groq

from app.core.config import settings


GROQ_API_KEY = os.environ.get("GROQ_API_KEY") or settings.GROQ_API_KEY
GROQ_VISION_MODEL = (
    os.environ.get("GROQ_VISION_MODEL")
    or settings.GROQ_VISION_MODEL
    or "qwen/qwen3.8-27b"
)
VISION_TIMEOUT_SECONDS = 30.0

VISION_SYSTEM_PROMPT = (
    "You analyze a single image as a local disaster and road hazard in Metro Manila. "
    "Return only one valid JSON object with exactly these keys: "
    "hazard_type, severity, suggested_title, suggested_description, passability_impact, "
    "estimated_expiration_hours. "
    "hazard_type must be one of Flood, Downed Power Line, Fallen Tree, Road Obstruction, "
    "Structural Collapse, Landslide, Fire, General Emergency. "
    "severity must be Low, Medium, High, or Critical. "
    "suggested_title must be a concise maximum-10-word summary. "
    "suggested_description must be 2-3 detailed sentences describing only visible damage, "
    "blockage, and context. passability_impact must be Passable, Motorcycles Only, or Impassable. "
    "estimated_expiration_hours must be an integer from 6 to 24 representing the suggested "
    "time before re-inspection. If uncertain, choose conservative values and General Emergency."
)

EMERGENCY_SYSTEM_PROMPT = (
    "You analyze a single image for an emergency incident report in Metro Manila. "
    "Return only one valid JSON object with exactly these keys: incident_type, severity, "
    "people_affected, and details. incident_type must be one of flood, fire, medical, "
    "trapped, or earthquake. severity must be low, medium, high, or critical. "
    "people_affected must be a non-negative integer estimate based only on visible people "
    "or clearly visible context; use 0 when it cannot be estimated. details must be 2-3 "
    "concise sentences describing visible injuries, danger, damage, location context, or "
    "people needing help. Do not return hazard-report fields such as passability or expiry."
)


def _validate_analysis(content: str) -> Dict[str, Any]:
    payload = json.loads(content)
    if not isinstance(payload, dict):
        raise ValueError("Groq vision response was not a JSON object")

    required = {
        "hazard_type",
        "severity",
        "suggested_title",
        "suggested_description",
        "passability_impact",
        "estimated_expiration_hours",
    }
    if set(payload) != required:
        raise ValueError("Groq vision response did not match the required JSON schema")

    allowed_hazards = {
        "Flood", "Downed Power Line", "Fallen Tree", "Road Obstruction",
        "Structural Collapse", "Landslide", "Fire", "General Emergency",
    }
    allowed_severity = {"Low", "Medium", "High", "Critical"}
    allowed_passability = {"Passable", "Motorcycles Only", "Impassable"}
    if payload["hazard_type"] not in allowed_hazards:
        raise ValueError("Groq returned an invalid hazard type")
    if payload["severity"] not in allowed_severity:
        raise ValueError("Groq returned an invalid severity")
    if payload["passability_impact"] not in allowed_passability:
        raise ValueError("Groq returned an invalid passability impact")

    for key in ("suggested_title", "suggested_description"):
        if not isinstance(payload[key], str) or not payload[key].strip():
            raise ValueError(f"Groq returned an empty {key}")

    expiration_hours = int(payload["estimated_expiration_hours"])
    if not 6 <= expiration_hours <= 24:
        raise ValueError("Groq returned an invalid expiration window")
    payload["estimated_expiration_hours"] = expiration_hours
    return payload


def _request_hazard_analysis(image_data_url: str) -> Dict[str, Any]:
    if not GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY is not configured")

    client = Groq(api_key=GROQ_API_KEY, timeout=VISION_TIMEOUT_SECONDS)
    response = client.chat.completions.create(
        model=GROQ_VISION_MODEL,
        temperature=0.1,
        max_tokens=600,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": VISION_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Analyze this hazard image for the report form."},
                    {"type": "image_url", "image_url": {"url": image_data_url}},
                ],
            },
        ],
    )
    content = response.choices[0].message.content if response.choices else None
    if not content:
        raise ValueError("Groq returned an empty vision response")
    return _validate_analysis(content)


async def analyze_hazard_image(image_data_url: str) -> Dict[str, Any]:
    """Run the synchronous Groq SDK away from the FastAPI event loop."""

    return await asyncio.wait_for(
        asyncio.to_thread(_request_hazard_analysis, image_data_url),
        timeout=VISION_TIMEOUT_SECONDS + 2,
    )


def _validate_emergency_analysis(content: str) -> Dict[str, Any]:
    payload = json.loads(content)
    if not isinstance(payload, dict):
        raise ValueError("Groq emergency response was not a JSON object")

    required = {"incident_type", "severity", "people_affected", "details"}
    if set(payload) != required:
        raise ValueError("Groq emergency response did not match the required JSON schema")

    if payload["incident_type"] not in {"flood", "fire", "medical", "trapped", "earthquake"}:
        raise ValueError("Groq returned an invalid incident type")
    if payload["severity"] not in {"low", "medium", "high", "critical"}:
        raise ValueError("Groq returned an invalid emergency severity")
    if not isinstance(payload["details"], str) or not payload["details"].strip():
        raise ValueError("Groq returned empty emergency details")

    people_affected = int(payload["people_affected"])
    if people_affected < 0:
        raise ValueError("Groq returned an invalid people-affected count")
    payload["people_affected"] = people_affected
    return payload


def _request_emergency_analysis(image_data_url: str) -> Dict[str, Any]:
    if not GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY is not configured")

    client = Groq(api_key=GROQ_API_KEY, timeout=VISION_TIMEOUT_SECONDS)
    response = client.chat.completions.create(
        model=GROQ_VISION_MODEL,
        temperature=0.1,
        max_tokens=450,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": EMERGENCY_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Analyze this image for the emergency incident form."},
                    {"type": "image_url", "image_url": {"url": image_data_url}},
                ],
            },
        ],
    )
    content = response.choices[0].message.content if response.choices else None
    if not content:
        raise ValueError("Groq returned an empty emergency response")
    return _validate_emergency_analysis(content)


async def analyze_emergency_image(image_data_url: str) -> Dict[str, Any]:
    """Analyze an image using the emergency-report schema."""

    return await asyncio.wait_for(
        asyncio.to_thread(_request_emergency_analysis, image_data_url),
        timeout=VISION_TIMEOUT_SECONDS + 2,
    )
