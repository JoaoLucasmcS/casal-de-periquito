"""Eventos e o fluxo propor → aprovar. As regras estão na seção 2 da especificação."""
from datetime import datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session as DbSession

from .. import push
from ..common import fmt_when, partner_of
from ..db import get_db, utcnow
from ..models import (
    KIND_PERSONAL, KIND_SHARED, STATUS_CANCELLED, STATUS_CONFIRMED, STATUS_PENDING,
    STATUS_REJECTED, Event, User,
)
from ..schemas import ConflictQuery, EventIn, EventOut, EventPatch, PendingOut, Permissions, RejectIn
from ..security import current_user

router = APIRouter(prefix="/api/events")

REJECTED_DAYS = 30
MAX_EVENT_LENGTH = timedelta(days=2)
VISIBLE = (STATUS_PENDING, STATUS_CONFIRMED)


# ---------- helpers ----------

def is_expired(ev: Event) -> bool:
    return ev.status == STATUS_PENDING and ev.ends_at < utcnow()


def permissions(ev: Event, me: User) -> Permissions:
    if ev.kind == KIND_PERSONAL:
        mine = ev.owner_id == me.id
        return Permissions(approve=False, reject=False, suggest=False, edit=mine, cancel=mine)
    i_proposed = ev.proposed_by_id == me.id
    pending = ev.status == STATUS_PENDING
    expired = is_expired(ev)
    if pending:
        return Permissions(
            approve=not i_proposed and not expired,
            reject=not i_proposed and not expired,
            suggest=not i_proposed,
            edit=i_proposed,
            cancel=i_proposed,
        )
    if ev.status == STATUS_CONFIRMED:
        return Permissions(approve=False, reject=False, suggest=False, edit=True, cancel=True)
    if ev.status == STATUS_REJECTED:
        return Permissions(approve=False, reject=False, suggest=False, edit=i_proposed, cancel=i_proposed)
    return Permissions(approve=False, reject=False, suggest=False, edit=False, cancel=False)


def out(ev: Event, me: User) -> EventOut:
    return EventOut(
        id=ev.id,
        kind=ev.kind,
        owner=ev.owner.slug,
        proposed_by=ev.proposed_by.slug if ev.proposed_by else None,
        title=ev.title,
        starts_at=ev.starts_at,
        ends_at=ev.ends_at,
        all_day=ev.all_day,
        location=ev.location,
        notes=ev.notes,
        status=ev.status,
        expired=is_expired(ev),
        rejection_comment=ev.rejection_comment,
        decided_at=ev.decided_at,
        updated_at=ev.updated_at,
        can=permissions(ev, me),
    )


def get_visible_event(db: DbSession, event_id: int) -> Event:
    ev = db.get(Event, event_id)
    if not ev or ev.status == STATUS_CANCELLED:
        raise HTTPException(404, "Evento não encontrado.")
    return ev


def validate_times(starts_at: datetime, ends_at: datetime) -> None:
    if starts_at.tzinfo is None or ends_at.tzinfo is None:
        raise HTTPException(400, "Datas precisam ter fuso horário.")
    if ends_at <= starts_at:
        raise HTTPException(400, "O fim precisa ser depois do início.")
    if ends_at - starts_at > MAX_EVENT_LENGTH:
        raise HTTPException(400, "O evento pode durar no máximo 2 dias.")


def clean(text: str | None) -> str | None:
    if text is None:
        return None
    text = text.strip()
    return text or None


def notify(bg: BackgroundTasks, user: User, title: str, body: str, ev: Event) -> None:
    bg.add_task(push.send_to_user, user.id, title, body, f"/evento/{ev.id}", f"evento-{ev.id}")


def overlapping(db: DbSession, starts_at: datetime, ends_at: datetime, exclude_id: int | None = None):
    q = select(Event).where(
        Event.status.in_(VISIBLE),
        Event.starts_at < ends_at,
        Event.ends_at > starts_at,
    )
    if exclude_id:
        q = q.where(Event.id != exclude_id)
    return db.scalars(q.order_by(Event.starts_at)).all()


# ---------- leitura ----------

