"""Channels: talk to your Bots where you already are.

Inspired by OpenClaw (MIT): one gateway, many chat surfaces, with DM pairing so
strangers can't talk to your agent. ReWoo ships a native Telegram channel
(no extra software needed); for WhatsApp, Slack, Discord, Signal, iMessage and
more, run the vendored OpenClaw gateway and point it at ReWoo's
OpenAI-compatible endpoint (see docs/ENGINES.md).
"""
from .manager import ChannelManager  # noqa: F401
