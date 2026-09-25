"""Memory: text extraction/chunking/redaction, storage, retrieval, context packing."""
from __future__ import annotations

import io
import zipfile

import pytest

from rewoo.memory.context import ContextBuilder
from rewoo.memory.text import chunk_text, extract_text, redact


# --------------------------------------------------------------------------- chunk_text
def test_chunk_text_respects_size_roughly():
    text = "Paragraph one is a sentence. " * 40
    chunks = chunk_text(text, size=200, overlap=20)
    assert len(chunks) > 1
    for c in chunks:
        assert len(c) <= 220  # some slack for overlap / sentence rounding


def test_chunk_text_empty_returns_empty_list():
    assert chunk_text("") == []
    assert chunk_text("   \n\n  ") == []


def test_chunk_text_splits_on_paragraphs():
    text = "First para.\n\nSecond para.\n\nThird para."
    chunks = chunk_text(text, size=5000)
    assert len(chunks) == 1  # small enough to fit in one chunk
    assert "First para." in chunks[0] and "Third para." in chunks[0]


# --------------------------------------------------------------------------- extract_text
def test_extract_text_plain_txt():
    assert extract_text(b"hello there", "notes.txt") == "hello there"


def test_extract_text_html():
    html = b"<html><body><p>Hello</p><p>World</p></body></html>"
    out = extract_text(html, "page.html")
    assert "Hello" in out and "World" in out


def test_extract_text_csv():
    out = extract_text(b"a,b\n1,2\n", "data.csv")
    assert out == "a | b\n1 | 2"


def test_extract_text_docx():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr(
            "word/document.xml",
            "<w:document><w:body>"
            "<w:p><w:r><w:t>Hello docx</w:t></w:r></w:p>"
            "<w:p><w:r><w:t>Second paragraph</w:t></w:r></w:p>"
            "</w:body></w:document>",
        )
    out = extract_text(buf.getvalue(), "report.docx")
    assert "Hello docx" in out
    assert "Second paragraph" in out


def test_extract_text_unknown_binary_returns_empty():
    assert extract_text(bytes(range(256)), "file.bin") == ""


# --------------------------------------------------------------------------- redact
def test_redact_hides_api_key():
    text, found = redact("my key is sk-abcdefghijklmnopqrstuvwx123456, keep it safe")
    assert "sk-abcdefghijklmnopqrstuvwx123456" not in text
    assert "[hidden API key]" in text
    assert "API key" in found


def test_redact_hides_password():
    text, found = redact("password: hunter2secret")
    assert "hunter2secret" not in text
    assert "password" in found


def test_redact_leaves_normal_text_untouched():
    text, found = redact("Nothing secret about this sentence.")
    assert text == "Nothing secret about this sentence."
    assert found == []


# --------------------------------------------------------------------------- Memory.add_document / search
def test_add_document_and_search_by_keyword(rw):
    rw.memory.add_document("src_uploads", "Lease", "Monthly rent is 42000 BDT due on the 5th.", external_id="lease1")
    hits = rw.memory.search("rent")
    assert any("42000" in h.text for h in hits)


def test_search_finds_fuzzy_plural(rw):
    rw.memory.add_document("src_uploads", "Pets", "I have two cats at home. They love naps.", external_id="pets1")
    hits = rw.memory.search("cat")  # singular query, plural in the doc
    assert any(h.doc_id for h in hits)
    assert any("cats" in h.text for h in hits)


def test_search_ignores_disabled_source(rw):
    src = rw.memory.add_source("upload", "Disabled source")
    rw.memory.add_document(src["id"], "Doc", "unique_marker_zzz content here", external_id="d1")
    rw.memory.update_source(src["id"], enabled=False)
    hits = rw.memory.search("unique_marker_zzz")
    assert hits == []


def test_add_document_same_external_id_same_text_not_duplicated(rw):
    doc1 = rw.memory.add_document("src_uploads", "T", "hello world", external_id="ext1")
    doc2 = rw.memory.add_document("src_uploads", "T", "hello world", external_id="ext1")
    assert doc1["id"] == doc2["id"]
    docs = rw.memory.documents("src_uploads")
    assert len([d for d in docs if d["external_id"] == "ext1"]) == 1


def test_add_document_same_external_id_changed_text_replaces(rw):
    doc1 = rw.memory.add_document("src_uploads", "T", "hello world", external_id="ext1")
    doc2 = rw.memory.add_document("src_uploads", "T", "goodbye world changed entirely", external_id="ext1")
    assert doc2["id"] != doc1["id"]
    docs = rw.memory.documents("src_uploads")
    matching = [d for d in docs if d["external_id"] == "ext1"]
    assert len(matching) == 1
    assert matching[0]["id"] == doc2["id"]
    # old chunks must be gone
    assert rw.store.query("SELECT id FROM chunks WHERE doc_id = ?", [doc1["id"]]) == []


def test_remove_source_cleans_chunks(rw):
    src = rw.memory.add_source("upload", "Temp source")
    doc = rw.memory.add_document(src["id"], "Doc", "some content to chunk and index", external_id="d1")
    assert rw.store.query("SELECT id FROM chunks WHERE doc_id = ?", [doc["id"]]) != []
    rw.memory.remove_source(src["id"])
    assert rw.store.query("SELECT id FROM chunks WHERE doc_id = ?", [doc["id"]]) == []
    assert rw.store.get("sources", src["id"]) is None


# --------------------------------------------------------------------------- ContextBuilder
def test_context_builder_excludes_private_when_remote(rw):
    priv = rw.memory.add_source("upload", "Private folder", private=True)
    rw.memory.add_document(priv["id"], "Secret", "super secret private salary info", external_id="p1")
    cb = ContextBuilder(rw.memory)
    pack = cb.build("secret salary", remote=True)
    assert pack.items == []
    assert any(e["reason"].startswith("From a private source") for e in pack.excluded)
    assert pack.contains_private is False


def test_context_builder_includes_private_when_local(rw):
    priv = rw.memory.add_source("upload", "Private folder", private=True)
    rw.memory.add_document(priv["id"], "Secret", "super secret private salary info", external_id="p1")
    cb = ContextBuilder(rw.memory)
    pack = cb.build("secret salary", remote=False)
    assert any(i.private for i in pack.items)
    assert pack.contains_private is True


def test_context_builder_tiny_budget_excludes_with_reason(rw):
    rw.memory.add_document("src_uploads", "T", "The quick brown fox jumps over the lazy dog repeatedly today.", external_id="ext1")
    cb = ContextBuilder(rw.memory)
    pack = cb.build("quick brown fox", budget_tokens=1)
    assert pack.items == []
    assert any(e["reason"] == "Didn't fit in the context budget" for e in pack.excluded)


def test_context_builder_memory_paused_returns_empty(rw):
    rw.store.set_setting("memory_paused", True)
    rw.memory.add_document("src_uploads", "T", "The quick brown fox jumps over the lazy dog.", external_id="ext1")
    cb = ContextBuilder(rw.memory)
    pack = cb.build("quick brown fox")
    assert pack.items == []
    assert pack.excluded[0]["reason"] == "Memory is paused"


def test_context_builder_pinned_facts_always_included(rw):
    rw.memory.add_fact("I am vegetarian", pinned=True)
    cb = ContextBuilder(rw.memory)
    pack = cb.build("what should I eat for a completely unrelated topic like astrophysics")
    assert any(i.kind == "fact" and "vegetarian" in i.text for i in pack.items)
