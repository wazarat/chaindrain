"""Agent worker configuration."""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", ".env.local"), extra="ignore")

    environment: str = Field(default="development", alias="ENVIRONMENT")

    supabase_url: str = Field(alias="SUPABASE_URL")
    supabase_service_role_key: str = Field(alias="SUPABASE_SERVICE_ROLE_KEY")

    perplexity_api_key: str | None = Field(default=None, alias="PERPLEXITY_API_KEY")
    comet_api_key: str | None = Field(default=None, alias="COMET_API_KEY")
    openai_api_key: str | None = Field(default=None, alias="OPENAI_API_KEY")

    agent_hmac_secret: str = Field(alias="AGENT_HMAC_SECRET")
    sentry_dsn: str | None = Field(default=None, alias="SENTRY_DSN_AGENT")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
