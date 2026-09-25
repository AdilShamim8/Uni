"""Skills: how Bots get smarter over time.

Inspired by Hermes Agent's closed learning loop (MIT, Nous Research): after a
Bot finishes non-trivial work, it *proposes* a reusable skill that describes how
it did it. ReWoo adds one rule on top: **nothing is learned without your OK**.
Approved skills are matched to future requests and injected into the Bot's
instructions, and their use is counted.

Skills are stored in the database *and* mirrored to disk as `SKILL.md` files
(YAML-ish front-matter + Markdown body — the same layout Hermes and the open
agentskills format use), so they can be read, edited, shared and imported:

    data/skills/<name>/SKILL.md
    ---
    name: weekly-rent-check
    description: Check the lease for rent amount and due date, then answer with citations.
    version: 1.0.0
    metadata:
      rewoo: {bot: scout, source: learned}
    ---
    # Weekly rent check
    ## When to use
    ...
    ## Steps
    1. ...
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from ..db import Store, new_id, now
from ..memory.text import cosine, local_embed, tokenize

NAME_RE = re.compile(r"[^a-z0-9]+")


def slugify(text: str, limit: int = 48) -> str:
    return NAME_RE.sub("-", text.lower()).strip("-")[:limit].strip("-") or "skill"


def parse_skill_md(text: str) -> Dict[str, Any]:
    """Parse a SKILL.md file (front-matter + body). Tolerant of simple YAML only."""
    meta: Dict[str, Any] = {}
    body = text
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n?(.*)$", text, re.S)
    if m:
        front, body = m.group(1), m.group(2)
        for line in front.splitlines():
            if not line.strip() or line.startswith((" ", "\t")):
                continue  # nested keys (metadata:) are ignored except top-level scalars
            key, _, value = line.partition(":")
            value = value.strip().strip('"').strip("'")
            if value and value != "|" and value != ">":
                meta[key.strip()] = value
    return {"name": meta.get("name", ""), "description": meta.get("description", ""),
            "version": meta.get("version", "1.0.0"), "category": meta.get("category", ""), "body": body.strip()}


def render_skill_md(skill: Dict[str, Any]) -> str:
    desc = (skill.get("description") or "").replace("\n", " ").strip()
    return (
        "---\n"
        f"name: {skill['name']}\n"
        f"description: {json.dumps(desc)}\n"
        f"version: {skill.get('version') or '1.0.0'}\n"
        "metadata:\n"
        f"  rewoo: {json.dumps({'bot': skill.get('bot_id') or '', 'source': skill.get('source') or 'learned'})}\n"
        "---\n\n"
        f"{(skill.get('body') or '').strip()}\n"
    )


def _repo_rel(p: Path) -> str:
    parts = p.resolve().parts
    return "/".join(parts[parts.index("engines"):]) if "engines" in parts else p.name


def _attribution(folder: Path, source: str) -> str:
    """Keep license attribution with imported skill text (MIT/OFL/Apache notices must travel with copies)."""
    lic = next((p for p in sorted(folder.glob("*")) if p.is_file() and p.name.lower().startswith(("license", "copying"))), None)
    origin = "Hermes Agent (MIT License, Copyright (c) 2025 Nous Research)" if source == "hermes" else source
    line = f"---\n_Imported from {origin}._"
    if lic:
        first = next((ln.strip() for ln in lic.read_text(encoding="utf-8", errors="ignore").splitlines() if ln.strip()), "")
        copyright_ln = next((ln.strip() for ln in lic.read_text(encoding="utf-8", errors="ignore").splitlines()
                             if ln.strip().lower().startswith("copyright")), "")
        line += f" _This skill has its own license: {first}{(' — ' + copyright_ln) if copyright_ln else ''}. Full text: `{_repo_rel(lic)}`._"
    return line


class Skills:
    def __init__(self, store: Store, skills_dir: Optional[Path] = None):
        self.store = store
        self.dir = Path(skills_dir) if skills_dir else None
        if self.dir:
            self.dir.mkdir(parents=True, exist_ok=True)

    # ----------------------------------------------------------------- CRUD
    def all(self, status: Optional[str] = None) -> List[Dict[str, Any]]:
        if status:
            return self.store.query("SELECT * FROM skills WHERE status = ? ORDER BY updated_at DESC", [status])
        return self.store.query("SELECT * FROM skills ORDER BY CASE status WHEN 'proposed' THEN 0 WHEN 'active' THEN 1 ELSE 2 END, updated_at DESC")

    def get(self, sid: str) -> Optional[Dict[str, Any]]:
        return self.store.get("skills", sid)

    def by_name(self, name: str) -> Optional[Dict[str, Any]]:
        return self.store.one("SELECT * FROM skills WHERE name = ?", [name])

    def create(self, name: str, description: str, body: str, *, status: str = "proposed", source: str = "learned",
               bot_id: Optional[str] = None, origin_task: Optional[str] = None, category: str = "",
               version: str = "1.0.0") -> Dict[str, Any]:
        base = slugify(name)
        slug, i = base, 2
        while self.by_name(slug):
            slug, i = f"{base}-{i}", i + 1
        row = {"id": new_id("skill_"), "name": slug, "description": description.strip()[:500], "body": body.strip(),
               "version": version, "category": category, "source": source, "status": status, "bot_id": bot_id,
               "uses": 0, "origin_task": origin_task, "updated_at": now()}
        self.store.insert("skills", row)
        self._write(self.get(row["id"]))  # type: ignore[arg-type]
        return self.get(row["id"])  # type: ignore[return-value]

    def update(self, sid: str, **changes: Any) -> Optional[Dict[str, Any]]:
        allowed = {k: v for k, v in changes.items() if k in ("description", "body", "status", "bot_id", "category", "version")}
        if not allowed:
            return self.get(sid)
        allowed["updated_at"] = now()
        self.store.update("skills", sid, allowed)
        row = self.get(sid)
        if row:
            self._write(row)
        return self.get(sid)

    def delete(self, sid: str) -> None:
        row = self.get(sid)
        self.store.delete("skills", sid)
        if row and row.get("path"):
            p = Path(row["path"])
            try:
                p.unlink()
                p.parent.rmdir()
            except OSError:
                pass

    def _write(self, row: Dict[str, Any]) -> None:
        if not self.dir or row.get("status") == "proposed":
            return
        folder = self.dir / row["name"]
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / "SKILL.md"
        path.write_text(render_skill_md(row), encoding="utf-8")
        if row.get("path") != str(path):
            self.store.update("skills", row["id"], {"path": str(path)})

    # --------------------------------------------------------------- import
    def import_dir(self, root: Path, source: str = "hermes", status: str = "disabled", limit: int = 500) -> int:
        """Import every SKILL.md under `root` (e.g. the vendored Hermes skills library)."""
        count = 0
        for path in sorted(Path(root).rglob("SKILL.md"))[:limit]:
            try:
                data = parse_skill_md(path.read_text(encoding="utf-8", errors="ignore"))
            except OSError:
                continue
            name = data["name"] or path.parent.name
            if not data["description"] or self.by_name(slugify(name)):
                continue
            category = path.parent.parent.name if path.parent.parent != Path(root) else ""
            body = data["body"][:12000] + "\n\n" + _attribution(path.parent, source)
            self.create(name, data["description"], body, status=status, source=source,
                        category=category, version=data["version"])
            count += 1
        return count

    # ------------------------------------------------------------ retrieval
    def relevant(self, request: str, bot_id: Optional[str] = None, k: int = 2) -> List[Dict[str, Any]]:
        active = [s for s in self.all("active") if not s["bot_id"] or s["bot_id"] == bot_id]
        if not active:
            return []
        qt, qv = set(tokenize(request)), local_embed(request)
        scored: List[Tuple[float, Dict[str, Any]]] = []
        for s in active:
            text = f"{s['name'].replace('-', ' ')} {s['description']}"
            overlap = len(qt & set(tokenize(text)))
            sim = cosine(qv, local_embed(text))
            score = overlap + 2 * sim
            if overlap >= 2 or sim > 0.35:
                scored.append((score, s))
        scored.sort(key=lambda x: -x[0])
        return [s for _, s in scored[:k]]

    def mark_used(self, sid: str) -> None:
        self.store.execute("UPDATE skills SET uses = uses + 1, updated_at = ? WHERE id = ?", [now(), sid])

    @staticmethod
    def prompt_block(skills: List[Dict[str, Any]]) -> str:
        if not skills:
            return ""
        parts = [f"### Skill: {s['name']}\n{s['description']}\n{(s['body'] or '')[:2500]}" for s in skills]
        return "\nSKILLS YOU HAVE LEARNED (follow them when they fit):\n" + "\n\n".join(parts) + "\n"


_FILLER = {"a", "an", "the", "my", "me", "to", "about", "please", "can", "you", "for", "of", "and", "i", "is", "on", "in"}


def draft_skill_from_run(prompt: str, answer: str, tool_steps: List[Dict[str, Any]], bot_name: str) -> Dict[str, str]:
    """Deterministic skill draft built from what actually happened (no LLM needed).

    Used by the offline Demo brain and as a fallback when a real brain can't
    produce a valid SKILL.md.
    """
    labels = []
    for st in tool_steps:
        label = st.get("label") or st.get("tool")
        if label and label not in labels:
            labels.append(label)
    title = re.sub(r"\s+", " ", prompt.strip().rstrip("?.!"))[:60]
    short = " ".join([w for w in re.findall(r"[A-Za-z0-9']+", title) if w.lower() not in _FILLER][:5]) or title
    steps = "\n".join(f"{i}. {lab}" + (f" (e.g. {json.dumps(st.get('input'))[:80]})" if st.get("input") else "")
                      for i, (lab, st) in enumerate(zip(labels, tool_steps), start=1))
    body = (
        f"# {title}\n\n"
        f"## When to use\nWhen the user asks something like: \"{prompt.strip()[:160]}\"\n\n"
        f"## Steps\n{steps}\n{len(labels) + 1}. Answer briefly and cite sources as [n].\n\n"
        f"## Notes\nLearned by {bot_name} from a successful run. Edit freely."
    )
    return {"name": short, "description": f"How to handle requests like: {title}", "body": body}


SKILL_WRITER_PROMPT = """You just completed a task successfully. Write a reusable SKILL so that next time a similar
request is handled faster and better. Reply with ONE JSON object only:
{{"name": "short-kebab-case-name", "description": "one sentence: when to use this skill",
  "body": "Markdown with sections: ## When to use, ## Steps (numbered, concrete), ## Pitfalls"}}

TASK: {prompt}
STEPS TAKEN: {steps}
FINAL ANSWER (truncated): {answer}"""
