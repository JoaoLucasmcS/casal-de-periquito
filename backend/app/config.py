import os
from dataclasses import dataclass


def _database_url() -> str:
    url = os.getenv("DATABASE_URL", "sqlite:///./dev.db")
    # Supabase entrega "postgresql://..." ou "postgres://..."; o SQLAlchemy precisa do driver psycopg 3.
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


def _vapid_subject() -> str:
    # A Apple e o pywebpush exigem "mailto:email" ou "https://site". Aceita o e-mail puro e corrige.
    sub = os.getenv("VAPID_SUBJECT", "").strip()
    if not sub:
        return "mailto:voce@example.com"
    if not sub.startswith(("mailto:", "https://")):
        sub = "mailto:" + sub
    return sub


def _clean_key(name: str) -> str:
    # Tolera colar a linha inteira do gen_vapid ("VAPID_PRIVATE_KEY=...") ou com aspas/espaços.
    val = os.getenv(name, "").strip().strip('"').strip("'").strip()
    if val.startswith(name + "="):
        val = val[len(name) + 1:].strip()
    return val


@dataclass(frozen=True)
class Settings:
    database_url: str = _database_url()
    vapid_public_key: str = _clean_key("VAPID_PUBLIC_KEY")
    vapid_private_key: str = _clean_key("VAPID_PRIVATE_KEY")
    vapid_subject: str = _vapid_subject()
    # Em desenvolvimento local (http) o cookie não pode ser Secure.
    cookie_secure: bool = os.getenv("COOKIE_SECURE", "true").lower() == "true"
    # Lembrete: quantos minutos antes do início avisar (0 = na hora). Dia inteiro: às 8h do dia.
    reminder_minutes: int = int(os.getenv("REMINDER_MINUTES", "30"))
    # Hora (de São Paulo) do resumo do dia. Ex.: 8 = 8h da manhã.
    digest_hour: int = int(os.getenv("DIGEST_HOUR", "8"))
    # Senha da URL que o cron-job.org chama para disparar os lembretes.
    cron_secret: str = os.getenv("CRON_SECRET", "")
    session_days: int = 90
    app_name: str = "Casal de Periquito"
    timezone: str = "America/Sao_Paulo"


settings = Settings()
