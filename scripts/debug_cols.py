from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))
import omr  # noqa: E402
from debug_overlay import build_template  # noqa: E402


def main() -> None:
    image = cv2.imread(sys.argv[1], cv2.IMREAD_COLOR)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    working, scale = omr._downscale(gray)
    binary = omr._binarize(working)
    warped, _assigned, alignment = omr._align_scan(gray, binary, scale, build_template())
    bw = omr._binarize(warped)
    height, width = bw.shape[:2]
    print("warped", width, height, alignment)
    vert = cv2.morphologyEx(
        bw, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(15, height // 28)))
    )
    col_score = np.sum(vert > 0, axis=0).astype(np.float64)
    print("max col_score", col_score.max(), "threshold 0.42", col_score.max() * 0.42)
    clusters = omr._cluster_positions(np.where(col_score >= col_score.max() * 0.42)[0])
    print("strong verticals:")
    for a, b in clusters:
        print(f"  x={(a+b)/2:7.1f} w={b-a+1:3d} score={int(col_score[(a+b)//2])}")
    weak = omr._cluster_positions(np.where(col_score >= col_score.max() * 0.18)[0])
    print("weaker verticals:")
    for a, b in weak:
        print(f"  x={(a+b)/2:7.1f} w={b-a+1:3d} score={int(col_score[(a+b)//2])}")
    # right 25% profile
    x0 = int(width * 0.72)
    print("right-side profile every 20px:")
    for x in range(x0, width, 20):
        print(f"  x={x:4d} score={int(col_score[x])}")


if __name__ == "__main__":
    main()
