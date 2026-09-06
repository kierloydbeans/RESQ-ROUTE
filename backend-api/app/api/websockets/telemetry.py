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
    user_id: Optional[int] = None
    role: Optional[str] = None
    display_name: Optional[str] = None


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.telemetry_data: Dict = {}
        self.latest_gps: Optional[Dict] = None
        self.latest_gps_by_user: Dict[str, Dict] = {}

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        for location in self.latest_gps_by_user.values():
            await websocket.send_json({
                "type": "gps_update",
                "data": location,
                "timestamp": time.time(),
            })
        if self.telemetry_data.get("evacuation_route"):
            await websocket.send_json({
                "type": "evacuation_route_updated",
                "data": self.telemetry_data["evacuation_route"],
                "timestamp": time.time(),
            })

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
                if message.get("type") == "evacuation_route_updated" and message.get("data"):
                    manager.telemetry_data["evacuation_route"] = message["data"]
                    await manager.broadcast({
                        "type": "evacuation_route_updated",
                        "data": message["data"],
                        "timestamp": time.time(),
                    })

                latitude = message.get("latitude")
                longitude = message.get("longitude")
                if latitude is not None and longitude is not None:
                    manager.latest_gps = {
                        "latitude": float(latitude),
                        "longitude": float(longitude),
                        "accuracy": message.get("accuracy"),
                        "device_id": message.get("device_id"),
                        "user_id": message.get("user_id"),
                        "role": message.get("role"),
                        "display_name": message.get("display_name"),
                        "timestamp": message.get("timestamp") or time.time(),
                    }
                    if manager.latest_gps["user_id"] is not None:
                        manager.latest_gps_by_user[str(manager.latest_gps["user_id"])] = manager.latest_gps
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
        "user_id": payload.user_id,
        "role": payload.role,
        "display_name": payload.display_name,
        "timestamp": time.time(),
    }
    if manager.latest_gps["user_id"] is not None:
        manager.latest_gps_by_user[str(manager.latest_gps["user_id"])] = manager.latest_gps

    await manager.broadcast({
        "type": "gps_update",
        "data": manager.latest_gps,
        "timestamp": time.time(),
    })

    return {"ok": True, "gps": manager.latest_gps}


@router.get("/api/v1/gps")
async def get_latest_gps():
    return {"gps": manager.latest_gps, "locations": list(manager.latest_gps_by_user.values())}


@router.post("/api/v1/evacuation-route")
async def update_evacuation_route(payload: Dict):
    manager.telemetry_data["evacuation_route"] = payload
    await manager.broadcast({
        "type": "evacuation_route_updated",
        "data": payload,
        "timestamp": time.time(),
    })
    return {"ok": True, "route": payload}


@router.get("/api/v1/evacuation-route")
async def get_evacuation_route():
    return {"route": manager.telemetry_data.get("evacuation_route")}
