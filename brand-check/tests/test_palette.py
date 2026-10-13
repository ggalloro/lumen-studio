from app.palette import check_palette, delta_e76, hex_to_rgb, rgb_to_lab

from .conftest import PINE_GREEN, SUMMIT_RED, make_image

KIT = [{"name": "Summit Red", "hex": SUMMIT_RED}, {"name": "Pine", "hex": PINE_GREEN}]
OFF_BLUE = "#3A7BFF"


def test_lab_conversion_reference_values():
    white = rgb_to_lab((255, 255, 255))
    assert abs(white[0] - 100) < 0.01 and abs(white[1]) < 0.01 and abs(white[2]) < 0.01
    red = rgb_to_lab((255, 0, 0))
    assert abs(red[0] - 53.24) < 0.05
    assert abs(red[1] - 80.09) < 0.05
    assert abs(red[2] - 67.20) < 0.05


def test_delta_e_identical_colours_is_zero():
    lab = rgb_to_lab(hex_to_rgb(SUMMIT_RED))
    assert delta_e76(lab, lab) == 0


def test_on_palette_image_passes():
    image = make_image([(SUMMIT_RED, 0.6), (PINE_GREEN, 0.4)])
    rule = check_palette(image, KIT, 18)
    assert rule["rule"] == "palette"
    assert rule["status"] == "pass"
    top = rule["details"]["colors"][0]
    assert top["nearest"] == SUMMIT_RED
    assert top["on_palette"] is True
    assert top["delta_e"] <= 1
    assert abs(top["share"] - 0.6) < 0.03


def test_minor_off_palette_share_warns():
    image = make_image([(SUMMIT_RED, 0.75), (OFF_BLUE, 0.25)])
    rule = check_palette(image, KIT, 18)
    assert rule["status"] == "warn"
    blue = next(c for c in rule["details"]["colors"] if c["on_palette"] is False)
    assert abs(blue["share"] - 0.25) < 0.03
    assert blue["delta_e"] > 18


def test_major_off_palette_share_fails():
    image = make_image([(SUMMIT_RED, 0.5), (OFF_BLUE, 0.5)])
    assert check_palette(image, KIT, 18)["status"] == "fail"


def test_small_off_palette_share_passes():
    image = make_image([(SUMMIT_RED, 0.9), (OFF_BLUE, 0.1)])
    assert check_palette(image, KIT, 18)["status"] == "pass"


def test_near_white_and_near_black_are_ignored():
    image = make_image([("#FFFFFF", 0.5), ("#000000", 0.4), (SUMMIT_RED, 0.1)])
    rule = check_palette(image, KIT, 18)
    assert rule["status"] == "pass"
    neutrals = [c for c in rule["details"]["colors"] if c["neutral"]]
    assert {c["hex"] for c in neutrals} >= {"#FFFFFF", "#000000"}


def test_greys_and_shadows_are_neutral():
    image = make_image([("#5A5D60", 0.5), ("#1A1C1E", 0.4), (SUMMIT_RED, 0.1)])
    rule = check_palette(image, KIT, 18)
    assert rule["status"] == "pass"
    assert all(c["neutral"] for c in rule["details"]["colors"] if c["delta_e"] > 18)


def test_tolerance_controls_match():
    # #D02A40 is close to Summit Red but not identical (delta E around 7).
    image = make_image([("#D02A40", 1.0)])
    assert check_palette(image, KIT, 18)["status"] == "pass"
    assert check_palette(image, KIT, 2)["status"] == "fail"


def test_reports_at_most_six_colours():
    bands = [(c, 1 / 8) for c in ["#FF0000", "#00FF00", "#0000FF", "#FFFF00",
                                  "#FF00FF", "#00FFFF", "#888888", "#C8102E"]]
    rule = check_palette(make_image(bands, size=(400, 100)), KIT, 18)
    assert len(rule["details"]["colors"]) <= 6


def test_empty_kit_palette_warns():
    rule = check_palette(make_image([(OFF_BLUE, 1.0)]), [], 18)
    assert rule["status"] == "warn"
    assert rule["details"]["colors"][0]["nearest"] is None
