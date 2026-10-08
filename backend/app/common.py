from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from .config import settings
from .models import User
from .schemas import PartnerOut, ProfileCard

SP = ZoneInfo(settings.timezone)
WEEKDAYS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"]


def partner_of(db: DbSession, user: User) -> User:
    partner = db.scalar(select(User).where(User.id != user.id).order_by(User.id))
    if not partner:
        raise HTTPException(500, "A outra conta não existe. Rode o script create_users.")
    return partner


def user_by_slug(db: DbSession, slug: str) -> User:
    user = db.scalar(select(User).where(User.slug == slug.lower().strip()))
    if not user:
        raise HTTPException(404, "Pessoa não encontrada.")
    return user


def avatar_version(user: User) -> int | None:
    return int(user.avatar_updated_at.timestamp()) if user.avatar_updated_at else None


def card(user: User) -> ProfileCard:
    return ProfileCard(slug=user.slug, display_name=user.display_name, avatar_version=avatar_version(user))


def partner_out(user: User) -> PartnerOut:
    return PartnerOut(**card(user).model_dump(), whatsapp=user.whatsapp)


def fmt_when(start: datetime, all_day: bool) -> str:
    """Ex.: 'sex 10/10 às 21h' ou 'sex 10/10 (dia inteiro)'."""
    local = start.astimezone(SP)
    day = f"{WEEKDAYS[local.weekday()]} {local:%d/%m}"
    if all_day:
        return f"{day} (dia inteiro)"
    hour = f"{local.hour}h" if local.minute == 0 else f"{local.hour}h{local.minute:02d}"
    return f"{day} às {hour}"
