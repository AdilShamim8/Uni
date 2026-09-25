"""Use ReWoo from your own code over its HTTP API.

Start ReWoo first (`python -m rewoo`), then run: python examples/api_quickstart.py
"""
import json
import time

import httpx

BASE = "http://localhost:8787"

with httpx.Client(base_url=BASE, timeout=30) as c:
    # 1) Give ReWoo some memory
    with open("examples/sample-notes/trip-plan.md", "rb") as f:
        print(c.post("/api/memory/upload", files={"files": ("trip-plan.md", f, "text/markdown")}).json())

    # 2) Ask a question
    task = c.post("/api/tasks", json={"prompt": "What's my hotel budget for the trip?", "helper_id": "scout"}).json()

    # 3) Wait for the answer (or stream /api/tasks/{id}/stream for live events)
    while True:
        data = c.get(f"/api/tasks/{task['id']}").json()
        if data["task"]["status"] not in ("queued", "running", "waiting"):
            break
        time.sleep(0.5)
    print(data["task"]["result"])
    receipt = next(e["data"] for e in data["events"] if e["type"] == "context")
    print("Context receipt:", json.dumps([i["title"] for i in receipt["used"]]))
