"""Cria (ou atualiza) as contas do João e da Carol.

Uso (no Shell do Render ou localmente):
    python -m app.scripts.create_users

O script pergunta nome, WhatsApp e senha de cada um. Para rodar sem perguntas:
    JOAO_PASSWORD=... CAROL_PASSWORD=... JOAO_WHATSAPP=81999999999 CAROL_WHATSAPP=81988888888 \
    python -m app.scripts.create_users
"""
import getpass
import os
import sys

from sqlalchemy import select

from ..db import SessionLocal
from ..models import User
from ..security import hash_password, normalize_whatsapp

PEOPLE = [("joao", "João"), ("carol", "Carol")]


def ask(prompt: str, env: str, default: str | None = None, secret: bool = False) -> str | None:
    if os.getenv(env):
        return os.getenv(env)
    if not sys.stdin.isatty():  # rodando sem terminal: usa o padrão
        return default
    suffix = f" [{default}]" if default else ""
    value = getpass.getpass(f"{prompt}: ") if secret else input(f"{prompt}{suffix}: ")
    return value.strip() or default


def main() -> None:
    with SessionLocal() as db:
        for slug, default_name in PEOPLE:
            print(f"\n— {default_name} —")
            user = db.scalar(select(User).where(User.slug == slug))
            name = ask("Nome de exibição", f"{slug.upper()}_NAME", user.display_name if user else default_name)
            whatsapp = ask("WhatsApp com DDD (ex.: 81999999999)", f"{slug.upper()}_WHATSAPP",
                           user.whatsapp if user else None)
            password = ask("Senha (deixe vazio para manter)" if user else "Senha", f"{slug.upper()}_PASSWORD",
                           secret=True)
            if not user:
                if not password or len(password) < 6:
                    raise SystemExit("A senha precisa ter pelo menos 6 caracteres.")
                user = User(slug=slug, display_name=name, password_hash=hash_password(password))
                db.add(user)
            else:
                user.display_name = name
                if password:
                    user.password_hash = hash_password(password)
            user.whatsapp = normalize_whatsapp(whatsapp) if whatsapp else None
        db.commit()
    print("\nPronto! Contas criadas/atualizadas. 🦜")


if __name__ == "__main__":
    main()
