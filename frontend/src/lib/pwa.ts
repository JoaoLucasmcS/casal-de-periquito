import { api } from "../api";

export const isIOS = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export const pushSupported = () =>
  "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** iPhone só recebe notificação com o app instalado na tela inicial */
export const needsInstall = () => isIOS() && !isStandalone();

function b64ToUint8(b64: string): Uint8Array {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

/** Precisa ser chamado a partir de um toque (exigência do iOS). */
export async function enablePush(): Promise<void> {
  if (!pushSupported()) {
    throw new Error(needsInstall()
      ? "Instale o app na tela de início para ativar as notificações."
      : "Este navegador não aceita notificações.");
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("As notificações foram bloqueadas. Libere em Ajustes › Notificações › Bobinhos.");
  }
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const { key } = await api.vapidKey();
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: b64ToUint8(key) as BufferSource,
    });
  }
  await api.subscribe(sub.toJSON());
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await api.unsubscribe(sub.endpoint).catch(() => undefined);
  await sub.unsubscribe();
}

export async function pushEnabledHere(): Promise<boolean> {
  return pushSupported() && Notification.permission === "granted" && !!(await currentSubscription());
}

/** Na abertura do app: se já tem permissão, garante que o servidor conhece este aparelho (e o dono atual). */
export async function syncPushSubscription(): Promise<void> {
  try {
    if (!pushSupported() || Notification.permission !== "granted") return;
    const sub = await currentSubscription();
    if (sub) await api.subscribe(sub.toJSON());
    else await enablePush();
  } catch {
    /* silencioso: a tela de perfil mostra o estado real */
  }
}

const SKIP_KEY = "periquito:notif-skip";
export const notifSkipped = () => {
  try {
    return localStorage.getItem(SKIP_KEY) === "1";
  } catch {
    return false;
  }
};
export const skipNotif = () => {
  try {
    localStorage.setItem(SKIP_KEY, "1");
  } catch {
    /* ignora */
  }
};
