"""Text utilities: extraction, chunking, local embeddings, secret redaction."""
from __future__ import annotations

import csv
import hashlib
import io
import json
import math
import re
import zipfile
from html.parser import HTMLParser
from typing import List, Tuple

TEXT_MIMES = ("text/", "application/json", "application/xml", "application/x-yaml")


class _HTMLText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts: List[str] = []
        self._skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript"):
            self._skip += 1
        elif tag in ("p", "br", "div", "li", "h1", "h2", "h3", "h4", "tr"):
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript") and self._skip:
            self._skip -= 1

    def handle_data(self, data):
        if not self._skip:
            self.parts.append(data)


def html_to_text(html: str) -> str:
    p = _HTMLText()
    p.feed(html)
    text = "".join(p.parts)
    return re.sub(r"\n\s*\n+", "\n\n", re.sub(r"[ \t]+", " ", text)).strip()


def extract_text(data: bytes, filename: str = "", mime: str = "") -> str:
    """Best-effort text extraction for the file types normal people have."""
    name = filename.lower()
    try:
        if name.endswith(".pdf") or mime == "application/pdf":
            try:
                from pypdf import PdfReader  # optional dependency
            except ImportError:
                return ""
            reader = PdfReader(io.BytesIO(data))
            return "\n\n".join((page.extract_text() or "") for page in reader.pages)
        if name.endswith(".docx") or "wordprocessingml" in mime:
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                xml = z.read("word/document.xml").decode("utf8", "ignore")
            xml = re.sub(r"</w:p>", "\n", xml)
            return re.sub(r"<[^>]+>", "", xml).strip()
        if name.endswith((".html", ".htm")) or mime == "text/html":
            return html_to_text(data.decode("utf8", "ignore"))
        if name.endswith(".csv") or mime == "text/csv":
            rows = list(csv.reader(io.StringIO(data.decode("utf8", "ignore"))))
            return "\n".join(" | ".join(r) for r in rows)
        if name.endswith(".json"):
            return json.dumps(json.loads(data.decode("utf8", "ignore")), indent=1)[:200_000]
        if mime.startswith(TEXT_MIMES) or name.endswith((".txt", ".md", ".markdown", ".rst", ".yaml", ".yml", ".log", ".py", ".js", ".ts")):
            return data.decode("utf8", "ignore")
        # unknown: accept if it looks like text
        sample = data[:2000]
        if sample and sum(32 <= b < 127 or b in (9, 10, 13) for b in sample) / len(sample) > 0.9:
            return data.decode("utf8", "ignore")
    except Exception:  # noqa: BLE001 - a broken file should never crash indexing
        return ""
    return ""


def chunk_text(text: str, size: int = 900, overlap: int = 120) -> List[str]:
    """Split on paragraph boundaries into ~size-char chunks with a small overlap."""
    text = re.sub(r"\r\n?", "\n", text).strip()
    if not text:
        return []
    paras = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks: List[str] = []
    cur = ""
    for p in paras:
        while len(p) > size:  # very long paragraph: hard-split on sentences/chars
            cut = p.rfind(". ", 0, size)
            cut = cut + 1 if cut > size // 2 else size
            piece, p = p[:cut].strip(), p[cut:].strip()
            if cur:
                chunks.append(cur)
                cur = ""
            chunks.append(piece)
        if len(cur) + len(p) + 2 <= size:
            cur = f"{cur}\n\n{p}" if cur else p
        else:
            if cur:
                chunks.append(cur)
            tail = cur[-overlap:] if cur and overlap else ""
            cur = f"{tail} {p}".strip() if tail else p
    if cur:
        chunks.append(cur)
    return chunks


WORD_RE = re.compile(r"[a-z0-9À-ɏঀ-৿]+")
STOP = set("a an and are as at be by for from has have i in is it its me my of on or our so that the this to was we were what when where which who will with you your about can do does how please tell".split())


def tokenize(text: str) -> List[str]:
    return [w for w in WORD_RE.findall(text.lower()) if w not in STOP and len(w) > 1]


def local_embed(text: str, dim: int = 256) -> List[float]:
    """A dependency-free 'feature hashing' embedding (words + character trigrams).

    Not as smart as a neural embedder, but fully local, private, deterministic,
    and good at fuzzy matches (typos, plurals). A real embedder can be plugged in
    via Settings → Memory → Embeddings.
    """
    vec = [0.0] * dim
    words = tokenize(text)
    feats: List[Tuple[str, float]] = [(w, 1.0) for w in words]
    for w in words:
        padded = f"#{w}#"
        feats.extend((padded[i : i + 3], 0.35) for i in range(len(padded) - 2))
    for f, weight in feats:
        h = int(hashlib.md5(f.encode()).hexdigest()[:8], 16)
        vec[h % dim] += weight if (h >> 16) & 1 else -weight
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [round(v / norm, 5) for v in vec]


def cosine(a: List[float], b: List[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a)) or 1.0
    nb = math.sqrt(sum(y * y for y in b)) or 1.0
    return dot / (na * nb)


SECRET_PATTERNS = [
    (re.compile(r"\b(sk|pk|rk)-[A-Za-z0-9_\-]{16,}\b"), "API key"),
    (re.compile(r"\bAKIA[0-9A-Z]{16}\b"), "AWS key"),
    (re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}\b"), "GitHub token"),
    (re.compile(r"\bAIza[0-9A-Za-z_\-]{30,}\b"), "Google API key"),
    (re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]+?-----END [A-Z ]*PRIVATE KEY-----"), "private key"),
    (re.compile(r"\b(?:\d[ -]?){13,16}\b"), "card-like number"),
    (re.compile(r"(?i)\b(password|passcode|pin)\s*[:=]\s*\S+"), "password"),
]


def redact(text: str) -> Tuple[str, List[str]]:
    """Mask things that look like secrets before they leave the machine."""
    found: List[str] = []
    for pattern, label in SECRET_PATTERNS:
        def _sub(m, label=label):
            found.append(label)
            return f"[hidden {label}]"
        text = pattern.sub(_sub, text)
    return text, found


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf8", "ignore")).hexdigest()[:16]
