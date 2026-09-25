"""Request bodies for the HTTP API (Pydantic v1 and v2 compatible)."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel


def dump(model: BaseModel) -> Dict[str, Any]:
    return model.model_dump() if hasattr(model, "model_dump") else model.dict()


class TaskIn(BaseModel):
    prompt: str
    helper_id: str = "woo"
    profile: Optional[str] = None
    thread_id: Optional[str] = None


class MessageIn(BaseModel):
    message: str
    bot_id: Optional[str] = None


class RecipeRun(BaseModel):
    inputs: Dict[str, str] = {}
    thread_id: Optional[str] = None


class Decision(BaseModel):
    approve: bool


class FactIn(BaseModel):
    text: str
    pinned: bool = False
    bot_id: Optional[str] = None


class FactPatch(BaseModel):
    text: Optional[str] = None
    pinned: Optional[bool] = None


class SourcePatch(BaseModel):
    enabled: Optional[bool] = None
    private: Optional[bool] = None
    name: Optional[str] = None


class SearchIn(BaseModel):
    query: str


class ProviderIn(BaseModel):
    id: str
    type: str
    name: str = ""
    base_url: str = ""
    api_key: Optional[str] = None
    model: str = ""
    embed_model: str = ""
    local: bool = False
    enabled: bool = True
    price_in: float = 0.0
    price_out: float = 0.0


class BotIn(BaseModel):
    name: str
    emoji: str = "✨"
    color: str = "#7C5CFF"
    tagline: str = ""
    job: str = ""
    instructions: str = ""
    tools: List[str] = []
    profile: str = "balanced"
    engine: str = "rewoo"
    engine_config: Dict[str, Any] = {}


class FoldersIn(BaseModel):
    folders: List[Dict[str, str]]


class SkillIn(BaseModel):
    name: str
    description: str
    body: str
    bot_id: Optional[str] = None
    status: str = "active"


class SkillPatch(BaseModel):
    description: Optional[str] = None
    body: Optional[str] = None
    status: Optional[str] = None
    bot_id: Optional[str] = None


class RoutineIn(BaseModel):
    bot_id: str = "woo"
    name: str = ""
    prompt: str
    steps: List[str] = []
    schedule: Dict[str, Any] = {"kind": "manual"}
    enabled: bool = True


class RoutinePatch(BaseModel):
    bot_id: Optional[str] = None
    name: Optional[str] = None
    prompt: Optional[str] = None
    steps: Optional[List[str]] = None
    schedule: Optional[Dict[str, Any]] = None
    enabled: Optional[bool] = None


class TeachIn(BaseModel):
    name: str = ""
    schedule: Dict[str, Any] = {"kind": "manual"}
    steps: Optional[List[str]] = None


class TelegramIn(BaseModel):
    name: str = "Telegram"
    token: str
    default_bot: str = "woo"


class ChannelPatch(BaseModel):
    name: Optional[str] = None
    default_bot: Optional[str] = None
    rotate_code: bool = False
    unpair_all: bool = False


class Toggle(BaseModel):
    enabled: bool


class CaseIn(BaseModel):
    title: str
    description: str = ""
    assignee_agent_id: Optional[str] = None
