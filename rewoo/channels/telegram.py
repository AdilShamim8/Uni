"""Telegram channel (Bot API over HTTPS long-polling — works behind NAT, no webhook needed).

Security model (borrowed from OpenClaw's DM pairing idea):
  • The channel only answers chats that are *paired*.
  • To pair, send `/start <pair code>` to your bot. The code is shown in
    ReWoo → Channels and can be rotated anytime.

Commands:
  /start <code>   pair this chat
  /bot <id>       switch which ReWoo Bot answers here (e.g. /bot scout)
  /bots           list Bots
  /new            start a fresh conversation
Anything else is a message to the current Bot. Approvals arrive as messages
with ✅ Allow / ✋ Not now buttons.
"""
from __future__ import annotations

import asyncio
import logging
import secrets
from typing import Any, Dict, List, Optional

import httpx

from ..db import new_id, now

log = logging.getLogger("rewoo.telegram")
API = "https://api.telegram.org"
MAX_LEN = 3900


def new_pair_code() -> str:
    return secrets.token_hex(3).upper()


def split_message(text: str, size: int = MAX_LEN) -> List[str]:
    text = text or "(empty)"
    parts = []
    while len(text) > size:
        cut = text.rfind("\n", 0, size)
        cut = cut if cut > size // 2 else size
        parts.append(text[:cut])
        text = text[cut:].lstrip()
    parts.append(text)
    return parts


