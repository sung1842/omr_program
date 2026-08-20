"""Synthetic overlay smoke test: fixed coords + fill threshold, no scan file.

    python scripts/test_coord_omr.py
"""

from __future__ import annotations

import base64
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))
import omr  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
from debug_overlay import CIRCLE_R, WIDTH, HEIGHT, CELL_H, build_template, circle_center  # noqa: E402


def blank_form() -> np.ndarray:
    image = np.full((HEIGHT, WIDTH, 3), 245, dtype=np.uint8)
    # 기표 15칸 외곽이 템플릿 워프 목적지와 같아야 항등 변환이 된다.
    _, first_cy = circle_center(0)
    _, last_cy = circle_center(14)
    y0 = int(round(first_cy - CELL_H / 2))
    y1 = int(round(last_cy + CELL_H / 2))
    cv2.rectangle(image, (36, y0), (2188, y1), (40, 40, 40), 3)
    cv2.line(image, (2036, y0), (2036, y1), (40, 40, 40), 2)
    for index in range(15):
        cx, cy = circle_center(index)
        row_top = int(round(cy - CELL_H / 2))
        cv2.line(image, (2036, row_top), (2188, row_top), (40, 40, 40), 2)
        cv2.circle(image, (cx, cy), CIRCLE_R, (30, 30, 30), 2)
    cv2.line(image, (2036, y1), (2188, y1), (40, 40, 40), 2)
    return image


def fill_hole(image: np.ndarray, index: int, shade: int = 40) -> None:
    cx, cy = circle_center(index)
    cv2.circle(image, (cx, cy), max(1, CIRCLE_R - 2), (shade, shade, shade), -1)


def encode(image: np.ndarray) -> str:
    return base64.b64encode(cv2.imencode(".png", image)[1].tobytes()).decode()


def selected_labels(result: dict) -> set[str]:
    picked: set[str] = set()
    for values in result["answers"].values():
        picked.update(values)
    return picked


def main() -> None:
    template = build_template()
    image = blank_form()
    fill_hole(image, 0)  # 우리마을
    fill_hole(image, 4)  # 일반3
    fill_hole(image, 6)  # 일반5
    fill_hole(image, 13)  # 시설2

    result = omr.process_scan(encode(image), template)
    details = result["details"]
    picked = selected_labels(result)
    expected = {"우리마을", "일반3", "일반5", "시설2"}

    print("engine", details["engine"], "alignment", details["alignment"])
    print("baseline", details["mark_baseline"], "threshold", details["mark_threshold"])
    for question in details["questions"]:
        for item in question["options"]:
            flag = "*" if item["verdict"] == "selected" else " "
            print(
                f"{flag}{item['label']:>7} fill={item['fill_ratio']:.4f} "
                f"px={item['ink_px']:>4} {item['verdict']}"
            )
    print("answers", result["answers"])
    print("sheet", result["sheet_status"], [item["message"] for item in result["exception_reasons"]])

    if picked != expected:
        raise SystemExit(f"expected {sorted(expected)}, got {sorted(picked)}")
    if result["sheet_status"] != "ok":
        raise SystemExit(f"sheet should be ok, got {result['sheet_status']}")

    # Same relative circles as the seed, but not 2224x2868 — this is a wizard clone.
    # Copier-like margins used to stretch via resize and miss the holes.
    wizard_template = build_template()
    wizard_template["image_width"] = 1800
    wizard_template["image_height"] = 2321
    pad = 80
    padded = np.full((HEIGHT + pad * 2, WIDTH + pad * 2, 3), 245, dtype=np.uint8)
    padded[pad : pad + HEIGHT, pad : pad + WIDTH] = image
    wizard_result = omr.process_scan(encode(padded), wizard_template)
    wizard_picked = selected_labels(wizard_result)
    wizard_align = wizard_result["details"]["alignment"]
    print("wizard clone", wizard_align, wizard_result["answers"])
    if wizard_picked != expected:
        raise SystemExit(
            f"wizard clone expected {sorted(expected)}, got {sorted(wizard_picked)} "
            f"(alignment={wizard_align})"
        )
    if wizard_align not in ("gipyo_column", "table_lines"):
        raise SystemExit("wizard clone should warp the 기표 column, not stretch the whole page")
    print("wizard clone with margins ok")

    # Overflow: two 특화 marks → exception, but both still counted as selected.
    overflow = blank_form()
    fill_hole(overflow, 0)
    fill_hole(overflow, 1)
    overflow_result = omr.process_scan(encode(overflow), template)
    overflow_picked = selected_labels(overflow_result)
    if overflow_picked != {"우리마을", "윤동주"}:
        raise SystemExit(f"overflow marks missing: {overflow_picked}")
    if overflow_result["sheet_status"] != "exception":
        raise SystemExit("two 특화 marks should be exception")
    print("overflow exception ok")

    faint = blank_form()
    cx, cy = circle_center(6)  # 일반5
    cv2.line(faint, (cx - 8, cy - 4), (cx, cy + 6), (210, 210, 210), 1)
    cv2.line(faint, (cx, cy + 6), (cx + 9, cy - 7), (210, 210, 210), 1)
    faint_result = omr.process_scan(encode(faint), template)
    faint_picked = selected_labels(faint_result)
    if faint_picked:
        raise SystemExit(f"a hairline must stay blank, got {sorted(faint_picked)}")
    if faint_result["sheet_status"] != "exception":
        raise SystemExit("a sheet with no marks should be an exception")
    if not any(item.get("kind") == "empty" for item in faint_result["exception_reasons"]):
        raise SystemExit(f"expected empty-sheet exception, got {faint_result['exception_reasons']}")
    print("hairline blank is exception ok")

    blank_result = omr.process_scan(encode(blank_form()), template)
    if selected_labels(blank_result):
        raise SystemExit(f"blank form must have no answers, got {blank_result['answers']}")
    if blank_result["sheet_status"] != "exception":
        raise SystemExit("blank form should be an exception")
    print("blank sheet exception ok")

    sample = Path(__file__).resolve().parents[1] / "tmp_measure" / "obj4.jpg"
    overlay = Path(__file__).resolve().parents[1] / "tmp_measure" / "overlay.png"
    if sample.exists():
        jpeg = cv2.imread(str(sample), cv2.IMREAD_COLOR)
        jpeg_result = omr.process_scan(encode(jpeg), template)
        jpeg_picked = selected_labels(jpeg_result)
        if "일반10" in jpeg_picked:
            raise SystemExit(f"일반10 must not fire on the sample scan, got {sorted(jpeg_picked)}")
        print("sample jpeg 일반10 blank ok", jpeg_result["answers"], jpeg_result["details"]["alignment"])
    if overlay.exists():
        ov = cv2.imread(str(overlay), cv2.IMREAD_COLOR)
        ov_result = omr.process_scan(encode(ov), template)
        ov_picked = selected_labels(ov_result)
        expected_ov = {"윤동주", "일반5", "일반7", "일반9", "시설2"}
        if ov_picked != expected_ov:
            raise SystemExit(f"overlay expected {sorted(expected_ov)}, got {sorted(ov_picked)}")
        print("overlay marks ok")
    print("PASS")


if __name__ == "__main__":
    main()
