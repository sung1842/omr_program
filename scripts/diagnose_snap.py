"""Print snapped 기표 rows on the warped 1234.jpg scan."""

from __future__ import annotations

import sys
from pathlib import Path

import cv2

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))
import omr  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
from debug_overlay import LABELS, WIDTH, HEIGHT, build_template
from tmp_measure_circles import OUT, extract_pdf

extract_pdf()
jpeg = cv2.imread(str(OUT / "obj4.jpg"), cv2.IMREAD_COLOR)
template = build_template()
gray = cv2.cvtColor(jpeg, cv2.COLOR_BGR2GRAY)
working, scale = omr._downscale(gray)
binary = omr._binarize(working)
warped, _a, alignment = omr._align_scan(gray, binary, scale, template)
print("alignment", alignment, "banner", omr._banner_top(warped), "shape", warped.shape)
rows = omr._detect_gipyo_rows(warped, 15)
print("rows", None if rows is None else len(rows))
vis = cv2.cvtColor(warped, cv2.COLOR_GRAY2BGR)
if rows:
    for i, row in enumerate(rows):
        x0 = int(row["x"] * WIDTH)
        y0 = int(row["y"] * HEIGHT)
        x1 = int((row["x"] + row["w"]) * WIDTH)
        y1 = int((row["y"] + row["h"]) * HEIGHT)
        c = row["circle"]
        cx0 = int(c["x"] * WIDTH)
        cy0 = int(c["y"] * HEIGHT)
        cx1 = int((c["x"] + c["w"]) * WIDTH)
        cy1 = int((c["y"] + c["h"]) * HEIGHT)
        cv2.rectangle(vis, (x0, y0), (x1, y1), (0, 160, 255), 1)
        cv2.rectangle(vis, (cx0, cy0), (cx1, cy1), (0, 0, 255), 2)
        print(f"{i+1:2d} {LABELS[i]:8s} cell=({x0},{y0},{x1-x0},{y1-y0}) circle=({cx0},{cy0},{cx1-cx0},{cy1-cy0})")
crop = vis[400:2100, 1700:2224]
cv2.imwrite(str(OUT / "snapped_gipyo.png"), crop)
print("wrote snapped_gipyo.png")
