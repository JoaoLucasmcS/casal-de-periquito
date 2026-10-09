# Casal de Periquito — Especificação v1

Agenda compartilhada de João e Carol, com o fluxo **propor → aprovar** no centro. É um PWA instalado na tela inicial de dois iPhones (11 e 13).

- **Nome completo:** Casal de Periquito (título, tela de login, notificações)
- **Nome curto (ícone):** Bobinhos
- **Ícone:** dois periquitos lado a lado, um azul e um rosa
- **Idioma e fuso:** português; horários sempre exibidos em America/Sao_Paulo e guardados em UTC

---

## 1. Usuários e login

- Existem exatamente duas contas, **joao** e **carol**, criadas por script. Não há cadastro público.
- A tela de entrada mostra dois cartões (foto e nome). Ao tocar num cartão, aparece o campo de senha daquela pessoa.
- Cada um tem a própria senha, guardada com hash argon2.
- A sessão usa um cookie `httpOnly`, `Secure` e `SameSite=Lax`, válido por 90 dias e renovado a cada uso. As sessões ficam numa tabela, para que possam ser revogadas.
- Trocar a senha encerra as outras sessões daquela pessoa.
- Proteção contra tentativas: no máximo 5 erros de senha a cada 15 minutos por conta.

### Recuperação de senha (o outro gera o código)

1. A Carol toca em "Esqueci a senha" no cartão dela. O servidor cria um pedido de redefinição, limitado a 1 a cada 5 minutos.
2. O João recebe a notificação "Carol pediu redefinição de senha" e também vê uma faixa no app.
3. O João toca em **Gerar código**. O servidor gera um código de 6 dígitos, mostra **só para o João**, uma única vez, e abre `wa.me/<número da Carol>?text=Seu código do Casal de Periquito: 482913 (vale 10 min)`.
4. A Carol digita o código e a nova senha. O código vale 10 minutos, é de uso único e aceita no máximo 5 tentativas.
5. Se os dois esquecerem a senha ao mesmo tempo, roda-se do computador, apontando para o banco do Supabase: `python -m app.scripts.reset_password carol`.

---

## 2. Eventos

### Campos
O formulário pede **título**, **dia**, **horário de início e fim** (a duração padrão é 1h) ou **dia inteiro**, e o **tipo**: *Nosso* (padrão) ou *Só meu*. Local e observação são opcionais e ficam recolhidos.

### Tipos e estados

| Tipo | Ao criar | Quem edita | Visível para |
|---|---|---|---|
| **Nosso** | `pendente` (proposto por quem criou) | os dois, seguindo as regras abaixo | os dois |
| **Só meu** | `confirmado` | só o dono | os dois |

Estados de um evento "Nosso": `pendente` → `confirmado` / `recusado` / `cancelado`.
**Expirado** não é um estado guardado no banco: é calculado quando o evento está pendente e a data de fim já passou.

### Regras (evento "Nosso")

| Ação | Quem pode | Resultado | Notifica |
|---|---|---|---|
| Criar | qualquer um | pendente, `proposto_por` = quem criou | o outro: "Novo pedido: Show sexta" |
| Aprovar | quem **não** propôs | confirmado | quem propôs: "Carol aprovou Show sexta" |
| Recusar (comentário opcional) | quem **não** propôs | recusado | quem propôs, com o comentário e um botão para o WhatsApp |
| Sugerir outro horário | quem **não** propôs | continua pendente, `proposto_por` passa a ser quem sugeriu | o outro: "Carol sugeriu outro horário" |
| Editar texto, local ou observação de um pendente | quem propôs | continua pendente | — |
| Cancelar um pendente | quem propôs | cancelado | o outro |
| Mudar data ou hora de um confirmado | qualquer um | volta a pendente, `proposto_por` = quem editou | o outro: "João mudou o horário de…" |
| Mudar só texto, local ou observação de um confirmado | qualquer um | continua confirmado | — |
| Cancelar um confirmado | qualquer um | cancelado | o outro |
| Propor de novo um recusado | quem propôs | volta a pendente (com a edição feita) | o outro |

Eventos cancelados ficam no banco (exclusão lógica) e não aparecem em nenhuma tela.

### Cores

| O que é | Visual |
|---|---|
| Confirmado (Nosso) | **verde**, preenchido |
| Pendente proposto pelo João | **azul**, preenchido |
| Pendente proposto pela Carol | **rosa**, preenchido |
| Só meu do João | contorno azul, sem preenchimento |
| Só meu da Carol | contorno rosa, sem preenchimento |
| Pendente expirado | a cor do pendente esmaecida, com a marca "expirou" |

