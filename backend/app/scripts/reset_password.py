"""Plano B, para quando os dois esquecerem a senha ao mesmo tempo.

Uso: python -m app.scripts.reset_password carol
"""
import getpass
import sys

from sqlalchemy import delete, select

from ..db import SessionLocal
from ..models import Session, User
from ..security import hash_password


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Uso: python -m app.scripts.reset_password <joao|carol>")
    slug = sys.argv[1].lower()
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.slug == slug))
        if not user:
            raise SystemExit(f"Usuário '{slug}' não existe.")
        password = getpass.getpass(f"Nova senha para {user.display_name}: ")
        if len(password) < 6:
            raise SystemExit("A senha precisa ter pelo menos 6 caracteres.")
        user.password_hash = hash_password(password)
        db.execute(delete(Session).where(Session.user_id == user.id))
        db.commit()
    print("Senha trocada. Todos os aparelhos dessa pessoa foram deslogados.")


if __name__ == "__main__":
    main()
