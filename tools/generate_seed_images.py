"""Generate the images listed in a catalog file with a Gemini image model.

Run once by hand; the output is committed so seeding and manual testing need no API key.
By default it reads seed/catalog.json and writes seed/images/. Use --catalog and --out for
other sets, for example samples/uploads/.

    pip install google-genai pillow
    export GOOGLE_GENAI_USE_VERTEXAI=true GOOGLE_CLOUD_PROJECT=<project> GOOGLE_CLOUD_LOCATION=global
    # or: export GEMINI_API_KEY=<key>
    # optional: export IMAGE_MODEL=<model id>
    python tools/generate_seed_images.py [--force] [--only <filename> ...]
    python tools/generate_seed_images.py --catalog samples/uploads/catalog.json --out samples/uploads
"""

import argparse
import io
import json
import os
import sys
from pathlib import Path

from google import genai
from google.genai import types
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CATALOG = ROOT / "seed" / "catalog.json"
OUT_DIR = ROOT / "seed" / "images"
MODEL = os.environ.get("IMAGE_MODEL", "gemini-2.5-flash-image")


def generate(client: genai.Client, prompt: str, aspect: str, dest: Path) -> None:
    response = client.models.generate_content(
        model=MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_modalities=["IMAGE"],
            image_config=types.ImageConfig(aspect_ratio=aspect),
        ),
    )
    for part in response.parts or []:
        if part.inline_data is not None:
            image = Image.open(io.BytesIO(part.inline_data.data)).convert("RGB")
            image.save(dest, "JPEG", quality=88, optimize=True)
            return
    raise RuntimeError(f"no image returned for {dest.name}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="regenerate existing files")
    parser.add_argument("--only", nargs="*", default=[], help="filenames to generate")
    parser.add_argument("--catalog", type=Path, default=CATALOG, help="catalog JSON file")
    parser.add_argument("--out", type=Path, default=OUT_DIR, help="output directory")
    args = parser.parse_args()

    catalog = json.loads(args.catalog.read_text(encoding="utf-8"))
    out_dir = args.out
    out_dir.mkdir(parents=True, exist_ok=True)
    client = genai.Client()

    failures = 0
    for asset in catalog["assets"]:
        for version in asset["versions"]:
            name = version["filename"]
            dest = out_dir / name
            if args.only and name not in args.only:
                continue
            if dest.exists() and not args.force:
                print(f"skip  {name}")
                continue
            try:
                generate(client, version["prompt"], version["aspect"], dest)
                print(f"ok    {name}")
            except Exception as exc:  # keep going so one bad prompt does not stop the batch
                failures += 1
                print(f"FAIL  {name}: {exc}", file=sys.stderr)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
