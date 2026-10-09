# Casal de Periquito 🦜🦜

A agenda do João e da Carol: um propõe, o outro aprova. É um app web instalável (PWA) para iPhone, com notificações.

- `frontend/`: React + Vite + TypeScript + Tailwind (vai para a Vercel)
- `backend/`: FastAPI + SQLAlchemy + Alembic (vai para o Render)
- Banco: Postgres no Supabase
- `ESPECIFICACAO.md`: todas as regras do app

```
iPhone (app instalado) ──▶ Vercel (front)
                              └─ /api/* ──▶ Render (FastAPI) ──▶ Supabase (Postgres)
cron-job.org ── a cada 5 min ──▶ Render /api/cron/reminders (lembretes + não deixa o servidor dormir)
```

---

## 1. Rodar no seu computador

Você precisa de Python 3.12+ e Node 20+.

**Back-end** (terminal 1):

```bash
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
export COOKIE_SECURE=false                              # local é http, não https
alembic upgrade head                                    # cria o banco SQLite dev.db
python -m app.scripts.create_users                      # pergunta nome, WhatsApp e senha
uvicorn app.main:app --reload --port 8000
```

**Front-end** (terminal 2):

```bash
cd frontend
npm install
npm run dev
```

Abra http://localhost:5173. O Vite manda o `/api` para o FastAPI local.
Notificações não funcionam localmente sem as chaves VAPID e sem HTTPS. Teste essa parte já em produção.

**Testes do back-end:** `pip install pytest httpx && python -m pytest`

---

## 2. Colocar no ar (tudo no plano gratuito)

Faça na ordem. Leva uns 30 minutos.

### 2.1 Gerar as chaves das notificações (uma vez só)

```bash
cd backend && python -m app.scripts.gen_vapid
```

Guarde as duas linhas (`VAPID_PUBLIC_KEY=` e `VAPID_PRIVATE_KEY=`). A privada é secreta: não coloque no repositório.

### 2.2 Supabase (banco)

1. Crie um projeto em https://supabase.com. Região: **South America (São Paulo)**. Anote a senha do banco.
2. No projeto, clique em **Connect** e copie a string da seção **Session pooler**. Ela tem o formato
   `postgresql://postgres.xxxx:[YOUR-PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`.
   Troque `[YOUR-PASSWORD]` pela senha do banco.
   - Use o **Session pooler**, e não a "Direct connection": a conexão direta é só IPv6, e o Render não alcança.
3. Pronto. As tabelas são criadas sozinhas pelo Render no primeiro deploy.

### 2.3 Render (back-end)

1. Em https://render.com: **New › Web Service** e conecte o seu repositório do GitHub.
2. Configure assim:
   - **Root Directory:** `backend`
   - **Runtime:** Python
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips="*"`
   - **Instance Type:** Free
3. Em **Environment**, adicione:

   | Variável | Valor |
   |---|---|
   | `DATABASE_URL` | a string do Session pooler do Supabase |
   | `VAPID_PUBLIC_KEY` | do passo 2.1 |
   | `VAPID_PRIVATE_KEY` | do passo 2.1 |
   | `VAPID_SUBJECT` | `mailto:seu-email@gmail.com` (um e-mail **real**; a Apple recusa endereços de exemplo) |
   | `CRON_SECRET` | uma senha inventada só de letras e números, ex.: `periquito8f3k2m9x` |
   | `REMINDER_MINUTES` | `30` (quantos minutos antes do evento chega o lembrete; `0` = na hora) |
   | `DIGEST_HOUR` | `8` (opcional: hora do resumo do dia, horário de São Paulo) |
   | `PYTHON_VERSION` | `3.12.8` |

4. Faça o deploy. Quando terminar, abra `https://SEU-APP.onrender.com/api/health`.
   Deve aparecer `{"ok":true,"push_configurado":true}`. Se aparecer `false`, faltam as chaves VAPID.

> As chaves VAPID não podem mudar depois que os celulares ativaram as notificações. Se trocar, cada um
> precisa ir em Perfil › Desativar › Ativar de novo.

(Também dá para usar o `backend/render.yaml` em **New › Blueprint**.)

### 2.4 Criar as contas do João e da Carol

No seu computador, aponte para o banco do Supabase e rode o script (no plano gratuito, o Render não tem terminal):

```bash
cd backend && source .venv/bin/activate
export DATABASE_URL="a mesma string do Session pooler"
python -m app.scripts.create_users
```

O script pergunta o nome, o WhatsApp (com DDD) e a senha de cada um. Rodar de novo atualiza os dados sem apagar nada.

### 2.5 Vercel (front-end)

1. Edite `frontend/vercel.json` e troque `https://SEU-APP.onrender.com` pelo endereço real do Render. Faça commit.
2. Em https://vercel.com: **Add New › Project**, importe o repositório e configure:
   - **Root Directory:** `frontend`
   - **Framework Preset:** Vite (detectado sozinho)
3. Faça o deploy. O endereço final (ex.: `casal-de-periquito.vercel.app`) é o que vocês vão abrir no iPhone.

Por que o `/api` passa pela Vercel: assim o celular enxerga um único site, e o Safari não bloqueia o cookie de login.

