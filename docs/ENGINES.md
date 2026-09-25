# Engines: Hermes Agent, OpenClaw and Paperclip

ReWoo merges three open-source agent systems into one product. Their full source is included in
[`engines/`](../engines/README.md). Each is **optional**: ReWoo runs on its own, and every engine
is a power-up you switch on under **Connections → Engines**.

```
                    ┌──────────────────────────── ReWoo ────────────────────────────┐
  WhatsApp, Slack,  │  Bots · Threads · Routines · Skills · Private memory · Consent │
  Discord, Signal ──┤                                                                │
  (via OpenClaw)    │   /v1/chat/completions ◄── OpenClaw / Hermes / any OpenAI app  │
  Telegram (native)─┤   /api/paperclip/heartbeat ◄── Paperclip "http" adapter        │
                    │   Bot engine = hermes ──► Hermes API server / CLI              │
                    │   Bot engine = openclaw ──► OpenClaw gateway /v1               │
                    └────────────────────────────────────────────────────────────────┘
```

## What was verified live (2026-09-25)

| Integration | Direction | Status | How it was tested |
|---|---|---|---|
| Hermes Agent uses a ReWoo Bot as its model | Hermes → ReWoo | ✅ **live** | `hermes chat -q "Calculate 1250 * 12" --provider rewoo -m rewoo/tally` against a running ReWoo. Task appeared in ReWoo with `origin=api`, and Hermes printed ReWoo's answer. |
| ReWoo Bot powered by Hermes CLI | ReWoo → Hermes | ✅ **live** | Bot with `engine=hermes`, `mode=cli`, running `hermes-agent` 2026 (Python 3.12). The answer streamed back and the full event trail was recorded. |
| Paperclip hires a ReWoo Bot (`http` adapter heartbeat) | Paperclip → ReWoo | ✅ **live** | `npx paperclipai test-drive` (server 2026.916.1). Created an agent with `adapterType: "http"` and invoked a heartbeat. The Paperclip run reported `succeeded`, and ReWoo's Tally ran the task (`origin=paperclip`). |
| Paperclip issue → ReWoo Bot → result on the issue | full loop | ✅ **live** | Created issue TES-7 "Calculate 1500 * 4" assigned to the ReWoo-backed agent. Paperclip woke the agent, ReWoo's Tally answered **6,000**, and ReWoo posted **one** comment on the issue and set it to `done`. Duplicate wakes for closed issues are skipped. |
| ReWoo → Paperclip REST | ReWoo → Paperclip | ✅ **live** | Listed agents (the CEO), created an issue assigned to the ReWoo-backed agent, and woke an agent from ReWoo. |
| OpenClaw agent uses a ReWoo Bot as its model | OpenClaw → ReWoo | ✅ **live** | OpenClaw 2026.9.6 gateway (Node 24.16) with `models.providers.rewoo` and `agents.defaults.model.primary = "rewoo/woo"`. `POST :18789/v1/chat/completions` "Calculate 7 * 8" returned **56** from ReWoo. The live test found OpenClaw's context-block wrapping, which is handled now. |
| ReWoo Bot powered by OpenClaw | ReWoo → OpenClaw | ✅ **live** | Bot with `engine=openclaw` (`openclaw/default`). "Calculate 12 * 12" came back as a streamed answer of **144** (10 deltas). |

## Hermes Agent (Nous Research, MIT)

**What it adds:** a self-improving agent with a large skills library. ReWoo's own skill loop writes the
same `SKILL.md` format, and **Skills → Import Hermes library** loads the 200+ skills bundled in
`engines/hermes-agent/skills` and `optional-skills` (off by default; switch on what you want).

**Install:** `pip install hermes-agent` (Python 3.11+), then `hermes setup`.

### Hermes → ReWoo (Hermes uses your ReWoo Bots, with memory and consent)

`~/.hermes/config.yaml`:

```yaml
model:
  default: rewoo/woo
  provider: rewoo
providers:
  rewoo:
    base_url: "http://127.0.0.1:8787/v1"
    key_env: REWOO_API_KEY          # export REWOO_API_KEY=<ReWoo → Connections → API → key>
```

```bash
hermes chat -q "Brief me on my lease" --provider rewoo -m rewoo/scout
```

> Don't add `api: openai-completions` under `providers:`. That key is read differently there.
> The block above is exactly what was verified.

### ReWoo → Hermes (a ReWoo Bot runs on Hermes)

*Connections → Engines → Hermes Agent → Configure*:

- **API mode** (recommended for servers): enable Hermes' `api_server` gateway platform (OpenAI-compatible, default
  `http://127.0.0.1:8642/v1`, auth `API_SERVER_KEY`). Enter the URL + key.
