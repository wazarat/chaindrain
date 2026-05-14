"""Runtime configuration loaded from environment variables."""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Centralized environment-backed settings."""

    model_config = SettingsConfigDict(
        env_file=(".env", ".env.local"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    environment: str = Field(default="development", alias="ENVIRONMENT")

    # Supabase
    supabase_url: str = Field(alias="SUPABASE_URL")
    supabase_anon_key: str = Field(alias="SUPABASE_ANON_KEY")
    supabase_service_role_key: str = Field(alias="SUPABASE_SERVICE_ROLE_KEY")
    supabase_jwks_url: str = Field(alias="SUPABASE_JWKS_URL")
    supabase_jwt_aud: str = Field(default="authenticated", alias="SUPABASE_JWT_AUD")

    # CORS
    allowed_origins: str = Field(
        default="http://localhost:3000",
        alias="ALLOWED_ORIGINS",
    )

    # Agent integration
    agent_run_url: str | None = Field(default=None, alias="AGENT_RUN_URL")
    agent_hmac_secret: str | None = Field(default=None, alias="AGENT_HMAC_SECRET")

    # Observability
    sentry_dsn: str | None = Field(default=None, alias="SENTRY_DSN_API")

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
