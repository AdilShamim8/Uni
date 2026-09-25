"""Wires every subsystem together. One object = one ReWoo."""
from __future__ import annotations

import secrets
from pathlib import Path
from typing import Optional

import httpx

from .agent.helpers import Helpers
from .agent.routines import Routines, Scheduler, build_prompt
from .agent.runtime import AgentRuntime
from .agent.skills import Skills
from .agent.threads import Threads
from .channels import ChannelManager
from .config import Config
from .connectors.gdrive import GoogleDrive
from .db import Store
from .engines import EngineHub
from .events import EventBus
from .memory.store import Memory
from .models.router import Router
from .recipes import load_recipes
from .tools.builtin import default_registry

REPO_ROOT = Path(__file__).resolve().parents[1]


class ReWoo:
    def __init__(self, config: Optional[Config] = None, db_path: Optional[str] = None,
                 transport: Optional[httpx.AsyncBaseTransport] = None, bootstrap_env: bool = True):
        self.config = config or Config.from_env()
        self.config.data_dir.mkdir(parents=True, exist_ok=True)
        self.store = Store(db_path or self.config.db_path)
        self.bus = EventBus(self.store)
        self.memory = Memory(self.store)
        self.router = Router(self.store, transport=transport, bootstrap_env=bootstrap_env)
        self.tools = default_registry()
        self.helpers = Helpers(self.store)
        self.skills = Skills(self.store, self.config.data_dir / "skills")
        self.threads = Threads(self.store)
        self.engines = EngineHub(self.store, transport=transport)
        self.runtime = AgentRuntime(self.store, self.bus, self.router, self.memory, self.tools, self.helpers,
                                    http_transport=transport, skills=self.skills, threads=self.threads, engines=self.engines)
        self.routines = Routines(self.store)
        self.scheduler = Scheduler(self.routines, self.start_routine)
        self.channels = ChannelManager(self, transport=transport)
        self.drive = GoogleDrive(self.store, self.memory, self.config.google_client_id, self.config.google_client_secret,
                                 redirect_uri=f"{self.config.base_url}/api/drive/callback", transport=transport)
        if not self.store.get_setting("api_key"):
            self.store.set_setting("api_key", "rw-" + secrets.token_urlsafe(24))

    # ------------------------------------------------------------ lifecycle
    def close(self) -> None:
        """Release resources (database connection). Safe to call twice."""
        self.store.close()

    def __enter__(self) -> "ReWoo":
        return self

    def __exit__(self, *exc) -> None:
        self.close()

    async def start_background(self) -> None:
        """Recover interrupted work, then start the heartbeat scheduler and channel connectors."""
        self.runtime.recover()
        self.scheduler.start()
        self.channels.start_all()

    async def stop_background(self) -> None:
        await self.scheduler.stop()
        await self.channels.stop_all()

    # ------------------------------------------------------------- helpers
    def recipes(self):
        return load_recipes(self.config.data_dir / "recipes")

    def start_routine(self, routine: dict) -> dict:
        """Start one run of a routine (continues the routine's own conversation)."""
        thread_id = None
        if routine.get("last_task_id"):
            last = self.store.get("tasks", routine["last_task_id"])
            thread_id = last.get("thread_id") if last else None
        task = self.runtime.create_task(build_prompt(routine), routine.get("bot_id") or "woo", thread_id=thread_id,
                                        origin="routine", routine_id=routine["id"])
        self.runtime.start(task["id"])
        return task

    @staticmethod
    def hermes_skill_roots() -> list:
        """Skill libraries shipped inside the vendored Hermes Agent source (MIT)."""
        base = REPO_ROOT / "engines" / "hermes-agent"
        return [p for p in (base / "skills", base / "optional-skills") if p.exists()]

    async def ask(self, prompt: str, helper: str = "woo", profile: Optional[str] = None, thread_id: Optional[str] = None) -> dict:
        """Run a task to completion (used by the CLI, tests and the eval harness).

        Approvals are answered elsewhere (UI, channel, or `harness.runner.auto_approver`).
        """
        task = self.runtime.create_task(prompt, helper, profile, thread_id=thread_id)
        return await self.runtime.run(task["id"])
