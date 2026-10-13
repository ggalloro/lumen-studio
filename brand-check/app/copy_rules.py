"""Deterministic copy rule: punctuation and casing checks on the asset copy."""

import re

SHOUTING_WORD = re.compile(r"\b[A-Z]{4,}\b")


def copy_text(asset: dict, version: dict) -> str:
    parts = [version.get("alt_text") or "", asset.get("description") or ""]
    return "\n".join(p.strip() for p in parts if p.strip())


def check_copy_style(text: str) -> dict:
    problems = []
    if "!" in text:
        problems.append("exclamation marks")
    shouting = sorted(set(SHOUTING_WORD.findall(text)))
    if shouting:
        problems.append("all-caps words (" + ", ".join(shouting) + ")")

    if not text.strip():
        status, message = "warn", "No copy to check"
    elif problems:
        status, message = "warn", "Copy uses " + " and ".join(problems)
    else:
        status, message = "pass", "No punctuation or casing issues"
    return {"rule": "copy_style", "status": status, "message": message, "details": {}}
