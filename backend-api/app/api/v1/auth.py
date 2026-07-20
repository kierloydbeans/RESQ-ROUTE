from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session, select
from app.core.security import create_access_token, verify_password, get_password_hash
from app.db.session import get_session
from app.models.user import User, UserCreate, UserRead
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()

@router.post("/login")
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    session: AsyncSession = Depends(get_session)
):
    # Query user from database
    statement = select(User).where(User.username == form_data.username)
    result = await session.execute(statement)
    user = result.scalar_one_or_none()
    
    # 🔍 Temporary Debug Logs
    print("--------------------------------------------------")
    print(f"1. Looking up username: '{form_data.username}'")
    print(f"2. User object found in DB? -> {user is not None}")
    
    if user:
        print(f"3. Stored hash in DB -> {user.hashed_password}")
        print(f"4. Input password -> {form_data.password}")
        is_pass_valid = verify_password(form_data.password, user.hashed_password)
        print(f"5. Does password match? -> {is_pass_valid}")
    print("--------------------------------------------------")

    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive",
        )
    
    # Create access token
    access_token = create_access_token(data={"sub": user.username, "role": user.role})
    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role
        }
    }

@router.post("/register", response_model=UserRead)
async def register(
    user_data: UserCreate,
    session: AsyncSession = Depends(get_session)
):
    # Check if username already exists
    statement = select(User).where(User.username == user_data.username)
    result = await session.execute(statement)
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered"
        )
    
    # Check if email already exists
    statement = select(User).where(User.email == user_data.email)
    result = await session.execute(statement)
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Create new user with hashed password
    db_user = User(
        username=user_data.username,
        email=user_data.email,
        full_name=user_data.full_name,
        role=user_data.role,
        hashed_password=get_password_hash(user_data.password),
        is_active=True
    )
    
    session.add(db_user)
    await session.commit()
    await session.refresh(db_user)
    
    return db_user

# Temporary test route
@router.get("/test-db")
async def test_db_connection(session: AsyncSession = Depends(get_session)):
    try:
        print("Mapped table name is:", User.__tablename__)
        # Check if users table has any records using User model
        statement = select(User)
        result = await session.execute(statement)
        users = result.scalars().all()
        
        return {
            "status": "connected",
            "total_users": len(users),
            "users": [
                {
                    "id": user.id,
                    "username": user.username,
                    "email": user.email,
                    "role": user.role,
                    "is_active": user.is_active
                }
                for user in users
            ]
        }


    except Exception as e:
        return {"status": "error", "details": str(e)}