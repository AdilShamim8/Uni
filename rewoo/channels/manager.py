"""Starts/stops channel connectors and exposes safe (secret-free) views of them."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

import httpx

from .telegram import TelegramChannel, create_channel, new_pair_code

KINDS = {"telegram": TelegramChannel}


class ChannelManager:
    def __init__(self, app: Any, transport: Optional[httpx.AsyncBaseTransport] = None):
        self.app = app
        self.transport = transport
        self.live: Dict[str, Any] = {}

    def rows(self) -> List[Dict[str, Any]]:
        return self.app.store.query("SELECT * FROM channels ORDER BY created_at")

    @staticmethod
    def public(row: Dict[str, Any]) -> Dict[str, Any]:
        cfg = dict(row.get("config") or {})
        token = cfg.pop("token", "")
        cfg.pop("offset", None)
        return {**{k: v for k, v in row.items() if k != "config"}, "enabled": bool(row.get("enabled")),
                "config": {**cfg, "token_set": bool(token), "token_hint": f"…{token[-4:]}" if len(token) > 8 else ""}}

    def list(self) -> List[Dict[str, Any]]:
        return [self.public(r) for r in self.rows()]

    def add_telegram(self, name: str, token: str, default_bot: str = "woo") -> Dict[str, Any]:
        if ":" not in token:
            raise ValueError("That doesn't look like a Telegram bot token (get one from @BotFather)")
        row = create_channel(self.app.store, name, token, default_bot)
        return self.public(self.app.store.get("channels", row["id"]))

    def connector(self, cid: str):
        row = self.app.store.get("channels", cid)
        if not row:
            raise KeyError(cid)
        if cid not in self.live:
            self.live[cid] = KINDS[row["kind"]](self.app, row, transport=self.transport)
        return self.live[cid]

    def start_all(self) -> None:
        for row in self.rows():
            if row.get("enabled") and (row.get("config") or {}).get("token"):
                self.connector(row["id"]).start()

    async def stop_all(self) -> None:
        for c in list(self.live.values()):
            await c.stop()
        self.live.clear()

    async def set_enabled(self, cid: str, enabled: bool) -> None:
        self.app.store.update("channels", cid, {"enabled": int(enabled)})
        c = self.connector(cid)
        if enabled:
            c.start()
        else:
            await c.stop()

    def update(self, cid: str, **changes: Any) -> Dict[str, Any]:
        row = self.app.store.get("channels", cid)
        if not row:
            raise KeyError(cid)
        cfg = dict(row.get("config") or {})
        if changes.get("rotate_code"):
            cfg["pair_code"] = new_pair_code()
        if changes.get("default_bot"):
            cfg["default_bot"] = changes["default_bot"]
        if changes.get("unpair_all"):
            cfg["allowed_chats"] = []
        upd: Dict[str, Any] = {"config": cfg}
        if changes.get("name"):
            upd["name"] = changes["name"]
        self.app.store.update("channels", cid, upd)
        return self.public(self.app.store.get("channels", cid))

    async def delete(self, cid: str) -> None:
        c = self.live.pop(cid, None)
        if c:
            await c.stop()
        self.app.store.execute("DELETE FROM channel_links WHERE channel_id = ?", [cid])
        self.app.store.delete("channels", cid)
