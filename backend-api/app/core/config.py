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

    # SMTP Settings
    SMTP_HOST: str
    SMTP_PORT: int = 587
    SMTP_USER: str
    SMTP_PASSWORD: str
    EMAILS_FROM_EMAIL: str
    EMAILS_FROM_NAME: str = "ResQ-Route Admin"
    SMTP_TLS: bool = True

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
