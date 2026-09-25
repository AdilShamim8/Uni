"""Recipes: one-click, reusable workflows.

A recipe is a friendly card ("Brief me on a topic") with a few blanks to fill
in. Under the hood it's just a prompt template + a helper + optional
constraints. Users can add their own by dropping a JSON file in
`rewoo/recipes/` or `<data_dir>/recipes/`.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

HERE = Path(__file__).parent


def load_recipes(extra_dir: Optional[Path] = None) -> List[Dict[str, Any]]:
    out: Dict[str, Dict[str, Any]] = {}
    for folder in [HERE, extra_dir]:
        if not folder or not Path(folder).exists():
            continue
        for f in sorted(Path(folder).glob("*.json")):
            try:
                data = json.loads(f.read_text(encoding="utf-8"))
            except ValueError:
                continue
            for r in data if isinstance(data, list) else [data]:
                if r.get("id") and r.get("prompt"):
                    out[r["id"]] = r
    return sorted(out.values(), key=lambda r: r.get("order", 99))


def render(recipe: Dict[str, Any], inputs: Dict[str, str]) -> str:
    missing = [f["name"] for f in recipe.get("fields", []) if f.get("required", True) and not str(inputs.get(f["name"], "")).strip()]
    if missing:
        raise ValueError(f"Please fill in: {', '.join(missing)}")

    def sub(m):
        return str(inputs.get(m.group(1), "")).strip()

    return re.sub(r"\{(\w+)\}", sub, recipe["prompt"]).strip()
