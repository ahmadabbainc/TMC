from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "TMC API"
    app_env: str = "development"
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    cors_origins: str = "http://localhost:3000"
    api_token: str = ""
    redis_url: str = ""
    storage_endpoint: str = ""
    storage_region: str = "auto"
    storage_bucket: str = ""
    storage_access_key: str = ""
    storage_secret_key: str = ""
    max_upload_bytes: int = 2_000_000_000
    upload_url_ttl_seconds: int = 600

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
