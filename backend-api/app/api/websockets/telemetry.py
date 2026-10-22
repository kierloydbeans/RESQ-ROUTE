from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from typing import List, Dict, Optional
import json
import time
from fastapi import HTTPException
from sqlalchemy import select
from ...core.security import decode_token
from ...db.session import async_session
from ...models.user import User, UserRole

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
        self.user_connections: Dict[int, List[WebSocket]] = {}
        self.calls: Dict[str, Dict] = {}

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
        user_id = getattr(websocket.state, "user_id", None)
        if user_id is not None:
            user_connections = self.user_connections.get(user_id, [])
            if websocket in user_connections:
                user_connections.remove(websocket)
            if not user_connections:
                self.user_connections.pop(user_id, None)

    async def send_to_user(self, user_id: int, message: dict) -> int:
        delivered = 0
        for connection in list(self.user_connections.get(user_id, [])):
            try:
                await connection.send_json(message)
                delivered += 1
            except Exception:
                self.disconnect(connection)
        return delivered

    async def authenticate(self, websocket: WebSocket, token: str) -> bool:
        try:
            claims = decode_token(token)
            username = claims.get("sub")
            if not username:
                return False
            async with async_session() as session:
                result = await session.execute(select(User).where(User.username == username))
                user = result.scalar_one_or_none()
                if not user or not user.is_active:
                    return False
                websocket.state.user_id = user.id
                websocket.state.username = user.username
                websocket.state.role = user.role.value if hasattr(user.role, "value") else str(user.role)
                websocket.state.full_name = user.full_name
            self.user_connections.setdefault(websocket.state.user_id, []).append(websocket)
            return True
        except HTTPException:
            return False

    async def handle_voice_message(self, websocket: WebSocket, message: dict) -> bool:
        message_type = message.get("type")
        if not isinstance(message_type, str) or not message_type.startswith("voice_"):
            return False

        user_id = getattr(websocket.state, "user_id", None)
        role = getattr(websocket.state, "role", "")
        if user_id is None:
            await websocket.send_json({"type": "voice_error", "message": "Authenticate before voice signaling."})
            return True

        call_id = message.get("call_id")
        if not isinstance(call_id, str) or not call_id:
            await websocket.send_json({"type": "voice_error", "message": "A call ID is required."})
            return True

        if message_type == "voice_invite":
            if role not in {"dispatcher", "admin"}:
                await websocket.send_json({"type": "voice_error", "message": "Only dispatchers can start calls."})
                return True
            if call_id in self.calls:
                await websocket.send_json({"type": "voice_error", "call_id": call_id, "message": "This call ID is already in use."})
                return True
            target_ids = message.get("target_user_ids")
            if not isinstance(target_ids, list) or not target_ids:
                await websocket.send_json({"type": "voice_error", "message": "Select at least one rescuer."})
                return True
            targets = {int(target_id) for target_id in target_ids if str(target_id).isdigit()}
            if not targets:
                await websocket.send_json({"type": "voice_error", "message": "No valid rescuer targets were provided."})
                return True
            async with async_session() as session:
                result = await session.execute(
                    select(User.id).where(
                        User.id.in_(targets),
                        User.role == UserRole.RESCUER,
                        User.is_active.is_(True),
                    )
                )
                targets = set(result.scalars().all())
            if not targets:
                await websocket.send_json({"type": "voice_error", "message": "No active rescuers were selected."})
                return True
            self.calls[call_id] = {
                "dispatcher_id": user_id,
                "invited": targets,
                "participants": set(),
            }
            invitation = {
                "type": "voice_invite",
                "call_id": call_id,
                "dispatcher_id": user_id,
                "dispatcher_name": getattr(websocket.state, "full_name", None) or websocket.state.username,
                "timestamp": time.time(),
            }
            online_count = 0
            for target_id in targets:
                online_count += bool(await self.send_to_user(target_id, invitation))
            await websocket.send_json({
                "type": "voice_invite_sent",
                "call_id": call_id,
                "target_count": len(targets),
                "online_count": online_count,
                "timestamp": time.time(),
            })
            return True

        call = self.calls.get(call_id)
        if not call:
            await websocket.send_json({"type": "voice_error", "call_id": call_id, "message": "This call is no longer active."})
            return True

        dispatcher_id = call["dispatcher_id"]
        if message_type == "voice_accept":
            if user_id not in call["invited"] or role != "rescuer":
                await websocket.send_json({"type": "voice_error", "call_id": call_id, "message": "You are not invited to this call."})
                return True
            call["participants"].add(user_id)
            await self.send_to_user(dispatcher_id, {
                "type": "voice_participant_joined",
                "call_id": call_id,
                "user_id": user_id,
                "display_name": getattr(websocket.state, "full_name", None) or websocket.state.username,
            })
            return True

        if message_type == "voice_decline":
            if user_id not in call["invited"] or role != "rescuer":
                await websocket.send_json({"type": "voice_error", "call_id": call_id, "message": "You are not invited to this call."})
                return True
            call["invited"].discard(user_id)
            await self.send_to_user(dispatcher_id, {
                "type": "voice_participant_declined",
                "call_id": call_id,
                "user_id": user_id,
            })
            if not call["invited"] and not call["participants"]:
                self.calls.pop(call_id, None)
            return True

        if message_type == "voice_signal":
            target_id = message.get("target_user_id")
            valid_pair = (
                user_id == dispatcher_id and target_id in call["participants"]
            ) or (
                user_id in call["participants"] and target_id == dispatcher_id
            )
            payload = message.get("payload")
            if not valid_pair or not isinstance(payload, dict):
                await websocket.send_json({"type": "voice_error", "call_id": call_id, "message": "Invalid call signaling target."})
                return True
            await self.send_to_user(int(target_id), {
                "type": "voice_signal",
                "call_id": call_id,
                "user_id": user_id,
                "payload": payload,
            })
            return True

        if message_type == "voice_leave":
            if user_id == dispatcher_id:
                await self.end_call(call_id)
            elif user_id in call["participants"]:
                call["participants"].discard(user_id)
                call["invited"].discard(user_id)
                await self.send_to_user(dispatcher_id, {
                    "type": "voice_participant_left",
                    "call_id": call_id,
                    "user_id": user_id,
                })
                if not call["invited"] and not call["participants"]:
                    self.calls.pop(call_id, None)
            return True

        return True

    async def end_call(self, call_id: str):
        call = self.calls.pop(call_id, None)
        if not call:
            return
        event = {"type": "voice_call_ended", "call_id": call_id}
        await self.send_to_user(call["dispatcher_id"], event)
        for participant_id in call["invited"]:
            await self.send_to_user(participant_id, event)

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

            if isinstance(message, dict) and message.get("type") == "authenticate":
                authenticated = await manager.authenticate(websocket, str(message.get("token") or ""))
                await websocket.send_json({
                    "type": "authenticated" if authenticated else "authentication_failed",
                    "user_id": getattr(websocket.state, "user_id", None),
                })
                if not authenticated:
                    await websocket.close(code=4401)
                continue

            if isinstance(message, dict) and message.get("type") == "heartbeat":
                continue

            if isinstance(message, dict) and await manager.handle_voice_message(websocket, message):
                continue

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
    finally:
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
