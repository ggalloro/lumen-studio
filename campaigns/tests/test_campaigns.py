from pathlib import Path

import httpx

from app import readiness
from app.clients import Upstream
from app.config import Settings

from .conftest import ASSETS_URL, BRAND_URL, INTERNAL, REVIEW_URL, RIGHTS_URL, bearer

H = bearer()


def create_campaign(client, name="Trailhead Fall 2026"):
    resp = client.post("/campaigns", json={"name": name, "brief": "Fall launch",
                                           "due_date": "2026-11-02"}, headers=H)
    assert resp.status_code == 201, resp.get_json()
    return resp.get_json()


def add(client, campaign_id, asset_id, channel):
    return client.post(f"/campaigns/{campaign_id}/deliverables",
                       json={"asset_id": asset_id, "channel": channel}, headers=H)


def test_health(client):
    assert client.get("/health").get_json() == {"status": "ok", "service": "campaigns"}


def test_requires_jwt(client):
    assert client.get("/campaigns").status_code == 401
    assert client.get("/campaigns", headers={"X-Internal-Token": INTERNAL}).status_code == 401
    resp = client.get("/campaigns", headers={"Authorization": "Bearer nope"})
    assert resp.status_code == 401
    assert "error" in resp.get_json()


def test_create_and_get_campaign(client):
    campaign = create_campaign(client)
    assert campaign["status"] == "draft"
    assert campaign["created_by"] == 5
    assert campaign["workspace_id"] == 1
    assert campaign["published_at"] is None
    assert campaign["deliverables"] == []

    assert client.get(f"/campaigns/{campaign['id']}", headers=H).get_json() == campaign
    assert client.get("/campaigns", headers=H).get_json()["items"] == [campaign]


def test_campaigns_are_scoped_to_workspace(client):
    campaign = create_campaign(client)
    other = bearer(workspace_id=2)
    assert client.get(f"/campaigns/{campaign['id']}", headers=other).status_code == 404
    assert client.get("/campaigns", headers=other).get_json()["items"] == []


def test_create_campaign_validation(client):
    assert client.post("/campaigns", json={"brief": "x"}, headers=H).status_code == 400
    resp = client.post("/campaigns", json={"name": "X", "due_date": "next week"}, headers=H)
    assert resp.status_code == 400
    assert client.post("/campaigns", data="nope", headers=H).status_code == 400


def test_add_and_delete_deliverable(client, upstream):
    upstream.add_asset(7, "Ridge Jacket hero")
    campaign = create_campaign(client)

    resp = add(client, campaign["id"], 7, "story")
    assert resp.status_code == 201
    deliverable = resp.get_json()
    assert deliverable["asset_id"] == 7 and deliverable["channel"] == "story"

    assert add(client, campaign["id"], 7, "story").status_code == 409
    assert add(client, campaign["id"], 7, "billboard").status_code == 400
    assert add(client, campaign["id"], 99, "story").status_code == 400

    path = f"/campaigns/{campaign['id']}/deliverables/{deliverable['id']}"
    assert client.delete(path, headers=H).status_code == 204
    assert client.delete(path, headers=H).status_code == 404


def test_add_deliverable_rejects_asset_from_other_workspace(client, upstream):
    upstream.add_asset(8, workspace_id=2)
    campaign = create_campaign(client)
    assert add(client, campaign["id"], 8, "story").status_code == 400


def test_readiness_reports_blockers(client, upstream):
    # 1: ready. 2: no approved review. 3: brand check failed. 4: never checked.
    # 5: rendition missing for the channel.
    upstream.add_asset(1, "Ready", {1: ["story"], 2: ["story"]})
    upstream.add_review(1, 2, "approved")
    upstream.set_check(1, 2, "warn")

    upstream.add_asset(2, "In review", {1: ["story"]})
    upstream.add_review(2, 1, "in_review")

    upstream.add_asset(3, "Off brand", {1: ["story"]})
    upstream.add_review(3, 1, "approved")
    upstream.set_check(3, 1, "fail")

    upstream.add_asset(4, "Unchecked", {1: ["story"]})
    upstream.add_review(4, 1, "approved")

    upstream.add_asset(5, "No banner", {1: ["story"]})
    upstream.add_review(5, 1, "approved")
    upstream.set_check(5, 1, "pass")

    campaign = create_campaign(client)
    for asset_id, channel in [(1, "story"), (2, "story"), (3, "story"), (4, "story"),
                              (5, "web_banner")]:
        assert add(client, campaign["id"], asset_id, channel).status_code == 201

    resp = client.get(f"/campaigns/{campaign['id']}/readiness", headers=H)
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["campaign_id"] == campaign["id"]
    assert body["ready"] is False
    assert body["total"] == 5
    assert body["ready_count"] == 1

    rows = {row["asset_id"]: row for row in body["deliverables"]}
    assert rows[1] == {
        "deliverable_id": rows[1]["deliverable_id"],
        "asset_id": 1,
        "asset_title": "Ready",
        "channel": "story",
        "review_status": "approved",
        "approved_version": 2,
        "brand_status": "warn",
        "rendition_url": "/blobs/1-2-story",
        "rights_cleared": True,
        "ready": True,
        "blockers": [],
    }
    assert rows[2]["review_status"] == "in_review"
    assert rows[2]["blockers"] == ["No approved review"]
    assert rows[3]["brand_status"] == "fail"
    assert rows[3]["blockers"] == ["Brand check failed"]
    assert rows[4]["brand_status"] == "none"
    assert rows[4]["blockers"] == ["Brand check not run"]
    assert rows[5]["blockers"] == ["Rendition missing for web_banner"]


