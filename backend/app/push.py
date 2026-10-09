"""Envio de notificações push (Web Push / VAPID).

Fluxo: o iPhone se inscreve (tabela push_subscriptions) → o servidor assina com a chave VAPID
e manda para o endpoint da Apple → o service worker (frontend/src/sw.ts) mostra a notificação.
"""
import json
import logging
from dataclasses import dataclass, field

from pywebpush import WebPushException, webpush
from sqlalchemy import delete, select

from .config import settings
from .db import SessionLocal, utcnow
from .models import PushSubscription

log = logging.getLogger("periquito.push")


def configured() -> bool:
    return bool(settings.vapid_public_key and settings.vapid_private_key)


@dataclass
class PushResult:
    devices: int = 0
    sent: int = 0
    removed: int = 0  # aparelhos que desinstalaram/revogaram (apagados)
    errors: list[str] = field(default_factory=list)


def _describe(exc: WebPushException) -> str:
    resp = exc.response
    if resp is None:
        return f"sem resposta do serviço de push ({exc})"
    text = (resp.text or "").strip()[:200]
    return f"{resp.status_code} {text}".strip()


def send_to_user(user_id: int, title: str, body: str, url: str = "/", tag: str | None = None) -> PushResult:
    """Envia para todos os aparelhos do usuário. Nunca levanta exceção."""
    result = PushResult()
    if not configured():
        msg = "VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY não configuradas no servidor"
        log.error("%s; notificação ignorada: %s", msg, title)
        result.errors.append(msg)
        return result
    payload = json.dumps({"title": title, "body": body, "url": url, "tag": tag})
    with SessionLocal() as db:
        subs = db.scalars(select(PushSubscription).where(PushSubscription.user_id == user_id)).all()
        result.devices = len(subs)
        if not subs:
            log.warning("Usuário %s não tem aparelho inscrito; notificação ignorada: %s", user_id, title)
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
                    timeout=10,
                )
                sub.last_used_at = utcnow()
                result.sent += 1
            except WebPushException as exc:
                status = exc.response.status_code if exc.response is not None else None
                if status in (404, 410):
                    dead.append(sub.id)  # aparelho desinstalou ou revogou a permissão
                else:
                    desc = _describe(exc)
                    log.error("Push recusado para usuário %s: %s", user_id, desc)
                    result.errors.append(desc)
            except Exception as exc:  # noqa: BLE001 — nunca derrubar a requisição por causa de push
                log.exception("Falha no push")
                result.errors.append(str(exc)[:200])
        if dead:
            db.execute(delete(PushSubscription).where(PushSubscription.id.in_(dead)))
            result.removed = len(dead)
        db.commit()
    log.info("Push '%s' → usuário %s: %s/%s enviados", title, user_id, result.sent, result.devices)
    return result
