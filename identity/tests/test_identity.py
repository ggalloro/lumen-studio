from datetime import datetime, timedelta, timezone

import jwt

from .conftest import INTERNAL, SECRET


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_health(client):
    assert client.get("/health").json() == {"status": "ok", "service": "identity"}


def test_seeds_workspace_and_users(client):
    resp = client.get("/users", headers={"X-Internal-Token": INTERNAL})
    assert resp.status_code == 200
    users = resp.json()["items"]
    assert [u["email"] for u in users] == [
        "leo@northwind.example",
        "ana@northwind.example",
        "maya@northwind.example",
        "sam@northwind.example",
        "priya@northwind.example",
    ]
    assert users[4] == {
        "id": 5,
        "name": "Priya Natarajan",
        "email": "priya@northwind.example",
        "role": "brand_admin",
        "workspace_id": 1,
        "avatar_color": "#C92A2A",
    }


def test_login_returns_token_with_contract_claims(login):
    body = login("maya@northwind.example")
    assert body["user"]["role"] == "reviewer"
    claims = jwt.decode(body["token"], SECRET, algorithms=["HS256"])
    assert claims["user_id"] == 3
    assert claims["workspace_id"] == 1
    assert claims["role"] == "reviewer"
    assert claims["name"] == "Maya Okafor"
    exp = datetime.fromtimestamp(claims["exp"], tz=timezone.utc)
    assert timedelta(hours=11) < exp - datetime.now(timezone.utc) <= timedelta(hours=12)


def test_login_rejects_bad_password(client):
    resp = client.post("/login", json={"email": "leo@northwind.example", "password": "nope"})
    assert resp.status_code == 401
    assert "error" in resp.json()


def test_login_rejects_unknown_email(client):
    resp = client.post("/login", json={"email": "who@example.com", "password": "lumen-demo"})
    assert resp.status_code == 401


def test_login_validation_error_uses_error_shape(client):
    resp = client.post("/login", json={"email": "leo@northwind.example"})
    assert resp.status_code == 400
    assert "error" in resp.json()


def test_me(client, login):
    token = login("leo@northwind.example")["token"]
    resp = client.get("/me", headers=auth(token))
    assert resp.status_code == 200
    assert resp.json()["name"] == "Leo Park"


def test_me_requires_token(client):
    assert client.get("/me").status_code == 401
    assert client.get("/me", headers=auth("garbage")).status_code == 401


def test_me_rejects_expired_token(client):
    token = jwt.encode(
        {"user_id": 1, "workspace_id": 1, "role": "designer", "name": "Leo Park",
         "exp": datetime.now(timezone.utc) - timedelta(minutes=1)},
        SECRET,
        algorithm="HS256",
    )
    assert client.get("/me", headers=auth(token)).status_code == 401


def test_me_rejects_internal_token(client):
    assert client.get("/me", headers={"X-Internal-Token": INTERNAL}).status_code == 401


def test_users_with_jwt_and_bad_internal_token(client, login):
    token = login("ana@northwind.example")["token"]
    assert len(client.get("/users", headers=auth(token)).json()["items"]) == 5
    assert client.get("/users", headers={"X-Internal-Token": "wrong"}).status_code == 401
    assert client.get("/users").status_code == 401


def test_get_user(client, login):
    token = login("ana@northwind.example")["token"]
    resp = client.get("/users/4", headers=auth(token))
    assert resp.status_code == 200
    assert resp.json()["name"] == "Sam Whitfield"
    assert client.get("/users/99", headers=auth(token)).status_code == 404
    assert client.get("/users/1", headers={"X-Internal-Token": INTERNAL}).status_code == 200


def test_get_workspace(client, login):
    token = login("ana@northwind.example")["token"]
    resp = client.get("/workspaces/1", headers=auth(token))
    assert resp.json() == {"id": 1, "name": "Northwind Outdoor"}
    assert client.get("/workspaces/2", headers=auth(token)).status_code == 404
    resp = client.get("/workspaces/1", headers={"X-Internal-Token": INTERNAL})
    assert resp.status_code == 200
