# Changelog

All notable changes to Uni are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) with the repo's
existing `type(scope): summary` commit vocabulary.

## [Unreleased] — CI repair wave

*Shipped 29 October 2026 — 6 commits, each pushed individually. Final
verification: CI run #107 fully green on GitHub Actions (contracts,
frontend, backend) — the backend job's first green run in repo history.*

### Fixed — backend

- **Backend CI job green on GitHub Actions for the first time.** The
  integration-test scratch root hardcoded one machine's absolute path
  (`/home/z/my-project/.tmp`), so every runner failed in beforeAll with
  `EACCES: permission denied, mkdir '/home/z'`. It now resolves from the
  `UNI_TEST_SCRATCH_ROOT` environment variable when set, else
  `<os.tmpdir()>/uni-backend-tests` — writable on dev laptops and CI
  runners alike.
- **Teardown no longer buries the real error.** A failed beforeAll used
  to cascade `TypeError: Cannot read properties of undefined` from
  afterAll in all 10 integration suites. Every teardown reference is now
  guarded, so the suite reports exactly one error: the real one.
- **Run finalization is atomic.** The terminal status, the assistant
  transcript node, and the active-leaf advance now commit in a single
  transaction. Previously the status became visible before the node was
  durable, so a cancel-then-reload could momentarily show a finished run
  with no assistant message — a race CI's slower runners reliably lost.
- **Cancel test is deterministic.** It waits for a real streamed chunk on
  the live SSE stream before cancelling, replacing a fixed 400ms sleep
  that raced first-token latency.

### Documentation

- `UNI_TEST_SCRATCH_ROOT` documented in `backend/README.md` and
  `CONTRIBUTING.md`; the three commit checks (CI, GitHub Pages, Vercel)
  explained in `CONTRIBUTING.md` and the README troubleshooting section —
  including that "Vercel — rate limited — retry in 24 hours" is an
  external account quota that auto-retries, not a repository defect.

## [Unreleased] — provider freedom wave

*Shipped 29 October 2026 — 91 commits (210 → 300), each pushed
individually. Final verification: frontend 339/339 + lint clean, backend
105/105, contracts clean.*

This wave makes "bring your own key" effortless for beginners and hardens
the honesty of connection tests.

### Added — frontend

- **Suggested models per provider.** The provider form now shows one-tap
  model chips matched to the endpoint being configured — OpenAI (GPT-6.1
  Terra / GPT-5.5 / GPT-4o mini…), Anthropic (Claude Opus/Sonnet/Haiku
  5.5…), Google Gemini, xAI Grok, DeepSeek, Groq, Mistral, OpenRouter,
  Cerebras, Together, Fireworks, Perplexity, SambaNova, NVIDIA NIM,
  GitHub Models, HuggingFace Router, Cohere, Alibaba DashScope (Qwen),
  Zhipu GLM, and local servers (Ollama / LM Studio / vLLM tags).
  Suggestions are quick-fills: every entry stays editable, and connecting
  a key still discovers the endpoint's live model list.
- **Ten more one-tap provider presets** with endpoints prefilled:
  Cerebras, Fireworks, Perplexity, SambaNova, NVIDIA NIM, Cohere,
  GitHub Models, HuggingFace Router, Alibaba DashScope (Qwen), Zhipu GLM.
- **Free-tier markers.** Presets whose provider offers a no-cost tier
  (Google AI Studio, Groq, OpenRouter free models, Mistral, Cerebras,
  SambaNova, NVIDIA NIM, GitHub Models, HuggingFace Router, DashScope,
  Zhipu, and fully-free local servers) now show a green `FREE` badge —
  Uni itself costs nothing, and these keys can too.
- **Long model lists collapse.** Providers with many discovered models
  (OpenRouter exposes hundreds) show the first 12 chips plus a
  "+N more models" toggle, with the total count in the section label.
- **OpenRouter free-first discovery.** When an OpenRouter endpoint is
  connected, discovered `:free` models are listed before paid ones.

### Fixed — frontend

- **Honest OpenRouter connection tests.** OpenRouter's `/models` catalog
  is public — a wrong key still returns a model list, so the old test
  claimed "Connected" and the first chat then failed with 401. The test
  now also verifies the key against OpenRouter's auth-protected `/key`
  endpoint and reports rejection honestly.
- **OpenRouter attribution.** Live chat requests to OpenRouter now carry
  the optional `X-Title: Uni` header (attribution, as their docs
  recommend).

### Fixed — backend

- **Server-side provider tests verify OpenRouter keys** against
  `/key` (same rationale as the frontend fix) and order OpenRouter
  discovery with the free tier first. Credentials remain encrypted at
  rest and redacted in every response.

### Tests

- Frontend: 339 tests green (was 321, +18) — new suites for suggested-model
  matching, catalog coverage and uniqueness, preset free-tier rendering,
  one-tap model add, model-list collapse, OpenRouter `/key` verification,
  free-first ordering, and `X-Title` attribution.
- Backend: 105 tests green (was 103) — new suite proving the OpenRouter
  key verification end-to-end with mocked DNS + fetch (no network).

### Infrastructure

- GitHub Actions CI: contracts build + typecheck, frontend typecheck +
  lint + tests, backend typecheck + integration tests (embedded
  PostgreSQL; no service container needed).

## Earlier history

The project's detailed history lives in the git log (conventional
`type(scope): summary` commits) and the per-milestone records in
`docs/` and `frontend/docs/`.
