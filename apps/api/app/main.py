"""FastAPI app factory and ASGI entrypoint."""

from __future__ import annotations

import logging

import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.config import get_settings
from app.routers import (
    admin,
    agent,
    catalog,
    events,
    health,
    me,
    notifications,
    search,
    threat_matrix,
    watchlists,
)

logger = logging.getLogger("chaindrain.api")
logger.setLevel(logging.INFO)


def _init_sentry() -> None:
    s = get_settings()
    if s.sentry_dsn:
        sentry_sdk.init(
            dsn=s.sentry_dsn,
            environment=s.environment,
            traces_sample_rate=0.1,
            send_default_pii=False,
        )


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:  # type: ignore[override]
        rid = request.headers.get("x-request-id") or ""
        response = await call_next(request)
        if rid:
            response.headers["x-request-id"] = rid
        return response


def create_app() -> FastAPI:
    _init_sentry()
    settings = get_settings()

    app = FastAPI(
        title="Chaindrain API",
        version="0.1.0",
        description="Exploit-intelligence backend for chaindrain.xyz",
    )

    cors_kwargs: dict[str, object] = {
        "allow_origins": settings.cors_origins,
        "allow_credentials": True,
        "allow_methods": ["*"],
        "allow_headers": ["*"],
        "expose_headers": ["x-request-id"],
    }
    if settings.allowed_origin_regex:
        cors_kwargs["allow_origin_regex"] = settings.allowed_origin_regex
    app.add_middleware(CORSMiddleware, **cors_kwargs)
    app.add_middleware(RequestIdMiddleware)

    limiter = Limiter(
        key_func=get_remote_address,
        default_limits=["600/minute"],
        enabled=settings.environment != "test",
    )
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    app.include_router(health.router)
    app.include_router(me.router)
    app.include_router(catalog.router)
    app.include_router(events.router)
    app.include_router(watchlists.router)
    app.include_router(notifications.router)
    app.include_router(threat_matrix.router)
    app.include_router(search.router)
    app.include_router(admin.router)
    app.include_router(agent.router)

    return app


app = create_app()