@router.get("", response_model=list[EventOut])
def list_events(
    from_: datetime = Query(alias="from"),
    to: datetime = Query(),
    me: User = Depends(current_user),
    db: DbSession = Depends(get_db),
):
    if to - from_ > timedelta(days=62):
        raise HTTPException(400, "Intervalo grande demais.")
    return [out(ev, me) for ev in overlapping(db, from_, to)]


@router.get("/pending", response_model=PendingOut)
def pending(me: User = Depends(current_user), db: DbSession = Depends(get_db)):
    evs = db.scalars(
        select(Event)
        .where(Event.kind == KIND_SHARED, Event.status == STATUS_PENDING)
        .order_by(Event.starts_at)
    ).all()
    waiting = [out(e, me) for e in evs if e.proposed_by_id != me.id and not is_expired(e)]
    sent = [out(e, me) for e in evs if e.proposed_by_id == me.id]
    return PendingOut(waiting_me=waiting, sent_by_me=sent)


@router.get("/rejected", response_model=list[EventOut])
def rejected(me: User = Depends(current_user), db: DbSession = Depends(get_db)):
    since = utcnow() - timedelta(days=REJECTED_DAYS)
    evs = db.scalars(
        select(Event)
        .where(
            Event.kind == KIND_SHARED,
            Event.status == STATUS_REJECTED,
            Event.proposed_by_id == me.id,
            Event.decided_at > since,
        )
        .order_by(Event.decided_at.desc())
    ).all()
    return [out(e, me) for e in evs]


@router.post("/conflicts", response_model=list[EventOut])
def conflicts(body: ConflictQuery, me: User = Depends(current_user), db: DbSession = Depends(get_db)):
    if body.ends_at <= body.starts_at:
        return []
    return [out(ev, me) for ev in overlapping(db, body.starts_at, body.ends_at, body.exclude_id)]


@router.get("/{event_id}", response_model=EventOut)
def get_event(event_id: int, me: User = Depends(current_user), db: DbSession = Depends(get_db)):
    return out(get_visible_event(db, event_id), me)


# ---------- escrita ----------

@router.post("", response_model=EventOut, status_code=201)
def create_event(
    body: EventIn, bg: BackgroundTasks,
    me: User = Depends(current_user), db: DbSession = Depends(get_db),
):
    validate_times(body.starts_at, body.ends_at)
    shared = body.kind == KIND_SHARED
    ev = Event(
        kind=body.kind,
        owner_id=me.id,
        proposed_by_id=me.id if shared else None,
        title=body.title.strip(),
        starts_at=body.starts_at,
        ends_at=body.ends_at,
        all_day=body.all_day,
        location=clean(body.location),
        notes=clean(body.notes),
        status=STATUS_PENDING if shared else STATUS_CONFIRMED,
    )
    db.add(ev)
    db.commit()
    db.refresh(ev)
    if shared:
        notify(bg, partner_of(db, me), f"Novo pedido de {me.display_name} 🦜",
               f"{ev.title} · {fmt_when(ev.starts_at, ev.all_day)}", ev)
    return out(ev, me)


