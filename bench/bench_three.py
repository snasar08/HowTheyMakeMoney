"""Run bench/three/bench.html in headless Chromium (SwiftShader, CPU) and print its timing."""
import functools
import http.server
import json
import os
import sys
import threading
import time

from playwright.sync_api import sync_playwright

N = int(os.environ.get("CROWD_N", "300"))
handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=os.getcwd())
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8765), handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
                                "--ignore-gpu-blocklist"])
    page = b.new_page(viewport={"width": 540, "height": 960})
    page.on("console", lambda m: print("[page]", m.text))
    t0 = time.time()
    page.goto(f"http://127.0.0.1:8765/bench/three/bench.html?n={N}")
    page.wait_for_function("window.RESULT", timeout=600000)
    r = page.evaluate("window.RESULT")
    r["load_s"] = round(time.time() - t0, 1)
    page.screenshot(path=f"bench/three_{N}.png")
    print(json.dumps(r))
    b.close()
srv.shutdown()
sys.exit(0)