- **CLI mode**: set *Mode* = `cli` and *CLI command* = the path to `hermes`. ReWoo runs `hermes chat -q "<request + context>" -Q`.

Then **Team → New Bot → Engine: Hermes Agent**. ReWoo still picks the relevant private context, applies
privacy rules (engines are treated as remote unless you mark them local), streams the answer and
records a receipt.

## OpenClaw (OpenClaw Foundation, MIT)

**What it adds:** one gateway for 20+ chat apps (WhatsApp, Telegram, Slack, Discord, Google Chat,
Signal, iMessage, Teams, Matrix…), with DM pairing. ReWoo ships a native Telegram channel. Use
OpenClaw for everything else.

**Install:** Node ≥ 24.16, then `npm install -g openclaw@latest`, `openclaw onboard` and `openclaw gateway` (port 18789).

### OpenClaw → ReWoo (every chat app reaches your ReWoo Bots)

`~/.openclaw/openclaw.json`:

```json5
{
  "models": {
    "providers": {
      "rewoo": {
        "baseUrl": "http://127.0.0.1:8787/v1",
        "apiKey": "<ReWoo API key>",
        "api": "openai-completions",
        "models": [{ "id": "woo", "name": "ReWoo Woo" }, { "id": "scout", "name": "ReWoo Scout" }]
      }
    }
  },
  "agents": { "defaults": { "model": { "primary": "rewoo/woo" } } }
}
```

`agents.defaults.model.primary` is `<provider id>/<model id>`, and each model `id` is a ReWoo Bot id
(`woo`, `scout`, `quill`…). This exact config was verified with OpenClaw 2026.9.6.

### ReWoo → OpenClaw (a ReWoo Bot runs on an OpenClaw agent)

Enable the gateway's OpenAI endpoint (`gateway.http.endpoints.chatCompletions.enabled: true`) and
note the gateway token (`gateway.auth.token` / `OPENCLAW_GATEWAY_TOKEN`). In ReWoo enter:
URL `http://127.0.0.1:18789/v1`, the token, and the agent id (`default` or your agent). ReWoo calls
`model: "openclaw/<agent>"`.

> The gateway token grants operator access to OpenClaw. Keep both apps on localhost or a private network.

## Paperclip (Paperclip AI, MIT)

**What it adds:** a control plane for a whole AI company (org chart, goals, budgets, heartbeats,
issues, governance). ReWoo Bots can be **hired** into it. From ReWoo you can see its agents, create and
assign issues, and wake agents.

**Install:** Node ≥ 24.11, then `npx paperclipai test-drive` (embedded Postgres, no setup) → http://127.0.0.1:3100.

### Paperclip → ReWoo (hire a ReWoo Bot)

1. **ReWoo → Connections → Engines → Paperclip → Configure:** set a *Webhook secret* (and optionally
   the Paperclip URL and company id so ReWoo can show agents and issues).
2. **Allow ReWoo's local address in Paperclip.** Paperclip's `http` adapter refuses private URLs by
   default, which is a good SSRF guard. Add this to your Paperclip instance's `.env`
   (e.g. `~/.paperclip/instances/default/.env`) and restart Paperclip:
   ```
   PAPERCLIP_HTTP_ADAPTER_PRIVATE_ENDPOINT_ALLOWLIST=http://127.0.0.1:8787
   ```
3. **Hire the agent** (Paperclip UI, or REST):
   ```bash
   curl -X POST http://127.0.0.1:3100/api/companies/<companyId>/agents -H 'content-type: application/json' -d '{
     "name": "Tally (ReWoo)", "role": "general", "adapterType": "http",
     "adapterConfig": {
       "url": "http://127.0.0.1:8787/api/paperclip/heartbeat",
       "headers": {"X-ReWoo-Secret": "<your webhook secret>"},
       "payloadTemplate": {"rewooBot": "tally"}
     }}'
   ```
4. **Assign it work.** Create an issue in Paperclip and assign it to that agent. Paperclip wakes the agent,
   ReWoo runs the Bot on the issue's title and description (Paperclip's run notes are kept as context),
   then **reports back**: it posts the answer as a comment and sets the issue to `done`, or to `blocked`
   with the reason if the Bot couldn't finish. Wakes for already-closed issues are skipped. Everything is
   visible in ReWoo with receipts and approvals, with one conversation per Paperclip agent. To turn off
   reporting back, set `paperclip_report: false`.

## Running everything with Docker

```bash
docker compose up                      # ReWoo only
docker compose --profile engines up    # + Paperclip (3100) and Hermes Agent (8642)
```

See `docker-compose.yml`. Engine containers build from the vendored sources in `engines/`.
