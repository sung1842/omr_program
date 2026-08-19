"""Save each 기표 cell with hole/ring overlays."""

from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))
import omr  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
from debug_overlay import build_template  # noqa: E402


def main() -> None:
    image = cv2.imread(sys.argv[1], cv2.IMREAD_COLOR)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    working, scale = omr._downscale(gray)
    binary = omr._binarize(working)
    template = build_template()
    warped, _assigned, alignment = omr._align_scan(gray, binary, scale, template)
    print("alignment", alignment, "cells", "template")
    h, w = warped.shape[:2]
    vis = cv2.cvtColor(warped, cv2.COLOR_GRAY2BGR)
    out_dir = Path("tmp_debug/cells")
    out_dir.mkdir(parents=True, exist_ok=True)
    index = 0
    for question in template["questions"]:
        for option in question["options"]:
            x0, y0, x1, y1 = omr._cell_box(option, w, h)
            ox0, oy0, ox1, oy1 = omr._circle_box(option, w, h)
            cv2.rectangle(vis, (x0, y0), (x1, y1), (0, 160, 255), 2)
            cv2.ellipse(
                vis,
                (int((ox0 + ox1) / 2), int((oy0 + oy1) / 2)),
                (max(1, int((ox1 - ox0) / 2)), max(1, int((oy1 - oy0) / 2))),
                0,
                0,
                360,
                (0, 0, 255),
                2,
            )
            pad = 8
            crop = vis[max(0, y0 - pad) : min(h, y1 + pad), max(0, x0 - pad) : min(w, x1 + pad)]
            cv2.imwrite(str(out_dir / f"{index:02d}_{option['label']}.png"), crop)
            print(option["label"], "cell", (x0, y0, x1, y1), "circle", (ox0, oy0, ox1, oy1), "r", (ox1 - ox0) / 2)
            index += 1
    cv2.imwrite("tmp_debug/cells_overlay.png", vis[:, int(w * 0.82) :])


if __name__ == "__main__":
    main()
