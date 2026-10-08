import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { api, ApiError } from "../api";
import { useMeStrict, useRefreshAll } from "../hooks";
import { addDays, plusHour, spParts, suggestedStart, timeRange, toIso } from "../lib/time";
import type { CalEvent, EventKind } from "../types";
import { Button, ErrorText, Sheet } from "./ui";

export type SheetMode =
  | { mode: "create"; day: string }
  | { mode: "edit"; ev: CalEvent }
  | { mode: "suggest"; ev: CalEvent };

function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function EventSheet({ state, onClose, onSaved }: {
  state: SheetMode;
  onClose: () => void;
  onSaved?: (ev: CalEvent) => void;
}) {
  const me = useMeStrict();
  const refreshAll = useRefreshAll();
  const ev = state.mode === "create" ? null : state.ev;
  const initial = useMemo(() => {
    if (!ev) {
      const start = suggestedStart(state.mode === "create" ? state.day : "");
      return { day: (state as { day: string }).day, start, end: plusHour(start), allDay: false };
    }
    const s = spParts(ev.starts_at);
    const e = spParts(ev.ends_at);
    return { day: s.day, start: s.time, end: e.time, allDay: ev.all_day };
  }, [ev, state]);

  const [kind, setKind] = useState<EventKind>(ev?.kind ?? "shared");
  const [title, setTitle] = useState(ev?.title ?? "");
  const [day, setDay] = useState(initial.day);
  const [allDay, setAllDay] = useState(initial.allDay);
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [location, setLocation] = useState(ev?.location ?? "");
  const [notes, setNotes] = useState(ev?.notes ?? "");
  const [more, setMore] = useState(!!(ev?.location || ev?.notes));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const suggesting = state.mode === "suggest";
  const partner = me.partner.display_name;

  const range = useMemo(() => {
    if (!day) return null;
    if (allDay) return { starts_at: toIso(day), ends_at: toIso(addDays(day, 1)) };
    if (!start || !end) return null;
    const endDay = end <= start ? addDays(day, 1) : day; // 22h → 2h = termina no dia seguinte
    return { starts_at: toIso(day, start), ends_at: toIso(endDay, end) };
  }, [day, allDay, start, end]);

  const debouncedRange = useDebounced(range);
  const conflicts = useQuery({
    queryKey: ["conflicts", debouncedRange, ev?.id],
    queryFn: () => api.conflicts(debouncedRange!.starts_at, debouncedRange!.ends_at, ev?.id),
    enabled: !!debouncedRange,
  });

  const timeChanged = ev && range
    ? new Date(range.starts_at).getTime() !== new Date(ev.starts_at).getTime() ||
      new Date(range.ends_at).getTime() !== new Date(ev.ends_at).getTime() ||
      allDay !== ev.all_day
    : true;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!suggesting && !title.trim()) return setError("Dê um nome para o evento.");
    if (!range) return setError("Escolha o dia e o horário.");
    if (suggesting && !timeChanged) return setError("Escolha um horário diferente para sugerir.");
    setBusy(true);
    try {
      let saved: CalEvent;
      const times = { ...range, all_day: allDay };
      if (state.mode === "create") {
        saved = await api.createEvent({
          kind, title: title.trim(), ...times,
          location: location.trim() || null, notes: notes.trim() || null,
        });
      } else if (suggesting) {
        saved = await api.updateEvent(state.ev.id, times);
      } else {
        saved = await api.updateEvent(state.ev.id, {
          title: title.trim(), ...times,
          location: location.trim() || null, notes: notes.trim() || null,
        });
      }
      refreshAll();
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não deu para salvar. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  const sheetTitle = state.mode === "create" ? "Novo evento" : suggesting ? "Sugerir outro horário" : "Editar evento";
  const submitLabel =
    state.mode === "create"
      ? kind === "shared" ? `Enviar para ${partner}` : "Salvar na agenda"
      : suggesting ? `Enviar sugestão para ${partner}`
      : ev?.kind === "shared" && (ev.status === "rejected" || (ev.status === "confirmed" && timeChanged))
        ? `Enviar para ${partner}` : "Salvar";

  const hint =
    suggesting ? `${partner} vai receber sua sugestão para aprovar.`
    : ev?.kind === "shared" && ev.status === "confirmed" ? "Mudar o dia ou o horário faz o evento voltar para aprovação."
    : ev?.status === "rejected" ? `Ao salvar, o pedido vai de novo para ${partner}.`
    : null;

  const input = "w-full min-h-12 rounded-xl border border-line bg-panel px-3 text-ink focus:border-ink focus:outline-none";

  return (
    <Sheet title={sheetTitle} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4 pb-4">
        {state.mode === "create" && (
          <div role="radiogroup" aria-label="Tipo" className="grid grid-cols-2 gap-1 rounded-2xl bg-line/60 p-1">
            {([
              ["shared", "Nosso", `${partner} aprova`],
              ["personal", "Só meu", "já fica na agenda"],
            ] as const).map(([value, label, sub]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={kind === value}
                onClick={() => setKind(value)}
                className={`rounded-xl px-3 py-2 text-left ${kind === value ? "bg-panel shadow-sm" : ""}`}
              >
                <span className="block font-display text-[19px] leading-tight font-bold">{label}</span>
                <span className="block text-[13px] text-muted">{sub}</span>
              </button>
            ))}
          </div>
        )}

        {suggesting ? (
          <p className="rounded-2xl bg-panel px-4 py-3">
            <span className="block font-display text-xl font-bold">{ev!.title}</span>
            <span className="text-muted">Horário atual: {timeRange(ev!)}</span>
          </p>
        ) : (
          <input
            className={`${input} font-display text-[20px] font-bold`}
            placeholder="O que vamos fazer?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            autoFocus={state.mode === "create"}
            aria-label="Título"
          />
        )}

        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-[15px] font-bold">Dia</span>
            <input type="date" className={input} value={day} onChange={(e) => setDay(e.target.value)} required />
          </label>
          <label className="flex min-h-12 items-center gap-2 rounded-xl px-1">
            <input type="checkbox" className="size-5 accent-[var(--color-green)]" checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)} />
            <span className="font-bold">Dia inteiro</span>
          </label>
        </div>

        {!allDay && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-[15px] font-bold">Começa</span>
              <input type="time" className={input} value={start} required
                onChange={(e) => {
                  // mantém a duração quando muda o início
                  const old = start;
                  setStart(e.target.value);
                  if (old && end && e.target.value) {
                    const diff = (toMin(end) - toMin(old) + 1440) % 1440 || 60;
                    setEnd(fromMin((toMin(e.target.value) + diff) % 1440));
                  }
                }} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[15px] font-bold">Termina</span>
              <input type="time" className={input} value={end} required onChange={(e) => setEnd(e.target.value)} />
            </label>
          </div>
        )}

        {!suggesting && (more ? (
          <>
            <label className="block">
              <span className="mb-1 block text-[15px] font-bold">Local</span>
              <input className={input} value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200}
                placeholder="Opcional" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[15px] font-bold">Observação</span>
              <textarea className={`${input} min-h-20 py-2`} value={notes} onChange={(e) => setNotes(e.target.value)}
                maxLength={2000} placeholder="Opcional" />
            </label>
          </>
        ) : (
          <button type="button" onClick={() => setMore(true)}
            className="flex items-center gap-1 self-start font-bold text-muted">
            <ChevronDown size={18} /> Local e observação
          </button>
        ))}

        {conflicts.data && conflicts.data.length > 0 && (
          <div role="status" className="flex gap-2 rounded-2xl bg-sun-soft px-4 py-3">
            <AlertTriangle size={20} className="mt-0.5 shrink-0 text-[#a07800]" aria-hidden />
            <div className="text-[15px]">
              <p className="font-bold">Conflita com:</p>
              <ul>
                {conflicts.data.map((c) => (
                  <li key={c.id}>
                    {c.title} ({c.kind === "personal"
                      ? c.owner === me.slug ? "seu" : partner
                      : "nosso"}, {timeRange(c)})
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-muted">Dá para enviar mesmo assim.</p>
            </div>
          </div>
        )}

        {hint && <p className="text-[15px] text-muted">{hint}</p>}
        <ErrorText>{error}</ErrorText>
        <Button type="submit" busy={busy} variant={kind === "shared" || suggesting ? "primary" : "approve"}>
          {submitLabel}
        </Button>
      </form>
    </Sheet>
  );
}

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const fromMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
