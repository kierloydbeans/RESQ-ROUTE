from sqlalchemy import text
from fastapi import APIRouter, Depends
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_session

# Temporary test route
@router.get("/test-db")
async def test_db_connection(session: AsyncSession = Depends(get_session)):
    try:
        # Run a simple raw query
        result = await session.execute(text("SELECT current_database(), current_user;"))
        db_name, db_user = result.fetchone()
        
        # Check if users table has any records
        # Replace 'User' with your actual SQLModel user class
        users_result = await session.execute(text("SELECT count(*) FROM \"user\";")) 
        user_count = users_result.scalar()

        return {
            "status": "connected",
            "database": db_name,
            "user": db_user,
            "total_users_in_db": user_count
        }
    except Exception as e:
        return {"status": "error", "details": str(e)}