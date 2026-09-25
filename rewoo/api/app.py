"""HTTP API + web app.

Everything the UI does goes through these endpoints, so ReWoo is fully
scriptable. Live progress streams over Server-Sent Events. The built web app
(`rewoo/web/dist`) is served as a single-page app with safe static handling.

Optional access token: set `REWOO_ACCESS_TOKEN` to require
`Authorization: Bearer <token>` (or the `rewoo_token` cookie) on /api/*.
Do this before exposing ReWoo beyond localhost.
"""
from __future__ import annotations

import hmac
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .. import __version__
from ..core import ReWoo
from . import openai_api, routes_core, routes_memory, routes_team

WEB_DIST = Path(__file__).resolve().parent.parent / "web" / "dist"
PUBLIC_API = ("/api/health", "/api/paperclip/heartbeat", "/api/drive/callback", "/api/auth")

FALLBACK_PAGE = """<!doctype html><meta charset=utf-8><title>ReWoo</title>
<body style="font-family:system-ui;background:#07060d;color:#eee;display:grid;place-items:center;height:100vh;margin:0">
<div style="max-width:560px;text-align:center"><h1>ReWoo API is running</h1>
<p>The web app hasn't been built. Run <code>cd web && npm install && npm run build</code>,
or use a release ZIP (it ships with the built app).</p><p><a style="color:#a78bfa" href="/docs">API docs</a></p></div>"""


def create_app(rewoo: Optional[ReWoo] = None, run_background: bool = True) -> FastAPI:
    rw = rewoo or ReWoo()
    access_token = os.environ.get("REWOO_ACCESS_TOKEN", "")

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if run_background:
            await rw.start_background()
        else:
            rw.runtime.recover()
        try:
            yield
        finally:
            if run_background:
                await rw.stop_background()

    app = FastAPI(title="ReWoo", version=__version__, lifespan=lifespan,
                  description="Personal AI Agent OS — AI teammates with private memory. OpenAI-compatible at /v1.")
    app.state.rewoo = rw

    @app.middleware("http")
    async def guard(request: Request, call_next):
        path = request.url.path
        if access_token and path.startswith("/api/") and not path.startswith(PUBLIC_API):
            header = request.headers.get("authorization", "")
            token = header[7:] if header.lower().startswith("bearer ") else request.cookies.get("rewoo_token", "")
            token = token or request.query_params.get("token", "")
            if not hmac.compare_digest(token, access_token):
                return JSONResponse({"detail": "ReWoo access token required", "auth": True}, status_code=401)
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "same-origin")
        return response

    @app.post("/api/auth")
    async def login(request: Request):
        body = await request.json()
        if not access_token:
            return {"ok": True, "required": False}
        if not hmac.compare_digest(str(body.get("token", "")), access_token):
            return JSONResponse({"detail": "Wrong token"}, status_code=401)
        resp = JSONResponse({"ok": True, "required": True})
        resp.set_cookie("rewoo_token", access_token, httponly=True, samesite="strict")
        return resp

    app.include_router(routes_core.build(rw))
    app.include_router(routes_memory.build(rw))
    app.include_router(routes_team.build(rw))
    app.include_router(openai_api.build(rw))

    # ---------------------------------------------------------------- web
    if (WEB_DIST / "index.html").exists():
        if (WEB_DIST / "assets").exists():
            app.mount("/assets", StaticFiles(directory=WEB_DIST / "assets"), name="assets")
        root = WEB_DIST.resolve()

        @app.get("/{full_path:path}", include_in_schema=False)
        def spa(full_path: str):
            if full_path.startswith(("api/", "v1/")):
                return JSONResponse({"detail": "Not found"}, status_code=404)
            candidate = (root / full_path).resolve()
            # Serve real files only from inside dist/ (no path traversal); everything else → the SPA.
            if full_path and candidate.is_file() and root in candidate.parents:
                return FileResponse(candidate)
            return FileResponse(root / "index.html")
    else:
        @app.get("/", include_in_schema=False)
        def no_ui():
            return HTMLResponse(FALLBACK_PAGE)

    return app
