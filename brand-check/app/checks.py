"""Runs every brand rule for one asset version and combines the results."""

from .copy_rules import check_copy_style, copy_text
from .palette import check_palette

SEVERITY = {"pass": 0, "warn": 1, "fail": 2}
FAIL_PENALTY = 30
WARN_PENALTY = 10


def overall_status(rules: list[dict]) -> str:
    return max((r["status"] for r in rules), key=SEVERITY.__getitem__, default="pass")


def score(rules: list[dict]) -> int:
    fails = sum(1 for r in rules if r["status"] == "fail")
    warns = sum(1 for r in rules if r["status"] == "warn")
    return max(0, 100 - FAIL_PENALTY * fails - WARN_PENALTY * warns)


def run_checks(kit: dict, asset: dict, version: dict, image: bytes) -> dict:
    rules = [
        check_palette(image, kit["palette"], kit["palette_tolerance"]),
        check_copy_style(copy_text(asset, version)),
    ]
    return {
        "asset_id": asset["id"],
        "version": version["version"],
        "overall": overall_status(rules),
        "score": score(rules),
        "rules": rules,
    }
