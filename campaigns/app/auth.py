"""JWT authentication for user-facing routes."""

from dataclasses import dataclass
from functools import wraps

import jwt
from flask import abort, current_app, g, request

REQUIRED_CLAIMS = ("user_id", "workspace_id", "role", "name")


@dataclass(frozen=True)
class User:
    user_id: int
    workspace_id: int
    role: str
    name: str


def _current_user() -> User:
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        abort(401, description="Missing bearer token")
    secret = current_app.config["SETTINGS"].token_secret
    try:
        claims = jwt.decode(token, secret, algorithms=["HS256"], options={"require": ["exp"]})
    except jwt.PyJWTError:
        abort(401, description="Invalid or expired token")
    if any(claim not in claims for claim in REQUIRED_CLAIMS):
        abort(401, description="Invalid or expired token")
    return User(
        user_id=int(claims["user_id"]),
        workspace_id=int(claims["workspace_id"]),
        role=claims["role"],
        name=claims["name"],
    )


def require_user(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        g.user = _current_user()
        return view(*args, **kwargs)

    return wrapper
