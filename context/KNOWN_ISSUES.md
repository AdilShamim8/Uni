# KNOWN ISSUES

Live register. Mirrors the audit register (D1–D14 in docs/engineering/CURRENT_STATE_AUDIT.md) until items close.

| ID | Severity | Issue | Status |
|---|---|---|---|
| D1 | Critical (product) | No multi-user auth in Python app | Open — being solved in YOU layer |
| D2 | High | SSRF via redirect chain in `web_fetch` | Fix claimed in 3a1ee423; regression test pending |
| D3 | High | Static path traversal | Guard present; Windows-path test pending |
| D4 | High (repo health) | 73.5k vendored files / ~292 MB under `engines/` | Open — owner decision required (ADR-007) |
| D5 | High | 3 failing tests (Windows/Py3.11+) | Partially addressed in 6076fb50; CI verify pending |
| D6 | Medium | EventBus thread-safety | Fix claimed; race test pending |
| D7 | Medium | OAuth state map growth | Open |
| D8 | Medium | SSE disconnect detection | Open |
| D9 | Medium | O(N) embedding scan | Open — fine at personal scale |
| D10 | Medium | Modal listener leaks in Vite UI | Open — UI superseded by YOU over time |
| D11 | Low | Deprecated asyncio/FastAPI APIs | Mostly migrated |
| D12 | Low | PDF ingestion dependency | Fix claimed; test pending |
| D13 | Medium (hygiene) | Committed prebuilt dist | Accepted trade-off, documented |
| D14 | Low | Historic commit message quality | Guidance adopted going forward |

## YOU app known limitations (updated as built)

- To be populated as the application lands. Nothing shipped yet.
