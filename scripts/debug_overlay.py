"""Draw the cells/circles the OMR pipeline actually scores.

    python scripts/debug_overlay.py tmp_debug/sheet_a.jpg tmp_debug/overlay.png

Geometry mirrors lib/defaultTemplate.ts (2224x2868 overlay, measured 기표 circles).
"""

from __future__ import annotations

import base64
import sys
from pathlib import Path

import cv2

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))
import omr  # noqa: E402

WIDTH = 2224
HEIGHT = 2868
CELL_X = 2036
CELL_W = 152
CELL_H = 101
CIRCLE_R = 21
# [cx, cy] overlay pixels. Empty rows ring-fit; filled rows = that cell's vertical center.
CIRCLES = [
    (2154, 613),
    (2153, 714),
    (2153, 816),
    (2152, 917),
    (2152, 1018),
    (2151, 1119),
    (2151, 1219),
    (2150, 1321),
    (2149, 1421),
    (2149, 1523),
    (2148, 1623),
    (2147, 1725),
    (2147, 1826),
    (2147, 1926),
    (2146, 2028),
]
CIRCLE_CX = 2150
FIRST_CY = 613

LABELS = (
    ["우리마을", "윤동주"]
    + [f"일반{i}" for i in range(1, 11)]
    + [f"시설{i}" for i in range(1, 4)]
)


def rel(x, y, w, h):
    return {"x": x / WIDTH, "y": y / HEIGHT, "w": w / WIDTH, "h": h / HEIGHT}


def circle_center(index: int) -> tuple[int, int]:
    return CIRCLES[index]


def mark_row(index: int):
    cx, cy = CIRCLES[index]
    return {
        "cell": rel(CELL_X, cy - CELL_H / 2, CELL_W, CELL_H),
        "circle": rel(cx - CIRCLE_R, cy - CIRCLE_R, CIRCLE_R * 2, CIRCLE_R * 2),
    }


def build_template():
    groups = [(1, "프로그램 사업 특화", 0, 2, 1, 1), (2, "프로그램 사업 일반", 2, 12, 1, 4), (3, "시설 사업", 12, 15, 1, 1)]
    questions = []
    for number, label, start, end, min_select, max_select in groups:
        options = []
        for index in range(start, end):
            row = mark_row(index)
            options.append(
                {
                    "id": f"opt-{index}",
                    "label": LABELS[index],
                    **row["cell"],
                    "circle": row["circle"],
                }
            )
        questions.append(
            {
                "id": f"q-{number}",
                "number": number,
                "label": label,
                "type": "multi",
                "min_select": min_select,
                "max_select": max_select,
                "on_overflow": "exception",
                "options": options,
            }
        )
    return {
        "name": "debug",
        "image_width": WIDTH,
        "image_height": HEIGHT,
        "marker_shape": "square",
        "fill_threshold": 0.28,
        "auto_mark_cells": False,
        "markers": [
            {"id": "tl", "shape": "square", **rel(36, CIRCLES[0][1] - CELL_H / 2, 48, 36)},
            {"id": "tr", "shape": "square", **rel(2188, CIRCLES[0][1] - CELL_H / 2, 48, 36)},
            {"id": "br", "shape": "square", **rel(2188, CIRCLES[-1][1] + CELL_H / 2, 48, 36)},
            {"id": "bl", "shape": "square", **rel(36, CIRCLES[-1][1] + CELL_H / 2, 48, 36)},
        ],
        "questions": questions,
    }


def main() -> None:
    src = Path(sys.argv[1])
    out = Path(sys.argv[2])
    template = build_template()

    image = cv2.imread(str(src), cv2.IMREAD_COLOR)
    print("input size", image.shape)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    working, scale = omr._downscale(gray)
    binary = omr._binarize(working)
    warped, assigned, alignment = omr._align_scan(gray, binary, scale, template)
    print("alignment", alignment, "assigned", {k: (round(v[0]), round(v[1])) for k, v in assigned.items()})

    canvas = cv2.cvtColor(warped, cv2.COLOR_GRAY2BGR)
    h, w = warped.shape[:2]
    for question in template["questions"]:
        for option in question["options"]:
            cx0, cy0, cx1, cy1 = omr._cell_box(option, w, h)
            ox0, oy0, ox1, oy1 = omr._circle_box(option, w, h)
            mark = omr._score_mark(warped, option)
            cv2.rectangle(canvas, (cx0, cy0), (cx1, cy1), (0, 160, 255), 2)
            cv2.ellipse(
                canvas,
                (int((ox0 + ox1) / 2), int((oy0 + oy1) / 2)),
                (max(1, int((ox1 - ox0) / 2)), max(1, int((oy1 - oy0) / 2))),
                0,
                0,
                360,
                (0, 0, 255),
                2,
            )
            print(
                f"{option['label']:>7} cell=({cx0},{cy0})-({cx1},{cy1}) "
                f"circle=({ox0},{oy0})-({ox1},{oy1}) "
                f"fill={mark['fill']:.4f} px={mark['ink_px']:>5} "
                f"blob={mark['blob_ratio']:.4f} spill={mark['spill_ratio']:.4f}"
            )

    payload = base64.b64encode(cv2.imencode(".jpg", image)[1].tobytes()).decode()
    result = omr.process_scan(payload, template)
    print("answers", result["answers"])
    print("baseline", result["details"]["mark_baseline"], "thr", result["details"]["mark_threshold"])
    print("sheet", result["sheet_status"], [r["message"] for r in result["exception_reasons"]])

    out.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(out), canvas)
    crop = canvas[:, int(w * 0.80) :]
    cv2.imwrite(str(out.with_name(out.stem + "_column.png")), crop)
    print("wrote", out)


if __name__ == "__main__":
    main()
