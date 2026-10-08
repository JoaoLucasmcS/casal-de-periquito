import type {
  CalEvent, EventInput, Me, PendingLists, ProfileCard, ResetRequest,
} from "./types";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown, raw?: Blob): Promise<T> {
  const headers: Record<string, string> = { "X-Requested-With": "periquito" };
  let payload: BodyInit | undefined;
  if (raw) {
    headers["Content-Type"] = raw.type;
    payload = raw;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: payload, credentials: "same-origin" });
  } catch {
    throw new ApiError(0, "Sem conexão. Confira a internet e tente de novo.");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = data?.detail;
    const msg = typeof detail === "string" ? detail : "Algo deu errado. Tente de novo em instantes.";
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

export const api = {
  profiles: () => request<ProfileCard[]>("GET", "/auth/profiles"),
  login: (slug: string, password: string) => request<Me>("POST", "/auth/login", { slug, password }),
  logout: () => request<void>("POST", "/auth/logout"),
  me: () => request<Me>("GET", "/me"),
  updateMe: (data: { display_name?: string; whatsapp?: string | null }) => request<Me>("PATCH", "/me", data),
  uploadAvatar: (blob: Blob) => request<Me>("PUT", "/me/avatar", undefined, blob),
  changePassword: (current: string, next: string) => request<void>("PUT", "/me/password", { current, new: next }),

  requestReset: (slug: string) => request<void>("POST", "/auth/reset-requests", { slug }),
  resetRequestsForMe: () => request<ResetRequest[]>("GET", "/reset-requests/for-me"),
  generateResetCode: (id: number) =>
    request<{ code: string; whatsapp_url: string | null }>("POST", `/reset-requests/${id}/code`),
  confirmReset: (slug: string, code: string, new_password: string) =>
    request<Me>("POST", "/auth/reset", { slug, code, new_password }),

  events: (from: string, to: string) =>
    request<CalEvent[]>("GET", `/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  event: (id: number) => request<CalEvent>("GET", `/events/${id}`),
  pending: () => request<PendingLists>("GET", "/events/pending"),
  rejected: () => request<CalEvent[]>("GET", "/events/rejected"),
  conflicts: (starts_at: string, ends_at: string, exclude_id?: number) =>
    request<CalEvent[]>("POST", "/events/conflicts", { starts_at, ends_at, exclude_id }),
  createEvent: (data: EventInput) => request<CalEvent>("POST", "/events", data),
  updateEvent: (id: number, data: EventInput) => request<CalEvent>("PATCH", `/events/${id}`, data),
  approve: (id: number) => request<CalEvent>("POST", `/events/${id}/approve`),
  reject: (id: number, comment: string) => request<CalEvent>("POST", `/events/${id}/reject`, { comment }),
  cancel: (id: number) => request<void>("POST", `/events/${id}/cancel`),

  vapidKey: () => request<{ key: string }>("GET", "/push/vapid-public-key"),
  subscribe: (sub: PushSubscriptionJSON) => request<void>("POST", "/push/subscriptions", sub),
  unsubscribe: (endpoint: string) => request<void>("DELETE", "/push/subscriptions", { endpoint }),
  subscriptionCount: () => request<{ count: number }>("GET", "/push/subscriptions/count"),
};

export function avatarUrl(p: ProfileCard): string | null {
  return p.avatar_version ? `/api/users/${p.slug}/avatar?v=${p.avatar_version}` : null;
}
