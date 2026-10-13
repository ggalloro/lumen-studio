from datetime import datetime, timedelta, timezone

import httpx
import jwt
import pytest
import respx

from app import create_app
from app.config import Settings

SECRET = "test-secret-0123456789abcdef0123456789"
INTERNAL = "test-internal"
ASSETS_URL = "http://assets.test"
REVIEW_URL = "http://review.test"
BRAND_URL = "http://brand.test"
RIGHTS_URL = "http://rights.test"


def bearer(user_id=5, role="brand_admin", workspace_id=1) -> dict:
    token = jwt.encode(
        {"user_id": user_id, "workspace_id": workspace_id, "role": role, "name": "Test",
         "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
        SECRET,
        algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def client(tmp_path):
    settings = Settings(
        token_secret=SECRET,
        internal_token=INTERNAL,
        data_dir=tmp_path / "data",
        assets_url=ASSETS_URL,
        review_url=REVIEW_URL,
        brand_url=BRAND_URL,
        rights_url=RIGHTS_URL,
    )
    app = create_app(settings)
    app.testing = True
    return app.test_client()


class FakeUpstream:
    """Configures respx routes for assets, review, brand-check and rights."""

    def __init__(self, router: respx.Router):
        self.router = router
        self.assets: dict[int, dict] = {}
        self.reviews: dict[int, list[dict]] = {}
        self.checks: dict[tuple[int, int], dict] = {}
        # Clearance reasons per (asset, channel); anything not listed is cleared.
        self.rights_reasons: dict[tuple[int, str], list[str]] = {}
        router.get(url__regex=rf"{ASSETS_URL}/assets/(?P<asset_id>\d+)$").mock(
            side_effect=self._asset)
        router.get(f"{REVIEW_URL}/reviews").mock(side_effect=self._reviews)
        router.get(f"{BRAND_URL}/checks/latest").mock(side_effect=self._latest)
        router.get(url__regex=rf"{RIGHTS_URL}/rights/(?P<asset_id>\d+)/clearance").mock(
            side_effect=self._clearance)

    def add_asset(self, asset_id, title="Asset", versions=None, workspace_id=1):
        """versions: {version_number: [preset, ...]} renditions present per version."""
        versions = versions or {1: []}
        self.assets[asset_id] = {
            "id": asset_id,
            "workspace_id": workspace_id,
            "title": title,
            "versions": [
                {"asset_id": asset_id, "version": v,
                 "renditions": [{"preset": p, "width": 1080, "height": 1920,
                                 "sha256": f"{asset_id}{v}{p}",
                                 "blob_url": f"/blobs/{asset_id}-{v}-{p}"} for p in presets]}
                for v, presets in versions.items()
            ],
        }

    def add_review(self, asset_id, version, status, review_id=None):
        items = self.reviews.setdefault(asset_id, [])
        items.insert(0, {"id": review_id or len(items) + 1 + asset_id * 100,
                         "asset_id": asset_id, "version": version, "status": status})

    def set_check(self, asset_id, version, overall):
        self.checks[(asset_id, version)] = {"id": 1, "asset_id": asset_id,
                                            "version": version, "overall": overall}

    def block_rights(self, asset_id, channel, *reasons):
        self.rights_reasons[(asset_id, channel)] = list(reasons)

    def _asset(self, request, asset_id):
        asset = self.assets.get(int(asset_id))
        if asset is None:
            return httpx.Response(404, json={"error": "not found"})
        return httpx.Response(200, json=asset)

    def _reviews(self, request):
        asset_id = int(request.url.params["asset_id"])
        return httpx.Response(200, json={"items": self.reviews.get(asset_id, [])})

    def _latest(self, request):
        key = (int(request.url.params["asset_id"]), int(request.url.params["version"]))
        if key not in self.checks:
            return httpx.Response(404, json={"error": "not found"})
        return httpx.Response(200, json=self.checks[key])

    def _clearance(self, request, asset_id):
        channel = request.url.params["channel"]
        reasons = self.rights_reasons.get((int(asset_id), channel), [])
        return httpx.Response(200, json={"asset_id": int(asset_id), "channel": channel,
                                         "date": "2026-10-13", "cleared": not reasons,
                                         "reasons": reasons})


@pytest.fixture
def upstream():
    with respx.mock(assert_all_called=False) as router:
        yield FakeUpstream(router)

