"""Lembretes e resumo do dia.

O Render gratuito não roda tarefas agendadas sozinho, então quem "bate o relógio" é o cron-job.org:
ele chama GET /api/cron/reminders?token=CRON_SECRET a cada 5 minutos. Essa mesma chamada mantém
o servidor acordado.

Cada chamada faz duas coisas:

1. Resumo do dia (uma vez por dia, a partir de DIGEST_HOUR, padrão 8h de São Paulo):
   "Hoje: Academia 18h, Cinema 21h" para cada um, com os eventos confirmados do dia
   (os "nossos" e os "só meus" de quem recebe) e quantos pedidos esperam resposta.
   Se o dia estiver vazio, não manda nada. Se o servidor ficou fora do ar, manda até as 12h.

2. Lembrete antes do evento (REMINDER_MINUTES antes do início, padrão 30; 0 = na hora):
   só para eventos confirmados com horário. "Nosso" avisa os dois; "só meu" avisa o dono.
   Eventos de dia inteiro já aparecem no resumo, então não geram lembrete separado.
   Se o evento já acabou (servidor fora do ar), o lembrete é descartado.
"""
import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session as DbSession

from .. import push
from ..common import SP, fmt_when
from ..config import settings
from ..db import get_db, utcnow
from ..models import KIND_PERSONAL, KIND_SHARED, STATUS_CONFIRMED, STATUS_PENDING, Event, User

router = APIRouter(prefix="/api/cron")

DIGEST_LAST_HOUR = 12  # depois disso, o resumo do dia não é mais enviado


def _hour(dt: datetime) -> str:
    local = dt.astimezone(SP)
    return f"{local.hour}h" if local.minute == 0 else f"{local.hour}h{local.minute:02d}"


# ---------- resumo do dia ----------

def day_bounds(now: datetime) -> tuple[datetime, datetime, str]:
    local = now.astimezone(SP)
    start = local.replace(hour=0, minute=0, second=0, microsecond=0)
    return start, start + timedelta(days=1), local.strftime("%Y-%m-%d")


def digest_for(db: DbSession, user: User, start: datetime, end: datetime) -> tuple[str, str] | None:
    events = db.scalars(
        select(Event)
        .where(
            Event.status == STATUS_CONFIRMED,
            Event.starts_at < end,
            Event.ends_at > start,
            or_(Event.kind == KIND_SHARED, (Event.kind == KIND_PERSONAL) & (Event.owner_id == user.id)),
        )
        .order_by(Event.all_day.desc(), Event.starts_at)
    ).all()
    waiting = [
        e for e in db.scalars(
            select(Event).where(Event.kind == KIND_SHARED, Event.status == STATUS_PENDING, Event.ends_at > start)
        ).all()
        if e.proposed_by_id != user.id
    ]
    if not events and not waiting:
        return None

    parts = []
    for e in events:
        if e.all_day or e.starts_at < start:
            parts.append(f"{e.title} (dia todo)")
        else:
            parts.append(f"{e.title} {_hour(e.starts_at)}")
    if parts:
        title = "Hoje: " + ", ".join(parts)
        if len(title) > 110:  # notificação no iPhone corta textos longos
            title = f"Hoje: {len(events)} eventos"
            body = ", ".join(parts)
        else:
            body = ""
    else:
        title = "Bom dia! 🦜"
        body = ""
    if waiting:
        n = len(waiting)
        extra = "1 pedido esperando sua resposta" if n == 1 else f"{n} pedidos esperando sua resposta"
        body = f"{body} · {extra}" if body else extra
    if not body:
        body = "Toque para ver a agenda."
    return title, body


def send_digests(db: DbSession, now: datetime) -> int:
    local = now.astimezone(SP)
    if not (settings.digest_hour <= local.hour < DIGEST_LAST_HOUR):
        return 0
    start, end, today = day_bounds(now)
    sent = 0
    for user in db.scalars(select(User).order_by(User.id)).all():
        if user.last_digest_on == today:
            continue
        user.last_digest_on = today  # marca antes de enviar: nunca manda duas vezes
        msg = digest_for(db, user, start, end)
        if msg:
            push.send_to_user(user.id, msg[0], msg[1], "/", f"resumo-{today}")
            sent += 1
    db.commit()
    return sent


# ---------- lembrete antes do evento ----------

def reminder_text(ev: Event, now: datetime) -> tuple[str, str]:
    minutes = round((ev.starts_at - now).total_seconds() / 60)
    if minutes <= 1:
        head = f"Agora: {ev.title}"
    elif minutes < 60:
        head = f"Em {minutes} min: {ev.title}"
    else:
        head = f"{ev.title} · {fmt_when(ev.starts_at, False)}"
    return head, f"Começa às {_hour(ev.starts_at)}" + (f" · {ev.location}" if ev.location else "")


def send_reminders(db: DbSession, now: datetime) -> tuple[int, int]:
    lead = timedelta(minutes=max(settings.reminder_minutes, 0))
    candidates = db.scalars(
        select(Event).where(
            Event.status == STATUS_CONFIRMED,
            Event.reminded_at.is_(None),
            Event.starts_at <= now + lead,
            Event.ends_at > now - timedelta(days=1),
        )
    ).all()
    users = [u.id for u in db.scalars(select(User)).all()]
    sent = skipped = 0
    for ev in candidates:
        ev.reminded_at = now
        if ev.all_day:
            continue  # já vai no resumo do dia
        if ev.ends_at <= now:
            skipped += 1  # já acabou: não manda aviso atrasado
            continue
        title, body = reminder_text(ev, now)
        for uid in (users if ev.kind == KIND_SHARED else [ev.owner_id]):
            push.send_to_user(uid, title, body, f"/evento/{ev.id}", f"lembrete-{ev.id}")
        sent += 1
    db.commit()
    return sent, skipped


@router.get("/reminders")
def run(
    token: str = Query(""),
    token_header: str = Header("", alias="token"),
    db: DbSession = Depends(get_db),
):
    # Aceita o token na URL (?token=...) ou num header "token" (como o cron-job.org permite).
    token = (token or token_header).strip()
    if not settings.cron_secret:
        raise HTTPException(503, "CRON_SECRET não configurado no servidor.")
    if not secrets.compare_digest(token.encode(), settings.cron_secret.encode()):
        raise HTTPException(403, "Token inválido: o valor (na URL ?token= ou no header token) precisa ser igual ao CRON_SECRET do Render, caractere por caractere.")
    now = utcnow()
    resumos = send_digests(db, now)
    enviados, descartados = send_reminders(db, now)
    return {
        "ok": True,
        "hora_sao_paulo": now.astimezone(SP).strftime("%d/%m %H:%M"),
        "resumos_enviados": resumos,
        "lembretes_enviados": enviados,
        "descartados": descartados,
    }
