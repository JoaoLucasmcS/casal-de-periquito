import type { CalEvent, Me, Slug } from "../types";
import { when } from "./time";

/** Cor base de cada pessoa */
export const personColor: Record<Slug, string> = {
  joao: "var(--color-blue)",
  carol: "var(--color-pink)",
};
export const personSoft: Record<Slug, string> = {
  joao: "var(--color-blue-soft)",
  carol: "var(--color-pink-soft)",
};

export interface EventLook {
  color: string;      // cor principal
  soft: string;       // fundo suave
  filled: boolean;    // "só meu" é só contorno
  faded: boolean;     // pendente expirado
  label: string;      // texto curto do estado
}

export function look(ev: CalEvent, me: Me): EventLook {
  const name = (slug: Slug | null) =>
    slug === me.slug ? "você" : slug === me.partner.slug ? me.partner.display_name : "";
  if (ev.kind === "personal") {
    const owner = ev.owner === me.slug ? "Só seu" : `Só ${ev.owner === "carol" ? "dela" : "dele"}`;
    return { color: personColor[ev.owner], soft: "transparent", filled: false, faded: false, label: owner };
  }
  if (ev.status === "confirmed") {
    return { color: "var(--color-green)", soft: "var(--color-green-soft)", filled: true, faded: false, label: "Confirmado" };
  }
  const by = ev.proposed_by ?? ev.owner;
  if (ev.status === "rejected") {
    return { color: personColor[by], soft: personSoft[by], filled: true, faded: true, label: "Recusado" };
  }
  if (ev.expired) {
    return { color: personColor[by], soft: personSoft[by], filled: true, faded: true, label: "Expirou" };
  }
  const label = by === me.slug ? `Esperando ${me.partner.display_name}` : `Pedido de ${name(by)}`;
  return { color: personColor[by], soft: personSoft[by], filled: true, faded: false, label };
}

export function whatsappLink(phone: string | null, ev?: CalEvent): string | null {
  if (!phone) return null;
  const text = ev ? `Sobre o "${ev.title}" (${when(ev)})… ` : "";
  return `https://wa.me/${phone}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
