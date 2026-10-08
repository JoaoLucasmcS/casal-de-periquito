from datetime import datetime, timedelta, timezone

from tests.conftest import make_client

SP = timezone(timedelta(hours=-3))


def at(days: int, hour: int, minutes: int = 60):
    start = (datetime.now(SP) + timedelta(days=days)).replace(hour=hour, minute=0, second=0, microsecond=0)
    return start.isoformat(), (start + timedelta(minutes=minutes)).isoformat()


def shared(title="Show sexta", days=3, hour=21):
    s, e = at(days, hour)
    return {"kind": "shared", "title": title, "starts_at": s, "ends_at": e}


# ---------- login ----------

def test_profiles_and_login(joao):
    anon = make_client()
    cards = anon.get("/api/auth/profiles").json()
    assert [c["slug"] for c in cards] == ["joao", "carol"]
    assert anon.get("/api/me").status_code == 401
    me = joao.get("/api/me").json()
    assert me["slug"] == "joao" and me["partner"]["slug"] == "carol"
    assert me["partner"]["whatsapp"] == "5581999990002"


def test_wrong_password_and_rate_limit():
    c = make_client()
    for _ in range(5):
        assert c.post("/api/auth/login", json={"slug": "carol", "password": "errada"}).status_code == 401
    assert c.post("/api/auth/login", json={"slug": "carol", "password": "senha-da-carol"}).status_code == 429


def test_csrf_header_required():
    from fastapi.testclient import TestClient
    from app.main import app
    raw = TestClient(app, base_url="https://testserver")
    r = raw.post("/api/auth/login", json={"slug": "joao", "password": "senha-do-joao"})
    assert r.status_code == 403


def test_logout(joao):
    assert joao.post("/api/auth/logout").status_code == 204
    assert joao.get("/api/me").status_code == 401


# ---------- fluxo propor → aprovar ----------

def test_propose_and_approve(joao, carol, pushes):
    ev = joao.post("/api/events", json=shared()).json()
    assert ev["status"] == "pending" and ev["proposed_by"] == "joao"
    assert ev["can"]["approve"] is False and ev["can"]["cancel"] is True
    assert pushes[-1]["to"] == "carol" and "Novo pedido" in pushes[-1]["title"]
    assert pushes[-1]["url"] == f"/evento/{ev['id']}"

    waiting = carol.get("/api/events/pending").json()
    assert [e["id"] for e in waiting["waiting_me"]] == [ev["id"]]
    assert joao.get("/api/events/pending").json()["sent_by_me"][0]["id"] == ev["id"]

    assert joao.post(f"/api/events/{ev['id']}/approve").status_code == 403  # não aprova o próprio
    ok = carol.post(f"/api/events/{ev['id']}/approve").json()
    assert ok["status"] == "confirmed"
    assert pushes[-1]["to"] == "joao" and "aprovou" in pushes[-1]["title"]


def test_reject_with_comment_then_repropose(joao, carol, pushes):
    ev = joao.post("/api/events", json=shared()).json()
    r = carol.post(f"/api/events/{ev['id']}/reject", json={"comment": "tenho prova"}).json()
    assert r["status"] == "rejected" and r["rejection_comment"] == "tenho prova"
    assert pushes[-1]["to"] == "joao" and "tenho prova" in pushes[-1]["body"]

    assert [e["id"] for e in joao.get("/api/events/rejected").json()] == [ev["id"]]
    assert carol.get("/api/events/rejected").json() == []

    s, e = at(4, 20)
    again = joao.patch(f"/api/events/{ev['id']}", json={"starts_at": s, "ends_at": e}).json()
    assert again["status"] == "pending" and again["rejection_comment"] is None
    assert pushes[-1]["to"] == "carol" and "de novo" in pushes[-1]["title"]


def test_suggest_other_time(joao, carol, pushes):
    ev = joao.post("/api/events", json=shared()).json()
    # Carol não pode mudar o título ao sugerir
    assert carol.patch(f"/api/events/{ev['id']}", json={"title": "outro"}).status_code == 403
    s, e = at(3, 20)
    sug = carol.patch(f"/api/events/{ev['id']}", json={"starts_at": s, "ends_at": e}).json()
    assert sug["status"] == "pending" and sug["proposed_by"] == "carol"
    assert pushes[-1]["to"] == "joao" and "sugeriu" in pushes[-1]["title"]
    # Agora é o João quem aprova
    assert carol.post(f"/api/events/{ev['id']}/approve").status_code == 403
    assert joao.post(f"/api/events/{ev['id']}/approve").json()["status"] == "confirmed"


