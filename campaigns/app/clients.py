"""HTTP clients for the services readiness depends on. All calls use the internal token."""

import httpx

from .config import Settings


class UpstreamError(Exception):
    def __init__(self, service: str, detail: str):
        super().__init__(f"{service}: {detail}")
        self.service = service


class Upstream:
    def __init__(self, settings: Settings):
        self._settings = settings
        self._client = httpx.Client(
            headers={"X-Internal-Token": settings.internal_token},
            timeout=settings.http_timeout,
        )

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self._client.close()

    def _get(self, service: str, url: str, params: dict | None = None) -> dict | None:
        """GET JSON; returns None on 404, raises UpstreamError on other failures."""
        try:
            response = self._client.get(url, params=params)
        except httpx.HTTPError as exc:
            raise UpstreamError(service, f"unreachable ({exc})") from exc
        if response.status_code == 404:
            return None
        if response.status_code >= 400:
            raise UpstreamError(service, f"returned HTTP {response.status_code}")
        return response.json()

    def get_asset(self, asset_id: int) -> dict | None:
        return self._get("assets", f"{self._settings.assets_url}/assets/{asset_id}")

    def list_reviews(self, asset_id: int) -> list[dict]:
        body = self._get("review", f"{self._settings.review_url}/reviews",
                         params={"asset_id": asset_id})
        return (body or {}).get("items", [])

    def latest_check(self, asset_id: int, version: int) -> dict | None:
        return self._get("brand-check", f"{self._settings.brand_url}/checks/latest",
                         params={"asset_id": asset_id, "version": version})

    def clearance(self, asset_id: int, channel: str) -> dict | None:
        return self._get("rights", f"{self._settings.rights_url}/rights/{asset_id}/clearance",
                         params={"channel": channel})
