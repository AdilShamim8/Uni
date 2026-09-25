# ReWoo Codebase Audit: Bugs, Errors, Security Vulnerabilities & Architectural Issues

*Generated on: 2026-09-25*  
*Target Repository: ReWoo (`c:\Users\Adil\Downloads\rewoo`)*  
*Environment Tested: Windows 11, Python 3.14.5, FastAPI 0.136.1, Pytest 9.1.1*

---

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Category 1: Active Test Suite Failures & Deadlocks](#category-1-active-test-suite-failures--deadlocks)
   - [1.1 SQLite Windows File Lock (`PermissionError: [WinError 32]`)](#11-sqlite-windows-file-lock-permissionerror-winerror-32)
   - [1.2 Modern Asyncio Wait-For Deadlock in Approval Flow](#12-modern-asyncio-wait-for-deadlock-in-approval-flow)
3. [Category 2: Platform & Windows Console Incompatibilities](#category-2-platform--windows-console-incompatibilities)
   - [2.1 Console `UnicodeEncodeError` on Startup & Trace Replay](#21-console-unicodeencodeerror-on-startup--trace-replay)
4. [Category 3: Silent Failures & Missing Dependency Fallbacks](#category-3-silent-failures--missing-dependency-fallbacks)
   - [3.1 PDF Text Extraction Silently Broken (`pypdf` vs `PyPDF2`)](#31-pdf-text-extraction-silently-broken-pypdf-vs-pypdf2)
5. [Category 4: Security Vulnerabilities](#category-4-security-vulnerabilities)
   - [4.1 SSRF Protection Bypass via Open HTTP Redirects in `web_fetch`](#41-ssrf-protection-bypass-via-open-http-redirects-in-web_fetch)
   - [4.2 Arbitrary Static File Exposure via Path Traversal](#42-arbitrary-static-file-exposure-via-path-traversal)
6. [Category 5: Concurrency, Thread-Safety & Race Conditions](#category-5-concurrency-thread-safety--race-conditions)
   - [5.1 Non-Atomic Sequence Generator in `EventBus`](#51-non-atomic-sequence-generator-in-eventbus)
   - [5.2 Thread-Safety Violation on `asyncio.Queue.put_nowait`](#52-thread-safety-violation-on-asyncioqueueput_nowait)
7. [Category 6: Resource & Memory Leaks](#category-6-resource--memory-leaks)
   - [6.1 Missing Database Connection Lifecycle Management (`Store.close()`)](#61-missing-database-connection-lifecycle-management-storeclose)
   - [6.2 Unbounded In-Memory Growth in OAuth States](#62-unbounded-in-memory-growth-in-oauth-states)
   - [6.3 Leaked DOM Keydown Listeners in Modal Dialogs](#63-leaked-dom-keydown-listeners-in-modal-dialogs)
   - [6.4 Blocked Disconnection Detection in Server-Sent Events (SSE)](#64-blocked-disconnection-detection-in-server-sent-events-sse)
8. [Category 7: Scalability & Performance Bottlenecks](#category-7-scalability--performance-bottlenecks)
   - [7.1 In-Memory O(N) Embedding Deserialization & Scan](#71-in-memory-on-embedding-deserialization--scan)
9. [Category 8: Deprecations & Modern Python Standards](#category-8-deprecations--modern-python-standards)
   - [8.1 Deprecated FastAPI `@app.on_event("startup")`](#81-deprecated-fastapi-appon_eventstartup)
   - [8.2 Deprecated `asyncio.get_event_loop()`](#82-deprecated-asyncioget_event_loop)
10. [Prioritized Remediation Roadmap](#prioritized-remediation-roadmap)

---

## Executive Summary

During testing and code review of the ReWoo personal AI agent OS repository, **12 distinct bugs, vulnerabilities, and architectural deficiencies** were uncovered. 

Key highlights:
- **3 failing pytest tests** causing CI/CD pipeline breakage on Windows and Python 3.11+.
- **1 high-severity SSRF vulnerability** allowing private network and local service exfiltration via HTTP redirect chaining.
- **1 silent document ingestion bug** preventing all uploaded PDF documents from being indexed.
- **Platform crashes on Windows** due to default console encoding limitations.
- **Memory leaks** in both backend OAuth state tracking and frontend DOM event listeners.

---

## Category 1: Active Test Suite Failures & Deadlocks

### 1.1 SQLite Windows File Lock (`PermissionError: [WinError 32]`)

- **File**: `rewoo/harness/runner.py` (Line 65) & `rewoo/db.py` (Line 84)
- **Failing Test**: `tests/test_harness.py::test_default_suite_all_pass`
- **Severity**: High (Blocks automated evaluation harness)

#### Description
In `run_scenario()`, an evaluation scenario runs inside a temporary directory context:
```python
async def run_scenario(sc: Dict[str, Any], brain: Optional[str] = None) -> Dict[str, Any]:
    with tempfile.TemporaryDirectory() as tmp:
        rw = ReWoo(Config(data_dir=Path(tmp)), db_path=str(Path(tmp) / "eval.db"), bootstrap_env=brain is not None)
        ...
        events = rw.bus.history(task["id"])
        return grade(sc, task, events, rw)
```

#### Root Cause
The `Store` class creates a persistent connection (`self._conn = sqlite3.connect(...)`) with WAL mode enabled. However, neither `Store` nor `ReWoo` implements a `close()` method. When `run_scenario()` exits the `with tempfile.TemporaryDirectory() as tmp:` context block, `shutil.rmtree` attempts to recursively delete `eval.db`, `eval.db-wal`, and `eval.db-shm`. On Windows, operating system file locks held by the open SQLite connection prevent unlinking:
```
PermissionError: [WinError 32] The process cannot access the file because it is being used by another process: '...\\eval.db'
```

#### Remediation
1. Add a `close()` method to `Store`:
   ```python
   def close(self) -> None:
       with self._lock:
           self._conn.close()
   ```
2. Add a `close()` method to `ReWoo`:
   ```python
   def close(self) -> None:
       self.store.close()
   ```
3. Call `rw.close()` in `run_scenario()` inside a `finally` block before exiting the temporary directory.

---

### 1.2 Modern Asyncio Wait-For Deadlock in Approval Flow

- **File**: `tests/test_runtime.py` (Lines 44–80)
- **Failing Tests**:
  - `tests/test_runtime.py::test_approval_flow_approve`
  - `tests/test_runtime.py::test_approval_flow_deny`
- **Severity**: High (100% test failure rate on Python 3.11+)

#### Description
The tests verify interactive human approvals when risky tools (e.g. `remember_fact`) are invoked:
```python
def test_approval_flow_approve(rw):
    async def go():
        approver = asyncio.ensure_future(auto_approver(rw, approve=True))
        try:
            return await asyncio.wait_for(rw.ask("Remember that my sister's birthday is May 3"), timeout=10)
        finally:
            approver.cancel()

    task = asyncio.run(go())
```

#### Root Cause
The test comment states:
```python
# wait_for schedules ask() as its own Task and yields at least
# once, giving the approver task a chance to subscribe first.
```
While this assumption held in Python <= 3.10, in Python 3.11+ `asyncio.wait_for` was refactored to use timeout context managers (`async with timeouts.timeout(timeout): return await fut`). It **does not yield control** to the event loop before awaiting `fut`.

Because `rw.ask(...)` is synchronous rule-based execution up until approval generation:
1. `rw.ask()` starts immediately in the current task.
2. `emit("approval_requested")` publishes to the event bus.
3. At this point, `auto_approver` has **not yet executed its first line** (`q = rw.bus.subscribe("*")`).
4. The event is emitted to 0 subscribers and is lost.
5. `rw.ask()` waits on `await fut` indefinitely until the 10-second timeout expires.

*Note*: In `rewoo/harness/runner.py` (Line 71) and `rewoo/__main__.py` (Line 68), the authors added `await asyncio.sleep(0)` to prevent this exact race, but omitted it in `tests/test_runtime.py`.

#### Remediation
Insert `await asyncio.sleep(0)` immediately after creating the `auto_approver` task in `tests/test_runtime.py`:
```python
approver = asyncio.ensure_future(auto_approver(rw, approve=True))
await asyncio.sleep(0)  # Yield to allow auto_approver to subscribe to bus
try:
    return await asyncio.wait_for(...)
```

---

## Category 2: Platform & Windows Console Incompatibilities

### 2.1 Console `UnicodeEncodeError` on Startup & Trace Replay

- **Files**: `rewoo/__main__.py` (Line 42), `rewoo/harness/replay.py` (Lines 8–12, 53–55)
- **Severity**: Medium (Crashes application startup on Windows command prompts)

#### Description
When starting the server or running `rewoo trace` in standard Windows consoles:
```powershell
python -m rewoo
```
The program crashes with:
```
UnicodeEncodeError: 'charmap' codec can't encode character '\U0001f7e3' in position 4: character maps to <undefined>
```

#### Root Cause
Default Windows command line environments (PowerShell / cmd.exe) use legacy legacy code pages such as `cp1252` or `cp437` unless `PYTHONUTF8=1` is configured. Printing Unicode emojis (such as `🟣`, `📥`, `🚀`, `✋`, `⚡`) or typographical symbols (`→`) causes Python's stream writer to raise `UnicodeEncodeError`.

#### Remediation
Ensure UTF-8 stream reconfiguration with fallback error replacement across CLI entrypoints:
```python
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
```

---

## Category 3: Silent Failures & Missing Dependency Fallbacks

### 3.1 PDF Text Extraction Silently Broken (`pypdf` vs `PyPDF2`)

- **File**: `rewoo/memory/text.py` (Lines 51–53)
- **Severity**: Medium (Silent degradation of core product functionality)

#### Description
When a user uploads a `.pdf` file in **Memory → Uploads**, the document appears to upload successfully, but indexing yields 0 chunks and 0 extracted characters.

#### Root Cause
`rewoo/memory/text.py` strictly attempts:
```python
try:
    from pypdf import PdfReader  # optional dependency
except ImportError:
    return ""
```
In many existing Python environments, the package installed is `PyPDF2` (version 3.0.x), which also exports `PdfReader`. When `import pypdf` fails, the `ImportError` block silently catches it and returns an empty string `""` without attempting `PyPDF2` or logging a warning to the user.

#### Remediation
Implement dual-library compatibility:
```python
try:
    from pypdf import PdfReader
except ImportError:
    try:
        from PyPDF2 import PdfReader
    except ImportError:
        return ""
```

---

## Category 4: Security Vulnerabilities

### 4.1 SSRF Protection Bypass via Open HTTP Redirects in `web_fetch`

- **File**: `rewoo/tools/builtin.py` (Lines 48–60, 112–117)
- **Severity**: High (Security Vulnerability: Server-Side Request Forgery)

#### Description
The built-in `web_fetch` tool validates target URLs using `_is_public_url(url)` to prevent the agent from querying `localhost`, loopback, or private RFC1918 subnets.
However, HTTP request dispatching is implemented as:
```python
async with httpx.AsyncClient(timeout=20, follow_redirects=True, transport=ctx.http_transport) as c:
    r = await c.get(url, headers={"User-Agent": ...})
```

#### Vulnerability
1. An attacker prompts the agent to fetch a public domain under their control (e.g. `https://attacker-controlled.com/redirect`).
2. `_is_public_url("https://attacker-controlled.com/redirect")` resolves to a public IP and evaluates to `True`.
3. `httpx.AsyncClient` issues the request with `follow_redirects=True`.
4. The server responds with an HTTP 302 redirecting to `http://127.0.0.1:8787/api/settings` or AWS instance metadata `http://169.254.169.254/latest/meta-data/`.
5. `httpx` follows the redirect without passing intermediate redirect locations back through `_is_public_url()`.
6. Private internal API data or cloud metadata is fetched and returned to the model context.

#### Remediation
Disable automated redirects (`follow_redirects=False`) or implement custom redirect validation:
```python
async with httpx.AsyncClient(timeout=20, follow_redirects=False, transport=ctx.http_transport) as c:
    curr_url = url
    for _ in range(5):
        if not _is_public_url(curr_url):
            return ToolResult("web_fetch: target or redirected URL is not public.", ok=False)
        r = await c.get(curr_url, headers=headers)
        if 300 <= r.status_code < 400 and "location" in r.headers:
            curr_url = str(r.url.join(r.headers["location"]))
        else:
            break
```

---

### 4.2 Arbitrary Static File Exposure via Path Traversal

- **File**: `rewoo/api/app.py` (Lines 465–470)
- **Severity**: Medium (Information Disclosure)

#### Description
The web server serves static assets using:
```python
@app.get("/{name}.{ext}")
def web_file(name: str, ext: str):
    path = WEB_DIR / f"{name}.{ext}"
    if ext in ("js", "css", "svg", "ico", "webmanifest") and path.exists():
        return FileResponse(path)
    return JSONResponse({"detail": "Not found"}, status_code=404)
```

#### Vulnerability
Path segments in `name` containing `../` sequences are joined directly into `path`. Although `ext` is constrained, on systems where files ending in `.js` or `.css` exist outside the `web/` folder, an attacker can traverse up the directory hierarchy and download system or project files.

#### Remediation
Verify that the canonical resolved path starts within `WEB_DIR`:
```python
resolved = (WEB_DIR / f"{name}.{ext}").resolve()
if ext in ("js", "css", "svg", "ico", "webmanifest") and resolved.is_file() and WEB_DIR in resolved.parents:
    return FileResponse(resolved)
```

---

## Category 5: Concurrency, Thread-Safety & Race Conditions

### 5.1 Non-Atomic Sequence Generator in `EventBus`

- **File**: `rewoo/events.py` (Lines 22–27)
- **Severity**: Medium (Data Integrity)

#### Description
```python
def _next_seq(self, task_id: str) -> int:
    if task_id not in self._seq:
        row = self.store.one("SELECT MAX(seq) AS m FROM events WHERE task_id = ?", [task_id])
        self._seq[task_id] = (row["m"] or 0) if row else 0
    self._seq[task_id] += 1
    return self._seq[task_id]
```
`_next_seq()` is not guarded by a mutex. When sub-agents or simultaneous parallel tools execute and publish events concurrently, race conditions can produce identical sequence numbers (`seq`), violating unique sequential ordering in the database and causing event sorting glitches in the UI.

#### Remediation
Wrap sequence updates in a `threading.Lock` or generate sequential IDs atomically directly via SQLite auto-increment or SQLite transactions.

---

### 5.2 Thread-Safety Violation on `asyncio.Queue.put_nowait`

- **File**: `rewoo/events.py` (Lines 41–46)
- **Severity**: Low / Edge-case Crash

#### Description
```python
for key in (task_id, "*"):
    for q in list(self._subs.get(key, [])):
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            pass
```
`EventBus.emit()` is a plain synchronous method called from various places, including potential worker threads or background tasks. In Python's `asyncio`, `Queue.put_nowait()` is **not thread-safe** and must only be called from the loop's thread or via `loop.call_soon_threadsafe()`.

---

## Category 6: Resource & Memory Leaks

### 6.1 Missing Database Connection Lifecycle Management (`Store.close()`)

- **File**: `rewoo/db.py` (Lines 84–99)
- **Severity**: Medium (Resource Leak)

#### Description
The `Store` class opens SQLite connections with `check_same_thread=False` and enables WAL journaling. It provides no destructor (`__del__`), context management (`__enter__`/`__exit__`), or explicit `.close()` method. When creating multiple instances (e.g. in test suites, evaluation batches, or transient workers), SQLite file descriptors remain open until garbage collection runs, causing locks and memory bloat.

---

### 6.2 Unbounded In-Memory Growth in OAuth States

- **File**: `rewoo/api/app.py` (Lines 107, 390, 401)
- **Severity**: Low / Denial of Service

#### Description
```python
oauth_states: set = set()
...
@app.get("/api/drive/connect")
def drive_connect():
    state = secrets.token_urlsafe(16)
    oauth_states.add(state)
```
Every invocation of `/api/drive/connect` appends a 16-byte state string to `oauth_states`. State tokens are only removed if a callback successfully matches. Abandoned sign-ins, bots, or repeated GET requests cause this set to grow monotonically in process memory.

#### Remediation
Use a bounded TTL dictionary (e.g. mapping `state -> timestamp`) and evict entries older than 10 minutes, or store HMAC-signed states.

---

### 6.3 Leaked DOM Keydown Listeners in Modal Dialogs

- **File**: `rewoo/web/app.js` (Lines 30–40)
- **Severity**: Low (Client-side Memory Leak)

#### Description
```javascript
function modal(html, onMount) {
  const bg = document.createElement("div");
  ...
  const close = () => bg.remove();
  bg.addEventListener("click", (e) => { if (e.target === bg) close(); });
  document.addEventListener("keydown", function k(e) { 
    if (e.key === "Escape") { close(); document.removeEventListener("keydown", k); } 
  });
```
The `keydown` listener `k` is only removed if the user presses `Escape`. If the user closes the modal by clicking the backdrop or clicking a close/cancel button inside the modal, `close()` is invoked, but `document.removeEventListener("keydown", k)` is never called. Every opened modal attaches a permanent listener to `window.document`.

#### Remediation
Define cleanup centrally inside `close()`:
```javascript
function modal(html, onMount) {
  ...
  function onKey(e) { if (e.key === "Escape") close(); }
  const close = () => {
    document.removeEventListener("keydown", onKey);
    bg.remove();
  };
  document.addEventListener("keydown", onKey);
}
```

---

### 6.4 Blocked Disconnection Detection in Server-Sent Events (SSE)

- **File**: `rewoo/api/app.py` (Lines 274–281)
- **Severity**: Low (Server Resource Waste)

#### Description
In `/api/tasks/{tid}/stream`:
```python
while True:
    if await request.is_disconnected():
        return
    try:
        ev = await asyncio.wait_for(q.get(), timeout=15)
    except asyncio.TimeoutError:
        yield ": keep-alive\n\n"
        continue
```
`request.is_disconnected()` is checked only at the start of each loop iteration. If the client closes the tab, the generator remains suspended inside `await asyncio.wait_for(q.get(), timeout=15)` for up to 15 seconds before noticing the disconnection, holding open worker coroutines and subscriber queues.

---

## Category 7: Scalability & Performance Bottlenecks

### 7.1 In-Memory O(N) Embedding Deserialization & Scan

- **File**: `rewoo/memory/store.py` (Lines 180–189)
- **Severity**: Medium (CPU & Latency Degradation at Scale)

#### Description
```python
for r in self.store.query(f"SELECT id, embedder, embedding FROM chunks WHERE source_id IN ({placeholders})", list(sources)):
    try:
        emb = json.loads(r["embedding"]) if r["embedding"] else []
    except ValueError:
        continue
    ...
    vec_scores.append((cosine(q, emb), r["id"]))
```
During retrieval, ReWoo executes a full table scan over all chunks in enabled sources. Every chunk’s vector embedding is stored as a JSON string, which is loaded and parsed in Python on every query. While adequate for small personal notebooks (< 500 chunks), corpora with thousands of document chunks will experience high GC pressure and CPU delays.

#### Remediation
1. Cache deserialized embedding matrices in memory or use binary BLOB formats (e.g. `numpy` float32 byte arrays).
2. Consider SQLite-vec or sqlite-vss vector extensions for sub-millisecond similarity queries.

---

## Category 8: Deprecations & Modern Python Standards

### 8.1 Deprecated FastAPI `@app.on_event("startup")`

- **File**: `rewoo/api/app.py` (Line 109)
- **Severity**: Low (Produces 30 warnings during pytest)

#### Description
```python
@app.on_event("startup")
async def _startup():
    rw.runtime.recover()
```
`@app.on_event` is deprecated in Starlette / FastAPI. It emits:
`DeprecationWarning: on_event is deprecated, use lifespan event handlers instead.`

#### Remediation
Migrate to the recommended `lifespan` handler:
```python
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    rw.runtime.recover()
    yield

app = FastAPI(title="ReWoo", lifespan=lifespan)
```

---

### 8.2 Deprecated `asyncio.get_event_loop()`

- **File**: `rewoo/agent/runtime.py` (Line 263)
- **Severity**: Low (Python 3.10+ Deprecation Warning)

#### Description
Inside `_use_tool()`:
```python
fut: asyncio.Future = asyncio.get_event_loop().create_future()
```
Calling `get_event_loop()` inside active asynchronous functions is deprecated when not explicitly referencing a running loop.

#### Remediation
Replace with `asyncio.get_running_loop().create_future()`.

---

## Prioritized Remediation Roadmap

| Priority | Issue | Action Items |
|---|---|---|
| **P0** | **Approval Flow Deadlock** | Add `await asyncio.sleep(0)` to `tests/test_runtime.py` to fix the test race condition. |
| **P0** | **WinError 32 File Lock** | Add `close()` to `Store` and `ReWoo`; call `rw.close()` in `rewoo/harness/runner.py`. |
| **P1** | **SSRF Open Redirect Bypass** | Set `follow_redirects=False` in `web_fetch` and manually validate redirect hops. |
| **P1** | **PDF Silent Extraction Failure** | Add `from PyPDF2 import PdfReader` fallback in `rewoo/memory/text.py`. |
| **P1** | **Windows Console Unicode Crash** | Ensure standard UTF-8 stream wrapping across `__main__.py` and `replay.py`. |
| **P2** | **Static Asset Path Traversal** | Enforce `resolved.is_relative_to(WEB_DIR)` in `/{name}.{ext}`. |
| **P2** | **DOM Listener Leak** | Remove keydown listener on modal close in `rewoo/web/app.js`. |
| **P3** | **FastAPI Lifespan Deprecation** | Migrate startup event to `@asynccontextmanager async def lifespan`. |
| **P3** | **O(N) Embedding Scan** | Cache vector embeddings or store in compact binary BLOBs. |
