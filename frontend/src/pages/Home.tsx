import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, KeyRound, Plus } from "lucide-react";
import { api, ApiError } from "../api";
import { Calendar } from "../components/Calendar";
import { EventRow } from "../components/EventRow";
import { EventSheet } from "../components/EventSheet";
import { Avatar, Button } from "../components/ui";
import { useMeStrict, usePending, useRefreshAll } from "../hooks";
import { addDays, addMonths, dayLong, eventDays, monthGrid, monthName, toIso, today } from "../lib/time";
import type { ResetRequest } from "../types";

export default function Home() {
  const me = useMeStrict();
  const [selected, setSelected] = useState(today());
  const [month, setMonth] = useState(today().slice(0, 7));
  const [creating, setCreating] = useState<string | null>(null);

  const grid = monthGrid(month);
  const events = useQuery({
    queryKey: ["events", month],
    queryFn: () => api.events(toIso(grid[0]), toIso(addDays(grid[grid.length - 1], 1))),
    placeholderData: (prev) => prev,
  });
  const pending = usePending();
  const resets = useQuery({ queryKey: ["reset-requests"], queryFn: api.resetRequestsForMe });

  const dayEvents = (events.data ?? [])
    .filter((ev) => eventDays(ev.starts_at, ev.ends_at).includes(selected))
    .sort((a, b) => Number(b.all_day) - Number(a.all_day) || a.starts_at.localeCompare(b.starts_at));

  const waiting = pending.data?.waiting_me.length ?? 0;
  const goMonth = (n: 1 | -1) => setMonth((m) => addMonths(m, n));

  function selectDay(d: string) {
    if (d === selected) setCreating(d); // segundo toque no mesmo dia abre o "novo evento"
    setSelected(d);
    if (!d.startsWith(month)) setMonth(d.slice(0, 7));
  }

  return (
    <div className="mx-auto max-w-lg pb-32">
      <header className="safe-top flex items-end justify-between px-5 pb-2">
        <div className="flex items-end gap-1">
          <h1 className="font-display text-[44px] leading-none font-extrabold tracking-tight">
            {monthName(month)}
            {month.slice(0, 4) !== today().slice(0, 4) && (
              <span className="ml-2 text-[22px] font-bold text-muted">{month.slice(0, 4)}</span>
            )}
          </h1>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => goMonth(-1)} aria-label="Mês anterior" className="grid size-11 place-items-center rounded-full active:bg-line">
            <ChevronLeft size={24} />
          </button>
          <button onClick={() => goMonth(1)} aria-label="Próximo mês" className="grid size-11 place-items-center rounded-full active:bg-line">
            <ChevronRight size={24} />
          </button>
          <Link to="/perfil" aria-label="Perfil" className="ml-1 flex -space-x-1.5">
            <Avatar person={me} size={30} ring />
            <Avatar person={me.partner} size={30} ring />
          </Link>
        </div>
      </header>

      <div className="flex flex-col gap-2 px-4 pb-3">
        {resets.data?.map((r) => <ResetBanner key={r.id} req={r} />)}
        {waiting > 0 && (
          <Link
            to="/pedidos"
            className="flex items-center justify-between rounded-2xl bg-sun px-4 py-3 text-[#2a2205]"
          >
            <span className="font-display text-[20px] font-bold">
              {waiting === 1 ? "1 pedido esperando você" : `${waiting} pedidos esperando você`}
            </span>
            <ChevronRight aria-hidden />
          </Link>
        )}
      </div>

      <Calendar
        month={month}
        selected={selected}
        events={events.data ?? []}
        me={me}
        onSelect={selectDay}
        onSwipe={goMonth}
      />

      <Legend />

      <section className="mt-2 px-2">
        <h2 className="px-3 pb-2 font-display text-[22px] font-bold">
          {selected === today() ? "Hoje" : dayLong(selected)}
        </h2>
        {events.isError ? (
          <p className="px-3 text-danger">Não deu para carregar a agenda. Puxe para atualizar ou abra de novo.</p>
        ) : dayEvents.length ? (
          <div className="flex flex-col gap-2">
            {dayEvents.map((ev) => <EventRow key={ev.id} ev={ev} me={me} />)}
          </div>
        ) : (
          <button onClick={() => setCreating(selected)} className="w-full px-3 py-6 text-left text-[17px] text-muted">
            Dia livre. Toque aqui para propor algo.
          </button>
        )}
      </section>

      <button
        onClick={() => setCreating(selected)}
        aria-label="Novo evento"
        className="fixed right-5 bottom-[calc(env(safe-area-inset-bottom)+76px)] z-30 grid size-16 place-items-center rounded-full bg-sun text-[#2a2205] shadow-[0_6px_20px_rgba(160,120,0,0.35)] active:scale-95"
      >
        <Plus size={32} strokeWidth={2.75} />
      </button>

      {creating && <EventSheet state={{ mode: "create", day: creating }} onClose={() => setCreating(null)} />}
    </div>
  );
}

function Legend() {
  const me = useMeStrict();
  const item = (style: React.CSSProperties, text: string) => (
    <span className="flex items-center gap-1.5">
      <span className="size-[9px] rounded-full" style={style} aria-hidden />
      {text}
    </span>
  );
  const blue = me.slug === "joao" ? "você" : me.partner.display_name;
  const pink = me.slug === "carol" ? "você" : me.partner.display_name;
  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 px-4 pt-2 pb-3 text-[13px] text-muted">
      {item({ background: "var(--color-green)" }, "confirmado")}
      {item({ background: "var(--color-blue)" }, `pedido de ${blue}`)}
      {item({ background: "var(--color-pink)" }, `pedido de ${pink}`)}
      {item({ boxShadow: "inset 0 0 0 1.5px var(--color-muted)" }, "só de um")}
    </div>
  );
}

function ResetBanner({ req }: { req: ResetRequest }) {
  const refreshAll = useRefreshAll();
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const name = req.requester.display_name;

  async function generate() {
    setBusy(true);
    setError("");
    try {
      const r = await api.generateResetCode(req.id);
      setCode(r.code);
      if (r.whatsapp_url) window.open(r.whatsapp_url, "_blank");
      refreshAll();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Não deu para gerar o código.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border-2 border-sun bg-panel px-4 py-3">
      <p className="flex items-center gap-2 font-display text-[19px] font-bold">
        <KeyRound size={20} aria-hidden /> {name} esqueceu a senha
      </p>
      {code ? (
        <p className="mt-1">
          Código: <strong className="font-display text-2xl tracking-[0.2em]">{code}</strong>
          <span className="block text-[15px] text-muted">Vale 10 minutos. Se o WhatsApp não abriu, mande o código para {name}.</span>
        </p>
      ) : (
        <>
          <p className="mt-1 text-[15px] text-muted">Gere um código e mande para {name} pelo WhatsApp.</p>
          <Button className="mt-2 w-full" onClick={generate} busy={busy}>Gerar código</Button>
        </>
      )}
      {error && <p className="mt-2 text-danger">{error}</p>}
    </div>
  );
}
