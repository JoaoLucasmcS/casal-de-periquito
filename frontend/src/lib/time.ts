/**
 * Tudo é exibido no horário de São Paulo, não importa onde o celular esteja.
 * O Brasil não tem horário de verão desde 2019, então o fuso é fixo em -03:00.
 * "Dia" aqui é sempre uma string "yyyy-MM-dd" no horário de São Paulo.
 */
export const TZ = "America/Sao_Paulo";
const OFFSET = "-03:00";

const partsFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export function spParts(iso: string | Date): { day: string; time: string } {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const p = Object.fromEntries(partsFmt.formatToParts(d).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

export function today(): string {
  return spParts(new Date()).day;
}

/** "2026-10-10" + "21:00" → ISO em UTC */
export function toIso(day: string, time = "00:00"): string {
  return new Date(`${day}T${time}:00${OFFSET}`).toISOString();
}

function toUTCDate(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUTCDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  const d = toUTCDate(day);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUTCDate(d);
}

export function addMonths(month: string, n: number): string {
  // month = "yyyy-MM"
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return fromUTCDate(d).slice(0, 7);
}

export function weekday(day: string): number {
  return toUTCDate(day).getUTCDay(); // 0 = domingo
}

/** 6 semanas começando no domingo, cobrindo o mês inteiro */
export function monthGrid(month: string): string[] {
  const first = `${month}-01`;
  const start = addDays(first, -weekday(first));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

/** Dias (em SP) que um evento ocupa */
export function eventDays(startIso: string, endIso: string): string[] {
  const first = spParts(startIso).day;
  const last = spParts(new Date(new Date(endIso).getTime() - 1)).day;
  const days = [first];
  while (days[days.length - 1] < last && days.length < 5) days.push(addDays(days[days.length - 1], 1));
  return days;
}

const monthNames = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
const weekdayNames = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
export const weekdayShort = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export function monthName(month: string): string {
  return monthNames[Number(month.slice(5, 7)) - 1];
}

/** "sexta, 10 de outubro" */
export function dayLong(day: string): string {
  const d = Number(day.slice(8, 10));
  return `${weekdayNames[weekday(day)]}, ${d} de ${monthName(day.slice(0, 7))}`;
}

/** "sex, 10/10" */
export function dayShort(day: string): string {
  return `${weekdayShort[weekday(day)]}, ${day.slice(8, 10)}/${day.slice(5, 7)}`;
}

/** "21h" ou "21h30" */
export function hourLabel(time: string): string {
  const [h, m] = time.split(":");
  return m === "00" ? `${Number(h)}h` : `${Number(h)}h${m}`;
}

/** Texto de horário de um evento: "21h – 23h", "dia inteiro", "22h – 2h (dia seguinte)" */
export function timeRange(ev: { starts_at: string; ends_at: string; all_day: boolean }): string {
  if (ev.all_day) return "dia inteiro";
  const s = spParts(ev.starts_at);
  const e = spParts(ev.ends_at);
  const next = e.day !== s.day ? " (dia seguinte)" : "";
  return `${hourLabel(s.time)} – ${hourLabel(e.time)}${next}`;
}

/** "sex, 10/10 · 21h – 23h" */
export function when(ev: { starts_at: string; ends_at: string; all_day: boolean }): string {
  return `${dayShort(spParts(ev.starts_at).day)}, ${timeRange(ev)}`;
}

/** Próxima hora cheia de hoje, ou 19h em outros dias */
export function suggestedStart(day: string): string {
  if (day !== today()) return "19:00";
  const h = Number(spParts(new Date()).time.slice(0, 2)) + 1;
  return h >= 23 ? "23:00" : `${String(h).padStart(2, "0")}:00`;
}

export function plusHour(time: string): string {
  const h = (Number(time.slice(0, 2)) + 1) % 24;
  return `${String(h).padStart(2, "0")}:${time.slice(3, 5)}`;
}