def ready_asset(upstream, asset_id, title="Hero", channels=("story",)):
    upstream.add_asset(asset_id, title, {1: list(channels)})
    upstream.add_review(asset_id, 1, "approved")
    upstream.set_check(asset_id, 1, "pass")


def rights_calls(upstream):
    return [c for c in upstream.router.calls if str(c.request.url).startswith(RIGHTS_URL)]


def test_readiness_rights_cleared(client, upstream):
    ready_asset(upstream, 1)
    campaign = create_campaign(client)
    add(client, campaign["id"], 1, "story")

    body = client.get(f"/campaigns/{campaign['id']}/readiness", headers=H).get_json()
    row = body["deliverables"][0]
    assert row["rights_cleared"] is True
    assert row["ready"] is True
    assert row["blockers"] == []

    (call,) = rights_calls(upstream)
    assert call.request.url.path == "/rights/1/clearance"
    assert call.request.url.params["channel"] == "story"
    assert call.request.headers["X-Internal-Token"] == INTERNAL


def test_readiness_rights_not_cleared_adds_reasons(client, upstream):
    ready_asset(upstream, 1, channels=["story", "web_banner"])
    upstream.block_rights(1, "web_banner", "Not licensed for web_banner", "Model release missing")
    # Rights are checked even when there is no approved review.
    upstream.add_asset(2, "In review", {1: ["story"]})
    upstream.add_review(2, 1, "in_review")
    upstream.block_rights(2, "story", "No usage rights on file")

    campaign = create_campaign(client)
    for asset_id, channel in [(1, "story"), (1, "web_banner"), (2, "story")]:
        assert add(client, campaign["id"], asset_id, channel).status_code == 201

    body = client.get(f"/campaigns/{campaign['id']}/readiness", headers=H).get_json()
    rows = {(r["asset_id"], r["channel"]): r for r in body["deliverables"]}
    assert body["ready_count"] == 1
    assert rows[(1, "story")]["rights_cleared"] is True
    banner = rows[(1, "web_banner")]
    assert banner["rights_cleared"] is False
    assert banner["ready"] is False
    assert banner["blockers"] == ["Not licensed for web_banner", "Model release missing"]
    assert rows[(2, "story")]["rights_cleared"] is False
    assert rows[(2, "story")]["blockers"] == ["No approved review", "No usage rights on file"]


def test_readiness_caches_clearance_per_asset_and_channel(upstream):
    ready_asset(upstream, 1, channels=["story", "web_banner"])
    deliverables = [{"id": 1, "asset_id": 1, "channel": "story"},
                    {"id": 2, "asset_id": 1, "channel": "story"},
                    {"id": 3, "asset_id": 1, "channel": "web_banner"}]
    settings = Settings(token_secret="s", internal_token=INTERNAL, data_dir=Path("."),
                        assets_url=ASSETS_URL, review_url=REVIEW_URL, brand_url=BRAND_URL,
                        rights_url=RIGHTS_URL)
    with Upstream(settings) as client:
        result = readiness.evaluate(1, deliverables, client)
    assert result["ready_count"] == 3
    channels = sorted(c.request.url.params["channel"] for c in rights_calls(upstream))
    assert channels == ["story", "web_banner"]


def test_readiness_returns_502_when_rights_is_down(client, upstream):
    ready_asset(upstream, 1)
    campaign = create_campaign(client)
    add(client, campaign["id"], 1, "story")
    upstream.router.get(url__regex=rf"{RIGHTS_URL}/rights/(?P<asset_id>\d+)/clearance").mock(
        side_effect=httpx.ConnectError("down"))
    resp = client.get(f"/campaigns/{campaign['id']}/readiness", headers=H)
    assert resp.status_code == 502
    assert "rights" in resp.get_json()["error"]


