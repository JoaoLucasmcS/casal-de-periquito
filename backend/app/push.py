"""Envio de notificações push (Web Push / VAPID)."""
import json
import logging

from pywebpush import WebPushException, webpush
from sqlalchemy import delete, select

from .config import settings
from .db import SessionLocal, utcnow
from .models import PushSubscription

log = logging.getLogger("periquito.push")


def send_to_user(user_id: int, title: str, body: str, url: str = "/", tag: str | None = None) -> None:
    """Envia para todos os aparelhos do usuário. Roda em BackgroundTasks, com sessão própria."""
    if not settings.vapid_private_key:
        log.warning("VAPID_PRIVATE_KEY não configurada; notificação ignorada: %s", title)
        return
    payload = json.dumps({"title": title, "body": body, "url": url, "tag": tag})
    with SessionLocal() as db:
        subs = db.scalars(select(PushSubscription).where(PushSubscription.user_id == user_id)).all()
        dead: list[int] = []
        for sub in subs:
            try:
                webpush(
                    subscription_info={"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
                    data=payload,
                    vapid_private_key=settings.vapid_private_key,
                    vapid_claims={"sub": settings.vapid_subject},
                    ttl=60 * 60 * 24,
                    headers={"Urgency": "high"},
                )
                sub.last_used_at = utcnow()
            except WebPushException as exc:
                status = exc.response.status_code if exc.response is not None else None
                if status in (404, 410):
                    dead.append(sub.id)  # aparelho desinstalou ou revogou a permissão
                else:
                    log.warning("Falha no push (%s): %s", status, exc)
            except Exception as exc:  # noqa: BLE001 — nunca derrubar a requisição por causa de push
                log.warning("Falha no push: %s", exc)
        if dead:
            db.execute(delete(PushSubscription).where(PushSubscription.id.in_(dead)))
        db.commit()
