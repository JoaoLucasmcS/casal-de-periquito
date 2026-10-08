import { useMemo, useRef } from "react";
import { look } from "../lib/events";
import { eventDays, monthGrid, today, weekdayShort } from "../lib/time";
import type { CalEvent, Me } from "../types";

interface Props {
  month: string; // "yyyy-MM"
  selected: string;
  events: CalEvent[];
  me: Me;
  onSelect: (day: string) => void;
  onSwipe: (dir: 1 | -1) => void;
}

export function Calendar({ month, selected, events, me, onSelect, onSwipe }: Props) {
  const days = useMemo(() => monthGrid(month), [month]);
  const byDay = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const ev of events) {
      for (const d of eventDays(ev.starts_at, ev.ends_at)) {
        if (!map.has(d)) map.set(d, []);
        map.get(d)!.push(ev);
      }
    }
    return map;
  }, [events]);
  const t = today();
  const touch = useRef<{ x: number; y: number } | null>(null);

  // Remove a 6ª semana quando ela é toda do mês seguinte
  const visible = days.slice(35).every((d) => !d.startsWith(month)) ? days.slice(0, 35) : days;

  return (
    <div
      onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
      onTouchEnd={(e) => {
        if (!touch.current) return;
        const dx = e.changedTouches[0].clientX - touch.current.x;
        const dy = e.changedTouches[0].clientY - touch.current.y;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) onSwipe(dx < 0 ? 1 : -1);
        touch.current = null;
      }}
      className="select-none px-3"
    >
      <div className="grid grid-cols-7 pb-1 text-center text-[13px] font-bold text-muted">
        {weekdayShort.map((w) => <span key={w}>{w}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {visible.map((d) => {
          const inMonth = d.startsWith(month);
          const isSel = d === selected;
          const isToday = d === t;
          const evs = byDay.get(d) ?? [];
          return (
            <button
              key={d}
              onClick={() => onSelect(d)}
              aria-label={`${Number(d.slice(8))}${evs.length ? `, ${evs.length} evento(s)` : ""}`}
              aria-pressed={isSel}
              className={`flex h-14 flex-col items-center justify-start gap-1 rounded-2xl pt-1.5 ${
                isSel ? "bg-ink text-paper" : ""
              } ${inMonth ? "" : "opacity-35"}`}
            >
              <span
                className={`grid size-7 place-items-center rounded-full font-display text-[18px] leading-none font-bold tabular-nums ${
                  isToday && !isSel ? "bg-sun text-[#2a2205]" : ""
                }`}
              >
                {Number(d.slice(8))}
              </span>
              <span className="flex h-2 items-center gap-[3px]">
                {evs.slice(0, 4).map((ev) => {
                  const l = look(ev, me);
                  return (
                    <span
                      key={ev.id}
                      className={`size-[7px] rounded-full ${l.faded ? "opacity-50" : ""}`}
                      style={
                        l.filled
                          ? { background: l.color }
                          : { boxShadow: `inset 0 0 0 1.5px ${l.color}` }
                      }
                    />
                  );
                })}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
