# Security

## Threat model (v0.2)

ReWoo is a **single-user app that runs on your own computer**. By default it listens on
`127.0.0.1` only. It is not multi-tenant, and it is not meant to be exposed to the internet
without an authenticating reverse proxy.

## Built-in protections

| Area | Protection |
|---|---|
| Web app / `/api` | Optional `REWOO_ACCESS_TOKEN` (bearer header or httpOnly cookie). Security headers (`nosniff`, `same-origin` referrer). |
| OpenAI-compatible `/v1` | Always requires the ReWoo API key (constant-time compare). Rotate it in Connections → API. |
| Paperclip webhook | Disabled until you set a secret. `X-ReWoo-Secret` is checked with a constant-time compare. |
| Telegram | Only **paired** chats are answered (`/start <code>`). Codes can be rotated and chats unpaired. |
| `web_fetch` tool | SSRF guard on **every redirect hop** (no localhost, private, link-local or reserved IPs). 2 MB body cap. Approval-gated in *Careful* mode. |
| Static files | Served only from inside `rewoo/web/dist` (resolved-path check, no traversal). |
| Google OAuth | `drive.readonly` scope. `state` values are single-use, expire after 10 minutes, and at most 50 can be pending. |
| Secrets in prompts | API keys, tokens, passwords, private keys and card-like numbers are redacted before any remote model or engine call. |
| Private data | Sources marked Private are only ever sent to on-device brains. A task that has included private data can't fall back to a remote brain. |
| Tools | Risk levels (safe / external / memory / irreversible) with approval modes. No tool can send email or messages on your behalf. |
| Calculator | AST-restricted arithmetic (no `eval`, no names, bounded exponents). |
| Stored credentials | API keys live in your local SQLite file and are never returned by the API (only a hint like `…abcd`). |

## Engines

The OpenClaw gateway token and the Hermes `API_SERVER_KEY` grant operator-level access to those
systems. Keep them on localhost or a private network. Paperclip's `http` adapter refuses private
URLs unless you allowlist ReWoo's exact origin (`PAPERCLIP_HTTP_ADAPTER_PRIVATE_ENDPOINT_ALLOWLIST`),
so only allowlist the one origin you need.

## Reporting a vulnerability

Please email **adilshamim696@gmail.com** with details and steps to reproduce. Don't open a public
issue for security problems. You'll get an acknowledgement within 72 hours.
