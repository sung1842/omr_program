"""Local OMR API used by `next dev` rewrites.

Usage:
    python scripts/dev_omr_server.py

api/omr.py is reloaded whenever it changes, so edits take effect without a restart.
"""

from __future__ import annotations

import importlib.util
import sys
import traceback
from http.server import HTTPServer
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
API_FILE = ROOT / "api" / "omr.py"


def load_api() -> Any:
    spec = importlib.util.spec_from_file_location("omr_api", API_FILE)
    if spec is None or spec.loader is None:
        raise SystemExit(f"Cannot load {API_FILE}")
    module = importlib.util.module_from_spec(spec)
    sys.modules["omr_api"] = module
    spec.loader.exec_module(module)
    return module


class ReloadingServer(HTTPServer):
    def __init__(self, address: tuple[str, int]) -> None:
        self.module = load_api()
        self.stamp = API_FILE.stat().st_mtime
        super().__init__(address, self.module.handler)

    def finish_request(self, request: Any, client_address: Any) -> None:
        stamp = API_FILE.stat().st_mtime
        if stamp != self.stamp:
            try:
                self.module = load_api()
                self.stamp = stamp
                self.RequestHandlerClass = self.module.handler
                print(f"reloaded {API_FILE.name}")
            except Exception:
                traceback.print_exc()
                print("reload failed; keeping the previous version")
        super().finish_request(request, client_address)


def main() -> None:
    host = "127.0.0.1"
    port = 8000
    server = ReloadingServer((host, port))
    print(f"OMR API listening on http://{host}:{port}/api/omr", flush=True)
    print("Keep this process running while `npm run dev` is open.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
