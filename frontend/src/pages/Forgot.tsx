import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { api, ApiError } from "../api";
import { Button, ErrorText, Field } from "../components/ui";

export default function Forgot() {
  const { slug = "" } = useParams();
  const profiles = useQuery({ queryKey: ["profiles"], queryFn: api.profiles });
  const me = profiles.data?.find((p) => p.slug === slug);
  const partner = profiles.data?.find((p) => p.slug !== slug);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const nav = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const user = await api.confirmReset(slug, code, password);
      qc.setQueryData(["me"], user);
      nav("/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não deu para trocar a senha.");
      setBusy(false);
    }
  }

  async function askAgain() {
    setError("");
    await api.requestReset(slug).catch(() => undefined);
    setInfo(`Pedido enviado de novo para ${partner?.display_name ?? "o outro"}.`);
  }

  return (
    <div className="safe-top safe-bottom mx-auto flex min-h-dvh max-w-md flex-col px-6">
      <Link to="/entrar" aria-label="Voltar" className="mt-2 grid size-11 place-items-center rounded-full bg-panel">
        <ArrowLeft size={22} />
      </Link>
      <h1 className="mt-6 font-display text-[34px] leading-tight font-extrabold">
        Nova senha{me ? ` para ${me.display_name}` : ""}
      </h1>
      <p className="mt-2 text-[17px] text-muted">
        {partner?.display_name ?? "O outro"} recebeu uma notificação para gerar um código. O código chega no seu
        WhatsApp e vale 10 minutos.
      </p>

      <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
        <Field
          label="Código"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          placeholder="6 números"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        />
        <Field
          label="Nova senha"
          type="password"
          autoComplete="new-password"
          minLength={6}
          hint="Pelo menos 6 caracteres."
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <ErrorText>{error}</ErrorText>
        {info && <p className="text-[15px] text-green">{info}</p>}
        <Button type="submit" busy={busy} disabled={code.length !== 6 || password.length < 6}>
          Trocar senha e entrar
        </Button>
        <Button type="button" variant="ghost" onClick={askAgain}>Pedir o código de novo</Button>
      </form>
    </div>
  );
}
