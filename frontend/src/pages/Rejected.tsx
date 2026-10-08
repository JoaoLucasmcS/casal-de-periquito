import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { api } from "../api";
import { Empty, PageTitle } from "../components/ui";
import { useMeStrict } from "../hooks";
import { whatsappLink } from "../lib/events";
import { dayShort, spParts, timeRange } from "../lib/time";

export default function Rejected() {
  const me = useMeStrict();
  const q = useQuery({ queryKey: ["rejected"], queryFn: api.rejected });
  const list = q.data ?? [];

  return (
    <div className="mx-auto max-w-lg pb-28">
      <PageTitle>Recusados</PageTitle>
      <p className="px-5 pb-4 text-muted">
        Seus pedidos que {me.partner.display_name} recusou nos últimos 30 dias. Abra um para editar e propor de novo.
      </p>
      {q.isLoading ? null : list.length ? (
        <ul className="flex flex-col gap-3 px-4">
          {list.map((ev) => {
            const wa = whatsappLink(me.partner.whatsapp, ev);
            return (
              <li key={ev.id} className="rounded-3xl border border-line bg-panel px-4 py-4">
                <Link to={`/evento/${ev.id}`} className="block">
                  <h3 className="font-display text-[22px] leading-tight font-bold">{ev.title}</h3>
                  <p className="text-muted">{dayShort(spParts(ev.starts_at).day)}, {timeRange(ev)}</p>
                  <p className="mt-2 text-[16px]">
                    {ev.rejection_comment ? <>“{ev.rejection_comment}”</> : <span className="text-muted">Sem comentário.</span>}
                  </p>
                </Link>
                <div className="mt-3 flex gap-2">
                  <Link to={`/evento/${ev.id}?editar=1`}
                    className="flex min-h-11 flex-1 items-center justify-center rounded-2xl bg-sun font-bold text-[#2a2205]">
                    Propor de novo
                  </Link>
                  {wa && (
                    <a href={wa} target="_blank" rel="noreferrer" aria-label="Conversar no WhatsApp"
                      className="grid min-h-11 w-14 place-items-center rounded-2xl bg-green text-white">
                      <MessageCircle size={22} />
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty>Nenhum pedido recusado. 🦜💚🦜</Empty>
      )}
    </div>
  );
}
