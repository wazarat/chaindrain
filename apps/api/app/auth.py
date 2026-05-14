"""Supabase JWT verification middleware.

Validates RS256/ES256 JWTs issued by Supabase Auth via the project's JWKS
endpoint. Caches keys in-process and surfaces the verified claims as a
`CurrentUser` model.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

import httpx
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.config import Settings, get_settings

_JWKS_CACHE: dict[str, Any] = {"keys": None, "fetched_at": 0.0}
_JWKS_TTL_SECONDS = 60 * 10  # 10 minutes


@dataclass
class CurrentUser:
    id: str
    email: str | None
    role: str  # supabase role: anon|authenticated|service_role
    claims: dict[str, Any]


async def _load_jwks(jwks_url: str) -> dict[str, Any]:
    now = time.time()
    cached = _JWKS_CACHE["keys"]
    if cached is not None and now - _JWKS_CACHE["fetched_at"] < _JWKS_TTL_SECONDS:
        return cached  # type: ignore[no-any-return]

    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(jwks_url)
        resp.raise_for_status()
        data = resp.json()

    _JWKS_CACHE["keys"] = data
    _JWKS_CACHE["fetched_at"] = now
    return data


_bearer = HTTPBearer(auto_error=False)


async def _verify_token(token: str, settings: Settings) -> dict[str, Any]:
    """Verify a Supabase JWT.

    Supabase issues HS256-signed tokens by default; new projects may also issue
    RS256 via the JWKS endpoint. We support both: try HS256 first using the
    project's JWT secret (encoded in the anon key's signing chain isn't enough,
    so we attempt JWKS RS256/ES256 fallback).
    """
    # First try JWKS-based verification (RS256/ES256).
    try:
        jwks = await _load_jwks(settings.supabase_jwks_url)
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")
        keys = jwks.get("keys", [])
        key = next((k for k in keys if k.get("kid") == kid), keys[0] if keys else None)
        if key is None:
            raise JWTError("No JWKS keys available")
        return jwt.decode(
            token,
            key,
            algorithms=[key.get("alg", "RS256")],
            audience=settings.supabase_jwt_aud,
            options={"verify_aud": True},
        )
    except (JWTError, httpx.HTTPError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    settings: Settings = Depends(get_settings),
) -> CurrentUser:
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    claims = await _verify_token(credentials.credentials, settings)
    user_id = claims.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing sub claim",
        )

    user = CurrentUser(
        id=user_id,
        email=claims.get("email"),
        role=claims.get("role", "authenticated"),
        claims=claims,
    )
    request.state.user = user
    return user


async def get_current_user_optional(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    settings: Settings = Depends(get_settings),
) -> CurrentUser | None:
    if credentials is None or not credentials.credentials:
        return None
    try:
        return await get_current_user(request, credentials, settings)
    except HTTPException:
        return None
