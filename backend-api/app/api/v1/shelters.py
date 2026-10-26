import json
from urllib.parse import urlsplit, urlunsplit
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from starlette.concurrency import run_in_threadpool
from supabase import create_client
from sqlmodel import Session, select
from typing import List
from app.core.security import get_current_user
from app.models.center import Center, CenterCreate, CenterRead, CenterUpdate
from app.db.session import get_session
from app.models.user import User, UserRole
from app.services.audit_logging import record_audit_log
from app.core.config import settings
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()

CENTER_IMAGES_BUCKET = "center_images"
MAX_CENTER_IMAGES = 3
MAX_CENTER_IMAGE_BYTES = 15 * 1024 * 1024
CENTER_IMAGE_EXTENSIONS = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}


def _center_image_urls(value: str | None) -> list[str]:
    if not value:
        return []
    try:
        parsed = json.loads(value)
    except (TypeError, json.JSONDecodeError):
        parsed = value
    if isinstance(parsed, str):
        parsed = [parsed]
    return [url.strip() for url in parsed if isinstance(url, str) and url.strip()][:MAX_CENTER_IMAGES]


def _serialize_center_image_urls(urls: list[str]) -> str | None:
    clean_urls = [url for url in urls if isinstance(url, str) and url.strip()][:MAX_CENTER_IMAGES]
    return json.dumps(clean_urls, separators=(",", ":")) if clean_urls else None


async def _get_center_editor(credentials: dict, session: AsyncSession, center_id: int) -> User:
    result = await session.execute(select(User).where(User.username == credentials.get("sub")))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Active user account required")
    if user.role in {UserRole.ADMIN, UserRole.COORDINATOR}:
        return user
    if user.role == UserRole.CENTER_COORDINATOR and user.assigned_center_id == center_id:
        return user
    raise HTTPException(status_code=403, detail="You are not authorized to manage this evacuation center")


def _storage_client():
    parts = urlsplit(settings.SUPABASE_URL)
    if parts.path.rstrip("/") == "/rest/v1":
        parts = parts._replace(path="")
    return create_client(urlunsplit(parts), settings.SUPABASE_KEY)


def _storage_path_from_url(url: str) -> str | None:
    marker = f"/storage/v1/object/public/{CENTER_IMAGES_BUCKET}/"
    return urlsplit(url).path.split(marker, 1)[1] if marker in urlsplit(url).path else None

@router.get("/", response_model=List[CenterRead])
async def list_shelters(
    skip: int = 0,
    limit: int = 100,
    session: Session = Depends(get_session)
):
    result = await session.execute(select(Center).offset(skip).limit(limit))
    centers = result.scalars().all()
    return centers

@router.get("/{center_id}", response_model=CenterRead)
async def get_shelter(center_id: int, session: Session = Depends(get_session)):
    result = await session.execute(select(Center).where(Center.id == center_id))
    center = result.scalar_one_or_none()
    if not center:
        raise HTTPException(status_code=404, detail="Shelter not found")
    return center

@router.post("/", response_model=CenterRead)
async def create_shelter(
    center: CenterCreate,
    session: Session = Depends(get_session)
):
    db_center = Center.from_orm(center)
    session.add(db_center)
    await session.commit()
    await session.refresh(db_center)
    return db_center

