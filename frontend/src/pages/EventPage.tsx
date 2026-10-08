import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Clock, MapPin, MessageCircle, StickyNote } from "lucide-react";
import { api, ApiError } from "../api";
import { EventSheet, type SheetMode } from "../components/EventSheet";
import { RejectDialog } from "../components/RejectDialog";
import { Button, Empty, ErrorText } from "../components/ui";
import { useMeStrict, useRefreshAll } from "../hooks";
import { look, whatsappLink } from "../lib/events";
import { dayLong, spParts, timeRange } from "../lib/time";

export default function EventPage() {
  const { id } = useParams();
  const me = useMeStrict();
  const nav = useNavigate();
  const refreshAll = useRefreshAll();
  const q = useQuery({ queryKey: ["event", Number(id)], queryFn: () => api.event(Number(id)) });
  const [sheet, setSheet] = useState<SheetMode | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState<"approve" | "cancel" | null>(null);
  const [error, setError] = useState("");
  const [params, setParams] = useSearchParams();

  // Vindo de "Recusados › Propor de novo": abre direto a edição.
  useEffect(() => {
    if (q.data && params.get("editar") === "1" && q.data.can.edit) {
      setSheet({ mode: "edit", ev: q.data });
      setParams({}, { replace: true });
    }
  }, [q.data, params, setParams]);

  const back = (
    <button onClick={() => (history.length > 1 ? nav(-1) : nav("/"))} aria-label="Voltar"
      className="grid size-11 place-items-center rounded-full bg-panel">
      <ArrowLeft size={22} />
    </button>
  );

  if (q.isLoading) return <div className="safe-top px-4">{back}</div>;
  if (q.isError || !q.data) {
    return (
      <div className="safe-top mx-auto max-w-lg px-4">
        {back}
        <Empty>
          Esse evento não existe mais (pode ter sido cancelado).{" "}
          <Link to="/" className="font-bold underline">Voltar para a agenda</Link>
        </Empty>
      </div>
    );
  }

  const ev = q.data;
  const l = look(ev, me);
  const partner = me.partner;
  const wa = whatsappLink(partner.whatsapp, ev);
  const iProposed = ev.proposed_by === me.slug;

  async function run(kind: "approve" | "cancel") {
    setError("");
    if (kind === "cancel" && !confirm(ev.kind === "shared" ? `Cancelar "${ev.title}"? ${partner.display_name} vai ser avisado.` : `Apagar "${ev.title}"?`)) return;
    setBusy(kind);
    try {
      if (kind === "approve") await api.approve(ev.id);
      else await api.cancel(ev.id);
      refreshAll();
      if (kind === "cancel") nav("/", { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Não deu certo. Tente de novo.");
    } finally {
      setBusy(null);
    }
  }

  let status: string;
  if (ev.kind === "personal") status = ev.owner === me.slug ? "Compromisso só seu" : `Compromisso só de ${partner.display_name}`;
  else if (ev.status === "confirmed") status = "Confirmado pelos dois";
  else if (ev.status === "rejected") status = `${iProposed ? partner.display_name : "Você"} recusou`;
  else if (ev.expired) status = "O pedido expirou sem resposta";
  else status = iProposed ? `Esperando ${partner.display_name} aprovar` : `${partner.display_name} quer marcar isso com você`;

  return (
    <div className="mx-auto max-w-lg pb-10">
      <div
        className="safe-top rounded-b-[32px] px-5 pb-6"
        style={{
          background: l.filled ? l.soft : "var(--color-panel)",
          borderBottom: l.filled ? undefined : `3px solid ${l.color}`,
        }}
      >
        {back}
        <p className="mt-4 font-bold" style={{ color: l.color }}>{status}</p>
        <h1 className={`font-display text-[34px] leading-tight font-extrabold ${l.faded ? "opacity-60" : ""}`}>
          {ev.title}
        </h1>
      </div>

      <dl className="flex flex-col gap-4 px-5 pt-5 text-[17px]">
        <div className="flex gap-3">
          <Clock className="mt-0.5 shrink-0 text-muted" size={20} aria-hidden />
          <div>
            <dt className="sr-only">Quando</dt>
            <dd className="font-bold">{dayLong(spParts(ev.starts_at).day)}</dd>
            <dd className="text-muted">{timeRange(ev)}</dd>
          </div>
        </div>
        {ev.location && (
          <div className="flex gap-3">
            <MapPin className="mt-0.5 shrink-0 text-muted" size={20} aria-hidden />
            <div><dt className="sr-only">Local</dt><dd>{ev.location}</dd></div>
          </div>
        )}
        {ev.notes && (
          <div className="flex gap-3">
            <StickyNote className="mt-0.5 shrink-0 text-muted" size={20} aria-hidden />
            <div><dt className="sr-only">Observação</dt><dd className="whitespace-pre-wrap">{ev.notes}</dd></div>
          </div>
        )}
        {ev.status === "rejected" && (
          <div className="rounded-2xl bg-panel px-4 py-3">
            <dt className="font-bold">Motivo</dt>
            <dd className="text-muted">{ev.rejection_comment ?? "Sem comentário."}</dd>
          </div>
        )}
      </dl>

      <div className="flex flex-col gap-3 px-5 pt-6">
        <ErrorText>{error}</ErrorText>
        {ev.can.approve && (
          <Button variant="approve" onClick={() => run("approve")} busy={busy === "approve"}>Aprovar</Button>
        )}
        {ev.can.reject && (
          <div className="grid grid-cols-2 gap-3">
            <Button variant="quiet" onClick={() => setSheet({ mode: "suggest", ev })}>Sugerir horário</Button>
            <Button variant="danger" onClick={() => setRejecting(true)}>Recusar</Button>
          </div>
        )}
        {!ev.can.reject && ev.can.suggest && (
          <Button variant="quiet" onClick={() => setSheet({ mode: "suggest", ev })}>Sugerir outro horário</Button>
        )}
        {ev.kind === "shared" && wa && (
          <a
            href={wa}
            target="_blank"
            rel="noreferrer"
            className={`flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 text-[17px] font-bold ${
              ev.status === "rejected" ? "bg-green text-white" : "border border-line bg-panel"
            }`}
          >
            <MessageCircle size={20} aria-hidden /> Conversar no WhatsApp
          </a>
        )}
        {ev.can.edit && (
          <Button variant="quiet" onClick={() => setSheet({ mode: "edit", ev })}>
            {ev.status === "rejected" ? "Editar e propor de novo" : "Editar"}
          </Button>
        )}
        {ev.can.cancel && (
          <Button variant="ghost" onClick={() => run("cancel")} busy={busy === "cancel"}>
            {ev.kind === "personal" || ev.status === "rejected" ? "Apagar" : ev.status === "pending" ? "Cancelar pedido" : "Cancelar evento"}
          </Button>
        )}
      </div>

      {sheet && <EventSheet state={sheet} onClose={() => setSheet(null)} />}
      {rejecting && <RejectDialog ev={ev} onClose={() => setRejecting(false)} />}
    </div>
  );
}
