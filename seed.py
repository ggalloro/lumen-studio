#!/usr/bin/env python3
"""Seed a running Lumen Studio stack with the Northwind Outdoor workspace data.

Reads seed/catalog.json and seed/images/, and talks to the services over their public APIs.
Uses only the standard library.

    python3 seed.py            # services on localhost default ports
    ASSETS_URL=http://... python3 seed.py

Run against empty databases (`make reset`, then start the stack).
"""

import json
import mimetypes
import os
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CATALOG = json.loads((ROOT / "seed" / "catalog.json").read_text(encoding="utf-8"))
IMAGES = ROOT / "seed" / "images"
PASSWORD = "lumen-demo"
PRESET_COUNT_TIMEOUT = 180

URLS = {
    "identity": os.environ.get("IDENTITY_URL", "http://localhost:8081"),
    "assets": os.environ.get("ASSETS_URL", "http://localhost:8082"),
    "renditions": os.environ.get("RENDITIONS_URL", "http://localhost:8083"),
    "review": os.environ.get("REVIEW_URL", "http://localhost:8084"),
    "brand": os.environ.get("BRAND_URL", "http://localhost:8085"),
    "campaigns": os.environ.get("CAMPAIGNS_URL", "http://localhost:8086"),
    "rights": os.environ.get("RIGHTS_URL", "http://localhost:8087"),
}


class ApiError(Exception):
    pass


def request(method, url, token=None, body=None, files=None, fields=None):
    headers = {}
    data = None
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if files is not None:
        boundary = uuid.uuid4().hex
        data = encode_multipart(boundary, fields or {}, files)
        headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
    elif body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        raise ApiError(f"{method} {url} -> {exc.code}: {exc.read().decode(errors='replace')}") from exc


def encode_multipart(boundary, fields, files):
    lines = []
    for name, value in fields.items():
        lines.append(f"--{boundary}\r\n".encode())
        lines.append(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode())
        lines.append(f"{value}\r\n".encode())
    for name, path in files.items():
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        # RFC 7578: filenames are sent as UTF-8 in the quoted string.
        disposition = f'Content-Disposition: form-data; name="{name}"; filename="{path.name}"\r\n'
        lines.append(f"--{boundary}\r\n".encode())
        lines.append(disposition.encode("utf-8"))
        lines.append(f"Content-Type: {content_type}\r\n\r\n".encode())
        lines.append(path.read_bytes())
        lines.append(b"\r\n")
    lines.append(f"--{boundary}--\r\n".encode())
    return b"".join(lines)


def wait_for_services(timeout=120):
    deadline = time.time() + timeout
    for name, base in URLS.items():
        while True:
            try:
                request("GET", f"{base}/health")
                print(f"  {name:<11} up")
                break
            except (ApiError, OSError):
                if time.time() > deadline:
                    sys.exit(f"{name} at {base} is not answering /health")
                time.sleep(2)


def login_all():
    tokens, users = {}, {}
    seen = set()
    for item in CATALOG["assets"]:
        seen.add(item["owner"])
    for review in CATALOG["reviews"]:
        seen.add(review["started_by"])
        seen.update(a["by"] for a in review["annotations"])
        if review.get("decision"):
            seen.add(review["decision"]["by"])
    seen.update(c["created_by"] for c in CATALOG["campaigns"])
    for email in sorted(seen):
        result = request("POST", f"{URLS['identity']}/login", body={"email": email, "password": PASSWORD})
        tokens[email] = result["token"]
        users[email] = result["user"]
    return tokens, users


def wait_for_renditions(token, asset_ids, expected):
    deadline = time.time() + PRESET_COUNT_TIMEOUT
    pending = set(asset_ids)
    while pending and time.time() < deadline:
        for asset_id in list(pending):
            asset = request("GET", f"{URLS['assets']}/assets/{asset_id}", token=token)
            if all(len(v["renditions"]) >= expected for v in asset["versions"]):
                pending.discard(asset_id)
        if pending:
            time.sleep(2)
    if pending:
        print(f"  warning: renditions still missing for assets {sorted(pending)}")


