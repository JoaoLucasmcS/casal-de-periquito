import { useNavigate } from "react-router-dom";
import { Share, SquarePlus } from "lucide-react";
import { Birds } from "../components/Birds";

export const BROWSER_OK_KEY = "periquito:browser-ok";

export default function Install() {
  const nav = useNavigate();
  const steps = [
    { icon: <Share size={22} aria-hidden />, text: <>Toque em <strong>Compartilhar</strong>, o quadrado com a seta na barra do Safari.</> },
    { icon: <SquarePlus size={22} aria-hidden />, text: <>Role a lista e toque em <strong>Adicionar à Tela de Início</strong>, depois em <strong>Adicionar</strong>.</> },
    { icon: <Birds className="h-6 w-auto" />, text: <>Feche o Safari e abra o app pelo ícone <strong>Bobinhos</strong> na tela de início.</> },
  ];
  return (
    <div className="safe-top safe-bottom mx-auto flex min-h-dvh max-w-md flex-col px-6">
      <h1 className="mt-10 font-display text-[36px] leading-tight font-extrabold">Instale no iPhone</h1>
      <p className="mt-2 text-[17px] text-muted">
        No iPhone, os avisos de pedidos só chegam com o app instalado na tela de início. Leva 10 segundos.
      </p>
      <ol className="mt-8 flex flex-col gap-5">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-sun font-display text-xl font-bold text-[#2a2205]">
              {i + 1}
            </span>
            <span className="flex-1 pt-1 text-[17px]">
              <span className="mb-1 flex text-muted">{s.icon}</span>
              {s.text}
            </span>
          </li>
        ))}
      </ol>
      <button
        onClick={() => {
          try { sessionStorage.setItem(BROWSER_OK_KEY, "1"); } catch { /* ignora */ }
          nav("/", { replace: true });
        }}
        className="mt-auto mb-4 py-4 text-muted underline underline-offset-4"
      >
        Continuar no navegador, sem notificações
      </button>
    </div>
  );
}
