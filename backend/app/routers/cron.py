"""Lembretes no horário dos eventos.

O Render gratuito não roda tarefas agendadas sozinho, então quem "bate o relógio" é o cron-job.org:
ele chama GET /api/cron/reminders?token=CRON_SECRET a cada 5 minutos. Essa mesma chamada mantém
o servidor acordado (substitui o ping no /api/health).

Regras:
- Eventos confirmados ("nosso" aprovado ou "só meu"), um lembrete por evento.
- Com horário: REMINDER_MINUTES antes do início (padrão 30; 0 = na hora).
- Dia inteiro: às 8h do próprio dia.
- "Nosso" avisa os dois; "só meu" avisa só o dono.
- Se o servidor ficou fora do ar e o evento já acabou, o lembrete é descartado (sem aviso atrasado).
"""
import secrets
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from .. import push
from ..common import SP, fmt_when
from ..config import settings
from ..db import get_db, utcnow
from ..models import KIND_SHARED, STATUS_CONFIRMED, Event, User

router = APIRouter(prefix="/api/cron")

ALL_DAY_REMINDER_HOUR = 8


def remind_at(ev: Event):
    if ev.all_day:
        return ev.starts_at + timedelta(hours=ALL_DAY_REMINDER_HOUR)  # starts_at = 00h de São Paulo
    return ev.starts_at - timedelta(minutes=settings.reminder_minutes)


def reminder_text(ev: Event, now) -> tuple[str, str]:
    if ev.all_day:
        return f"Hoje: {ev.title}", "O dia inteiro" + (f" · {ev.location}" if ev.location else "")
    minutes = round((ev.starts_at - now).total_seconds() / 60)
    hour = ev.starts_at.astimezone(SP)
    hour_txt = f"{hour.hour}h" if hour.minute == 0 else f"{hour.hour}h{hour.minute:02d}"
    if minutes <= 1:
        head = f"Agora: {ev.title}"
    elif minutes < 60:
        head = f"Em {minutes} min: {ev.title}"
    else:
        head = f"{ev.title} · {fmt_when(ev.starts_at, False)}"
    return head, f"Começa às {hour_txt}" + (f" · {ev.location}" if ev.location else "")


@router.get("/reminders")
def run_reminders(token: str = Query(""), db: DbSession = Depends(get_db)):
    if not settings.cron_secret:
        raise HTTPException(503, "CRON_SECRET não configurado no servidor.")
    if not secrets.compare_digest(token, settings.cron_secret):
        raise HTTPException(403, "Token inválido.")

    now = utcnow()
    lead = timedelta(minutes=max(settings.reminder_minutes, 0))
    candidates = db.scalars(
        select(Event).where(
            Event.status == STATUS_CONFIRMED,
            Event.reminded_at.is_(None),
            Event.starts_at <= now + lead,
            Event.ends_at > now - timedelta(days=1),
        )
    ).all()

    users = {u.id: u for u in db.scalars(select(User)).all()}
    sent, skipped = 0, 0
    for ev in candidates:
        if remind_at(ev) > now:
            continue  # ainda não é hora (ex.: dia inteiro antes das 8h)
        ev.reminded_at = now
        if ev.ends_at <= now:
            skipped += 1  # já acabou: não manda aviso atrasado
            continue
        title, body = reminder_text(ev, now)
        targets = list(users) if ev.kind == KIND_SHARED else [ev.owner_id]
        for uid in targets:
            push.send_to_user(uid, title, body, f"/evento/{ev.id}", f"lembrete-{ev.id}")
        sent += 1
    db.commit()
    return {"ok": True, "lembretes_enviados": sent, "descartados": skipped}
