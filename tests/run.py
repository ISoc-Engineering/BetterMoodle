#!/usr/bin/env python3
"""Run the extension's browser checks with installed Firefox; no dependencies."""
import http.server
import json
import pathlib
import subprocess
import tempfile
import threading

ROOT = pathlib.Path(__file__).resolve().parent.parent
finished = threading.Event()
report = {}

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, *args):
        pass

    def do_GET(self):
        if self.path.startswith(('/mod/', '/pluginfile.php/')):
            body = b'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="60"><rect width="100" height="60" fill="green"/></svg>' if self.path.startswith('/pluginfile.php/') else b'<!doctype html><body id="destination">Moodle activity destination</body>'
            self.send_response(200)
            self.send_header('Content-Type', 'image/svg+xml' if self.path.startswith('/pluginfile.php/') else 'text/html')
            self.end_headers()
            try:
                self.wfile.write(body)
            except BrokenPipeError:
                pass
            return
        if self.path.startswith(('/course/', '/my/')):
            self.path = '/tests/fixture.html' + ('?dashboard' if self.path.startswith('/my/') else '')
        super().do_GET()

    def do_POST(self):
        report.update(json.loads(self.rfile.read(int(self.headers['Content-Length']))))
        self.send_response(204)
        self.end_headers()
        finished.set()

with http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler) as server, tempfile.TemporaryDirectory(prefix='bettermoodle-firefox-') as profile:
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{server.server_port}/tests/index.html'
    process = subprocess.Popen(['firefox', '--headless', '--no-remote', '--profile', profile, url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        if not finished.wait(45):
            raise SystemExit('FAIL: Firefox tests timed out')
        for result in report['results']:
            print(result)
        raise SystemExit(1 if report['failures'] else 0)
    finally:
        process.terminate()
        process.wait(timeout=10)
        server.shutdown()
