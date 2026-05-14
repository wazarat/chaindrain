"""Playwright fallback used when Comet is unavailable or returns garbage.

This is a *deliberately conservative* extractor: it loads the page, pulls
visible headlines and links from a known set of selectors per source slug,
and returns them as RawFinding stubs. The deterministic classifier then does
the rest.

Selectors live here to avoid scattering them across codepaths.
"""

from __future__ import annotations

import asyncio
import contextlib
from typing import Any

from app.classifier import RawFinding

SELECTORS: dict[str, dict[str, str]] = {
    "rekt-news": {
        "container": "article a, .entry-title a, h2 a",
    },
    "defillama-hacks": {
        "container": 'table a[href*="/hacks/"], a[href*="/hack/"]',
    },
    "chainalysis-blog": {
        "container": "article h2 a, .entry-title a",
    },
    "sec-press-releases": {
        "container": "table.list a.usa-link, .views-row a",
    },
    "rugdoc": {
        "container": "article a, h2 a",
    },
    "etherscan-exploits": {
        "container": 'a[href*="/address/"], a[href*="/tx/"]',
    },
}


async def fetch_headlines(source_slug: str, source_url: str, *, max_items: int = 25) -> list[RawFinding]:
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        return []

    sel = SELECTORS.get(source_slug, {}).get("container", "a")
    findings: list[RawFinding] = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        try:
            page = await browser.new_page()
            await page.set_extra_http_headers(
                {"user-agent": "Mozilla/5.0 chaindrain-agent/0.1 (+https://chaindrain.xyz)"},
            )
            with contextlib.suppress(Exception):
                await page.goto(source_url, wait_until="domcontentloaded", timeout=20000)
            anchors = await page.locator(sel).all()
            seen: set[str] = set()
            for a in anchors[: max_items * 2]:
                href = (await a.get_attribute("href")) or ""
                text = (await a.inner_text()).strip()
                if not text or len(text) < 12:
                    continue
                if href.startswith("/"):
                    # naive absolute resolve
                    href = source_url.rstrip("/") + href
                if href in seen:
                    continue
                seen.add(href)
                findings.append(
                    RawFinding(
                        title=text[:240],
                        summary=f"Headline scraped from {source_slug} fallback path: {text}",
                        sources=[href] if href.startswith("http") else [source_url],
                        raw={"source_slug": source_slug, "fallback": True},
                    ),
                )
                if len(findings) >= max_items:
                    break
        finally:
            await browser.close()

    return findings


def fetch_headlines_sync(source_slug: str, source_url: str, *, max_items: int = 25) -> list[RawFinding]:
    """Convenience wrapper for non-async callers."""
    return asyncio.run(fetch_headlines(source_slug, source_url, max_items=max_items))


# Quiet lint
__all__ = ["fetch_headlines", "fetch_headlines_sync", "Any"]
