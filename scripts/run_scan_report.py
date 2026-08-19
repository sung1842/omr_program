"""Report process_scan on the sample JPEG (obj4.jpg)."""
from __future__ import annotations

import base64
import sys
from pathlib import Path

import cv2

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))
import omr  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
from debug_overlay import build_template

OUT = Path("tmp_measure")
EXPECTED = {"윤동주", "일반5", "일반7", "일반9", "시설2"}

jpeg = cv2.imread(str(OUT / "obj4.jpg"))
if jpeg is None:
    raise SystemExit("need tmp_measure/obj4.jpg")
ok, buf = cv2.imencode(".jpg", jpeg)
result = omr.process_scan(base64.b64encode(buf).decode(), build_template())
print("alignment", result["details"]["alignment"])
print("sheet", result["sheet_status"])
print("answers", result["answers"])
for question in result["details"]["questions"]:
    for item in question["options"]:
        flag = "Y" if item["label"] in EXPECTED else " "
        print(
            f"{flag} {item['label']:>7} circle={item['fill_ratio']:.3f} "
            f"cell={item.get('cell_fill', 0):.3f} {item['verdict']}"
        )
