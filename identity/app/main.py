from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import db
from .auth import Principal, require_user, require_user_or_internal
from .config import Settings, load_settings
from .security import create_token, verify_password

SERVICE_NAME = "identity"


class LoginRequest(BaseModel):
    email: str
    password: str


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        db.init_db(settings)
        yield

    app = FastAPI(title="Lumen Studio identity", lifespan=lifespan)
    app.state.settings = settings

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request: Request, exc: StarletteHTTPException):
        return JSONResponse({"error": str(exc.detail)}, status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        first = exc.errors()[0] if exc.errors() else {}
        field = ".".join(str(p) for p in first.get("loc", ()) if p != "body")
        message = first.get("msg", "Invalid request")
        return JSONResponse(
            {"error": f"{field}: {message}" if field else message}, status_code=400
        )

    @app.get("/health")
    def health():
        return {"status": "ok", "service": SERVICE_NAME}

    @app.post("/login")
    def login(body: LoginRequest):
        with db.connect(settings) as conn:
            row = conn.execute(
                "SELECT * FROM users WHERE email = ?", (body.email.strip(),)
            ).fetchone()
        if row is None or not verify_password(body.password, row["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid email or password")
        user = db.user_to_dict(row)
        token = create_token(user, settings.token_secret, settings.token_ttl_hours)
        return {"token": token, "user": user}

    @app.get("/me")
    def me(principal: Principal = Depends(require_user)):
        with db.connect(settings) as conn:
            row = conn.execute(
                "SELECT * FROM users WHERE id = ?", (principal.user_id,)
            ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="User not found")
        return db.user_to_dict(row)

    @app.get("/users")
    def list_users(principal: Principal = Depends(require_user_or_internal)):
        with db.connect(settings) as conn:
            if principal.internal:
                rows = conn.execute("SELECT * FROM users ORDER BY id").fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM users WHERE workspace_id = ? ORDER BY id",
                    (principal.workspace_id,),
                ).fetchall()
        return {"items": [db.user_to_dict(r) for r in rows]}

    @app.get("/users/{user_id}")
    def get_user(user_id: int, principal: Principal = Depends(require_user_or_internal)):
        with db.connect(settings) as conn:
            row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if row is None or (
            not principal.internal and row["workspace_id"] != principal.workspace_id
        ):
            raise HTTPException(status_code=404, detail="User not found")
        return db.user_to_dict(row)

    @app.get("/workspaces/{workspace_id}")
    def get_workspace(
        workspace_id: int, principal: Principal = Depends(require_user_or_internal)
    ):
        if not principal.internal and workspace_id != principal.workspace_id:
            raise HTTPException(status_code=404, detail="Workspace not found")
        with db.connect(settings) as conn:
            row = conn.execute(
                "SELECT id, name FROM workspaces WHERE id = ?", (workspace_id,)
            ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Workspace not found")
        return {"id": row["id"], "name": row["name"]}

    return app


app = create_app()