### 2.6 cron-job.org (lembretes e servidor acordado)

O Render gratuito não roda tarefas sozinho e "dorme" depois de 15 minutos sem uso. O cron-job.org resolve
as duas coisas: a cada 5 minutos ele chama o endereço que dispara os lembretes, e isso mantém o servidor acordado.

1. Crie uma conta em https://cron-job.org.
2. **Create cronjob**:
   - URL: `https://SEU-APP.onrender.com/api/cron/reminders?token=SEU_CRON_SECRET`
     (o mesmo valor que você colocou em `CRON_SECRET` no Render)
   - Schedule: a cada 5 minutos
3. Salve e use **Test run**. A resposta deve ser `{"ok":true,"lembretes_enviados":0,...}`.
   - `403`: o token na URL está diferente do `CRON_SECRET`.
   - `503`: o `CRON_SECRET` não foi configurado no Render.
4. Se você já tinha um cronjob para `/api/health`, apague: este substitui.

O token pode ir na URL (`?token=...`) ou num header chamado `token` (seção Headers do cron-job.org).
Nos dois casos, o valor precisa ser igual ao `CRON_SECRET`, caractere por caractere.

O que esse cronjob dispara:
- **Resumo do dia**, às 8h (ou `DIGEST_HOUR`): "Hoje: Academia 18h, Cinema 21h", com os eventos confirmados
  do dia (os "nossos" e os "só meus" de quem recebe) e quantos pedidos esperam resposta. Dia vazio não gera aviso.
- **Lembrete**, `REMINDER_MINUTES` antes do início (padrão 30): eventos confirmados com horário. O "nosso"
  avisa os dois; o "só meu" avisa só o dono. Eventos de dia inteiro aparecem só no resumo.

### 2.7 Instalar nos iPhones (cada um no seu)

1. Abra o endereço da Vercel no **Safari** (não funciona pelo Chrome no iPhone).
2. O app mostra o passo a passo: **Compartilhar › Adicionar à Tela de Início › Adicionar**.
3. Abra pelo ícone **Bobinhos**, escolha seu nome e digite a senha.
4. Toque em **Ativar notificações** e depois em **Permitir**.
5. Faça um teste: um cria um evento "Nosso", e o outro deve receber a notificação.

---

## 3. Dia a dia

- **Esqueceu a senha:** toque no seu cartão › "Esqueci a senha". O outro recebe um aviso, toca em "Gerar código" e o código vai pelo WhatsApp.
- **Os dois esqueceram:** `python -m app.scripts.reset_password carol` (com o `DATABASE_URL` do Supabase, como no passo 2.4).
- **Trocar o número de WhatsApp:** no app, em Perfil.
- **Atualizar o app:** faça push no GitHub. A Vercel e o Render publicam sozinhos, e o app no iPhone se atualiza na próxima vez que for aberto.

## 4. Problemas comuns

| Sintoma | Causa provável |
|---|---|
| A tela de login demora ou mostra "servidor acordando" | O Render dormiu: confira se o cron-job.org está ativo. |
| A notificação não chega no iPhone | Veja a seção 5 abaixo. |
| O login cai toda hora | O `vercel.json` precisa apontar para o Render. Não chame o Render direto pelo front. |
| Erro de conexão com o banco no Render | Use a string do **Session pooler** (porta 5432) e confira a senha. |
| Erro 503 ao ativar as notificações | Faltam `VAPID_PUBLIC_KEY` ou `VAPID_PRIVATE_KEY` no Render. |
| Lembretes não chegam | Confira o cronjob do passo 2.6 (histórico de execuções no cron-job.org). |

## 5. Notificações não chegam: diagnóstico

Onde está o código: `backend/app/push.py` (envio), `backend/app/routers/push_subs.py` (inscrição dos
aparelhos e teste), `backend/app/routers/cron.py` (lembretes) e `frontend/src/sw.ts` (recebe no celular).

Faça na ordem, em cada um dos dois iPhones:

1. Abra `https://SEU-APP.onrender.com/api/health`. Precisa mostrar `"push_configurado":true`.
2. Abra o app **pelo ícone Bobinhos** (no Safari, notificação não funciona).
3. Vá em **Perfil › Notificações**. Precisa dizer "Ativas neste aparelho" e "1 aparelho seu recebe avisos".
   Se disser 0 aparelhos, toque em **Ativar neste aparelho**.
4. Toque em **Enviar notificação de teste** e bloqueie a tela. A mensagem embaixo do botão diz o que aconteceu:
   - "Enviada para 1 aparelho": o servidor entregou à Apple. Se mesmo assim não aparecer, confira
     Ajustes › Notificações › Bobinhos (Permitir, Tela Bloqueada e Central ativados) e o modo Foco.
   - "recusou: 403 ... BadJwtToken" ou "VapidPkHashMismatch": o `VAPID_SUBJECT` não é um e-mail real,
     ou as chaves mudaram depois da inscrição. Corrija no Render e depois, no app: Desativar › Ativar.
   - "não conhece nenhum aparelho seu": toque em Ativar neste aparelho.
5. Os logs do Render (aba **Logs**) mostram cada envio: `Push '...' → usuário 2: 1/1 enviados`.
