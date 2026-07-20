from pydantic_settings import BaseSettings
from typing import Optional, Union, List

class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres.wsqbushgpximssghrsmh:passwordngresq1234@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres"
    
    # Supabase
    SUPABASE_URL: str = "https://wsqbushgpximssghrsmh.supabase.co/rest/v1/"
    SUPABASE_KEY: str = "sb_publishable_ryAR3AVkoEL0JwpQSOJP0A_Bm8-5jl5"
    
    # Security
    SECRET_KEY: str = "sb_secret_lhHEcUEHcE42V4qbsjWLkw_5wV1QWPh"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # CORS
    CORS_ORIGINS: Union[List[str], str] = ["*"]   

    # WebSocket
    WS_HEARTBEAT_INTERVAL: int = 30
    
    class Config:
        env_file = ".env"

settings = Settings()
