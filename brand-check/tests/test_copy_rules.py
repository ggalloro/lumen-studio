import pytest

from app.copy_rules import check_copy_style, copy_text


@pytest.mark.parametrize(
    ("text", "status"),
    [
        ("Hiker on a granite ridge at dawn.", "pass"),
        ("Built for wet trails. Taped seams, 20k waterproofing.", "pass"),
        ("Ready for the trail!", "warn"),
        ("AMAZING jacket for the trail.", "warn"),
        ("GPS and USB-C are fine.", "pass"),
        ("", "warn"),
    ],
)
def test_copy_style_status(text, status):
    assert check_copy_style(text)["status"] == status


def test_copy_style_lists_every_problem():
    result = check_copy_style("HUGE SALE today!!!")
    assert result["rule"] == "copy_style"
    assert result["message"] == "Copy uses exclamation marks and all-caps words (HUGE, SALE)"


def test_empty_copy_message():
    assert check_copy_style("   ")["message"] == "No copy to check"


def test_copy_text_joins_alt_text_and_description():
    asset = {"description": "  Fall launch.  "}
    version = {"alt_text": "Red jacket on a ridge."}
    assert copy_text(asset, version) == "Red jacket on a ridge.\nFall launch."
