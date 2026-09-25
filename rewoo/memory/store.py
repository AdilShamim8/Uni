"""Personal memory: sources → documents → chunks, plus facts.

Four layers, each with a different job:
  • Facts      — short things you *approved* ReWoo to remember ("my sister's birthday is May 3").
  • Knowledge  — your documents (uploads, Google Drive, notes), chunked + indexed.
  • Episodes   — what happened in past tasks (question → answer), so ReWoo learns your context.
  • Working    — the per-task context window, assembled fresh by `ContextBuilder`.

Retrieval is hybrid: SQLite FTS5 (BM25 keyword ranking) fused with vector
similarity (local hashing embedder by default, or a real embedding model) using
Reciprocal Rank Fusion. Only *enabled* sources are ever searched.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from ..db import Store, new_id, now
from .text import chunk_text, content_hash, cosine, local_embed, tokenize

BUILTIN_SOURCES = [
    {"id": "src_uploads", "kind": "upload", "name": "My uploads"},
    {"id": "src_notes", "kind": "notes", "name": "My notes"},
    {"id": "src_episodes", "kind": "episodes", "name": "Past conversations"},
]


@dataclass
class Hit:
    chunk_id: str
    doc_id: str
    source_id: str
    source_name: str
    source_kind: str
    title: str
    text: str
    score: float
    private: bool = False
    url: str = ""
    why: List[str] = field(default_factory=list)

    def as_dict(self) -> Dict[str, Any]:
        return self.__dict__.copy()


class Memory:
    def __init__(self, store: Store):
        self.store = store
        for s in BUILTIN_SOURCES:
            if not store.get("sources", s["id"]):
                store.insert("sources", {**s, "enabled": 1, "private": 0, "config": {}})

    # --------------------------------------------------------------- sources
    def sources(self) -> List[Dict[str, Any]]:
        rows = self.store.query(
            """SELECT s.*, (SELECT COUNT(*) FROM documents d WHERE d.source_id = s.id) AS doc_count,
                      (SELECT COUNT(*) FROM chunks c WHERE c.source_id = s.id) AS chunk_count
               FROM sources s ORDER BY s.created_at"""
        )
        for r in rows:
            r["enabled"], r["private"] = bool(r["enabled"]), bool(r["private"])
        return rows

    def add_source(self, kind: str, name: str, config: Optional[Dict] = None, private: bool = False, sid: Optional[str] = None) -> Dict:
        row = {"id": sid or new_id("src_"), "kind": kind, "name": name, "enabled": 1, "private": int(private), "config": config or {}}
        return self.store.insert("sources", row)

    def update_source(self, sid: str, **changes: Any) -> None:
        clean = {k: int(v) if isinstance(v, bool) else v for k, v in changes.items() if k in ("enabled", "private", "name", "config", "status", "last_sync")}
        self.store.update("sources", sid, clean)

    def remove_source(self, sid: str) -> None:
        for doc in self.store.query("SELECT id FROM documents WHERE source_id = ?", [sid]):
            self.remove_document(doc["id"])
        if sid not in {s["id"] for s in BUILTIN_SOURCES}:
            self.store.delete("sources", sid)

    # ------------------------------------------------------------- documents
    def documents(self, sid: str) -> List[Dict[str, Any]]:
        return self.store.query("SELECT id, title, mime, url, modified, chars, created_at, external_id FROM documents WHERE source_id = ? ORDER BY created_at DESC", [sid])

    def find_document(self, sid: str, external_id: str) -> Optional[Dict[str, Any]]:
        return self.store.one("SELECT * FROM documents WHERE source_id = ? AND external_id = ?", [sid, external_id])

    def add_document(self, sid: str, title: str, text: str, mime: str = "text/plain", url: str = "",
                     external_id: str = "", modified: str = "", embeddings: Optional[List[List[float]]] = None) -> Optional[Dict]:
        text = (text or "").strip()
        if not text:
            return None
        h = content_hash(text)
        if external_id:
            old = self.find_document(sid, external_id)
            if old:
                if old["hash"] == h:
                    return old  # unchanged → nothing to do (incremental sync)
                self.remove_document(old["id"])
        doc = self.store.insert("documents", {
            "id": new_id("doc_"), "source_id": sid, "external_id": external_id or None, "title": title,
            "mime": mime, "url": url, "modified": modified, "hash": h, "chars": len(text),
        })
        pieces = chunk_text(text)
        rows, fts = [], []
        for i, piece in enumerate(pieces):
            cid = new_id("chk_")
            emb = embeddings[i] if embeddings and i < len(embeddings) else local_embed(f"{title}\n{piece}")
            embedder = "provider" if embeddings else "local"
            rows.append([cid, doc["id"], sid, i, piece, max(1, len(piece) // 4), embedder, json.dumps(emb)])
            fts.append([cid, title, piece])
        self.store.executemany("INSERT INTO chunks (id, doc_id, source_id, position, text, tokens, embedder, embedding) VALUES (?,?,?,?,?,?,?,?)", rows)
        self.store.executemany("INSERT INTO chunks_fts (chunk_id, title, text) VALUES (?,?,?)", fts)
        return doc

    def remove_document(self, doc_id: str) -> None:
        ids = [r["id"] for r in self.store.query("SELECT id FROM chunks WHERE doc_id = ?", [doc_id])]
        for cid in ids:
            self.store.execute("DELETE FROM chunks_fts WHERE chunk_id = ?", [cid])
        self.store.execute("DELETE FROM chunks WHERE doc_id = ?", [doc_id])
        self.store.delete("documents", doc_id)

    def read_document(self, doc_id: str, max_chars: int = 6000) -> Optional[Dict[str, Any]]:
        doc = self.store.get("documents", doc_id)
        if not doc:
            return None
        src = self.store.get("sources", doc["source_id"])
        if not src or not src["enabled"]:
            return None
        text = "\n\n".join(r["text"] for r in self.store.query("SELECT text FROM chunks WHERE doc_id = ? ORDER BY position", [doc_id]))
        return {**doc, "text": text[:max_chars], "truncated": len(text) > max_chars, "private": bool(src["private"])}

    # ----------------------------------------------------------------- facts
    def facts(self) -> List[Dict[str, Any]]:
        rows = self.store.query("SELECT * FROM facts ORDER BY pinned DESC, created_at DESC")
        for r in rows:
            r["pinned"] = bool(r["pinned"])
        return rows

    def add_fact(self, text: str, source_task: str = "", pinned: bool = False) -> Dict:
        text = text.strip()
        for f in self.facts():  # avoid exact duplicates
            if f["text"].lower() == text.lower():
                return f
        return self.store.insert("facts", {"id": new_id("fact_"), "text": text, "pinned": int(pinned), "source_task": source_task})

    def update_fact(self, fid: str, **changes: Any) -> None:
        self.store.update("facts", fid, {k: int(v) if isinstance(v, bool) else v for k, v in changes.items() if k in ("text", "pinned")})

    def forget_fact(self, fid: str) -> None:
        self.store.delete("facts", fid)

    # -------------------------------------------------------------- episodes
    def add_episode(self, task_id: str, prompt: str, answer: str) -> None:
        if self.store.get_setting("memory_paused", False) or not answer:
            return
        text = f"You asked: {prompt}\n\nReWoo answered: {answer}"
        self.add_document("src_episodes", f"Conversation: {prompt[:60]}", text, external_id=task_id)

    # ------------------------------------------------------------- retrieval
    def search(self, query: str, k: int = 8, include_private: bool = True, query_embedding: Optional[List[float]] = None) -> List[Hit]:
        sources = {s["id"]: s for s in self.sources() if s["enabled"] and (include_private or not s["private"])}
        if not sources or not query.strip():
            return []
        placeholders = ",".join("?" for _ in sources)
        # 1) keyword (BM25 via FTS5)
        terms = tokenize(query)[:12]
        kw_rank: Dict[str, int] = {}
        if terms:
            match = " OR ".join(f'"{t}"' for t in terms)
            rows = self.store.query(
                f"""SELECT f.chunk_id FROM chunks_fts f JOIN chunks c ON c.id = f.chunk_id
                    WHERE chunks_fts MATCH ? AND c.source_id IN ({placeholders})
                    ORDER BY bm25(chunks_fts, 0.0, 2.0, 1.0) LIMIT 40""",
                [match, *sources],
            )
            kw_rank = {r["chunk_id"]: i for i, r in enumerate(rows)}
        # 2) vector similarity (brute force — fine for personal-scale corpora)
        qvec_local = local_embed(query)
        vec_scores = []
        for r in self.store.query(f"SELECT id, embedder, embedding FROM chunks WHERE source_id IN ({placeholders})", list(sources)):
            try:
                emb = json.loads(r["embedding"]) if r["embedding"] else []
            except ValueError:
                continue
            q = query_embedding if (r["embedder"] == "provider" and query_embedding) else qvec_local
            if r["embedder"] == "provider" and not query_embedding:
                continue
            vec_scores.append((cosine(q, emb), r["id"]))
        vec_scores.sort(reverse=True)
        vec_rank = {cid: i for i, (s, cid) in enumerate(vec_scores[:40]) if s > 0.12}
        # 3) reciprocal rank fusion
        fused: Dict[str, float] = {}
        for ranks in (kw_rank, vec_rank):
            for cid, rank in ranks.items():
                fused[cid] = fused.get(cid, 0.0) + 1.0 / (60 + rank)
        top = sorted(fused.items(), key=lambda x: -x[1])[: k * 2]
        hits: List[Hit] = []
        per_doc: Dict[str, int] = {}
        for cid, score in top:
            row = self.store.one("SELECT c.*, d.title, d.url FROM chunks c JOIN documents d ON d.id = c.doc_id WHERE c.id = ?", [cid])
            if not row:
                continue
            if per_doc.get(row["doc_id"], 0) >= 2:  # diversity: max 2 chunks per document
                continue
            per_doc[row["doc_id"]] = per_doc.get(row["doc_id"], 0) + 1
            src = sources[row["source_id"]]
            why = []
            if cid in kw_rank:
                why.append("matching words")
            if cid in vec_rank:
                why.append("similar meaning")
            hits.append(Hit(cid, row["doc_id"], src["id"], src["name"], src["kind"], row["title"] or "Untitled",
                            row["text"], round(score * 1000, 2), bool(src["private"]), row["url"] or "", why))
            if len(hits) >= k:
                break
        return hits

    def relevant_facts(self, query: str, k: int = 6) -> List[Dict[str, Any]]:
        facts = self.facts()
        qt = set(tokenize(query))
        qv = local_embed(query)
        scored = []
        for f in facts:
            overlap = len(qt & set(tokenize(f["text"])))
            sim = cosine(qv, local_embed(f["text"]))
            score = (3.0 if f["pinned"] else 0.0) + overlap + sim
            if f["pinned"] or overlap or sim > 0.25:
                scored.append((score, f))
        scored.sort(key=lambda x: -x[0])
        return [f for _, f in scored[:k]]

    def stats(self) -> Dict[str, int]:
        one = lambda sql: (self.store.one(sql) or {}).get("n", 0)  # noqa: E731
        return {
            "facts": one("SELECT COUNT(*) AS n FROM facts"),
            "documents": one("SELECT COUNT(*) AS n FROM documents WHERE source_id != 'src_episodes'"),
            "chunks": one("SELECT COUNT(*) AS n FROM chunks"),
            "episodes": one("SELECT COUNT(*) AS n FROM documents WHERE source_id = 'src_episodes'"),
        }


def safe_filename(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9._\- ]", "_", name)[:120] or "file"


def touch_source(store: Store, sid: str) -> None:
    store.update("sources", sid, {"last_sync": now(), "status": "ready"})
