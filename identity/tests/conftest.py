import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

SECRET = "test-secret-0123456789abcdef0123456789"
INTERNAL = "test-internal"


@pytest.fixture
def client(tmp_path):
    settings = Settings(token_secret=SECRET, internal_token=INTERNAL, data_dir=tmp_path / "data")
    with TestClient(create_app(settings)) as c:
        yield c


@pytest.fixture
def login(client):
    def _login(email: str, password: str = "lumen-demo") -> dict:
        resp = client.post("/login", json={"email": email, "password": password})
        assert resp.status_code == 200, resp.text
        return resp.json()

    return _login
