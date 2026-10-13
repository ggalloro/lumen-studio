"""Reads asset metadata and original blobs from the assets service."""

import httpx

from .config import Settings


class AssetNotFound(Exception):
    pass


class AssetsUnavailable(Exception):
    pass


class AssetsClient:
    def __init__(self, settings: Settings):
        self._client = httpx.Client(
            base_url=settings.assets_url,
            headers={"X-Internal-Token": settings.internal_token},
            timeout=settings.http_timeout,
        )

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self._client.close()

    def _get(self, path: str) -> httpx.Response:
        try:
            response = self._client.get(path)
        except httpx.HTTPError as exc:
            raise AssetsUnavailable(f"assets service unreachable: {exc}") from exc
        if response.status_code == 404:
            raise AssetNotFound(path)
        if response.status_code >= 400:
            raise AssetsUnavailable(f"assets service returned {response.status_code} for {path}")
        return response

    def get_asset(self, asset_id: int) -> dict:
        return self._get(f"/assets/{asset_id}").json()

    def get_version(self, asset_id: int, version: int) -> dict:
        return self._get(f"/assets/{asset_id}/versions/{version}").json()

    def download(self, blob_url: str) -> bytes:
        # blob_url is normally relative ("/blobs/<sha256>"); httpx joins it with base_url.
        return self._get(blob_url).content
