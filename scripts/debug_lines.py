"""Dump the table ruling lines in the right-hand mark column of a warped scan."""

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
    src = Path(sys.argv[1])
    template = build_template()
    image = cv2.imread(str(src), cv2.IMREAD_COLOR)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    working, scale = omr._downscale(gray)
    binary = omr._binarize(working)
    warped, assigned, alignment = omr._align_scan(gray, binary, scale, template)
    print("warped", warped.shape, "alignment", alignment)

    bw = omr._binarize(warped)
    height, width = bw.shape[:2]

    vert = cv2.morphologyEx(
        bw, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(15, height // 28)))
    )
    col_score = np.sum(vert > 0, axis=0)
    x_clusters = omr._cluster_positions(np.where(col_score >= col_score.max() * 0.42)[0])
    print("vertical lines (x, score):")
    for a, b in x_clusters:
        print(f"  x={(a + b) / 2:7.1f} width={b - a + 1:3d} score={int(col_score[(a + b) // 2])}")

    horiz = cv2.morphologyEx(
        bw, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (max(15, width // 22), 1))
    )
    row_score = np.sum(horiz > 0, axis=1)
    y_clusters = omr._cluster_positions(np.where(row_score >= row_score.max() * 0.42)[0])
    ys = [(a + b) / 2.0 for a, b in y_clusters]
    print("horizontal lines:")
    for index, y in enumerate(ys):
        gap = ys[index] - ys[index - 1] if index else 0
        print(f"  [{index:2d}] y={y:7.1f} gap={gap:6.1f}")


if __name__ == "__main__":
    main()
