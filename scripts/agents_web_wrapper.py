"""
Render free-tier wrapper for the agents worker.
Render requires web services to bind a PORT — background workers are paid-only.
This starts a minimal health-check HTTP server in a daemon thread, then runs
the full agent loop in the main thread exactly as `python -m agents.main` would.
"""
import os, sys, threading
from http.server import HTTPServer, BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class _Health(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"ok")

    def log_message(self, *args):
        pass


port = int(os.environ.get("PORT", 8080))
threading.Thread(
    target=lambda: HTTPServer(("", port), _Health).serve_forever(),
    daemon=True,
).start()

import runpy
runpy.run_module("agents.main", run_name="__main__")