def main():
    print("Waiting for services")
    wait_for_services()
    tokens, users = login_all()
    admin = tokens["priya@northwind.example"]

    existing = request("GET", f"{URLS['assets']}/assets", token=admin)["items"]
    if existing:
        sys.exit("Assets already exist. Run `make reset`, restart the stack, then seed again.")

    print("Brand kit")
    request("PUT", f"{URLS['brand']}/brand-kit", token=admin, body=CATALOG["brand_kit"])

    print("Assets")
    asset_ids = {}
    for item in CATALOG["assets"]:
        token = tokens[item["owner"]]
        first, *rest = item["versions"]
        asset = request(
            "POST", f"{URLS['assets']}/assets", token=token,
            files={"file": IMAGES / first["filename"]},
            fields={
                "title": item["title"],
                "description": item["description"],
                "tags": ",".join(item["tags"]),
                "alt_text": first["alt_text"],
            },
        )
        asset_ids[item["key"]] = asset["id"]
        for version in rest:
            request(
                "POST", f"{URLS['assets']}/assets/{asset['id']}/versions", token=token,
                files={"file": IMAGES / version["filename"]},
                fields={"alt_text": version["alt_text"]},
            )
        print(f"  {item['title']} ({len(item['versions'])} version(s))")

    presets = request("GET", f"{URLS['renditions']}/presets")["items"]
    print(f"Waiting for {len(presets)} renditions per version")
    wait_for_renditions(admin, asset_ids.values(), len(presets))

    print("Brand checks")
    for item in CATALOG["assets"]:
        for number in range(1, len(item["versions"]) + 1):
            report = request(
                "POST", f"{URLS['brand']}/checks", token=tokens[item["owner"]],
                body={"asset_id": asset_ids[item["key"]], "version": number},
            )
            print(f"  {item['title']} v{number}: {report['overall']} ({report['score']})")

    print("Usage rights")
    for item in CATALOG["assets"]:
        if "rights" not in item:
            print(f"  {item['title']}: none on file")
            continue
        request("PUT", f"{URLS['rights']}/rights/{asset_ids[item['key']]}", token=admin, body=item["rights"])
        print(f"  {item['title']}: {item['rights']['license_type']}")

    print("Reviews")
    for spec in CATALOG["reviews"]:
        asset_id = asset_ids[spec["asset"]]
        review = request(
            "POST", f"{URLS['review']}/reviews", token=tokens[spec["started_by"]],
            body={"asset_id": asset_id, "version": spec["version"]},
        )
        for note in spec["annotations"]:
            request(
                "POST", f"{URLS['review']}/reviews/{review['id']}/annotations", token=tokens[note["by"]],
                body={"x_pct": note["x_pct"], "y_pct": note["y_pct"], "body": note["body"]},
            )
        decision = spec.get("decision")
        if decision:
            review = request(
                "POST", f"{URLS['review']}/reviews/{review['id']}/decision", token=tokens[decision["by"]],
                body={"decision": decision["decision"], "note": decision["note"]},
            )
        if spec.get("resubmit_version"):
            review = request(
                "POST", f"{URLS['review']}/reviews/{review['id']}/versions", token=tokens[spec["started_by"]],
                body={"version": spec["resubmit_version"]},
            )
        print(f"  {spec['asset']}: {review['status']}")

    print("Campaigns")
    for spec in CATALOG["campaigns"]:
        token = tokens[spec["created_by"]]
        campaign = request(
            "POST", f"{URLS['campaigns']}/campaigns", token=token,
            body={"name": spec["name"], "brief": spec["brief"], "due_date": spec["due_date"]},
        )
        for d in spec["deliverables"]:
            request(
                "POST", f"{URLS['campaigns']}/campaigns/{campaign['id']}/deliverables", token=token,
                body={"asset_id": asset_ids[d["asset"]], "channel": d["channel"]},
            )
        readiness = request("GET", f"{URLS['campaigns']}/campaigns/{campaign['id']}/readiness", token=token)
        print(f"  {spec['name']}: {readiness['ready_count']}/{readiness['total']} deliverables ready")

    print("Done. Open http://localhost:3000 and sign in with any seeded user (password: lumen-demo).")


if __name__ == "__main__":
    main()
