import httpx
import pytest
import respx

from .conftest import ASSETS_URL, INTERNAL, INTERNAL_HEADERS, SUMMIT_RED, bearer, make_image

KIT = {
    "name": "Northwind Outdoor",
    "palette": [{"name": "Summit Red", "hex": SUMMIT_RED}],
    "fonts": ["Source Sans 3"],
    "tone_of_voice": "Calm, practical, outdoors.",
    "logo_rules": "Keep clear space around the mark.",
    "palette_tolerance": 18,
}


def test_health(client):
    assert client.get("/health").json() == {"status": "ok", "service": "brand-check"}


def test_seeds_empty_kit(client):
    resp = client.get("/brand-kit", headers=bearer())
    assert resp.status_code == 200
    kit = resp.json()
    assert kit["workspace_id"] == 1
    assert kit["palette"] == []
    assert kit["palette_tolerance"] == 18
    assert client.get("/brand-kit", headers=INTERNAL_HEADERS).status_code == 200


def test_brand_kit_requires_auth(client):
    assert client.get("/brand-kit").status_code == 401
    assert client.get("/brand-kit", headers={"X-Internal-Token": "wrong"}).status_code == 401


def test_brand_admin_can_update_kit(client):
    resp = client.put("/brand-kit", json=KIT, headers=bearer(user_id=5, role="brand_admin"))
    assert resp.status_code == 200
    body = resp.json()
    assert body["palette"] == KIT["palette"]
    assert body["tone_of_voice"] == KIT["tone_of_voice"]
    assert client.get("/brand-kit", headers=bearer()).json()["palette"] == KIT["palette"]


@pytest.mark.parametrize("role", ["designer", "reviewer"])
def test_other_roles_cannot_update_kit(client, role):
    resp = client.put("/brand-kit", json=KIT, headers=bearer(role=role))
    assert resp.status_code == 403
    assert "error" in resp.json()


def test_internal_token_cannot_update_kit(client):
    assert client.put("/brand-kit", json=KIT, headers=INTERNAL_HEADERS).status_code == 401


def test_update_kit_validates_hex(client):
    bad = {**KIT, "palette": [{"name": "Bad", "hex": "red"}]}
    resp = client.put("/brand-kit", json=bad, headers=bearer(role="brand_admin"))
    assert resp.status_code == 400
    assert "error" in resp.json()


def mock_assets(image: bytes, description: str = "Ridge jacket on the trail.",
                alt_text: str = "Hiker in a red jacket"):
    respx.get(f"{ASSETS_URL}/assets/7").respond(json={
        "id": 7, "workspace_id": 1, "title": "Ridge Jacket hero", "description": description,
    })
    route = respx.get(f"{ASSETS_URL}/assets/7/versions/2").respond(json={
        "asset_id": 7, "version": 2, "content_type": "image/png",
        "blob_url": "/blobs/abc123", "alt_text": alt_text,
    })
    respx.get(f"{ASSETS_URL}/blobs/abc123").respond(content=image)
    return route


@respx.mock
def test_check_on_palette_asset(client):
    client.put("/brand-kit", json=KIT, headers=bearer(role="brand_admin"))
    version_route = mock_assets(make_image([(SUMMIT_RED, 0.7), ("#FFFFFF", 0.3)]))

    resp = client.post("/checks", json={"asset_id": 7, "version": 2}, headers=bearer())
    assert resp.status_code == 201, resp.text
    report = resp.json()
    assert report["overall"] == "pass"
    assert report["score"] == 100
    assert [r["rule"] for r in report["rules"]] == ["palette", "copy_style"]
    assert version_route.calls[0].request.headers["X-Internal-Token"] == INTERNAL


@respx.mock
def test_check_off_palette_and_shouting_copy(client):
    client.put("/brand-kit", json=KIT, headers=bearer(role="brand_admin"))
    mock_assets(make_image([("#3A7BFF", 1.0)]), description="HUGE sale!!!")

    report = client.post(
        "/checks", json={"asset_id": 7, "version": 2}, headers=INTERNAL_HEADERS
    ).json()
    statuses = {r["rule"]: r["status"] for r in report["rules"]}
    assert statuses == {"palette": "fail", "copy_style": "warn"}
    assert report["overall"] == "fail"
    assert report["score"] == 60


@respx.mock
def test_check_unknown_asset_returns_404(client):
    respx.get(f"{ASSETS_URL}/assets/99").respond(404, json={"error": "not found"})
    resp = client.post("/checks", json={"asset_id": 99, "version": 1}, headers=bearer())
    assert resp.status_code == 404


@respx.mock
def test_check_other_workspace_asset_returns_404(client):
    mock_assets(make_image([(SUMMIT_RED, 1.0)]))
    resp = client.post("/checks", json={"asset_id": 7, "version": 2},
                       headers=bearer(workspace_id=2))
    assert resp.status_code == 404


@respx.mock
def test_check_assets_unreachable_returns_502(client):
    respx.get(f"{ASSETS_URL}/assets/7").mock(side_effect=httpx.ConnectError("refused"))
    resp = client.post("/checks", json={"asset_id": 7, "version": 2}, headers=bearer())
    assert resp.status_code == 502


@respx.mock
def test_list_and_latest_checks(client):
    client.put("/brand-kit", json=KIT, headers=bearer(role="brand_admin"))
    assert client.get("/checks/latest?asset_id=7&version=2", headers=bearer()).status_code == 404

    mock_assets(make_image([(SUMMIT_RED, 1.0)]))
    first = client.post("/checks", json={"asset_id": 7, "version": 2}, headers=bearer()).json()
    second = client.post("/checks", json={"asset_id": 7, "version": 2}, headers=bearer()).json()

    items = client.get("/checks?asset_id=7", headers=bearer()).json()["items"]
    assert [i["id"] for i in items] == [second["id"], first["id"]]
    assert client.get("/checks?asset_id=7&version=1", headers=bearer()).json()["items"] == []

    latest = client.get("/checks/latest?asset_id=7&version=2", headers=INTERNAL_HEADERS)
    assert latest.json()["id"] == second["id"]


def test_checks_query_validation(client):
    assert client.get("/checks", headers=bearer()).status_code == 400
    assert client.get("/checks/latest?asset_id=7", headers=bearer()).status_code == 400
    assert client.get("/checks?asset_id=7").status_code == 401
