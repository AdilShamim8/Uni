# Extending ReWoo

ReWoo is deliberately small. Each extension point is a plain Python object you can read in a few minutes.

## Add a tool

```python
from rewoo.core import ReWoo
from rewoo.tools.registry import ToolResult

rw = ReWoo()

@rw.tools.tool(
    "currency_convert",                        # name the model will call
    "Convert an amount between currencies.",   # what it does (the model reads this)
    {"amount": "number", "from": "ISO code", "to": "ISO code"},
    risk="external",                           # safe | external | memory | irreversible
    label="Converting currency",               # what the user sees
    emoji="💱",
)
async def currency_convert(ctx, amount=0, **kw):
    ...  # ctx gives you ctx.store, ctx.memory, ctx.task_id, ctx.remote, ctx.search(...)
    return ToolResult("currency_convert: 100 USD = 11,950 BDT", {"result": "11,950 BDT"})
```

Rules of thumb:

- Pick the **risk level honestly**. It decides whether the user is asked first.
- Return `ToolResult(text=…)` for the model and `data={…}` for the UI (a `result`, `title` or `subject` key is shown under the step).
- Never raise for expected failures. Return `ToolResult("why it failed", ok=False)` so the model can adapt.
- To restrict a tool to certain helpers, list it in that helper's `tools`. Helpers with an empty list get every tool.

See `examples/custom_tool.py` for a runnable version.

## Add a recipe

Put a JSON file in `data/recipes/` (or `rewoo/recipes/` to ship it):

```json
{
  "id": "gift-ideas", "emoji": "🎁", "color": "#E4577B", "order": 10,
  "title": "Gift ideas", "description": "Ideas based on what you've told me.",
  "helper": "woo",
  "fields": [{"name": "person", "label": "Who is it for?"}, {"name": "budget", "label": "Budget"}],
  "prompt": "Suggest 5 gift ideas for {person} within {budget}. Check my memory first."
}
```

## Add a brain (model provider)

Any OpenAI-compatible server works without code: Settings → Brains → *Other (OpenAI-compatible)*.

For a new API style, subclass `ModelProvider`:

```python
from rewoo.models.base import ModelProvider, Completion, ProviderError

class MyProvider(ModelProvider):
    async def complete(self, messages, system="", model=None, temperature=0.2, max_tokens=1200):
        async with self.client() as c:            # httpx client (mockable in tests)
            r = await c.post(self.spec.base_url, json={...})
        self._raise_for(r)                        # maps HTTP errors to retryable/non-retryable
        return Completion(text=..., provider=self.id, model=model or self.spec.model)
```

Then register the type in `rewoo/models/router.py` (`PROVIDER_TYPES`) and, optionally, add a preset to `PRESETS`. Set `local=True` in the spec only if the model truly runs on the user's machine: that flag decides whether it may see private memory.

## Add a memory source / connector

A connector only needs to call:

```python
src = rw.memory.add_source("mysource", "My Source")          # once
rw.memory.add_document(src["id"], title, text,
                       external_id="stable-id-from-the-service",  # enables incremental updates
                       url="https://link-back", modified="2026-01-01T00:00:00Z")
rw.memory.remove_document(doc_id)                              # when it disappears upstream
```

Re-adding the same `external_id` with unchanged text is a no-op. Changed text replaces the old chunks. Sources automatically get the *enabled* and *private* toggles in the UI and are respected by retrieval. `connectors/gdrive.py` is a complete example: OAuth, token refresh, folder scoping and incremental sync.

## Add a helper

Settings-free: Helpers → *Make a helper*. Or via the API:

```bash
curl -X POST localhost:8787/api/helpers -H 'content-type: application/json' \
  -d '{"name":"Chef","emoji":"🍳","tagline":"Meal ideas","instructions":"Cheap, quick recipes.","tools":["search_memory","save_note"]}'
```

## Add an eval scenario

Append to `rewoo/harness/scenarios/*.json` (or pass `--suite path/`):

```json
{
  "id": "my-check", "name": "Uses the lease for pet questions",
  "setup": {"documents": [{"title": "Lease", "text": "Pets allowed with permission."}]},
  "prompt": "Can I have a cat?",
  "expect": {"status": "done", "tools_used": ["search_memory"], "cites": true}
}
```

Run `python -m rewoo eval`. Keys are documented at the top of `rewoo/harness/runner.py`.

## HTTP API cheat-sheet

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/tasks` | start a task `{prompt, helper_id}` |
| GET | `/api/tasks/{id}` | task + full event log |
| GET | `/api/tasks/{id}/stream` | live events (SSE) |
| POST | `/api/approvals/{id}` | `{approve: true/false}` |
| POST | `/api/memory/upload` | multipart files |
| POST | `/api/memory/search` | preview the context receipt for a query |
| GET/POST/PATCH/DELETE | `/api/memory/facts…` | manage remembered facts |
| PATCH | `/api/memory/sources/{id}` | `{enabled, private}` |
| GET/POST | `/api/providers` | brains |
| GET/PUT | `/api/settings` | approval mode, budgets, defaults |
| GET | `/api/recipes`, POST `/api/recipes/{id}/run` | one-click workflows |

Interactive docs: <http://localhost:8787/docs>.