@router.put("/{center_id}", response_model=CenterRead)
async def update_shelter(
    center_id: int,
    center_update: CenterUpdate,
    request: Request,
    current_user: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    user_result = await session.execute(
        select(User).where(User.username == current_user.get("sub"))
    )
    user = user_result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Active user account required")
    if user.role not in {UserRole.ADMIN, UserRole.COORDINATOR}:
        raise HTTPException(status_code=403, detail="Coordinator account required")

    result = await session.execute(select(Center).where(Center.id == center_id))
    db_center = result.scalar_one_or_none()
    if not db_center:
        raise HTTPException(status_code=404, detail="Shelter not found")
    
    center_data = center_update.dict(exclude_unset=True)
    for key, value in center_data.items():
        setattr(db_center, key, value)
    
    record_audit_log(session, current_user, request, f"Evacuation center {center_id} updated")
    await session.commit()
    await session.refresh(db_center)
    return db_center


@router.post("/{center_id}/images", status_code=201)
async def upload_center_image(
    center_id: int,
    file: UploadFile = File(...),
    credentials: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    await _get_center_editor(credentials, session, center_id)
    result = await session.execute(select(Center).where(Center.id == center_id))
    center = result.scalar_one_or_none()
    if not center:
        raise HTTPException(status_code=404, detail="Shelter not found")
    content_type = (file.content_type or "").lower()
    extension = CENTER_IMAGE_EXTENSIONS.get(content_type)
    if not extension:
        raise HTTPException(status_code=415, detail="Upload a JPG, PNG, or WebP image")
    urls = _center_image_urls(center.image_url)
    if len(urls) >= MAX_CENTER_IMAGES:
        raise HTTPException(status_code=409, detail="An evacuation center can have at most 3 images")
    contents = await file.read(MAX_CENTER_IMAGE_BYTES + 1)
    if len(contents) > MAX_CENTER_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Center images must be 15 MB or smaller")
    storage_path = f"centers/{center_id}/{uuid4().hex}{extension}"
    storage = _storage_client().storage.from_(CENTER_IMAGES_BUCKET)
    try:
        await run_in_threadpool(lambda: storage.upload(storage_path, contents, file_options={"content-type": content_type, "upsert": "false"}))
        public_response = await run_in_threadpool(lambda: storage.get_public_url(storage_path))
        public_url = public_response if isinstance(public_response, str) else (public_response.get("publicUrl") or public_response.get("public_url") if isinstance(public_response, dict) else None)
        if not public_url:
            raise RuntimeError("Supabase Storage did not return a public URL")
        center.image_url = _serialize_center_image_urls([*urls, public_url])
        await session.commit()
        await session.refresh(center)
    except HTTPException:
        raise
    except Exception as error:
        await session.rollback()
        raise HTTPException(status_code=502, detail="Unable to upload center image") from error
    finally:
        await file.close()
    return {"bucket": CENTER_IMAGES_BUCKET, "path": storage_path, "public_url": public_url, "image_url": center.image_url}


@router.delete("/{center_id}/images/{image_index}")
async def delete_center_image(
    center_id: int,
    image_index: int,
    credentials: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    await _get_center_editor(credentials, session, center_id)
    result = await session.execute(select(Center).where(Center.id == center_id))
    center = result.scalar_one_or_none()
    if not center:
        raise HTTPException(status_code=404, detail="Shelter not found")
    urls = _center_image_urls(center.image_url)
    if image_index < 0 or image_index >= len(urls):
        raise HTTPException(status_code=404, detail="Center image not found")
    removed_url = urls.pop(image_index)
    storage_path = _storage_path_from_url(removed_url)
    try:
        if storage_path:
            storage = _storage_client().storage.from_(CENTER_IMAGES_BUCKET)
            await run_in_threadpool(lambda: storage.remove([storage_path]))
        center.image_url = _serialize_center_image_urls(urls)
        await session.commit()
        await session.refresh(center)
    except Exception as error:
        await session.rollback()
        raise HTTPException(status_code=502, detail="Unable to delete center image") from error
    return {"image_url": center.image_url}


@router.put("/{center_id}/images/{image_index}")
async def replace_center_image(
    center_id: int,
    image_index: int,
    file: UploadFile = File(...),
    credentials: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    await _get_center_editor(credentials, session, center_id)
    result = await session.execute(select(Center).where(Center.id == center_id))
    center = result.scalar_one_or_none()
    if not center:
        raise HTTPException(status_code=404, detail="Shelter not found")
    urls = _center_image_urls(center.image_url)
    if image_index < 0 or image_index >= len(urls):
        raise HTTPException(status_code=404, detail="Center image not found")
    content_type = (file.content_type or "").lower()
    extension = CENTER_IMAGE_EXTENSIONS.get(content_type)
    if not extension:
        raise HTTPException(status_code=415, detail="Upload a JPG, PNG, or WebP image")
    contents = await file.read(MAX_CENTER_IMAGE_BYTES + 1)
    if len(contents) > MAX_CENTER_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Center images must be 15 MB or smaller")
    storage_path = f"centers/{center_id}/{uuid4().hex}{extension}"
    storage = _storage_client().storage.from_(CENTER_IMAGES_BUCKET)
    old_path = _storage_path_from_url(urls[image_index])
    try:
        await run_in_threadpool(lambda: storage.upload(storage_path, contents, file_options={"content-type": content_type, "upsert": "false"}))
        public_response = await run_in_threadpool(lambda: storage.get_public_url(storage_path))
        public_url = public_response if isinstance(public_response, str) else (public_response.get("publicUrl") or public_response.get("public_url") if isinstance(public_response, dict) else None)
        if not public_url:
            raise RuntimeError("Supabase Storage did not return a public URL")
        urls[image_index] = public_url
        center.image_url = _serialize_center_image_urls(urls)
        await session.commit()
        await session.refresh(center)
        if old_path:
            await run_in_threadpool(lambda: storage.remove([old_path]))
    except HTTPException:
        raise
    except Exception as error:
        await session.rollback()
        raise HTTPException(status_code=502, detail="Unable to replace center image") from error
    finally:
        await file.close()
    return {"bucket": CENTER_IMAGES_BUCKET, "path": storage_path, "public_url": public_url, "image_url": center.image_url}

@router.delete("/{center_id}")
async def delete_shelter(center_id: int, session: Session = Depends(get_session)):
    result = await session.execute(select(Center).where(Center.id == center_id))
    db_center = result.scalar_one_or_none()
    if not db_center:
        raise HTTPException(status_code=404, detail="Shelter not found")
    
    await session.delete(db_center)
    await session.commit()
    return {"message": "Shelter deleted successfully"}