@router.patch("/{event_id}", response_model=EventOut)
def update_event(
    event_id: int, body: EventPatch, bg: BackgroundTasks,
    me: User = Depends(current_user), db: DbSession = Depends(get_db),
):
    ev = get_visible_event(db, event_id)
    fields = body.model_fields_set
    can = permissions(ev, me)

    new_start = body.starts_at if "starts_at" in fields and body.starts_at else ev.starts_at
    new_end = body.ends_at if "ends_at" in fields and body.ends_at else ev.ends_at
    new_all_day = body.all_day if "all_day" in fields and body.all_day is not None else ev.all_day
    time_changed = (new_start, new_end, new_all_day) != (ev.starts_at, ev.ends_at, ev.all_day)
    text_fields = {"title", "location", "notes"} & fields

    # Quem recebeu o pedido só pode "sugerir outro horário": mexe só em data/hora.
    suggesting = ev.kind == KIND_SHARED and ev.status == STATUS_PENDING and can.suggest
    if suggesting:
        if text_fields:
            raise HTTPException(403, "Ao sugerir outro horário, só data e hora podem mudar.")
        if not time_changed:
            raise HTTPException(400, "Escolha um horário diferente para sugerir.")
    elif not can.edit:
        raise HTTPException(403, "Você não pode editar esse evento.")

    if time_changed:
        validate_times(new_start, new_end)
    ev.starts_at, ev.ends_at, ev.all_day = new_start, new_end, new_all_day
    if "title" in fields and body.title:
        ev.title = body.title.strip()
    if "location" in fields:
        ev.location = clean(body.location)
    if "notes" in fields:
        ev.notes = clean(body.notes)

    partner = partner_of(db, me)
    when = fmt_when(ev.starts_at, ev.all_day)

    if ev.kind == KIND_SHARED:
        if suggesting:
            ev.proposed_by_id = me.id
            notify(bg, partner, f"{me.display_name} sugeriu outro horário",
                   f"{ev.title} · {when}", ev)
        elif ev.status == STATUS_REJECTED:
            # Propor de novo depois de uma recusa
            ev.status = STATUS_PENDING
            ev.rejection_comment = None
            ev.decided_at = None
            notify(bg, partner, f"{me.display_name} propôs de novo 🦜", f"{ev.title} · {when}", ev)
        elif ev.status == STATUS_CONFIRMED and time_changed:
            ev.status = STATUS_PENDING
            ev.proposed_by_id = me.id
            ev.decided_at = None
            notify(bg, partner, f"{me.display_name} mudou o horário",
                   f"{ev.title} · {when} — precisa da sua aprovação", ev)
        elif ev.status == STATUS_PENDING and time_changed:
            # Quem propôs ajustou o próprio pedido
            notify(bg, partner, f"{me.display_name} alterou o pedido", f"{ev.title} · {when}", ev)
        # Mudança só de texto: sem notificação.

    db.commit()
    db.refresh(ev)
    return out(ev, me)


@router.post("/{event_id}/approve", response_model=EventOut)
def approve(event_id: int, bg: BackgroundTasks, me: User = Depends(current_user), db: DbSession = Depends(get_db)):
    ev = get_visible_event(db, event_id)
    if not permissions(ev, me).approve:
        raise HTTPException(403, "Você não pode aprovar esse evento.")
    ev.status = STATUS_CONFIRMED
    ev.decided_at = utcnow()
    db.commit()
    db.refresh(ev)
    notify(bg, ev.proposed_by, f"{me.display_name} aprovou! 💚", f"{ev.title} · {fmt_when(ev.starts_at, ev.all_day)}", ev)
    return out(ev, me)


@router.post("/{event_id}/reject", response_model=EventOut)
def reject(
    event_id: int, body: RejectIn, bg: BackgroundTasks,
    me: User = Depends(current_user), db: DbSession = Depends(get_db),
):
    ev = get_visible_event(db, event_id)
    if not permissions(ev, me).reject:
        raise HTTPException(403, "Você não pode recusar esse evento.")
    ev.status = STATUS_REJECTED
    ev.rejection_comment = clean(body.comment)
    ev.decided_at = utcnow()
    db.commit()
    db.refresh(ev)
    msg = f"{ev.title}: “{ev.rejection_comment}”" if ev.rejection_comment else f"{ev.title} · toque para conversar"
    notify(bg, ev.proposed_by, f"{me.display_name} recusou", msg, ev)
    return out(ev, me)


@router.post("/{event_id}/cancel", status_code=204)
def cancel(event_id: int, bg: BackgroundTasks, me: User = Depends(current_user), db: DbSession = Depends(get_db)):
    ev = get_visible_event(db, event_id)
    if not permissions(ev, me).cancel:
        raise HTTPException(403, "Você não pode cancelar esse evento.")
    was = ev.status
    ev.status = STATUS_CANCELLED
    db.commit()
    if ev.kind == KIND_SHARED and was in (STATUS_PENDING, STATUS_CONFIRMED):
        bg.add_task(
            push.send_to_user, partner_of(db, me).id,
            f"{me.display_name} cancelou",
            f"{ev.title} · {fmt_when(ev.starts_at, ev.all_day)}",
            "/", f"evento-{ev.id}",
        )
