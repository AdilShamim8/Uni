"""Evaluation harness: the shipped default scenario suite should pass end to end
against the offline Demo brain."""
from __future__ import annotations

import asyncio

from rewoo.harness.runner import run_suite


def test_default_suite_all_pass():
    report = asyncio.run(run_suite())
    failing = [r for r in report["results"] if not r["passed"]]
    assert not failing, f"failing scenarios: {failing}"
    assert report["summary"]["failed"] == 0
    assert report["summary"]["total"] == report["summary"]["passed"]
