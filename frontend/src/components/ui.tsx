import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { X } from "lucide-react";
import { avatarUrl } from "../api";
import { personColor } from "../lib/events";
import type { ProfileCard } from "../types";

type Variant = "primary" | "approve" | "quiet" | "danger" | "ghost";

const variants: Record<Variant, string> = {
  primary: "bg-sun text-[#2a2205] font-bold",
  approve: "bg-green text-white font-bold",
  quiet: "bg-panel text-ink border border-line font-bold",
  danger: "bg-panel text-danger border border-line font-bold",
  ghost: "text-muted underline underline-offset-4",
};

export function Button({
  variant = "primary", className = "", busy, children, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || busy}
      className={`min-h-12 rounded-2xl px-5 text-[17px] transition active:scale-[0.98] disabled:opacity-50 ${variants[variant]} ${className}`}
    >
      {busy ? "Um instante…" : children}
    </button>
  );
}

export function Field({ label, hint, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[15px] font-bold">{label}</span>
      <input
        {...rest}
        className="w-full min-h-12 rounded-xl border border-line bg-panel px-3 text-ink placeholder:text-muted/70 focus:border-ink focus:outline-none"
      />
      {hint && <span className="mt-1 block text-sm text-muted">{hint}</span>}
    </label>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-[15px] text-danger">{children}</p>;
}

export function Avatar({ person, size = 40, ring }: { person: ProfileCard; size?: number; ring?: boolean }) {
  const url = avatarUrl(person);
  const color = personColor[person.slug];
  const style = {
    width: size, height: size,
    boxShadow: ring ? `0 0 0 2px var(--color-paper)` : undefined,
  };
  if (url) return <img src={url} alt={person.display_name} style={style} className="shrink-0 rounded-full object-cover" />;
  return (
    <span
      aria-label={person.display_name}
      style={{ ...style, background: color, fontSize: size * 0.45 }}
      className="grid shrink-0 place-items-center rounded-full font-display font-bold text-white"
    >
      {person.display_name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Painel que sobe de baixo (padrão de app no iPhone) */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet safe-bottom max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[28px] bg-paper px-5 pt-3"
      >
        <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-line" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold">{title}</h2>
          <button onClick={onClose} aria-label="Fechar" className="grid size-10 place-items-center rounded-full bg-panel">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function PageTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <header className="safe-top flex items-end justify-between gap-3 px-5 pb-3">
      <h1 className="font-display text-[34px] leading-tight font-extrabold">{children}</h1>
      {aside}
    </header>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-5 py-10 text-center text-[17px] text-muted">{children}</p>;
}
