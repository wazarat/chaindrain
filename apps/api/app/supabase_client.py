"""Thin Supabase client wrappers.

Three clients, picked by the route based on access semantics:

- `public_client()`  : anon key, no JWT. RLS treats caller as the `anon` role.
                       Use for endpoints that only read public data.
- `user_client(jwt)` : anon key + per-request user JWT. RLS scopes to
                       `auth.uid()` of that user. Use for per-user endpoints
                       (profiles/me, watchlists, notifications).
- `admin_client()`   : service-role key, bypasses RLS entirely. Use only
                       for trusted server-side ops (admin tools, agent
                       ingestion). Raises if SUPABASE_SERVICE_ROLE_KEY
                       is not configured.
"""

from __future__ import annotations

from functools import lru_cache

from fastapi import HTTPException, status
from supabase import Client, create_client

from app.config import get_settings


@lru_cache(maxsize=1)
def public_client() -> Client:
    """Anon client with no JWT applied. Subject to RLS as the anon role."""
    s = get_settings()
    return create_client(s.supabase_url, s.supabase_anon_key)


@lru_cache(maxsize=1)
def admin_client() -> Client:
    """Service-role client that bypasses RLS. Configured-only."""
    s = get_settings()
    if not s.supabase_service_role_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="SUPABASE_SERVICE_ROLE_KEY not configured; admin operations disabled",
        )
    return create_client(s.supabase_url, s.supabase_service_role_key)


def user_client(jwt: str) -> Client:
    """Return a Supabase client that acts as the given user (RLS applied)."""
    s = get_settings()
    client = create_client(s.supabase_url, s.supabase_anon_key)
    client.postgrest.auth(jwt)
    return client