def test_confirmed_time_change_goes_back_to_pending(joao, carol, pushes):
    ev = joao.post("/api/events", json=shared()).json()
    carol.post(f"/api/events/{ev['id']}/approve")
    n = len(pushes)
    # Mudar só o texto: continua confirmado e não notifica
    t = carol.patch(f"/api/events/{ev['id']}", json={"location": "Marco Zero"}).json()
    assert t["status"] == "confirmed" and t["location"] == "Marco Zero" and len(pushes) == n
    # Mudar o horário: volta a pendente, proposto por quem mudou
    s, e = at(5, 19)
    p = carol.patch(f"/api/events/{ev['id']}", json={"starts_at": s, "ends_at": e}).json()
    assert p["status"] == "pending" and p["proposed_by"] == "carol"
    assert pushes[-1]["to"] == "joao" and "mudou o horário" in pushes[-1]["title"]


def test_cancel_rules(joao, carol, pushes):
    ev = joao.post("/api/events", json=shared()).json()
    assert carol.post(f"/api/events/{ev['id']}/cancel").status_code == 403  # pendente: só quem propôs
    assert joao.post(f"/api/events/{ev['id']}/cancel").status_code == 204
    assert joao.get(f"/api/events/{ev['id']}").status_code == 404
    assert pushes[-1]["to"] == "carol" and "cancelou" in pushes[-1]["title"]

    ev2 = joao.post("/api/events", json=shared("Cinema")).json()
    carol.post(f"/api/events/{ev2['id']}/approve")
    assert carol.post(f"/api/events/{ev2['id']}/cancel").status_code == 204  # confirmado: qualquer um
    assert pushes[-1]["to"] == "joao"


def test_personal_events(joao, carol, pushes):
    s, e = at(2, 18, 120)
    ev = carol.post("/api/events", json={"kind": "personal", "title": "Academia", "starts_at": s, "ends_at": e}).json()
    assert ev["status"] == "confirmed" and ev["proposed_by"] is None
    assert pushes == []  # "só meu" não notifica
    seen = joao.get(f"/api/events/{ev['id']}").json()
    assert seen["can"] == {"approve": False, "reject": False, "suggest": False, "edit": False, "cancel": False}
    assert joao.patch(f"/api/events/{ev['id']}", json={"title": "x"}).status_code == 403
    assert carol.patch(f"/api/events/{ev['id']}", json={"title": "Academia + corrida"}).status_code == 200


def test_conflicts_any_overlap(joao, carol):
    s, e = at(2, 18, 120)
    carol.post("/api/events", json={"kind": "personal", "title": "Academia", "starts_at": s, "ends_at": e})
    s2, e2 = at(2, 19)
    joao.post("/api/events", json={"kind": "shared", "title": "Jantar", "starts_at": s2, "ends_at": e2})
    s3, e3 = at(2, 19, 30)
    found = joao.post("/api/events/conflicts", json={"starts_at": s3, "ends_at": e3}).json()
    assert sorted(f["title"] for f in found) == ["Academia", "Jantar"]
    s4, e4 = at(2, 21)
    assert joao.post("/api/events/conflicts", json={"starts_at": s4, "ends_at": e4}).json() == []


def test_list_range_and_expired(joao, carol):
    s, e = at(-2, 10)
    old = joao.post("/api/events", json={"kind": "shared", "title": "Antigo", "starts_at": s, "ends_at": e}).json()
    assert old["expired"] is True
    assert old["id"] not in [x["id"] for x in carol.get("/api/events/pending").json()["waiting_me"]]
    assert carol.post(f"/api/events/{old['id']}/approve").status_code == 403
    now = datetime.now(SP)
    lst = carol.get("/api/events", params={
        "from": (now - timedelta(days=7)).isoformat(), "to": (now + timedelta(days=7)).isoformat(),
    }).json()
    assert old["id"] in [x["id"] for x in lst]


def test_invalid_times(joao):
    s, e = at(1, 10)
    r = joao.post("/api/events", json={"kind": "shared", "title": "x", "starts_at": e, "ends_at": s})
    assert r.status_code == 400


# ---------- perfil ----------

