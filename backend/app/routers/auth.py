import secrets
from datetime import timedelta
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from fastapi.responses import Response as RawResponse
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from .. import push
from ..config import settings
from ..db import get_db, utcnow
from ..models import PasswordResetRequest, User
from ..schemas import (
    LoginIn, MeOut, MeUpdate, PasswordChange, ProfileCard, ResetCodeOut,
    ResetConfirmIn, ResetRequestIn, ResetRequestOut,
)
from ..security import (
    current_user, end_all_sessions, end_session, hash_password, login_limiter,
    normalize_whatsapp, start_session, validate_new_password, verify_password,
)
from ..common import card, partner_of, partner_out, user_by_slug

router = APIRouter(prefix="/api")

RESET_REQUEST_COOLDOWN = timedelta(minutes=5)
RESET_REQUEST_WINDOW = timedelta(hours=24)   # tempo para o parceiro gerar o código
RESET_CODE_TTL = timedelta(minutes=10)
RESET_MAX_ATTEMPTS = 5
MAX_AVATAR_BYTES = 300 * 1024


def me_out(db: DbSession, user: User) -> MeOut:
    return MeOut(**card(user).model_dump(), whatsapp=user.whatsapp, partner=partner_out(partner_of(db, user)))


# ---------- perfis e login ----------

@router.get("/auth/profiles", response_model=list[ProfileCard])
def profiles(db: DbSession = Depends(get_db)):
    return [card(u) for u in db.scalars(select(User).order_by(User.id)).all()]


@router.get("/users/{slug}/avatar")
def avatar(slug: str, db: DbSession = Depends(get_db)):
    user = user_by_slug(db, slug)
    if not user.avatar:
        raise HTTPException(404, "Sem foto.")
    return RawResponse(
        content=user.avatar,
        media_type=user.avatar_mime or "image/jpeg",
        headers={"Cache-Control": "public, max-age=31536000, immutable"},  # a URL leva ?v=versão
    )


@router.post("/auth/login", response_model=MeOut)
def login(body: LoginIn, response: Response, db: DbSession = Depends(get_db)):
    key = body.slug.lower().strip()
    if login_limiter.blocked(key):
        raise HTTPException(429, "Muitas tentativas. Espere 15 minutos.")
    user = db.scalar(select(User).where(User.slug == key))
    if not user or not verify_password(user.password_hash, body.password):
        login_limiter.hit(key)
        raise HTTPException(401, "Senha incorreta.")
    login_limiter.reset(key)
    start_session(db, response, user)
    return me_out(db, user)


@router.post("/auth/logout", status_code=204)
def logout(request: Request, response: Response, db: DbSession = Depends(get_db)):
    end_session(db, request, response)
    response.status_code = 204
    return response


# ---------- perfil ----------

