import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera } from "lucide-react";
import { api, ApiError } from "../api";
import { Avatar, Button, ErrorText, Field, PageTitle } from "../components/ui";
import { useMeStrict } from "../hooks";
import { disablePush, enablePush, needsInstall, pushEnabledHere, pushSupported } from "../lib/pwa";

/** Recorta no centro e reduz para 256×256 JPEG no próprio celular (~30 KB). */
async function resizeAvatar(file: File): Promise<Blob> {
  const img = await createImageBitmap(file);
  const side = Math.min(img.width, img.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  canvas.getContext("2d")!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 256, 256);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("falha ao reduzir"))), "image/jpeg", 0.85),
  );
}

function formatPhone(digits: string | null): string {
  if (!digits) return "";
  const d = digits.startsWith("55") ? digits.slice(2) : digits;
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d;
}

export default function Profile() {
  const me = useMeStrict();
  const qc = useQueryClient();
  const nav = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(me.display_name);
  const [phone, setPhone] = useState(formatPhone(me.whatsapp));
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [pwError, setPwError] = useState("");

  const [pushHere, setPushHere] = useState<boolean | null>(null);
  const [pushError, setPushError] = useState("");
  const devices = useQuery({ queryKey: ["push-count"], queryFn: api.subscriptionCount });

  useEffect(() => {
    pushEnabledHere().then(setPushHere);
  }, []);

  const setMe = (m: Awaited<ReturnType<typeof api.me>>) => qc.setQueryData(["me"], m);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setBusy("profile");
    setError("");
    setSaved("");
    try {
      setMe(await api.updateMe({ display_name: name.trim(), whatsapp: phone.trim() || null }));
      setSaved("Perfil salvo.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não deu para salvar.");
    } finally {
      setBusy(null);
    }
  }

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    setBusy("photo");
    setError("");
    try {
      setMe(await api.uploadAvatar(await resizeAvatar(file)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não deu para trocar a foto.");
    } finally {
      setBusy(null);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy("password");
    setPwError("");
    setPwMsg("");
    try {
      await api.changePassword(current, next);
      setCurrent("");
      setNext("");
      setPwMsg("Senha trocada. Seus outros aparelhos vão pedir login de novo.");
    } catch (err) {
      setPwError(err instanceof ApiError ? err.message : "Não deu para trocar a senha.");
    } finally {
      setBusy(null);
    }
  }

  async function togglePush() {
    setBusy("push");
    setPushError("");
    try {
      if (pushHere) await disablePush();
      else await enablePush();
      setPushHere(await pushEnabledHere());
      devices.refetch();
    } catch (err) {
      setPushError(err instanceof Error ? err.message : "Não deu certo.");
    } finally {
      setBusy(null);
    }
  }

  async function logout() {
    await disablePush().catch(() => undefined); // este aparelho para de receber avisos desta conta
    await api.logout().catch(() => undefined);
    qc.clear();
    qc.setQueryData(["me"], null);
    nav("/entrar", { replace: true });
  }

  const count = devices.data?.count ?? 0;

  return (
    <div className="mx-auto max-w-lg pb-28">
      <PageTitle>Perfil</PageTitle>

      <form onSubmit={saveProfile} className="flex flex-col gap-4 px-5">
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => fileRef.current?.click()} className="relative" aria-label="Trocar foto">
            <Avatar person={me} size={88} />
            <span className="absolute -right-1 -bottom-1 grid size-9 place-items-center rounded-full border-4 border-paper bg-sun text-[#2a2205]">
              <Camera size={16} aria-hidden />
            </span>
          </button>
          <div>
            <p className="font-display text-[26px] leading-tight font-bold">{me.display_name}</p>
            <p className="text-muted">{busy === "photo" ? "Enviando foto…" : "Toque na foto para trocar"}</p>
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pickPhoto(e.target.files?.[0])} />
        </div>
        <Field label="Nome" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
        <Field
          label="Seu WhatsApp"
          type="tel"
          inputMode="tel"
          placeholder="(81) 99999-9999"
          hint={`É para onde ${me.partner.display_name} manda mensagem pelos botões do app e o código de senha.`}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <ErrorText>{error}</ErrorText>
        {saved && <p className="text-green">{saved}</p>}
        <Button type="submit" variant="quiet" busy={busy === "profile"}>Salvar perfil</Button>
      </form>

      <section className="mt-10 px-5">
        <h2 className="font-display text-[24px] font-bold">Notificações</h2>
        {!pushSupported() ? (
          <p className="mt-1 text-muted">
            {needsInstall()
              ? "Instale o app na tela de início (Compartilhar › Adicionar à Tela de Início) para receber avisos."
              : "Este navegador não aceita notificações."}
          </p>
        ) : (
          <>
            <p className="mt-1 text-muted">
              {pushHere ? "Ativas neste aparelho." : "Desativadas neste aparelho."}{" "}
              {count === 1 ? "1 aparelho seu recebe avisos." : `${count} aparelhos seus recebem avisos.`}
            </p>
            <ErrorText>{pushError}</ErrorText>
            <Button className="mt-3 w-full" variant={pushHere ? "quiet" : "primary"} onClick={togglePush}
              busy={busy === "push"} disabled={pushHere === null}>
              {pushHere ? "Desativar neste aparelho" : "Ativar neste aparelho"}
            </Button>
          </>
        )}
      </section>

      <form onSubmit={changePassword} className="mt-10 flex flex-col gap-4 px-5">
        <h2 className="font-display text-[24px] font-bold">Trocar senha</h2>
        <Field label="Senha atual" type="password" autoComplete="current-password" value={current}
          onChange={(e) => setCurrent(e.target.value)} required />
        <Field label="Nova senha" type="password" autoComplete="new-password" minLength={6} hint="Pelo menos 6 caracteres."
          value={next} onChange={(e) => setNext(e.target.value)} required />
        <ErrorText>{pwError}</ErrorText>
        {pwMsg && <p className="text-green">{pwMsg}</p>}
        <Button type="submit" variant="quiet" busy={busy === "password"}>Trocar senha</Button>
      </form>

      <div className="mt-10 px-5">
        <Button variant="danger" className="w-full" onClick={logout}>Sair</Button>
      </div>
    </div>
  );
}
