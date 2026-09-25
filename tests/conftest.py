"""Shared fixtures for the ReWoo test suite.

Every fixture builds a fully isolated ReWoo instance (its own tmp data_dir and
sqlite db, `bootstrap_env=False` so no real API keys from the environment ever
get pulled in) so tests never make real network calls and never share state.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from rewoo.api.app import create_app
from rewoo.config import Config
from rewoo.core import ReWoo


@pytest.fixture
def rw(tmp_path):
    # NOTE: unlike Config.from_env(), the plain Config(...) constructor used here
    # (required so no real env API keys leak into tests) does not create
    # data_dir/upload_dir on disk. /api/memory/upload writes directly into
    # upload_dir without creating it first (see rewoo/api/app.py), so it would
    # crash with FileNotFoundError unless we create the directory ourselves.
    config = Config(data_dir=tmp_path)
    config.upload_dir.mkdir(parents=True, exist_ok=True)
    app = ReWoo(config, db_path=str(tmp_path / "t.db"), bootstrap_env=False)
    return app


@pytest.fixture
def client(rw):
    with TestClient(create_app(rw)) as c:
        yield c
