"""Command line: `python -m rewoo [serve|ask|eval|trace]`."""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
import webbrowser


def _utf8_console() -> None:
    """Windows consoles default to legacy code pages; never crash on emoji output."""
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
        except Exception:  # noqa: BLE001
            pass


def main(argv=None) -> int:
    _utf8_console()
    parser = argparse.ArgumentParser(prog="rewoo", description="ReWoo — your personal AI agent OS")
    sub = parser.add_subparsers(dest="cmd")
    s = sub.add_parser("serve", help="Start the ReWoo app (default)")
    s.add_argument("--host")
    s.add_argument("--port", type=int)
    s.add_argument("--no-browser", action="store_true")
    a = sub.add_parser("ask", help="Ask ReWoo something from the terminal")
    a.add_argument("prompt")
    a.add_argument("--helper", default="woo")
    e = sub.add_parser("eval", help="Run the evaluation harness")
    e.add_argument("--suite", default=None, help="Folder or file with scenarios")
    t = sub.add_parser("trace", help="Replay a task's event log")
    t.add_argument("task_id")
    args = parser.parse_args(argv)

    from .config import Config

    cfg = Config.from_env()
    if args.cmd in (None, "serve"):
        import uvicorn

        from .api.app import create_app

        host = getattr(args, "host", None) or cfg.host
        port = getattr(args, "port", None) or cfg.port
        cfg.host, cfg.port = host, port
        from .core import ReWoo

        app = create_app(ReWoo(cfg))
        url = f"http://{'localhost' if host in ('0.0.0.0', '127.0.0.1') else host}:{port}"
        print(f"\n  🟣  ReWoo is running →  {url}\n")
        if not getattr(args, "no_browser", False):
            try:
                webbrowser.open(url)
            except Exception:  # noqa: BLE001
                pass
        uvicorn.run(app, host=host, port=port, log_level="warning")
        return 0

    from .core import ReWoo

    if args.cmd == "ask":
        rw = ReWoo(cfg)

        async def terminal_approver():
            q = rw.bus.subscribe("*")
            loop = asyncio.get_running_loop()
            while True:
                ev = await q.get()
                if ev["type"] == "approval_requested":
                    d = ev["data"]
                    ans = await loop.run_in_executor(None, input, f"\n✋ ReWoo wants to {d.get('label') or d['tool']}: {d.get('input')}\n   Allow? [y/N] ")
                    rw.runtime.decide(d["id"], ans.strip().lower() in ("y", "yes"))

        async def go():
            approver = asyncio.ensure_future(terminal_approver())
            await asyncio.sleep(0)
            task = await rw.ask(args.prompt, args.helper)
            approver.cancel()
            return task

        task = asyncio.run(go())
        print(task.get("result") or task.get("error"))
        return 0 if task["status"] == "done" else 1

    if args.cmd == "eval":
        from .harness.runner import run_suite

        report = asyncio.run(run_suite(args.suite))
        print(json.dumps(report["summary"], indent=2))
        for r in report["results"]:
            mark = "✅" if r["passed"] else "❌"
            print(f"{mark} {r['id']}: {r['name']}" + ("" if r["passed"] else f"  → {'; '.join(r['failures'])}"))
        return 0 if report["summary"]["failed"] == 0 else 1

    if args.cmd == "trace":
        from .harness.replay import print_trace

        return print_trace(ReWoo(cfg), args.task_id)
    return 0


if __name__ == "__main__":
    sys.exit(main())
