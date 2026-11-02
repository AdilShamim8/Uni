# Provider compatibility matrix

Uni speaks two provider wire protocols today. This matrix states, per
protocol and per surface, what is supported, how it is verified, and
what it costs to use. It is the single reference the settings UI, the
backend adapters, and the smoke harness agree on (U020).

## Protocols and surfaces

| Surface | `openai-compatible` | `anthropic` |
| --- | --- | --- |
| Discovery (`GET {base}/models`) | Supported. Base used as configured (`as-configured` policy) — `…/v1` or a gateway prefix both work. Catalog bounded at 2 MB / 2 000 parsed ids. | Supported. Base normalized to the versioned API (`versioned-v1` policy): root, `/v1`, and gateway prefixes never double. Same bounds. |
| Generation (`POST …/chat/completions` · `POST {base}/v1/messages`) | Supported, streamed (SSE). | Supported, streamed (SSE). |
| Credential transport | `Authorization: Bearer <key>` — or **no header at all** for genuinely no-auth local runtimes (Ollama, LM Studio). | `x-api-key` + `anthropic-version`. A credential is required; there is no keyless Anthropic. |
| Key verification | Discovery +, for OpenRouter, the auth-protected `/key` endpoint (verified / rejected / unknown are distinct). Manual-model endpoints verify by a one-token generation instead (U017). | Discovery proves the key (401/403 = rejected; 2xx = verified). |
| No-`/models` endpoints | Supported through manual model entry + generation verification (U017). | Same. |
| Operator egress policy | Enforced by the URL guard on every outbound request regardless of credentials: hosted deployments reject private/loopback/masked targets; local endpoints require the explicit local-endpoint policy (U002/U003/U012). | Same. |

## Deterministic verification (what runs in CI)

Every combination above is covered by **deterministic fake adapters** in
the test suites — local HTTP servers speaking the real wire shapes,
with no network access and no credentials:

- Backend: `tests/providers-*.test.ts`, `tests/runs.integration.test.ts`
  (discovery, verification states, body caps, manual models, no-auth,
  secret redaction, streamed runs).
- Frontend: `tests/byok.test.ts`, `tests/providerDescriptors.test.ts`,
  `tests/connectionBounds.test.ts`, `tests/manualModel.test.ts`,
  `tests/sseProtocol.test.ts` (browser-side discovery, streaming,
  capability metadata, bounds, cancellation).

These suites never contact a real provider and never see a real key.

## Opt-in smoke harness (real providers, recorded separately)

`backend/scripts/provider-smoke.mjs` runs the SAME surfaces against
REAL configured providers, opt-in only:

```bash
cd backend
SMOKE_PROVIDERS='[
  {"label":"groq","endpointUrl":"https://api.groq.com/openai/v1","kind":"openai-compatible","apiKey":"gsk-…","modelId":"llama-3.1-8b-instant"}
]' node scripts/provider-smoke.mjs
```

- **Cost and credentials are explicit.** Each provider entry needs its
  own key supplied via the environment (never committed); each run
  performs one real one-token generation, which may consume quota or
  cost tokens on paid accounts.
- Results (endpoint host, protocol, discovery outcome, generation
  outcome, latency, timestamp — never the key) are written to
  `backend/smoke-results.json` (git-ignored), separate from the
  deterministic suite results.
- A failing smoke run does not fail CI: it is evidence about a real
  provider at a point in time, not a contract of the codebase.

## Curated free routes (credential and cost summary)

| Route | Credential | Cost |
| --- | --- | --- |
| Groq | API key (console.groq.com) | Free tier, daily request limits |
| Google AI Studio · Gemini | API key (aistudio.google.com) | Free tier, per-minute limits |
| OpenRouter `:free` models | API key (openrouter.ai) | `$0` for ids ending `:free` |
| Mistral | API key (console.mistral.ai) | Free experiment plan |
| Cerebras | API key (cloud.cerebras.ai) | Free tier, daily limits |
| NVIDIA NIM | API key (build.nvidia.com) | Free signup credits |
| HuggingFace Router | Token with Inference permission | Free monthly credits |
| Ollama / LM Studio (local) | **None** | Free, runs on your machine |

GitHub Models was retired as a curated route (U018); existing profiles
keep working unchanged and nothing is migrated automatically.
