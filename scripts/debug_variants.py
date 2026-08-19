"""Light strokes, off-centre marks and neighbour bleed on a blank scan."""

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
from debug_synth import cell_spots, inverse_matrix  # noqa: E402


def run(name: str, painted: np.ndarray, template: dict) -> None:
    payload = base64.b64encode(cv2.imencode(".jpg", painted)[1].tobytes()).decode()
    result = omr.process_scan(payload, template)
    picked = {key: value for key, value in result["answers"].items()}
    reasons = [item["message"] for item in result["exception_reasons"]]
    print(f"\n== {name}\n   answers {picked}\n   sheet {result['sheet_status']} {reasons}")
    for question in result["details"]["questions"]:
        for item in question["options"]:
            if item["verdict"] != "blank":
                print(
                    f"   {item['label']:>7} fill={item['fill_ratio']:.4f} "
                    f"blob={item['blob_ratio']:.4f} spill={item['spill_ratio']:.4f} {item['verdict']}"
                )


def main() -> None:
    src = Path(sys.argv[1])
    template = build_template()
    image = cv2.imread(str(src), cv2.IMREAD_COLOR)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    spots = cell_spots(template, inverse_matrix(gray, template))

    # 1. Faint short pen stroke (V check), not a filled circle.
    painted = image.copy()
    for label in ("윤동주", "일반3", "시설1"):
        x, y, cell_h = spots[label]
        arm = int(cell_h * 0.30)
        cv2.line(painted, (x - arm, y - arm // 2), (x, y + arm // 2), (120, 120, 125), 3)
        cv2.line(painted, (x, y + arm // 2), (x + arm, y - arm), (120, 120, 125), 3)
    run("faint check marks", painted, template)

    # 2. Mark pushed to the top edge of the cell, overlapping the printed rule.
    painted = image.copy()
    for label in ("우리마을", "일반10", "시설3"):
        x, y, cell_h = spots[label]
        cv2.circle(painted, (x + 30, int(y - cell_h * 0.32)), int(cell_h * 0.26), (40, 40, 45), -1)
    run("marks on the row line", painted, template)

    # 3. One mark bleeding well into the row below.
    painted = image.copy()
    x, y, cell_h = spots["일반6"]
    cv2.ellipse(painted, (x, int(y + cell_h * 0.45)), (int(cell_h * 0.5), int(cell_h * 0.8)), 0, 0, 360, (40, 40, 45), -1)
    x, y, cell_h = spots["윤동주"]
    cv2.circle(painted, (x, y), int(cell_h * 0.28), (40, 40, 45), -1)
    x, y, cell_h = spots["시설2"]
    cv2.circle(painted, (x, y), int(cell_h * 0.28), (40, 40, 45), -1)
    run("neighbour bleed", painted, template)


if __name__ == "__main__":
    main()