def test_publish_blocked_by_rights(client, upstream):
    ready_asset(upstream, 1)
    upstream.block_rights(1, "story", "License expired on 2026-09-30")
    campaign = create_campaign(client)
    add(client, campaign["id"], 1, "story")

    resp = client.post(f"/campaigns/{campaign['id']}/publish", headers=H)
    assert resp.status_code == 409
    row = resp.get_json()["readiness"]["deliverables"][0]
    assert row["rights_cleared"] is False
    assert row["blockers"] == ["License expired on 2026-09-30"]
    assert client.get(f"/campaigns/{campaign['id']}/manifest", headers=H).status_code == 404

    del upstream.rights_reasons[(1, "story")]
    assert client.post(f"/campaigns/{campaign['id']}/publish", headers=H).status_code == 200


def test_readiness_uses_internal_token(client, upstream):
    upstream.add_asset(1, "Ready", {1: ["story"]})
    campaign = create_campaign(client)
    add(client, campaign["id"], 1, "story")
    client.get(f"/campaigns/{campaign['id']}/readiness", headers=H)
    review_calls = [c for c in upstream.router.calls if str(c.request.url).startswith(REVIEW_URL)]
    assert review_calls
    assert all(c.request.headers["X-Internal-Token"] == INTERNAL for c in upstream.router.calls)


def test_readiness_returns_502_when_review_is_down(client, upstream):
    upstream.add_asset(1, "Ready", {1: ["story"]})
    campaign = create_campaign(client)
    add(client, campaign["id"], 1, "story")
    upstream.router.get(f"{REVIEW_URL}/reviews").mock(side_effect=httpx.ConnectError("down"))
    resp = client.get(f"/campaigns/{campaign['id']}/readiness", headers=H)
    assert resp.status_code == 502


def test_publish_blocked_until_ready(client, upstream):
    upstream.add_asset(1, "Ridge Jacket hero", {1: ["story"]})
    upstream.add_review(1, 1, "approved")
    campaign = create_campaign(client)
    add(client, campaign["id"], 1, "story")

    resp = client.post(f"/campaigns/{campaign['id']}/publish", headers=H)
    assert resp.status_code == 409
    body = resp.get_json()
    assert body["error"]
    assert body["readiness"]["deliverables"][0]["blockers"] == ["Brand check not run"]
    assert client.get(f"/campaigns/{campaign['id']}/manifest", headers=H).status_code == 404

    upstream.set_check(1, 1, "pass")
    resp = client.post(f"/campaigns/{campaign['id']}/publish", headers=H)
    assert resp.status_code == 200
    published = resp.get_json()
    assert published["status"] == "published"
    assert published["published_at"]
    manifest = published["manifest"]
    assert manifest == {
        "campaign_id": campaign["id"],
        "name": "Trailhead Fall 2026",
        "published_at": published["published_at"],
        "items": [{"asset_id": 1, "asset_title": "Ridge Jacket hero", "version": 1,
                   "channel": "story", "rendition_url": "/blobs/1-1-story",
                   "width": 1080, "height": 1920}],
    }
    assert client.get(f"/campaigns/{campaign['id']}/manifest", headers=H).get_json() == manifest


def test_published_campaign_is_locked(client, upstream):
    upstream.add_asset(1, "Hero", {1: ["story", "thumbnail"]})
    upstream.add_review(1, 1, "approved")
    upstream.set_check(1, 1, "pass")
    campaign = create_campaign(client)
    deliverable = add(client, campaign["id"], 1, "story").get_json()
    assert client.post(f"/campaigns/{campaign['id']}/publish", headers=H).status_code == 200

    assert add(client, campaign["id"], 1, "thumbnail").status_code == 409
    path = f"/campaigns/{campaign['id']}/deliverables/{deliverable['id']}"
    assert client.delete(path, headers=H).status_code == 409
    assert client.post(f"/campaigns/{campaign['id']}/publish", headers=H).status_code == 409


def test_empty_campaign_cannot_publish(client, upstream):
    campaign = create_campaign(client)
    resp = client.post(f"/campaigns/{campaign['id']}/publish", headers=H)
    assert resp.status_code == 409
    assert resp.get_json()["readiness"]["total"] == 0


def test_assets_unreachable_on_add_returns_502(client, upstream):
    campaign = create_campaign(client)
    upstream.router.get(url__regex=rf"{ASSETS_URL}/assets/(?P<asset_id>\d+)$").mock(
        side_effect=httpx.ConnectError("down"))
    assert add(client, campaign["id"], 1, "story").status_code == 502