@router.get("/me", response_model=MeOut)
def get_me(user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    return me_out(db, user)


@router.patch("/me", response_model=MeOut)
def update_me(body: MeUpdate, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    user = db.merge(user)
    if body.display_name is not None:
        user.display_name = body.display_name.strip()
    if "whatsapp" in body.model_fields_set:
        user.whatsapp = normalize_whatsapp(body.whatsapp)
    db.commit()
    return me_out(db, user)


@router.put("/me/avatar", response_model=MeOut)
async def upload_avatar(request: Request, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    mime = request.headers.get("content-type", "").split(";")[0].strip()
    if mime not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(400, "Envie uma imagem JPEG, PNG ou WebP.")
    data = await request.body()
    if not data or len(data) > MAX_AVATAR_BYTES:
        raise HTTPException(400, "Imagem vazia ou grande demais.")
    user = db.merge(user)
    user.avatar = data
    user.avatar_mime = mime
    user.avatar_updated_at = utcnow()
    db.commit()
    return me_out(db, user)


@router.put("/me/password", status_code=204)
def change_password(
    body: PasswordChange, response: Response,
    user: User = Depends(current_user), db: DbSession = Depends(get_db),
):
    if not verify_password(user.password_hash, body.current):
        raise HTTPException(400, "Senha atual incorreta.")
    validate_new_password(body.new)
    user = db.merge(user)
    user.password_hash = hash_password(body.new)
    db.commit()
    end_all_sessions(db, user)        # derruba os outros aparelhos...
    start_session(db, response, user)  # ...e mantém este logado
    response.status_code = 204
    return response


# ---------- recuperação de senha (o parceiro gera o código) ----------

@router.post("/auth/reset-requests", status_code=202)
def request_reset(body: ResetRequestIn, background: BackgroundTasks, db: DbSession = Depends(get_db)):
    user = user_by_slug(db, body.slug)
    now = utcnow()
    recent = db.scalar(
        select(PasswordResetRequest)
        .where(PasswordResetRequest.user_id == user.id, PasswordResetRequest.used_at.is_(None))
        .order_by(PasswordResetRequest.created_at.desc())
    )
    if recent and now - recent.created_at < RESET_REQUEST_COOLDOWN:
        return {"ok": True}  # já pediu há pouco; não notifica de novo
    db.add(PasswordResetRequest(user_id=user.id, created_at=now))
    db.commit()
    partner = partner_of(db, user)
    background.add_task(
        push.send_to_user, partner.id,
        f"{user.display_name} esqueceu a senha 🔑",
        "Toque para gerar o código e mandar pelo WhatsApp.",
        "/", "reset",
    )
    return {"ok": True}


@router.get("/reset-requests/for-me", response_model=list[ResetRequestOut])
def reset_requests_for_me(user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    partner = partner_of(db, user)
    since = utcnow() - RESET_REQUEST_WINDOW
    reqs = db.scalars(
        select(PasswordResetRequest)
        .where(
            PasswordResetRequest.user_id == partner.id,
            PasswordResetRequest.used_at.is_(None),
            PasswordResetRequest.created_at > since,
        )
        .order_by(PasswordResetRequest.created_at.desc())
    ).all()
    # Mostra só o mais recente — basta um código.
    return [
        ResetRequestOut(id=r.id, created_at=r.created_at, code_generated=r.code_hash is not None, requester=card(partner))
        for r in reqs[:1]
    ]


@router.post("/reset-requests/{req_id}/code", response_model=ResetCodeOut)
def generate_reset_code(req_id: int, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    req = db.get(PasswordResetRequest, req_id)
    if not req or req.used_at is not None or req.user_id == user.id:
        raise HTTPException(404, "Pedido não encontrado.")
    if utcnow() - req.created_at > RESET_REQUEST_WINDOW:
        raise HTTPException(410, "Esse pedido expirou. Peça de novo.")
    code = f"{secrets.randbelow(1_000_000):06d}"
    now = utcnow()
    req.code_hash = hash_password(code)
    req.code_generated_at = now
    req.expires_at = now + RESET_CODE_TTL
    req.attempts = 0
    db.commit()
    target = req.user
    url = None
    if target.whatsapp:
        text = f"Seu código do {settings.app_name}: {code} (vale 10 minutos) 🦜"
        url = f"https://wa.me/{target.whatsapp}?text={quote(text)}"
    return ResetCodeOut(code=code, whatsapp_url=url)


@router.post("/auth/reset", response_model=MeOut)
def confirm_reset(body: ResetConfirmIn, response: Response, db: DbSession = Depends(get_db)):
    user = user_by_slug(db, body.slug)
    req = db.scalar(
        select(PasswordResetRequest)
        .where(
            PasswordResetRequest.user_id == user.id,
            PasswordResetRequest.used_at.is_(None),
            PasswordResetRequest.code_hash.is_not(None),
        )
        .order_by(PasswordResetRequest.code_generated_at.desc())
    )
    if not req or req.expires_at is None or req.expires_at < utcnow():
        raise HTTPException(400, "Código expirado ou inexistente. Peça um novo.")
    if req.attempts >= RESET_MAX_ATTEMPTS:
        raise HTTPException(429, "Tentativas esgotadas. Peça um novo código.")
    if not verify_password(req.code_hash, body.code.strip()):
        req.attempts += 1
        db.commit()
        left = RESET_MAX_ATTEMPTS - req.attempts
        raise HTTPException(400, f"Código incorreto. Restam {left} tentativa(s).")
    validate_new_password(body.new_password)
    user.password_hash = hash_password(body.new_password)
    req.used_at = utcnow()
    db.commit()
    end_all_sessions(db, user)
    login_limiter.reset(user.slug)
    start_session(db, response, user)
    return me_out(db, user)
