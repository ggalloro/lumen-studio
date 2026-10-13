from datetime import datetime, timedelta, timezone
from io import BytesIO

import jwt
import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from app.config import Settings
from app.main import create_app

SECRET = "test-secret-0123456789abcdef0123456789"
INTERNAL = "test-internal"
ASSETS_URL = "http://assets.test"

SUMMIT_RED = "#C8102E"
PINE_GREEN = "#1F5130"


def make_token(user_id=1, role="designer", workspace_id=1, name="Test User") -> str:
    claims = {
        "user_id": user_id,
        "workspace_id": workspace_id,
        "role": role,
        "name": name,
        "exp": datetime.now(timezone.utc) + timedelta(hours=1),
    }
    return jwt.encode(claims, SECRET, algorithm="HS256")


def bearer(**kwargs) -> dict:
    return {"Authorization": f"Bearer {make_token(**kwargs)}"}


INTERNAL_HEADERS = {"X-Internal-Token": INTERNAL}


def make_image(bands: list[tuple[str, float]], size=(200, 100)) -> bytes:
    """PNG made of vertical colour bands; each band is (hex, share of width)."""
    img = Image.new("RGB", size, "#FFFFFF")
    draw = ImageDraw.Draw(img)
    x = 0
    for hex_color, share in bands:
        width = round(size[0] * share)
        draw.rectangle([x, 0, x + width - 1, size[1] - 1], fill=hex_color)
        x += width
    out = BytesIO()
    img.save(out, format="PNG")
    return out.getvalue()


@pytest.fixture
def settings(tmp_path):
    return Settings(
        token_secret=SECRET,
        internal_token=INTERNAL,
        data_dir=tmp_path / "data",
        assets_url=ASSETS_URL,
    )


@pytest.fixture
def client(settings):
    with TestClient(create_app(settings)) as c:
        yield c
