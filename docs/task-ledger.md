# Task ledger — audit repair waves

Item ID → commit SHA → acceptance evidence → remaining limits. Source
backlog: `Uni_100_Work_Items.md` (2 Nov 2026). Only completed items are
listed here; nothing is marked complete without its tests in the same
commit.

## Wave 1 — urgent correctness/security (2026-11-02, branch `task/urgent-correctness-wave1`)

| Item | Commit | Evidence | Remaining limits |
| --- | --- | --- | --- |
| U001 baseline | `add8fd819` | Fresh clean-clone run at audited HEAD `1c5ba05f6`: contracts build+typecheck, frontend lint/build/446 tests, backend typecheck/build + 117/117 incl. all DB suites (embedded PG works under this non-root account) — recorded in verification.md | None |
| U002 IPv6/IPv4 guard | `223dc3401` | CIDR-derived family-scoped ranges; 46 validation-only tests, 21 red against old code; fc00/fd00/fe80/ff02/::1/mapped/translated/Teredo/6to4/NAT64 + cloud metadata all rejected, public v4/v6 accepted | Ranges reviewed against IANA registries; no private address was ever contacted |
| U003 guarded transport | `a8dfbbb28` | One pinned transport for discovery+probes+SDK generation; tests pin DNS to names with no OS record (success only via validated address); redirects refused; deadline/caller abort cancel real sockets; fake-provider SDK e2e through the transport | Body-size bounding deferred to U016 |
| U004 OpenRouter verify | `4d296b10d` | Three-state /key outcome (verified/rejected/unknown); 429/500/network/non-JSON never report verified nor claim invalid; provider row never marked connected by inconclusive checks; both sides tested | Full 4-state health model (reachable/catalog/credential/generation) is U011+ |
| U005 catalog clipping | `0971644d7` | Free model beyond 205 early paid ids stays discoverable on both sides (reproduced first); parse bounded at 2000, classification/ordering before caps | Provider-side pagination/search is U005 follow-up in Wave 2 UX |
| U006 Anthropic bases | `5370f06ff` | anthropicApiBase shared by discovery+generation on both sides; root, /v1, gateway prefix, trailing slash covered incl. no /v1 doubling; SDK request path proven via fake Anthropic SSE server | — |
| U007 BYOK terminal evidence | `e4dc019d2` | onDone now complete/stopped/interrupted; [DONE]/finish_reason/message_stop tracked; delta-then-EOF ends interrupted on both protocols; store marks stopped with honest prefix; Work keeps stoppedPartial | — |
| U008 server SSE client | `62cc531fc` | Shared standards parser (CRLF, multiline, split UTF-8, trailing frames); runtime-validated events deduped by sequence; premature close reconnects to the SAME run by cursor, durable run as authority, honest RunStreamInterruptedError after bounded retries | Backoff/retry constants are conservative; SSE-auth-through-proxy test is U092 |
| U009 session fencing | `1a46e2a79` | Session generation + scoped aborts; delayed conversations/providers/detail responses from account A cannot repopulate signed-out state or account B (2 red fixtures on old store); sign-in clears prior account data; run subscription aborted on sign-out | Server-side cross-process concerns are U036+ |
| U010 single-origin routing | `e076f4545` | FRONTEND_DIST_DIR opt-in serves SPA with API precedence; /chat deep link 200 html; /api/*, /health/* always JSON (never HTML fallback); assets immutable; traversal 400; qa-live phase over real sockets — full sweep 125/125; vercel.json SPA rewrites for static hosting | The linked Vercel deployment still needs project settings pointed at a real backend (outside repo control) |

## Verification snapshot after Wave 1

- Frontend: lint clean, build clean, **468/468** tests (446 baseline + 22 new).
- Backend: typecheck clean, build clean, **206/206** tests (117 baseline + 89 new).
- `npm run qa:live`: **125/125** checks incl. the new single-origin routing phase.

## Not started (next sessions)

U011–U100 remain, in backlog order. Highest-leverage next steps:
U011–U020 (provider descriptors, no-auth locals, deliberate selection,
bounded checks), U021–U030 (workspace modes + main-UI server chat),
U031–U040 (atomic idempotency/admission — the concurrency fixes the
audit flagged as needing fresh multi-request integration tests).
