"""Diagnose why 일반10 fires: warped 기표 column vs template circles."""

from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))
import omr  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
from debug_overlay import CIRCLES, CELL_X, CELL_W, CIRCLE_R, LABELS, WIDTH, HEIGHT, build_template
from tmp_measure_circles import OUT, extract_pdf

OUT.mkdir(exist_ok=True)


def main() -> None:
    extract_pdf()
    jpeg = cv2.imread(str(OUT / "obj4.jpg"), cv2.IMREAD_COLOR)
    template = build_template()
    gray = cv2.cvtColor(jpeg, cv2.COLOR_BGR2GRAY)
    working, scale = omr._downscale(gray)
    binary = omr._binarize(working)
    corners = omr._find_table_corners_from_lines(binary)
    print("working", working.shape, "scale", scale)
    print("table_lines", {k: (round(v[0] / scale), round(v[1] / scale)) for k, v in (corners or {}).items()})
    warped, assigned, alignment = omr._align_scan(gray, binary, scale, template)
    print("alignment", alignment, {k: (round(v[0]), round(v[1])) for k, v in assigned.items()})
    print("markers dest corner", [(m["id"], round(m["x"] * WIDTH), round(m["y"] * HEIGHT)) for m in template["markers"]])

    h, w = warped.shape
    vis = cv2.cvtColor(warped, cv2.COLOR_GRAY2BGR)
    strip = warped[:, CELL_X - 10 : CELL_X + CELL_W + 20]
    # vertical ink profile in 기표 band
    col = np.mean(255 - strip, axis=1)
    # smooth
    kernel = np.ones(9) / 9
    smooth = np.convolve(col, kernel, mode="same")
    peaks = []
    for y in range(400, 2200):
        if smooth[y] > 12 and smooth[y] >= smooth[y - 1] and smooth[y] >= smooth[y + 1]:
            if not peaks or y - peaks[-1] > 40:
                peaks.append(y)
    print("dark peaks in 기표 column", peaks[:20], "count", len(peaks))

    idx = 0
    for question in template["questions"]:
        for option in question["options"]:
            cx, cy = CIRCLES[idx]
            mark = omr._score_mark(warped, option)
            cv2.circle(vis, (int(cx), int(cy)), CIRCLE_R, (0, 0, 255), 2)
            cv2.putText(
                vis,
                f"{idx+1}:{mark['fill']:.2f}",
                (CELL_X - 90, int(cy)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.4,
                (0, 255, 255),
                1,
            )
            print(f"{idx+1:2d} {option['label']:8s} template=({cx},{cy}) fill={mark['fill']:.3f} cell={mark['cell_fill']:.3f}")
            idx += 1

    crop = vis[500:2150, 1980:2224]
    cv2.imwrite(str(OUT / "warped_gipyo.png"), crop)
    cv2.imwrite(str(OUT / "warped_full.jpg"), vis)
    print("wrote", OUT / "warped_gipyo.png")


if __name__ == "__main__":
    main()