def test_profile_update_and_avatar(joao, carol):
    me = joao.patch("/api/me", json={"display_name": "Joãozinho", "whatsapp": "(81) 99999-1234"}).json()
    assert me["display_name"] == "Joãozinho" and me["whatsapp"] == "5581999991234"
    assert carol.get("/api/me").json()["partner"]["display_name"] == "Joãozinho"
    img = b"\xff\xd8\xff" + b"0" * 1000
    up = joao.put("/api/me/avatar", content=img, headers={"Content-Type": "image/jpeg"}).json()
    assert up["avatar_version"] is not None
    assert make_client().get("/api/users/joao/avatar").content == img


def test_change_password_logs_out_other_devices(joao):
    other_device = make_client("joao")
    r = joao.put("/api/me/password", json={"current": "senha-do-joao", "new": "nova-senha-123"})
    assert r.status_code == 204
    assert joao.get("/api/me").status_code == 200       # este aparelho continua logado
    assert other_device.get("/api/me").status_code == 401  # o outro caiu


# ---------- recuperação de senha pelo parceiro ----------

def test_password_reset_by_partner(joao, pushes):
    anon = make_client()
    assert anon.post("/api/auth/reset-requests", json={"slug": "carol"}).status_code == 202
    assert pushes[-1]["to"] == "joao" and "esqueceu a senha" in pushes[-1]["title"]
    # Pedir de novo logo em seguida não notifica de novo
    anon.post("/api/auth/reset-requests", json={"slug": "carol"})
    assert len(pushes) == 1

    reqs = joao.get("/api/reset-requests/for-me").json()
    assert len(reqs) == 1 and reqs[0]["requester"]["slug"] == "carol"
    code = joao.post(f"/api/reset-requests/{reqs[0]['id']}/code").json()
    assert len(code["code"]) == 6
    assert code["whatsapp_url"].startswith("https://wa.me/5581999990002?text=")

    # A Carol não pode gerar código para si mesma
    carol_old = make_client("carol")
    assert carol_old.post(f"/api/reset-requests/{reqs[0]['id']}/code").status_code == 404

    wrong = "000000" if code["code"] != "000000" else "111111"
    r = anon.post("/api/auth/reset", json={"slug": "carol", "code": wrong, "new_password": "nova123"})
    assert r.status_code == 400 and "Restam 4" in r.json()["detail"]
    ok = anon.post("/api/auth/reset", json={"slug": "carol", "code": code["code"], "new_password": "nova123"})
    assert ok.status_code == 200 and ok.json()["slug"] == "carol"
    assert anon.get("/api/me").json()["slug"] == "carol"   # já entra logada
    assert carol_old.get("/api/me").status_code == 401       # sessões antigas caem
    # Código é de uso único
    again = make_client().post("/api/auth/reset", json={"slug": "carol", "code": code["code"], "new_password": "x123456"})
    assert again.status_code == 400
    assert joao.get("/api/reset-requests/for-me").json() == []


def test_reset_attempts_exhausted(joao):
    anon = make_client()
    anon.post("/api/auth/reset-requests", json={"slug": "carol"})
    rid = joao.get("/api/reset-requests/for-me").json()[0]["id"]
    code = joao.post(f"/api/reset-requests/{rid}/code").json()["code"]
    wrong = "000000" if code != "000000" else "111111"
    for _ in range(5):
        anon.post("/api/auth/reset", json={"slug": "carol", "code": wrong, "new_password": "nova123"})
    r = anon.post("/api/auth/reset", json={"slug": "carol", "code": code, "new_password": "nova123"})
    assert r.status_code == 429


# ---------- push ----------

def test_push_subscription_moves_between_users(joao, carol):
    sub = {"endpoint": "https://web.push.apple.com/abc", "keys": {"p256dh": "k", "auth": "a"}}
    assert joao.post("/api/push/subscriptions", json=sub).status_code == 204
    assert joao.get("/api/push/subscriptions/count").json()["count"] == 1
    carol.post("/api/push/subscriptions", json=sub)  # mesmo aparelho, agora logado como Carol
    assert joao.get("/api/push/subscriptions/count").json()["count"] == 0
    assert carol.get("/api/push/subscriptions/count").json()["count"] == 1
    assert carol.request("DELETE", "/api/push/subscriptions", json={"endpoint": sub["endpoint"]}).status_code == 204
    assert carol.get("/api/push/subscriptions/count").json()["count"] == 0