As cores são fixas no código. Escolher cor fica fora da v1.

### Aviso de conflito
Ao criar ou editar um evento, o formulário consulta as sobreposições com **qualquer** evento visível (dos dois, de qualquer tipo, confirmado ou pendente, sem contar os recusados e cancelados). O aviso aparece em amarelo, por exemplo: *"Conflita com: Academia (Carol, 18h–20h), Jantar (nosso, 19h)"*, e **não impede** o envio.

---

## 3. Notificações

- São push pelo Web Push (VAPID), enviadas pelo back-end com `pywebpush`.
- No iPhone, só funcionam com o app instalado na tela inicial (iOS 16.4 ou mais novo), e a permissão precisa ser pedida a partir de um toque.
- Cada aparelho que ativar as notificações recebe todas elas, e o perfil mostra quantos aparelhos estão ativos.
- Ao tocar na notificação, o app abre direto no evento (`/evento/:id`), com os botões **Aprovar**, **Recusar** e **Sugerir horário**.
- Se uma assinatura de notificação responder 404 ou 410, ela é apagada automaticamente.

**Resumo do dia:** às `DIGEST_HOUR` (padrão 8h), cada um recebe "Hoje: Cinema 21h, Academia (Carol) 18h" com todos os eventos confirmados do dia (os "nossos" e os "só meus" dos dois; os do outro vêm com o nome) e quantos pedidos esperam resposta. Dia vazio não gera aviso; se o servidor ficou fora do ar, o resumo é enviado até as 12h.

**Lembretes:** eventos confirmados com horário avisam os dois `REMINDER_MINUTES` antes do início (padrão 30; 0 = na hora), inclusive os "só meu" (o outro recebe com o nome do dono); eventos de dia inteiro aparecem só no resumo. Um lembrete por evento; mudar o horário gera um novo. Quem dispara é o cron-job.org, chamando `GET /api/cron/reminders?token=CRON_SECRET` a cada 5 minutos.

Notificações enviadas: resumo do dia · lembrete do evento · novo pedido · aprovado · recusado (com comentário) · sugestão de horário · horário alterado · cancelado · pedido de redefinição de senha.

---

## 4. Telas (pensadas para o celular)

| Rota | Tela |
|---|---|
| `/instalar` | Aparece quando o app é aberto no Safari sem estar instalado. Passo a passo com ilustrações: Compartilhar → Adicionar à Tela de Início. |
| `/entrar` | Dois cartões, João e Carol. Ao tocar num deles, aparecem a senha e o link "Esqueci a senha". |
| `/esqueci/:pessoa` | Instrução ("peça para o João gerar o código"), campo do código e campo da nova senha. |
| `/ativar-notificacoes` | Aparece no primeiro login e enquanto as notificações estiverem desativadas. Tem o botão "Ativar notificações" e explica para que elas servem. |
| `/` | **Principal.** Faixa no topo com "N pedidos esperando você" e redefinições de senha pendentes. Calendário do mês com bolinhas nas cores acima (deslizar troca o mês). Lista dos eventos do dia selecionado logo abaixo. Botão "+" fixo. |
| painel "+" | Painel que sobe de baixo, com o dia já preenchido e o tipo "Nosso" como padrão. Mostra o aviso de conflito e o botão Enviar. Tocar num dia do calendário também abre o painel. |
| `/evento/:id` | Detalhes do evento e as ações permitidas para quem está vendo. Num evento recusado, mostra o botão "Conversar no WhatsApp" com a mensagem já preenchida (*"Sobre o 'Show sexta' (10/10 às 21h)…"*). |
| `/pendentes` | Pedidos esperando você, cada um com Aprovar e Recusar. Mais abaixo, os pedidos que você enviou. |
| `/recusados` | Os seus pedidos recusados, com o botão "Editar e propor de novo". |
| `/perfil` | Nome de exibição, foto (reduzida para 256px no próprio celular antes do envio), WhatsApp, troca de senha, notificações neste aparelho (ativar ou desativar) e quantidade de aparelhos ativos. Botão Sair. |

---

## 5. Modelo de dados (Postgres)

