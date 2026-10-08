import { useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api";
import { EventRow } from "../components/EventRow";
import { RejectDialog } from "../components/RejectDialog";
import { Button, Empty, ErrorText, PageTitle } from "../components/ui";
import { useMeStrict, usePending, useRefreshAll } from "../hooks";
import { look } from "../lib/events";
import { dayShort, spParts, timeRange } from "../lib/time";
import type { CalEvent } from "../types";

export default function Pending() {
  const me = useMeStrict();
  const q = usePending();
  const waiting = q.data?.waiting_me ?? [];
  const sent = q.data?.sent_by_me ?? [];

  return (
    <div className="mx-auto max-w-lg pb-28">
      <PageTitle>Pedidos</PageTitle>
      <section className="px-4">
        <h2 className="px-1 pb-2 font-display text-[22px] font-bold">Esperando você</h2>
        {q.isLoading ? null : waiting.length ? (
          <div className="flex flex-col gap-3">{waiting.map((ev) => <WaitingCard key={ev.id} ev={ev} />)}</div>
        ) : (
          <p className="px-1 pb-4 text-[17px] text-muted">Nada para aprovar agora.</p>
        )}
      </section>
      <section className="mt-6 px-2">
        <h2 className="px-3 pb-2 font-display text-[22px] font-bold">Enviados por você</h2>
        {sent.length ? (
          <div className="flex flex-col gap-2">
            {sent.map((ev) => <EventRow key={ev.id} ev={ev} me={me} showDate={dayShort(spParts(ev.starts_at).day)} />)}
          </div>
        ) : (
          <Empty>Você não tem pedidos aguardando {me.partner.display_name}.</Empty>
        )}
      </section>
    </div>
  );
}

function WaitingCard({ ev }: { ev: CalEvent }) {
  const me = useMeStrict();
  const refreshAll = useRefreshAll();
  const l = look(ev, me);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState("");

  async function approve() {
    setBusy(true);
    try {
      await api.approve(ev.id);
      refreshAll();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Não deu para aprovar.");
      setBusy(false);
    }
  }

  return (
    <article className="rounded-3xl px-4 py-4" style={{ background: l.soft }}>
      <Link to={`/evento/${ev.id}`} className="block">
        <p className="text-[15px] font-bold" style={{ color: l.color }}>{l.label}</p>
        <h3 className="font-display text-[24px] leading-tight font-bold">{ev.title}</h3>
        <p className="text-muted">{dayShort(spParts(ev.starts_at).day)}, {timeRange(ev)}{ev.location ? ` · ${ev.location}` : ""}</p>
      </Link>
      <div className="mt-3 grid grid-cols-[2fr_1fr] gap-2">
        <Button variant="approve" onClick={approve} busy={busy}>Aprovar</Button>
        <Button variant="danger" onClick={() => setRejecting(true)}>Recusar</Button>
      </div>
      <Link to={`/evento/${ev.id}`} className="mt-2 block text-center text-[15px] font-bold text-muted underline underline-offset-4">
        Sugerir outro horário
      </Link>
      {error && <div className="mt-2"><ErrorText>{error}</ErrorText></div>}
      {rejecting && <RejectDialog ev={ev} onClose={() => setRejecting(false)} />}
    </article>
  );
}
