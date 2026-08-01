from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional, Union, List

class Settings(BaseSettings):
    # General
    PROJECT_NAME: str = "ResQ-Route API"

    # Database
    DATABASE_URL: str 
    
    # Supabase
    SUPABASE_URL: str 
    SUPABASE_KEY: str 
    # Security
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # CORS
    CORS_ORIGINS: Union[List[str], str] = ["*"]   

    # WebSocket
    WS_HEARTBEAT_INTERVAL: int = 30

    # Brevo email API
    BREVO_API_KEY: str
    BREVO_API_URL: str 
    EMAILS_FROM_EMAIL: str
    EMAILS_FROM_NAME: str = "ResQ-Route Admin"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
