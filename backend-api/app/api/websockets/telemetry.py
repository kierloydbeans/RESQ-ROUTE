from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from typing import List, Dict, Optional
import json
import time

router = APIRouter()


class GPSPayload(BaseModel):
    latitude: float
    longitude: float
    accuracy: Optional[float] = None
    device_id: Optional[str] = None


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.telemetry_data: Dict = {}
        self.latest_gps: Optional[Dict] = None

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception:
                pass


manager = ConnectionManager()


@router.websocket("/api/v1/ws")
@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)

            manager.telemetry_data.update(message)

            if isinstance(message, dict):
                latitude = message.get("latitude")
                longitude = message.get("longitude")
                if latitude is not None and longitude is not None:
                    manager.latest_gps = {
                        "latitude": float(latitude),
                        "longitude": float(longitude),
                        "accuracy": message.get("accuracy"),
                        "device_id": message.get("device_id"),
                        "timestamp": message.get("timestamp") or time.time(),
                    }
                    await manager.broadcast({
                        "type": "gps_update",
                        "data": manager.latest_gps,
                        "timestamp": time.time(),
                    })

            await manager.broadcast({
                "type": "telemetry",
                "data": message,
                "timestamp": time.time(),
            })
    except WebSocketDisconnect:
        manager.disconnect(websocket)


@router.post("/api/v1/gps")
async def update_gps(payload: GPSPayload):
    manager.latest_gps = {
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "accuracy": payload.accuracy,
        "device_id": payload.device_id,
        "timestamp": time.time(),
    }

    await manager.broadcast({
        "type": "gps_update",
        "data": manager.latest_gps,
        "timestamp": time.time(),
    })

    return {"ok": True, "gps": manager.latest_gps}


@router.get("/api/v1/gps")
async def get_latest_gps():
    return {"gps": manager.latest_gps}