```
users
  id, slug ('joao'|'carol') UNIQUE, display_name, password_hash,
  whatsapp (E.164), avatar BYTEA NULL, avatar_mime, last_digest_on NULL, created_at

sessions
  id, user_id → users, token_hash UNIQUE, created_at, expires_at, last_seen_at

events
  id, kind ('shared'|'personal'), owner_id → users,          -- criador original
  proposed_by_id → users NULL,                               -- última proposta (shared)
  title, starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ, all_day BOOL,
  location NULL, notes NULL,
  status ('pending'|'confirmed'|'rejected'|'cancelled'),
  rejection_comment NULL, decided_at NULL, reminded_at NULL, created_at, updated_at
  INDEX (starts_at, ends_at), INDEX (status)

push_subscriptions
  id, user_id → users, endpoint UNIQUE, p256dh, auth, user_agent, created_at, last_used_at

password_reset_requests
  id, user_id → users, code_hash NULL, created_at, code_generated_at NULL,
  expires_at NULL, attempts INT, used_at NULL
```

---

## 6. API (FastAPI, prefixo `/api`)

**Saúde**
- `GET /health`: usado pelo cron-job.org para manter o servidor acordado

**Login e perfil**
- `GET /auth/profiles`: dados públicos dos dois cartões (slug, nome, se tem foto)
- `GET /users/{slug}/avatar`
- `POST /auth/login` `{slug, password}` · `POST /auth/logout`
- `GET /me` · `PATCH /me` `{display_name, whatsapp}` · `PUT /me/avatar` · `PUT /me/password` `{current, new}`

**Recuperação de senha**
- `POST /auth/reset-requests` `{slug}`: não exige login
- `GET /reset-requests/for-me`: pedidos do parceiro esperando código
- `POST /reset-requests/{id}/code` → `{code, whatsapp_url}`: só o parceiro pode chamar
- `POST /auth/reset` `{slug, code, new_password}`

**Eventos**
- `GET /events?from=&to=`: tudo que aparece no calendário naquele intervalo
- `POST /events` · `GET /events/{id}` · `PATCH /events/{id}`
- `POST /events/{id}/approve` · `/reject` `{comment?}` · `/cancel`
- `GET /events/pending`: `{waiting_me: [...], sent_by_me: [...]}`
- `GET /events/rejected`
- `POST /events/conflicts` `{starts_at, ends_at, all_day, exclude_id?}` → lista de eventos

**Notificações**
- `GET /push/vapid-public-key` · `POST /push/subscriptions` · `DELETE /push/subscriptions` `{endpoint}` · `GET /push/subscriptions/count`

Proteção contra CSRF: o cookie usa SameSite=Lax, e toda rota que altera dados exige o cabeçalho `X-Requested-With: periquito`.

---

## 7. Arquitetura e deploy

```
iPhone (PWA) ──HTTPS──▶ Vercel (React estático)
                          └─ rewrite /api/* ──▶ Render (FastAPI, gratuito)
                                                    └──▶ Supabase (Postgres)
cron-job.org ── GET /api/cron/reminders a cada 5 min ──▶ Render
```

- **Front:** Vite + React + TypeScript + Tailwind + date-fns, com `vite-plugin-pwa` (manifest + service worker que recebe as notificações push).
- **Back:** FastAPI + SQLAlchemy 2 + Alembic + psycopg 3 + argon2-cffi + pywebpush.
- O rewrite da Vercel faz o navegador enxergar um único domínio. Assim o cookie é "de primeira parte" e o Safari não o bloqueia.
- O comando de start no Render roda `alembic upgrade head` antes de iniciar o `uvicorn`.
- **Variáveis de ambiente do back:** `DATABASE_URL`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`, `REMINDER_MINUTES`, `DIGEST_HOUR`.
- **Scripts:** `app.scripts.create_users` (cria João e Carol com nome, WhatsApp e senha inicial), `app.scripts.reset_password <slug>` e `app.scripts.gen_vapid`.

---

## 8. Fora da v1

Eventos que se repetem · sincronização com o Google Agenda · escolha de cores · eventos privados · visão de semana ou de dia · SMS automático.

## 9. Decisões menores que assumi (revise)

- Mudar só texto, local ou observação de um evento confirmado **não** gera notificação.
- Quem propôs pode editar o texto de um pendente sem notificar o outro.
- Ao tocar num dia, o horário sugerido é a próxima hora cheia (ou 19h, se o dia não for hoje).
- A lista "Recusados" mostra os últimos 30 dias.
- A semana do calendário começa no domingo.
