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
    # service_role is only required for admin/agent routes; default empty so the
    # API boots in dev without it (admin calls will fail loudly when invoked).
    supabase_service_role_key: str = Field(default="", alias="SUPABASE_SERVICE_ROLE_KEY")
    # JWKS URL is derived from supabase_url if not explicitly set.
    supabase_jwks_url: str = Field(default="", alias="SUPABASE_JWKS_URL")
    supabase_jwt_aud: str = Field(default="authenticated", alias="SUPABASE_JWT_AUD")

    # CORS
    allowed_origins: str = Field(
        default="http://localhost:3000",
        alias="ALLOWED_ORIGINS",
    )
    allowed_origin_regex: str | None = Field(
        default=None,
        alias="ALLOWED_ORIGIN_REGEX",
    )

    # Agent integration
    agent_run_url: str | None = Field(default=None, alias="AGENT_RUN_URL")
    agent_hmac_secret: str | None = Field(default=None, alias="AGENT_HMAC_SECRET")

    # Observability
    sentry_dsn: str | None = Field(default=None, alias="SENTRY_DSN_API")

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def jwks_url(self) -> str:
        if self.supabase_jwks_url:
            return self.supabase_jwks_url
        return f"{self.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
