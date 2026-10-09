from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session as DbSession

from .. import push
from ..config import settings
from ..db import get_db
from ..models import PushSubscription, User
from ..schemas import PushSubIn, PushUnsubIn
from ..security import current_user

router = APIRouter(prefix="/api/push")


@router.get("/vapid-public-key")
def vapid_public_key():
    if not settings.vapid_public_key:
        raise HTTPException(503, "Notificações não configuradas no servidor (VAPID).")
    return {"key": settings.vapid_public_key}


@router.post("/subscriptions", status_code=204)
def subscribe(body: PushSubIn, request: Request, me: User = Depends(current_user), db: DbSession = Depends(get_db)):
    if "p256dh" not in body.keys or "auth" not in body.keys:
        raise HTTPException(400, "Assinatura inválida.")
    sub = db.scalar(select(PushSubscription).where(PushSubscription.endpoint == body.endpoint))
    if sub is None:
        sub = PushSubscription(endpoint=body.endpoint)
        db.add(sub)
    # Se o aparelho mudou de dono (logout/login com a outra conta), passa a ser de quem está logado.
    sub.user_id = me.id
    sub.p256dh = body.keys["p256dh"]
    sub.auth = body.keys["auth"]
    sub.user_agent = (request.headers.get("user-agent") or "")[:300]
    db.commit()


@router.delete("/subscriptions", status_code=204)
def unsubscribe(body: PushUnsubIn, me: User = Depends(current_user), db: DbSession = Depends(get_db)):
    db.execute(delete(PushSubscription).where(
        PushSubscription.endpoint == body.endpoint, PushSubscription.user_id == me.id,
    ))
    db.commit()


@router.get("/subscriptions/count")
def count(me: User = Depends(current_user), db: DbSession = Depends(get_db)):
    n = db.scalar(select(func.count()).select_from(PushSubscription).where(PushSubscription.user_id == me.id))
    return {"count": n or 0}


@router.post("/test")
def send_test(me: User = Depends(current_user)):
    """Botão "Enviar notificação de teste" do perfil: manda para os aparelhos de quem está logado."""
    if not push.configured():
        raise HTTPException(503, "O servidor está sem as chaves VAPID (VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY no Render).")
    r = push.send_to_user(me.id, "Teste do Casal de Periquito 🦜", "Se você está lendo isto, as notificações funcionam!", "/perfil", "teste")
    return {"devices": r.devices, "sent": r.sent, "removed": r.removed, "errors": r.errors}
