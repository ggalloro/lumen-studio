"""Deterministic palette rule: dominant colours compared to the brand kit in CIE Lab."""

import math
from io import BytesIO

from PIL import Image

MAX_COLORS = 6
SAMPLE_SIZE = 128
# Very light, very dark and low-chroma colours (whites, shadows, greys) do not count for or
# against the palette.
NEUTRAL_LIGHT_L = 95
NEUTRAL_DARK_L = 20
NEUTRAL_MAX_CHROMA = 12
FAIL_SHARE = 0.35
WARN_SHARE = 0.15


def hex_to_rgb(value: str) -> tuple[int, int, int]:
    digits = value.strip().lstrip("#")
    if len(digits) != 6:
        raise ValueError(f"Invalid hex colour: {value!r}")
    return tuple(int(digits[i:i + 2], 16) for i in (0, 2, 4))


def rgb_to_hex(rgb: tuple[int, int, int]) -> str:
    return "#{:02X}{:02X}{:02X}".format(*rgb)


def rgb_to_lab(rgb: tuple[int, int, int]) -> tuple[float, float, float]:
    """sRGB (D65) to CIE L*a*b*."""

    def linear(channel: int) -> float:
        c = channel / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = (linear(c) for c in rgb)
    x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047
    y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b
    z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883

    def f(t: float) -> float:
        return t ** (1 / 3) if t > (6 / 29) ** 3 else t / (3 * (6 / 29) ** 2) + 4 / 29

    fx, fy, fz = f(x), f(y), f(z)
    return 116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)


def delta_e76(lab1: tuple[float, float, float], lab2: tuple[float, float, float]) -> float:
    return math.dist(lab1, lab2)


def dominant_colors(image_bytes: bytes) -> list[tuple[tuple[int, int, int], float]]:
    """Up to MAX_COLORS colours with their pixel share, largest share first."""
    with Image.open(BytesIO(image_bytes)) as img:
        sample = img.convert("RGB")
    sample.thumbnail((SAMPLE_SIZE, SAMPLE_SIZE))
    quantized = sample.quantize(colors=MAX_COLORS, method=Image.Quantize.MEDIANCUT)
    palette = quantized.getpalette()
    counts = quantized.getcolors() or []
    total = sum(count for count, _ in counts)
    colors = []
    for count, index in sorted(counts, reverse=True):
        rgb = tuple(palette[index * 3:index * 3 + 3])
        colors.append((rgb, count / total))
    return colors


def check_palette(image_bytes: bytes, kit_palette: list[dict], tolerance: float) -> dict:
    kit = [(entry["hex"], rgb_to_lab(hex_to_rgb(entry["hex"]))) for entry in kit_palette]
    details = []
    off_share = 0.0

    for rgb, share in dominant_colors(image_bytes):
        lab = rgb_to_lab(rgb)
        chroma = math.hypot(lab[1], lab[2])
        neutral = lab[0] > NEUTRAL_LIGHT_L or lab[0] < NEUTRAL_DARK_L or chroma < NEUTRAL_MAX_CHROMA
        nearest_hex, distance = None, None
        if kit:
            nearest_hex, nearest_lab = min(kit, key=lambda k: delta_e76(lab, k[1]))
            distance = delta_e76(lab, nearest_lab)
        on_palette = neutral or (distance is not None and distance <= tolerance)
        if not on_palette:
            off_share += share
        details.append({
            "hex": rgb_to_hex(rgb),
            "share": round(share, 4),
            "nearest": nearest_hex.upper() if nearest_hex else None,
            "delta_e": round(distance, 1) if distance is not None else None,
            "on_palette": on_palette,
            "neutral": neutral,
        })

    percent = round(off_share * 100)
    if not kit:
        status = "warn"
        message = "Brand kit has no palette colours to compare against"
    elif off_share > FAIL_SHARE:
        status = "fail"
        message = f"Off-palette colours cover {percent}% of the image (limit 15%)"
    elif off_share > WARN_SHARE:
        status = "warn"
        message = f"Off-palette colours cover {percent}% of the image (limit 15%)"
    else:
        status = "pass"
        message = f"Off-palette colours cover {percent}% of the image"

    return {"rule": "palette", "status": status, "message": message,
            "details": {"colors": details}}
