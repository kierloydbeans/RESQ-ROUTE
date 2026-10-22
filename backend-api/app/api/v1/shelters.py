from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select
from typing import List
from app.core.security import get_current_user
from app.models.center import Center, CenterCreate, CenterRead, CenterUpdate
from app.db.session import get_session
from app.models.user import User, UserRole

router = APIRouter()

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
    
    await session.commit()
    await session.refresh(db_center)
    return db_center

@router.delete("/{center_id}")
async def delete_shelter(center_id: int, session: Session = Depends(get_session)):
    result = await session.execute(select(Center).where(Center.id == center_id))
    db_center = result.scalar_one_or_none()
    if not db_center:
        raise HTTPException(status_code=404, detail="Shelter not found")
    
    await session.delete(db_center)
    await session.commit()
    return {"message": "Shelter deleted successfully"}
