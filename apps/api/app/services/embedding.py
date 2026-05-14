"""Embedding utility with graceful fallback.

Uses OpenAI's text-embedding-3-small (1536-dim) when OPENAI_API_KEY is set;
otherwise returns None. The agent worker has its own embedder; this one is
for ad-hoc use from the API (e.g. search query encoding).
"""

from __future__ import annotations

import os
from typing import Sequence

import httpx


async def embed_text(text: str) -> Sequence[float] | None:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return None
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            "https://api.openai.com/v1/embeddings",
            headers={"Authorization": f"Bearer {api_key}"},
            json={"model": "text-embedding-3-small", "input": text},
        )
        resp.raise_for_status()
        data = resp.json()
    return data["data"][0]["embedding"]