class TelegramChannel:
    def __init__(self, app: Any, channel: Dict[str, Any], transport: Optional[httpx.AsyncBaseTransport] = None):
        self.app = app  # the ReWoo core object
        self.channel_id = channel["id"]
        self.transport = transport
        self._task: Optional[asyncio.Task] = None
        self._watchers: Dict[str, asyncio.Task] = {}

    # --------------------------------------------------------------- config
    @property
    def cfg(self) -> Dict[str, Any]:
        row = self.app.store.get("channels", self.channel_id) or {}
        return row.get("config") or {}

    def _save_cfg(self, **changes: Any) -> None:
        cfg = {**self.cfg, **changes}
        self.app.store.update("channels", self.channel_id, {"config": cfg})

    def _status(self, status: str, error: str = "") -> None:
        self.app.store.update("channels", self.channel_id, {"status": status, "last_error": error[:300]})

    # ------------------------------------------------------------------ API
    async def call(self, method: str, **params: Any) -> Any:
        token = self.cfg.get("token")
        if not token:
            raise RuntimeError("Telegram bot token not set")
        timeout = float(params.get("timeout", 0)) + 15
        async with httpx.AsyncClient(timeout=timeout, transport=self.transport) as c:
            r = await c.post(f"{API}/bot{token}/{method}", json=params)
        data = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        if not data.get("ok"):
            raise RuntimeError(data.get("description") or f"Telegram {method} failed ({r.status_code})")
        return data.get("result")

    async def send(self, chat_id: int, text: str, buttons: Optional[List[List[Dict[str, str]]]] = None) -> None:
        for i, part in enumerate(split_message(text)):
            params: Dict[str, Any] = {"chat_id": chat_id, "text": part, "disable_web_page_preview": True}
            if buttons and i == 0:
                params["reply_markup"] = {"inline_keyboard": buttons}
            await self.call("sendMessage", **params)

    # ------------------------------------------------------------ lifecycle
    def start(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.ensure_future(self._poll_forever())

    async def stop(self) -> None:
        for t in [self._task, *self._watchers.values()]:
            if t:
                t.cancel()
        self._watchers.clear()
        self._task = None
        self._status("stopped")

    async def verify(self) -> Dict[str, Any]:
        me = await self.call("getMe")
        self._save_cfg(bot_username=me.get("username", ""))
        return me

    async def _poll_forever(self) -> None:
        backoff = 2.0
        while True:
            try:
                await self.poll_once(timeout=25)
                backoff = 2.0
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 - keep the channel alive
                self._status("error", str(exc))
                log.warning("telegram poll failed: %s", exc)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 60)

    async def poll_once(self, timeout: int = 0) -> int:
        offset = int(self.cfg.get("offset", 0))
        updates = await self.call("getUpdates", offset=offset, timeout=timeout, allowed_updates=["message", "callback_query"])
        self._status("running")
        for u in updates or []:
            self._save_cfg(offset=int(u["update_id"]) + 1)
            try:
                await self.handle(u)
            except Exception as exc:  # noqa: BLE001
                log.warning("telegram update failed: %s", exc)
        return len(updates or [])

    # -------------------------------------------------------------- routing
    def _link(self, chat_id: int) -> Dict[str, Any]:
        key = f"telegram:{self.channel_id}:{chat_id}"
        row = self.app.store.one("SELECT * FROM channel_links WHERE key = ?", [key])
        if row:
            return row
        bot = self.cfg.get("default_bot") or "woo"
        row = {"key": key, "channel_id": self.channel_id, "thread_id": None, "bot_id": bot, "created_at": now()}
        self.app.store.execute("INSERT INTO channel_links (key, channel_id, thread_id, bot_id, created_at) VALUES (?,?,?,?,?)",
                               [key, self.channel_id, None, bot, row["created_at"]])
        return row

    def _update_link(self, chat_id: int, **changes: Any) -> None:
        key = f"telegram:{self.channel_id}:{chat_id}"
        for k, v in changes.items():
            self.app.store.execute(f"UPDATE channel_links SET {k} = ? WHERE key = ?", [v, key])

    def _allowed(self, chat_id: int) -> bool:
        return chat_id in [int(x) for x in self.cfg.get("allowed_chats", [])]

    async def handle(self, update: Dict[str, Any]) -> None:
        if "callback_query" in update:
            await self._on_callback(update["callback_query"])
            return
        msg = update.get("message") or {}
        chat_id = (msg.get("chat") or {}).get("id")
        text = (msg.get("text") or "").strip()
        if not chat_id or not text:
            return
        if text.startswith("/start"):
            code = text.split(maxsplit=1)[1].strip().upper() if " " in text else ""
            if self._allowed(chat_id):
                await self.send(chat_id, "You're already paired. Just message me! (/bots to see the team)")
            elif code and code == str(self.cfg.get("pair_code", "")).upper():
                self._save_cfg(allowed_chats=[*self.cfg.get("allowed_chats", []), chat_id])
                await self.send(chat_id, "Paired with ReWoo. Message me anything. Commands: /bots, /bot <id>, /new")
            else:
                await self.send(chat_id, "Hi! To pair, send /start <code>. You'll find the code in ReWoo → Channels.")
            return
        if not self._allowed(chat_id):
            await self.send(chat_id, "This chat isn't paired yet. Send /start <code> (see ReWoo → Channels).")
            return
        link = self._link(chat_id)
        if text == "/bots":
            lines = [f"{h['emoji']} {h['id']} — {h['name']}: {h['tagline']}" for h in self.app.helpers.all()]
            await self.send(chat_id, "Your Bots:\n" + "\n".join(lines) + f"\n\nNow talking to: {link['bot_id']}")
            return
        if text.startswith("/bot"):
            want = text.split(maxsplit=1)[1].strip().lower() if " " in text else ""
            if not self.app.helpers.exists(want):
                await self.send(chat_id, "Unknown Bot. Send /bots to see who's on the team.")
                return
            self._update_link(chat_id, bot_id=want, thread_id=None)
            h = self.app.helpers.get(want)
            await self.send(chat_id, f"Now talking to {h['emoji']} {h['name']}.")
            return
        if text == "/new":
            self._update_link(chat_id, thread_id=None)
            await self.send(chat_id, "Fresh conversation started.")
            return
        task = self.app.runtime.create_task(text, link["bot_id"], thread_id=link["thread_id"], origin="telegram")
        if not link["thread_id"]:
            self._update_link(chat_id, thread_id=task["thread_id"])
        await self.call("sendChatAction", chat_id=chat_id, action="typing")
        self._watchers[task["id"]] = asyncio.ensure_future(self._watch(chat_id, task["id"]))
        self.app.runtime.start(task["id"])

    async def _watch(self, chat_id: int, task_id: str) -> None:
        q = self.app.bus.subscribe(task_id)
        try:
            while True:
                ev = await q.get()
                d = ev["data"]
                if ev["type"] == "approval_requested":
                    detail = ", ".join(f"{k}: {v}" for k, v in (d.get("input") or {}).items())
                    await self.send(chat_id, f"✋ Can I {str(d.get('label') or d['tool']).lower()}?\n{detail}\n{d.get('reason', '')}",
                                    buttons=[[{"text": "✅ Allow", "callback_data": f"ap:{d['id']}:y"},
                                              {"text": "✋ Not now", "callback_data": f"ap:{d['id']}:n"}]])
                elif ev["type"] == "skill_proposed":
                    await self.send(chat_id, f"💡 I learned a reusable skill: “{d['skill']['name']}”. Review it in ReWoo → Skills.")
                elif ev["type"] == "answer" and not d.get("depth"):
                    await self.send(chat_id, d.get("text", ""))
                elif ev["type"] in ("error", "stopped", "cancelled"):
                    await self.send(chat_id, d.get("message") or ev["type"])
                    return
                elif ev["type"] == "done":
                    return
        finally:
            self.app.bus.unsubscribe(task_id, q)
            self._watchers.pop(task_id, None)

    async def _on_callback(self, cq: Dict[str, Any]) -> None:
        data = cq.get("data") or ""
        chat_id = ((cq.get("message") or {}).get("chat") or {}).get("id")
        if not data.startswith("ap:") or not chat_id or not self._allowed(chat_id):
            await self.call("answerCallbackQuery", callback_query_id=cq["id"])
            return
        _, aid, choice = data.split(":", 2)
        ok = self.app.runtime.decide(aid, choice == "y")
        await self.call("answerCallbackQuery", callback_query_id=cq["id"],
                        text=("Allowed" if choice == "y" else "Skipped") if ok else "Already answered")


def create_channel(store, name: str, token: str, default_bot: str = "woo") -> Dict[str, Any]:
    row = {"id": new_id("ch_"), "kind": "telegram", "name": name or "Telegram",
           "config": {"token": token.strip(), "default_bot": default_bot, "allowed_chats": [], "pair_code": new_pair_code(), "offset": 0},
           "enabled": 1, "status": "idle"}
    store.insert("channels", row)
    return row
