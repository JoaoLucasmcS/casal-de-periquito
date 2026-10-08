import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import { Birds } from "../components/Birds";
import { Avatar, Button, ErrorText } from "../components/ui";
import type { ProfileCard } from "../types";

export default function Login() {
  const profiles = useQuery({ queryKey: ["profiles"], queryFn: api.profiles });
  const [chosen, setChosen] = useState<ProfileCard | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const nav = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!chosen) return;
    setBusy(true);
    setError("");
    try {
      const me = await api.login(chosen.slug, password);
      qc.setQueryData(["me"], me);
      nav("/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não deu para entrar.");
      setBusy(false);
    }
  }

  async function forgot() {
    if (!chosen) return;
    try {
      await api.requestReset(chosen.slug);
    } catch {
      /* a próxima tela permite pedir de novo */
    }
    nav(`/esqueci/${chosen.slug}`);
  }

  return (
    <div className="safe-top safe-bottom mx-auto flex min-h-dvh max-w-md flex-col px-6">
      <div className="pt-10 pb-8">
        <Birds className="h-20 w-auto" />
        <h1 className="mt-4 font-display text-[40px] leading-[1.05] font-extrabold">Casal de Periquito</h1>
        <p className="mt-1 text-[17px] text-muted">Quem está entrando?</p>
      </div>

      {profiles.isError && <ErrorText>Não deu para falar com o servidor. Ele pode estar acordando; tente em alguns segundos.</ErrorText>}

      <div className="grid grid-cols-2 gap-3">
        {(profiles.data ?? []).map((p) => {
          const active = chosen?.slug === p.slug;
          return (
            <button
              key={p.slug}
              onClick={() => { setChosen(p); setPassword(""); setError(""); }}
              aria-pressed={active}
              className={`flex flex-col items-center gap-3 rounded-[28px] border-2 bg-panel px-3 py-6 transition ${
                active ? "" : "border-transparent"
              }`}
              style={active ? { borderColor: p.slug === "joao" ? "var(--color-blue)" : "var(--color-pink)" } : undefined}
            >
              <Avatar person={p} size={84} />
              <span className="font-display text-[24px] font-bold">{p.display_name}</span>
            </button>
          );
        })}
      </div>

      {chosen && (
        <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
          <label className="block">
            <span className="mb-1 block font-bold">Senha de {chosen.display_name}</span>
            <input
              type="password"
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full min-h-12 rounded-xl border border-line bg-panel px-3 focus:border-ink focus:outline-none"
            />
          </label>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" busy={busy} disabled={!password}>Entrar</Button>
          <Button type="button" variant="ghost" onClick={forgot}>Esqueci a senha</Button>
        </form>
      )}
    </div>
  );
}
