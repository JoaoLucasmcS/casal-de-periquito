import { useEffect, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Birds } from "./components/Birds";
import { TabBar } from "./components/TabBar";
import { Button } from "./components/ui";
import { useMe, useRefreshAll } from "./hooks";
import { needsInstall, notifSkipped, pushSupported, syncPushSubscription } from "./lib/pwa";
import EnableNotifications from "./pages/EnableNotifications";
import EventPage from "./pages/EventPage";
import Forgot from "./pages/Forgot";
import Home from "./pages/Home";
import Install, { BROWSER_OK_KEY } from "./pages/Install";
import Login from "./pages/Login";
import Pending from "./pages/Pending";
import Profile from "./pages/Profile";
import Rejected from "./pages/Rejected";

function browserOk() {
  try {
    return sessionStorage.getItem(BROWSER_OK_KEY) === "1";
  } catch {
    return false;
  }
}

export default function App() {
  const me = useMe();
  const loc = useLocation();
  const nav = useNavigate();
  const refreshAll = useRefreshAll();

  // Mensagens do service worker: notificação chegou (atualiza) ou foi tocada (abre o evento).
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === "refresh") refreshAll();
      if (e.data?.type === "navigate" && typeof e.data.url === "string") {
        refreshAll();
        nav(e.data.url);
      }
    };
    navigator.serviceWorker.addEventListener("message", onMsg);
    return () => navigator.serviceWorker.removeEventListener("message", onMsg);
  }, [nav, refreshAll]);

  useEffect(() => {
    if (me.data) syncPushSubscription();
  }, [me.data?.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  if (needsInstall() && !browserOk() && loc.pathname !== "/instalar") {
    return <Navigate to="/instalar" replace />;
  }

  if (me.isLoading) return <Splash />;
  if (me.isError) return <Offline retry={() => me.refetch()} />;

  if (!me.data) {
    return (
      <Routes>
        <Route path="/instalar" element={<Install />} />
        <Route path="/entrar" element={<Login />} />
        <Route path="/esqueci/:slug" element={<Forgot />} />
        <Route path="*" element={<Navigate to="/entrar" replace />} />
      </Routes>
    );
  }

  const askNotifications =
    pushSupported() && Notification.permission === "default" && !notifSkipped();

  return (
    <Routes>
      <Route path="/instalar" element={<Install />} />
      <Route path="/ativar-notificacoes" element={<EnableNotifications />} />
      <Route path="/evento/:id" element={<EventPage />} />
      <Route path="/entrar" element={<Navigate to="/" replace />} />
      <Route path="/esqueci/:slug" element={<Navigate to="/" replace />} />
      <Route
        path="/"
        element={askNotifications ? <Navigate to="/ativar-notificacoes" replace /> : <WithTabs><Home /></WithTabs>}
      />
      <Route path="/pedidos" element={<WithTabs><Pending /></WithTabs>} />
      <Route path="/recusados" element={<WithTabs><Rejected /></WithTabs>} />
      <Route path="/perfil" element={<WithTabs><Profile /></WithTabs>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function WithTabs({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <TabBar />
    </>
  );
}

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <Birds className="h-16 w-auto animate-pulse motion-reduce:animate-none" />
    </div>
  );
}

function Offline({ retry }: { retry: () => void }) {
  return (
    <div className="safe-top mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <Birds className="h-16 w-auto opacity-60" />
      <p className="text-[17px]">Não deu para falar com o servidor. Confira a internet; se acabou de abrir, ele pode estar acordando.</p>
      <Button onClick={retry}>Tentar de novo</Button>
    </div>
  );
}
