import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import db
from .assets_client import AssetNotFound, AssetsClient, AssetsUnavailable
from .auth import Principal, require_user, require_user_or_internal
from .checks import run_checks
from .config import Settings, load_settings

SERVICE_NAME = "brand-check"
HEX_PATTERN = r"^#[0-9A-Fa-f]{6}$"

logger = logging.getLogger(__name__)


class PaletteColor(BaseModel):
    name: str = Field(min_length=1)
    hex: str = Field(pattern=HEX_PATTERN)


class BrandKitUpdate(BaseModel):
    name: str | None = None
    palette: list[PaletteColor] | None = None
    fonts: list[str] | None = None
    tone_of_voice: str | None = None
    logo_rules: str | None = None
    palette_tolerance: float | None = Field(default=None, ge=0, le=100)


class CheckRequest(BaseModel):
    asset_id: int
    version: int = Field(ge=1)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        db.init_db(settings)
        yield

    app = FastAPI(title="Lumen Studio brand-check", lifespan=lifespan)
    app.state.settings = settings

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request: Request, exc: StarletteHTTPException):
        return JSONResponse({"error": str(exc.detail)}, status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        first = exc.errors()[0] if exc.errors() else {}
        field = ".".join(str(p) for p in first.get("loc", ()) if p not in ("body", "query"))
        message = first.get("msg", "Invalid request")
        return JSONResponse(
            {"error": f"{field}: {message}" if field else message}, status_code=400
        )

    def workspace_for(principal: Principal, requested: int | None = None) -> int:
        if principal.internal:
            return requested or db.DEFAULT_WORKSPACE_ID
        return principal.workspace_id

    @app.get("/health")
    def health():
        return {"status": "ok", "service": SERVICE_NAME}

    @app.get("/brand-kit")
    def get_brand_kit(
        workspace_id: int | None = None,
        principal: Principal = Depends(require_user_or_internal),
    ):
        with db.connect(settings) as conn:
            return db.get_kit(conn, workspace_for(principal, workspace_id))

    @app.put("/brand-kit")
    def put_brand_kit(body: BrandKitUpdate, principal: Principal = Depends(require_user)):
        if principal.role != "brand_admin":
            raise HTTPException(status_code=403, detail="Only brand admins can edit the brand kit")
        changes = body.model_dump(exclude_none=True)
        with db.connect(settings) as conn:
            kit = db.get_kit(conn, principal.workspace_id)
            kit.update(changes)
            kit["updated_at"] = db.utc_now()
            db.save_kit(conn, kit)
            return db.get_kit(conn, principal.workspace_id)

    @app.post("/checks", status_code=201)
    def create_check(body: CheckRequest, principal: Principal = Depends(require_user_or_internal)):
        try:
            with AssetsClient(settings) as assets:
                asset = assets.get_asset(body.asset_id)
                if not principal.internal and asset.get("workspace_id") != principal.workspace_id:
                    raise AssetNotFound()
                version = assets.get_version(body.asset_id, body.version)
                image = assets.download(version["blob_url"])
        except AssetNotFound:
            raise HTTPException(status_code=404, detail="Asset version not found")
        except AssetsUnavailable as exc:
            logger.warning("POST /checks failed: %s", exc)
            raise HTTPException(status_code=502, detail="Could not read the asset from assets")

        workspace_id = asset.get("workspace_id") or db.DEFAULT_WORKSPACE_ID
        with db.connect(settings) as conn:
            kit = db.get_kit(conn, workspace_id)
        try:
            report = run_checks(kit, asset, version, image)
        except OSError:
            # Pillow raises UnidentifiedImageError (an OSError) for unreadable blobs.
            raise HTTPException(status_code=400, detail="Asset version is not a readable image")
        with db.connect(settings) as conn:
            return db.insert_report(conn, workspace_id, report)

    @app.get("/checks")
    def list_checks(
        asset_id: int,
        version: int | None = None,
        principal: Principal = Depends(require_user_or_internal),
    ):
        workspace_id = None if principal.internal else principal.workspace_id
        with db.connect(settings) as conn:
            items = db.list_reports(conn, asset_id, version, workspace_id)
        return {"items": items}

    @app.get("/checks/latest")
    def latest_check(
        asset_id: int,
        version: int,
        principal: Principal = Depends(require_user_or_internal),
    ):
        workspace_id = None if principal.internal else principal.workspace_id
        with db.connect(settings) as conn:
            items = db.list_reports(conn, asset_id, version, workspace_id, limit=1)
        if not items:
            raise HTTPException(status_code=404, detail="No brand check for this asset version")
        return items[0]

    return app


app = create_app()
