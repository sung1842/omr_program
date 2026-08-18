"""Local OMR API used by `next dev` rewrites.

Usage:
    python scripts/dev_omr_server.py
"""

from __future__ import annotations

import importlib.util
import sys
from http.server import HTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
API_FILE = ROOT / "api" / "omr.py"

spec = importlib.util.spec_from_file_location("omr_api", API_FILE)
if spec is None or spec.loader is None:
    raise SystemExit(f"Cannot load {API_FILE}")
module = importlib.util.module_from_spec(spec)
sys.modules["omr_api"] = module
spec.loader.exec_module(module)


def main() -> None:
    host = "127.0.0.1"
    port = 8000
    server = HTTPServer((host, port), module.handler)
    print(f"OMR API listening on http://{host}:{port}/api/omr")
    print("Keep this process running while `npm run dev` is open.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
