import { Link } from "react-router-dom";
import { MapPin } from "lucide-react";
import { look } from "../lib/events";
import { timeRange } from "../lib/time";
import type { CalEvent, Me } from "../types";

/** Uma linha de evento: barra lateral colorida (cheia = nosso, contorno = só de um) */
export function EventRow({ ev, me, showDate }: { ev: CalEvent; me: Me; showDate?: string }) {
  const l = look(ev, me);
  return (
    <Link
      to={`/evento/${ev.id}`}
      className={`flex items-stretch gap-3 rounded-2xl px-3 py-3 active:bg-line/50 ${l.faded ? "opacity-55" : ""}`}
      style={{ background: l.filled ? l.soft : undefined }}
    >
      <span
        aria-hidden
        className="w-1.5 shrink-0 rounded-full"
        style={
          l.filled
            ? { background: l.color }
            : { border: `2px solid ${l.color}`, background: "transparent", width: 8 }
        }
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[17px] font-bold">{ev.title}</span>
          <span className="shrink-0 text-[15px] tabular-nums text-muted">
            {showDate ? `${showDate}, ` : ""}{timeRange(ev)}
          </span>
        </span>
        <span className="mt-0.5 flex items-center gap-2 text-[14px] text-muted">
          <span className="font-bold" style={{ color: l.color }}>{l.label}</span>
          {ev.location && (
            <span className="flex min-w-0 items-center gap-1 truncate">
              <MapPin size={13} aria-hidden /> {ev.location}
            </span>
          )}
        </span>
      </span>
    </Link>
  );
}
