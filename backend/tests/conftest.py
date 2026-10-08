import os
import pathlib
import tempfile

# Banco de teste: Postgres se TEST_DATABASE_URL estiver definido, senão um SQLite temporário.
_tmp = pathlib.Path(tempfile.mkdtemp()) / "test.db"
os.environ["DATABASE_URL"] = os.getenv("TEST_DATABASE_URL", f"sqlite:///{_tmp}")
os.environ.setdefault("VAPID_PUBLIC_KEY", "test-public-key")

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import push  # noqa: E402
from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User  # noqa: E402
from app.security import hash_password, login_limiter  # noqa: E402

BACKEND = pathlib.Path(__file__).resolve().parents[1]
PASSWORDS = {"joao": "senha-do-joao", "carol": "senha-da-carol"}


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(engine)
    with engine.begin() as conn:
        conn.exec_driver_sql("DROP TABLE IF EXISTS alembic_version")
    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND / "alembic"))
    command.upgrade(cfg, "head")  # garante que a migração cria tudo certo
    with SessionLocal() as db:
        db.add_all([
            User(slug="joao", display_name="João", password_hash=hash_password(PASSWORDS["joao"]), whatsapp="5581999990001"),
            User(slug="carol", display_name="Carol", password_hash=hash_password(PASSWORDS["carol"]), whatsapp="5581999990002"),
        ])
        db.commit()
    login_limiter.hits.clear()
    yield


@pytest.fixture
def pushes(monkeypatch):
    sent = []

    def fake_send(user_id, title, body, url="/", tag=None):
        with SessionLocal() as db:
            sent.append({"to": db.get(User, user_id).slug, "title": title, "body": body, "url": url})

    monkeypatch.setattr(push, "send_to_user", fake_send)
    return sent


def make_client(slug: str | None = None) -> TestClient:
    c = TestClient(app, base_url="https://testserver", headers={"X-Requested-With": "periquito"})
    if slug:
        r = c.post("/api/auth/login", json={"slug": slug, "password": PASSWORDS[slug]})
        assert r.status_code == 200, r.text
    return c


@pytest.fixture
def joao():
    return make_client("joao")


@pytest.fixture
def carol():
    return make_client("carol")
