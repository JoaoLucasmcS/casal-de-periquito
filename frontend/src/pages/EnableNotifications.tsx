import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BellRing } from "lucide-react";
import { Button, ErrorText } from "../components/ui";
import { useMeStrict } from "../hooks";
import { enablePush, skipNotif } from "../lib/pwa";

export default function EnableNotifications() {
  const me = useMeStrict();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const p = me.partner.display_name;

  async function enable() {
    setBusy(true);
    setError("");
    try {
      await enablePush();
      nav("/", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não deu para ativar.");
      setBusy(false);
    }
  }

  return (
    <div className="safe-top safe-bottom mx-auto flex min-h-dvh max-w-md flex-col px-6">
      <div className="mt-12 grid size-20 place-items-center rounded-[28px] bg-sun text-[#2a2205]">
        <BellRing size={40} aria-hidden />
      </div>
      <h1 className="mt-6 font-display text-[36px] leading-tight font-extrabold">Ative as notificações</h1>
      <p className="mt-2 text-[17px] text-muted">Assim você fica sabendo na hora quando:</p>
      <ul className="mt-3 flex list-disc flex-col gap-1 pl-6 text-[17px]">
        <li>{p} pedir para marcar algo com você</li>
        <li>{p} aprovar ou recusar um pedido seu</li>
        <li>{p} sugerir outro horário ou cancelar</li>
      </ul>
      <p className="mt-4 text-[15px] text-muted">
        Ao tocar no botão, o iPhone pergunta se pode mandar notificações. Toque em <strong>Permitir</strong>.
      </p>
      <div className="mt-auto mb-4 flex flex-col gap-2 pt-8">
        <ErrorText>{error}</ErrorText>
        <Button onClick={enable} busy={busy}>Ativar notificações</Button>
        <Button variant="ghost" onClick={() => { skipNotif(); nav("/", { replace: true }); }}>Agora não</Button>
      </div>
    </div>
  );
}
