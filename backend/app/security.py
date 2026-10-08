import hashlib
import re
import secrets
import time
from collections import defaultdict, deque
from datetime import timedelta

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, InvalidHashError
from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy import delete, select
from sqlalchemy.orm import Session as DbSession

from .config import settings
from .db import get_db, utcnow
from .models import Session, User

COOKIE_NAME = "periquito_session"
_hasher = PasswordHasher()


# ---------- senhas ----------

def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, InvalidHashError):
        return False


def validate_new_password(password: str) -> None:
    if len(password) < 6:
        raise HTTPException(400, "A senha precisa ter pelo menos 6 caracteres.")


def normalize_whatsapp(raw: str | None) -> str | None:
    if not raw:
        return None
    digits = re.sub(r"\D", "", raw)
    if len(digits) in (10, 11):  # DDD + número, sem o 55
        digits = "55" + digits
    if not 12 <= len(digits) <= 15:
        raise HTTPException(400, "Número de WhatsApp inválido. Use DDD + número, ex.: 81 99999-9999.")
    return digits


# ---------- sessões ----------

def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def start_session(db: DbSession, response: Response, user: User) -> None:
    token = secrets.token_urlsafe(32)
    now = utcnow()
    db.add(Session(
        user_id=user.id,
        token_hash=_token_hash(token),
        created_at=now,
        last_seen_at=now,
        expires_at=now + timedelta(days=settings.session_days),
    ))
    db.commit()
    _set_cookie(response, token)


def _set_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=settings.session_days * 24 * 3600,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )


def end_session(db: DbSession, request: Request, response: Response) -> None:
    token = request.cookies.get(COOKIE_NAME)
    if token:
        db.execute(delete(Session).where(Session.token_hash == _token_hash(token)))
        db.commit()
    response.delete_cookie(COOKIE_NAME, path="/")


def end_all_sessions(db: DbSession, user: User) -> None:
    db.execute(delete(Session).where(Session.user_id == user.id))
    db.commit()


def current_user(request: Request, response: Response, db: DbSession = Depends(get_db)) -> User:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(401, "Faça login.")
    sess = db.scalar(select(Session).where(Session.token_hash == _token_hash(token)))
    now = utcnow()
    if not sess or sess.expires_at < now:
        raise HTTPException(401, "Sessão expirada. Faça login de novo.")
    # Sessão "deslizante": quem usa o app nunca precisa logar de novo.
    if now - sess.last_seen_at > timedelta(hours=12):
        sess.last_seen_at = now
        sess.expires_at = now + timedelta(days=settings.session_days)
        db.commit()
        _set_cookie(response, token)
    return sess.user


# ---------- limite de tentativas (memória; o Render gratuito roda uma instância só) ----------

class RateLimiter:
    def __init__(self, max_hits: int, window_seconds: int):
        self.max_hits = max_hits
        self.window = window_seconds
        self.hits: dict[str, deque] = defaultdict(deque)

    def _prune(self, key: str) -> deque:
        q = self.hits[key]
        cutoff = time.monotonic() - self.window
        while q and q[0] < cutoff:
            q.popleft()
        return q

    def blocked(self, key: str) -> bool:
        return len(self._prune(key)) >= self.max_hits

    def hit(self, key: str) -> None:
        self._prune(key).append(time.monotonic())

    def reset(self, key: str) -> None:
        self.hits.pop(key, None)


login_limiter = RateLimiter(max_hits=5, window_seconds=15 * 60)
