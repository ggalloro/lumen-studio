"""Campaign readiness: every deliverable needs an approved review, a passing brand check
on the approved version, a rendition of that version for its channel, and usage rights
that clear the asset for the channel today."""

from functools import cache

from .clients import Upstream


def _approved_review(reviews: list[dict]) -> dict | None:
    approved = [r for r in reviews if r.get("status") == "approved"]
    if not approved:
        return None
    return max(approved, key=lambda r: (r.get("version", 0), r.get("id", 0)))


def _review_status(reviews: list[dict], approved: dict | None) -> str:
    if approved:
        return "approved"
    if not reviews:
        return "none"
    newest = max(reviews, key=lambda r: r.get("id", 0))
    return newest.get("status", "none")


def _find_rendition(asset: dict, version: int, channel: str) -> dict | None:
    for v in asset.get("versions") or []:
        if v.get("version") == version:
            for rendition in v.get("renditions") or []:
                if rendition.get("preset") == channel:
                    return rendition
    return None


def evaluate(campaign_id: int, deliverables: list[dict], upstream: Upstream) -> dict:
    get_asset = cache(upstream.get_asset)
    list_reviews = cache(upstream.list_reviews)
    latest_check = cache(upstream.latest_check)
    clearance = cache(upstream.clearance)

    rows = []
    for d in deliverables:
        asset_id, channel = d["asset_id"], d["channel"]
        row = {
            "deliverable_id": d["id"],
            "asset_id": asset_id,
            "asset_title": None,
            "channel": channel,
            "review_status": "none",
            "approved_version": None,
            "brand_status": "none",
            "rendition_url": None,
            "rights_cleared": False,
            "ready": False,
            "blockers": [],
            # Used to build the manifest; stripped from the readiness response.
            "_rendition": None,
        }
        rows.append(row)

        asset = get_asset(asset_id)
        if asset is None:
            row["blockers"].append("Asset not found")
            continue
        row["asset_title"] = asset.get("title")

        reviews = list_reviews(asset_id)
        approved = _approved_review(reviews)
        row["review_status"] = _review_status(reviews, approved)
        if approved is None:
            row["blockers"].append("No approved review")
        else:
            version = approved["version"]
            row["approved_version"] = version

            report = latest_check(asset_id, version)
            if report is None:
                row["blockers"].append("Brand check not run")
            else:
                row["brand_status"] = report["overall"]
                if report["overall"] == "fail":
                    row["blockers"].append("Brand check failed")

            rendition = _find_rendition(asset, version, channel)
            if rendition is None:
                row["blockers"].append(f"Rendition missing for {channel}")
            else:
                row["rendition_url"] = rendition.get("blob_url")
                row["_rendition"] = rendition

        # Rights do not depend on the version, so they are checked even without an
        # approved review. The reasons are passed through as written by the rights service.
        result = clearance(asset_id, channel)
        if result is None:
            result = {"cleared": False, "reasons": ["No usage rights on file"]}
        row["rights_cleared"] = bool(result.get("cleared"))
        if not row["rights_cleared"]:
            row["blockers"].extend(result.get("reasons") or ["Rights not cleared"])

        row["ready"] = not row["blockers"]

    ready_count = sum(1 for r in rows if r["ready"])
    return {
        "campaign_id": campaign_id,
        "ready": bool(rows) and ready_count == len(rows),
        "total": len(rows),
        "ready_count": ready_count,
        "deliverables": rows,
    }


def public(readiness: dict) -> dict:
    """Readiness as returned by the API, without internal fields."""
    return {
        **readiness,
        "deliverables": [
            {k: v for k, v in row.items() if not k.startswith("_")}
            for row in readiness["deliverables"]
        ],
    }


def build_manifest(campaign: dict, readiness: dict, published_at: str) -> dict:
    items = []
    for row in readiness["deliverables"]:
        rendition = row["_rendition"]
        items.append({
            "asset_id": row["asset_id"],
            "asset_title": row["asset_title"],
            "version": row["approved_version"],
            "channel": row["channel"],
            "rendition_url": row["rendition_url"],
            "width": rendition.get("width"),
            "height": rendition.get("height"),
        })
    return {
        "campaign_id": campaign["id"],
        "name": campaign["name"],
        "published_at": published_at,
        "items": items,
    }
