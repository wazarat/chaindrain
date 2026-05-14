"""Thin Supabase client wrappers.

We use two clients:
- `admin_client`: service-role key, bypasses RLS. For trusted server-side ops.
- `user_client(jwt)`: anon key + per-request JWT so RLS applies as that user.
"""

from __future__ import annotations

from functools import lru_cache

from supabase import Client, create_client

from app.config import get_settings


@lru_cache(maxsize=1)
def admin_client() -> Client:
    s = get_settings()
    return create_client(s.supabase_url, s.supabase_service_role_key)


def user_client(jwt: str) -> Client:
    """Return a Supabase client that acts as the given user (RLS applied)."""
    s = get_settings()
    client = create_client(s.supabase_url, s.supabase_anon_key)
    # supabase-py >= 2 exposes postgrest auth.
    client.postgrest.auth(jwt)
    return client
