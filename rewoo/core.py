"""Wires every subsystem together. One object = one ReWoo."""
from __future__ import annotations

from typing import Optional

import httpx

from .agent.helpers import Helpers
from .agent.runtime import AgentRuntime
from .config import Config
from .connectors.gdrive import GoogleDrive
from .db import Store
from .events import EventBus
from .memory.store import Memory
from .models.router import Router
from .recipes import load_recipes
from .tools.builtin import default_registry


class ReWoo:
    def __init__(self, config: Optional[Config] = None, db_path: Optional[str] = None,
                 transport: Optional[httpx.AsyncBaseTransport] = None, bootstrap_env: bool = True):
        self.config = config or Config.from_env()
        self.store = Store(db_path or self.config.db_path)
        self.bus = EventBus(self.store)
        self.memory = Memory(self.store)
        self.router = Router(self.store, transport=transport, bootstrap_env=bootstrap_env)
        self.tools = default_registry()
        self.helpers = Helpers(self.store)
        self.runtime = AgentRuntime(self.store, self.bus, self.router, self.memory, self.tools, self.helpers, http_transport=transport)
        self.drive = GoogleDrive(self.store, self.memory, self.config.google_client_id, self.config.google_client_secret,
                                 redirect_uri=f"{self.config.base_url}/api/drive/callback", transport=transport)

    def recipes(self):
        return load_recipes(self.config.data_dir / "recipes")

    async def ask(self, prompt: str, helper: str = "woo", profile: Optional[str] = None) -> dict:
        """Run a task to completion (used by the CLI, tests and the eval harness).

        Approval requests are auto-answered according to `auto_approve`
        (setting) — interactive approvals happen in the UI.
        """
        task = self.runtime.create_task(prompt, helper, profile)
        return await self.runtime.run(task["id"])
