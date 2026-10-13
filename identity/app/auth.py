"""Request authentication: user JWTs and the service-to-service internal token."""

import hmac
from dataclasses import dataclass

import jwt
from fastapi import HTTPException, Request

REQUIRED_CLAIMS = ("user_id", "workspace_id", "role", "name")


@dataclass(frozen=True)
class Principal:
    internal: bool
    user_id: int | None = None
    workspace_id: int | None = None
    role: str | None = None
    name: str | None = None


def _decode_bearer(request: Request) -> Principal | None:
    header = request.headers.get("Authorization", "")
    if not header:
        return None
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Invalid Authorization header")
    settings = request.app.state.settings
    try:
        claims = jwt.decode(
            token, settings.token_secret, algorithms=["HS256"], options={"require": ["exp"]}
        )
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    if any(claim not in claims for claim in REQUIRED_CLAIMS):
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return Principal(
        internal=False,
        user_id=int(claims["user_id"]),
        workspace_id=int(claims["workspace_id"]),
        role=claims["role"],
        name=claims["name"],
    )


def _has_internal_token(request: Request) -> bool:
    supplied = request.headers.get("X-Internal-Token")
    if supplied is None:
        return False
    expected = request.app.state.settings.internal_token
    if not hmac.compare_digest(supplied.encode(), expected.encode()):
        raise HTTPException(status_code=401, detail="Invalid internal token")
    return True


def require_user(request: Request) -> Principal:
    principal = _decode_bearer(request)
    if principal is None:
        raise HTTPException(status_code=401, detail="Missing bearer token")
    return principal


def require_user_or_internal(request: Request) -> Principal:
    if _has_internal_token(request):
        return Principal(internal=True)
    return require_user(request)
