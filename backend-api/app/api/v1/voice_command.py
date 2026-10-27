import re
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field


router = APIRouter()


class VoiceCommandRequest(BaseModel):
    transcript: str = Field(..., min_length=1, max_length=500)
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)


class VoiceCommandResponse(BaseModel):
    detected_intent: str
    original_transcript: str
    action: str


INTENT_RULES = (
    ("rescue_route", ("route", "evacuate", "evacuation", "center", "path"), "FETCH_NEAREST_ROUTE"),
    ("rescue_alert", ("emergency", "emergencies", "camera", "snap", "picture"), "OPEN_EMERGENCY_CAMERA"),
    ("rescue_hazard", ("hazard", "road", "blockage"), "OPEN_ROAD_HAZARD_REPORT"),
)


def normalize_voice_transcript(transcript: str) -> str:
    """Normalize punctuation and whitespace while preserving phrase boundaries."""
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", transcript.lower().strip())).strip()


def _contains_keyword(text: str, keyword: str) -> bool:
    padded_text = f" {text} "
    return f" {keyword} " in padded_text


def detect_voice_intent(transcript: str) -> tuple[str, str] | None:
    normalized = normalize_voice_transcript(transcript)
    if not normalized:
        return None

    for intent, keywords, action in INTENT_RULES:
        if any(_contains_keyword(normalized, keyword) for keyword in keywords):
            return intent, action
    return None


@router.post("/voice-command", response_model=VoiceCommandResponse)
async def parse_voice_command(request: VoiceCommandRequest) -> VoiceCommandResponse:
    detected = detect_voice_intent(request.transcript)
    if detected is None:
        raise HTTPException(
            status_code=400,
            detail="Voice command was not recognized. Try saying route, emergency, camera, or road hazard.",
        )

    detected_intent, action = detected
    return VoiceCommandResponse(
        detected_intent=detected_intent,
        original_transcript=request.transcript,
        action=action,
    )
