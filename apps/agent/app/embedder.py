"""Embedding helper for the agent worker.

Tries OpenAI text-embedding-3-small (1536 dims, matches schema). Returns None on
failure so the caller can insert events without an embedding (search will fall
back to FTS).
"""

from __future__ import annotations

from typing import Sequence

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
async def embed(text: str, api_key: str) -> Sequence[float]:
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(
            "https://api.openai.com/v1/embeddings",
            headers={"Authorization": f"Bearer {api_key}"},
            json={"model": "text-embedding-3-small", "input": text[:8000]},
        )
        resp.raise_for_status()
        data = resp.json()
    return data["data"][0]["embedding"]
