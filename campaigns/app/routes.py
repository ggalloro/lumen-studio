import json
import logging
from datetime import date

from flask import Blueprint, abort, current_app, g, jsonify, request

from . import db, readiness
from .auth import require_user
from .clients import Upstream, UpstreamError

SERVICE_NAME = "campaigns"
# Renditions preset ids; a deliverable's channel must be one of these.
CHANNELS = ("instagram_square", "story", "web_banner", "email_header", "thumbnail")

logger = logging.getLogger(__name__)
bp = Blueprint("campaigns", __name__)


def settings():
    return current_app.config["SETTINGS"]


def json_body() -> dict:
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        abort(400, description="Request body must be a JSON object")
    return body


def load_campaign(conn, campaign_id: int):
    row = db.get_campaign_row(conn, campaign_id, g.user.workspace_id)
    if row is None:
        abort(404, description="Campaign not found")
    return row


def compute_readiness(campaign_id: int, deliverables: list[dict]) -> dict:
    try:
        with Upstream(settings()) as upstream:
            return readiness.evaluate(campaign_id, deliverables, upstream)
    except UpstreamError as exc:
        logger.warning("readiness for campaign %s failed: %s", campaign_id, exc)
        abort(502, description=f"Could not reach the {exc.service} service")


@bp.get("/health")
def health():
    return {"status": "ok", "service": SERVICE_NAME}


@bp.get("/campaigns")
@require_user
def list_campaigns():
    with db.connect(settings()) as conn:
        rows = conn.execute(
            "SELECT * FROM campaigns WHERE workspace_id = ? ORDER BY created_at DESC, id DESC",
            (g.user.workspace_id,),
        ).fetchall()
        return {"items": [db.campaign_to_dict(conn, r) for r in rows]}


@bp.post("/campaigns")
@require_user
def create_campaign():
    body = json_body()
    name = body.get("name")
    if not isinstance(name, str) or not name.strip():
        abort(400, description="name is required")
    brief = body.get("brief") or ""
    if not isinstance(brief, str):
        abort(400, description="brief must be a string")
    due_date = body.get("due_date")
    if due_date is not None:
        try:
            date.fromisoformat(due_date)
        except (TypeError, ValueError):
            abort(400, description="due_date must be a date in YYYY-MM-DD format")

    with db.connect(settings()) as conn:
        cur = conn.execute(
            "INSERT INTO campaigns (workspace_id, name, brief, due_date, status, created_by,"
            " created_at) VALUES (?, ?, ?, ?, 'draft', ?, ?)",
            (g.user.workspace_id, name.strip(), brief, due_date, g.user.user_id, db.utc_now()),
        )
        row = load_campaign(conn, cur.lastrowid)
        return db.campaign_to_dict(conn, row), 201


@bp.get("/campaigns/<int:campaign_id>")
@require_user
def get_campaign(campaign_id: int):
    with db.connect(settings()) as conn:
        return db.campaign_to_dict(conn, load_campaign(conn, campaign_id))


@bp.post("/campaigns/<int:campaign_id>/deliverables")
@require_user
def add_deliverable(campaign_id: int):
    body = json_body()
    asset_id, channel = body.get("asset_id"), body.get("channel")
    if not isinstance(asset_id, int) or isinstance(asset_id, bool):
        abort(400, description="asset_id must be an integer")
    if channel not in CHANNELS:
        abort(400, description=f"channel must be one of: {', '.join(CHANNELS)}")

    with db.connect(settings()) as conn:
        campaign = load_campaign(conn, campaign_id)
        if campaign["status"] == "published":
            abort(409, description="Campaign is already published")
        duplicate = conn.execute(
            "SELECT 1 FROM deliverables WHERE campaign_id = ? AND asset_id = ? AND channel = ?",
            (campaign_id, asset_id, channel),
        ).fetchone()
        if duplicate:
            abort(409, description="Deliverable already exists for this asset and channel")

    try:
        with Upstream(settings()) as upstream:
            asset = upstream.get_asset(asset_id)
    except UpstreamError:
        abort(502, description="Could not reach the assets service")
    if asset is None or asset.get("workspace_id") != g.user.workspace_id:
        abort(400, description=f"Asset {asset_id} not found")

    with db.connect(settings()) as conn:
        cur = conn.execute(
            "INSERT OR IGNORE INTO deliverables (campaign_id, asset_id, channel, created_at)"
            " VALUES (?, ?, ?, ?)",
            (campaign_id, asset_id, channel, db.utc_now()),
        )
        if cur.rowcount == 0:
            abort(409, description="Deliverable already exists for this asset and channel")
        row = conn.execute(
            "SELECT * FROM deliverables WHERE id = ?", (cur.lastrowid,)
        ).fetchone()
        return db.deliverable_to_dict(row), 201


@bp.delete("/campaigns/<int:campaign_id>/deliverables/<int:deliverable_id>")
@require_user
def delete_deliverable(campaign_id: int, deliverable_id: int):
    with db.connect(settings()) as conn:
        campaign = load_campaign(conn, campaign_id)
        if campaign["status"] == "published":
            abort(409, description="Campaign is already published")
        cur = conn.execute(
            "DELETE FROM deliverables WHERE id = ? AND campaign_id = ?",
            (deliverable_id, campaign_id),
        )
        if cur.rowcount == 0:
            abort(404, description="Deliverable not found")
    return "", 204


@bp.get("/campaigns/<int:campaign_id>/readiness")
@require_user
def get_readiness(campaign_id: int):
    with db.connect(settings()) as conn:
        load_campaign(conn, campaign_id)
        deliverables = db.list_deliverables(conn, campaign_id)
    return readiness.public(compute_readiness(campaign_id, deliverables))


@bp.post("/campaigns/<int:campaign_id>/publish")
@require_user
def publish(campaign_id: int):
    with db.connect(settings()) as conn:
        row = load_campaign(conn, campaign_id)
        if row["status"] == "published":
            abort(409, description="Campaign is already published")
        campaign = db.campaign_to_dict(conn, row)

    result = compute_readiness(campaign_id, campaign["deliverables"])
    if not result["ready"]:
        error = ("Campaign has no deliverables" if result["total"] == 0
                 else "Campaign is not ready to publish")
        return jsonify({"error": error, "readiness": readiness.public(result)}), 409

    published_at = db.utc_now()
    manifest = readiness.build_manifest(campaign, result, published_at)
    with db.connect(settings()) as conn:
        cur = conn.execute(
            "UPDATE campaigns SET status = 'published', published_at = ?, manifest = ?"
            " WHERE id = ? AND status = 'draft'",
            (published_at, json.dumps(manifest), campaign_id),
        )
        if cur.rowcount == 0:
            abort(409, description="Campaign is already published")
        body = db.campaign_to_dict(conn, load_campaign(conn, campaign_id))
    body["manifest"] = manifest
    return body


@bp.get("/campaigns/<int:campaign_id>/manifest")
@require_user
def get_manifest(campaign_id: int):
    with db.connect(settings()) as conn:
        manifest = db.manifest_of(load_campaign(conn, campaign_id))
    if manifest is None:
        abort(404, description="Campaign is not published")
    return manifest
