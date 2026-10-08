/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

declare const self: ServiceWorkerGlobalScope;

self.skipWaiting();
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
// O app abre mesmo sem internet (a agenda carrega quando a conexão voltar). /api nunca vai para o cache.
registerRoute(new NavigationRoute(createHandlerBoundToURL("/index.html"), { denylist: [/^\/api\//] }));

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string | null;
}

self.addEventListener("push", (event) => {
  const data: PushPayload = (() => {
    try {
      return event.data?.json() as PushPayload;
    } catch {
      return { title: "Casal de Periquito", body: event.data?.text() ?? "" };
    }
  })();
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(data.title, {
        body: data.body,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: data.tag ?? undefined,
        data: { url: data.url ?? "/" },
      });
      // Se o app estiver aberto, atualiza a agenda na hora.
      const clients = await self.clients.matchAll({ type: "window" });
      clients.forEach((c) => c.postMessage({ type: "refresh" }));
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data?.url as string) ?? "/";
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of clients) {
        if ("focus" in c) {
          await c.focus();
          c.postMessage({ type: "navigate", url });
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
