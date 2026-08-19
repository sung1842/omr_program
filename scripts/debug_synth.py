"""Paint marks into a blank scan at known rows, then check the pipeline reads them back.

    python scripts/debug_synth.py tmp_debug/sheet_a.jpg 일반5 일반7 일반9 시설2
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
from debug_overlay import build_template  # noqa: E402


def to_source(point: tuple[float, float], inverse: np.ndarray) -> tuple[float, float]:
    mapped = cv2.perspectiveTransform(
        np.array([[[float(point[0]), float(point[1])]]], dtype=np.float32), inverse
    )[0][0]
    return float(mapped[0]), float(mapped[1])


def cell_spots(template: dict, inverse: np.ndarray) -> dict[str, tuple[int, int, float]]:
    """Printed-circle centre in scan pixels plus the cell height at that scale."""
    spots: dict[str, tuple[int, int, float]] = {}
    width = template["image_width"]
    height = template["image_height"]
    for question in template["questions"]:
        for option in question["options"]:
            circle = option.get("circle") or option
            cx = (circle["x"] + circle["w"] / 2.0) * width
            cy = (circle["y"] + circle["h"] / 2.0) * height
            half = option["h"] * height / 2.0
            centre = to_source((cx, cy), inverse)
            bottom = to_source((cx, cy + half), inverse)
            cell_h = 2.0 * abs(bottom[1] - centre[1])
            spots[option["label"]] = (int(round(centre[0])), int(round(centre[1])), cell_h)
    return spots


def inverse_matrix(gray: np.ndarray, template: dict) -> np.ndarray:
    working, scale = omr._downscale(gray)
    binary = omr._binarize(working)
    corners = omr._find_table_corners_from_lines(binary)
    assigned = omr._scale_corners(corners, scale)
    src, dst_rel = omr._ordered_points(assigned, template["markers"], "corner")
    dst = np.column_stack(
        (dst_rel[:, 0] * template["image_width"], dst_rel[:, 1] * template["image_height"])
    ).astype(np.float32)
    return cv2.getPerspectiveTransform(dst, src)


def main() -> None:
    src_path = Path(sys.argv[1])
    wanted = set(sys.argv[2:]) or {"일반5", "일반7", "일반9", "시설2"}
    template = build_template()

    image = cv2.imread(str(src_path), cv2.IMREAD_COLOR)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    inverse = inverse_matrix(gray, template)

    painted = image.copy()
    spots = cell_spots(template, inverse)
    for label in sorted(wanted):
        if label not in spots:
            raise SystemExit(f"unknown label: {label}")
        x, y, cell_h = spots[label]
        radius = max(3, int(round(cell_h * 0.30)))
        cv2.circle(painted, (x, y), radius, (40, 40, 45), -1)
        print(f"painted {label} at {x},{y} r={radius} (cell height {cell_h:.1f})")

    out = src_path.with_name(src_path.stem + "_marked.jpg")
    cv2.imwrite(str(out), painted, [int(cv2.IMWRITE_JPEG_QUALITY), 88])

    payload = base64.b64encode(cv2.imencode(".jpg", painted)[1].tobytes()).decode()
    result = omr.process_scan(payload, template)
    details = result["details"]
    print("cell_source", details.get("cell_source"), "alignment", details["alignment"], "engine", details.get("engine"))
    print("baseline", details["mark_baseline"], "threshold", details["mark_threshold"])
    for question in details["questions"]:
        for item in question["options"]:
            print(
                f"{item['label']:>7} fill={item['fill_ratio']:.4f} px={item['ink_px']:>5} "
                f"blob={item['blob_ratio']:.4f} spill={item['spill_ratio']:.4f} {item['verdict']}"
            )
    print("answers", result["answers"])
    print("sheet", result["sheet_status"], [item["message"] for item in result["exception_reasons"]])
    print("wrote", out)


if __name__ == "__main__":
    main()
