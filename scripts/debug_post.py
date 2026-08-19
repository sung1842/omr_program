"""POST a sheet to the running dev OMR server, the same way the browser does.

    python scripts/debug_post.py tmp_debug/sheet_a_marked.jpg
"""

from __future__ import annotations

import base64
import json
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from debug_overlay import build_template  # noqa: E402

URL = "http://127.0.0.1:8000/api/omr"


def main() -> None:
    image = Path(sys.argv[1]).read_bytes()
    template = build_template()
    body = json.dumps(
        {
            "image_base64": base64.b64encode(image).decode(),
            "template": {
                "image_width": template["image_width"],
                "image_height": template["image_height"],
                "marker_shape": template["marker_shape"],
                "markers": template["markers"],
                "questions": template["questions"],
                "fill_threshold": template["fill_threshold"],
                "auto_mark_cells": False,
            },
        }
    ).encode()

    request = urllib.request.Request(
        URL, data=body, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        result = json.loads(response.read().decode())

    details = result.get("details") or {}
    print("cell_source", details.get("cell_source"), "alignment", details.get("alignment"))
    print("engine", details.get("engine"))
    print("baseline", details.get("mark_baseline"), "threshold", details.get("mark_threshold"))
    for question in details.get("questions") or []:
        for item in question.get("options") or []:
            print(
                f"{item['label']:>7} fill={item['fill_ratio']:.4f} px={item.get('ink_px')} "
                f"blob={item.get('blob_ratio')} spill={item.get('spill_ratio')} "
                f"scribble={item.get('scribble_blob')} {item['verdict']}"
            )
    print("answers", json.dumps(result.get("answers"), ensure_ascii=False))
    print("sheet", result.get("sheet_status"), [item["message"] for item in result.get("exception_reasons") or []])


if __name__ == "__main__":
    main()
