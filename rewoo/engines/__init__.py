"""Engines: plug full agent runtimes into ReWoo as Bots.

ReWoo's own runtime ("rewoo") is always available. Two external agent engines
can power individual Bots, and one orchestration engine can hire ReWoo Bots:

  • Hermes Agent (Nous Research, MIT)   — self-improving agent; talks to its
    OpenAI-compatible API server (default http://127.0.0.1:8642/v1), or runs
    its one-shot CLI (`hermes chat -q ... -Q`).
  • OpenClaw (OpenClaw Foundation, MIT) — the "works where you work" gateway;
    talks to its OpenAI-compatible endpoint (default http://127.0.0.1:18789/v1,
    `model: openclaw/<agentId>`).
  • Paperclip (Paperclip AI, MIT)       — the AI-company control plane; its
    generic `http` adapter sends heartbeats to ReWoo (`/api/paperclip/heartbeat`),
    and ReWoo can read agents/issues (and create issues) through Paperclip's REST API.

Full upstream sources are vendored in `engines/` at the repository root (see
engines/README.md and THIRD_PARTY_NOTICES.md). Each engine is optional.
"""
from .hub import EngineHub, ENGINE_INFO  # noqa: F401
