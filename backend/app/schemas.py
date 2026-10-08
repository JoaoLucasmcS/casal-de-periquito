from datetime import datetime

from pydantic import BaseModel, Field


class ProfileCard(BaseModel):
    slug: str
    display_name: str
    avatar_version: int | None  # None = sem foto


class PartnerOut(ProfileCard):
    whatsapp: str | None


class MeOut(ProfileCard):
    whatsapp: str | None
    partner: PartnerOut


class LoginIn(BaseModel):
    slug: str
    password: str


class MeUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=60)
    whatsapp: str | None = None


class PasswordChange(BaseModel):
    current: str
    new: str


class ResetRequestIn(BaseModel):
    slug: str


class ResetRequestOut(BaseModel):
    id: int
    created_at: datetime
    code_generated: bool
    requester: ProfileCard


class ResetCodeOut(BaseModel):
    code: str
    whatsapp_url: str | None


class ResetConfirmIn(BaseModel):
    slug: str
    code: str
    new_password: str


class EventIn(BaseModel):
    kind: str = Field(pattern="^(shared|personal)$")
    title: str = Field(min_length=1, max_length=120)
    starts_at: datetime
    ends_at: datetime
    all_day: bool = False
    location: str | None = Field(default=None, max_length=200)
    notes: str | None = Field(default=None, max_length=2000)


class EventPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    all_day: bool | None = None
    location: str | None = Field(default=None, max_length=200)
    notes: str | None = Field(default=None, max_length=2000)


class RejectIn(BaseModel):
    comment: str | None = Field(default=None, max_length=500)


class ConflictQuery(BaseModel):
    starts_at: datetime
    ends_at: datetime
    exclude_id: int | None = None


class Permissions(BaseModel):
    approve: bool
    reject: bool
    suggest: bool
    edit: bool
    cancel: bool


class EventOut(BaseModel):
    id: int
    kind: str
    owner: str
    proposed_by: str | None
    title: str
    starts_at: datetime
    ends_at: datetime
    all_day: bool
    location: str | None
    notes: str | None
    status: str
    expired: bool
    rejection_comment: str | None
    decided_at: datetime | None
    updated_at: datetime
    can: Permissions


class PendingOut(BaseModel):
    waiting_me: list[EventOut]
    sent_by_me: list[EventOut]


class PushSubIn(BaseModel):
    endpoint: str
    keys: dict[str, str]


class PushUnsubIn(BaseModel):
    endpoint: str
