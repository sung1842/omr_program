"""Sweep circle-fill thresholds on 1234.pdf overlay and warped scan.

    python scripts/sweep_threshold.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import cv2

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))
import omr  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
from debug_overlay import build_template  # noqa: E402
from tmp_measure_circles import OUT, SRC, extract_pdf, load_overlay  # noqa: E402

EXPECTED = {"윤동주", "일반5", "일반7", "일반9", "시설2"}


def report(gray, template, title: str) -> None:
    print(f"\n==== {title} {gray.shape} ====")
    rows = []
    for question in template["questions"]:
        for option in question["options"]:
            mark = omr._score_mark(gray, option)
            label = option["label"]
            truth = label in EXPECTED
            rows.append((label, truth, mark["fill"], mark.get("cell_fill", 0.0)))
            flag = "Y" if truth else " "
            print(
                f"{flag} {label:>7} circle={mark['fill']:.3f} cell={mark.get('cell_fill', 0):.3f}"
            )

    print("threshold  TP FP FN  picked")
    best = None
    for cut in [i / 100 for i in range(10, 61, 2)]:
        picked = {label for label, _t, fill, _c in rows if fill >= cut}
        tp = len(picked & EXPECTED)
        fp = len(picked - EXPECTED)
        fn = len(EXPECTED - picked)
        mark = " <--" if fp == 0 and fn == 0 else ""
        print(f"  {cut:.2f}      {tp:2d} {fp:2d} {fn:2d}  {sorted(picked)}{mark}")
        if fp == 0 and fn == 0 and best is None:
            best = cut
    print("first perfect cut", best)


def main() -> None:
    extract_pdf()
    template = build_template()
    overlay = load_overlay()
    report(overlay, template, "overlay identity")

    jpeg = cv2.imread(str(OUT / "obj4.jpg"), cv2.IMREAD_COLOR)
    ok, buf = cv2.imencode(".jpg", jpeg)
    payload = buf.tobytes()
    import base64

    result = omr.process_scan(base64.b64encode(payload).decode(), template)
    print("\n==== warped+snap scan ====")
    print("alignment", result["details"]["alignment"], "snap", result["details"]["cell_source"])
    print("answers", result["answers"])
    print("sheet", result["sheet_status"])
    for question in result["details"]["questions"]:
        for item in question["options"]:
            flag = "Y" if item["label"] in EXPECTED else " "
            print(
                f"{flag} {item['label']:>7} circle={item['fill_ratio']:.3f} cell={item.get('cell_fill', 0):.3f} {item['verdict']}"
            )


if __name__ == "__main__":
    if not SRC.exists():
        raise SystemExit(f"need {SRC}")
    main()
