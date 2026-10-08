import { useState } from "react";
import { api, ApiError } from "../api";
import { useMeStrict, useRefreshAll } from "../hooks";
import type { CalEvent } from "../types";
import { Button, ErrorText, Sheet } from "./ui";

export function RejectDialog({ ev, onClose, onDone }: { ev: CalEvent; onClose: () => void; onDone?: () => void }) {
  const me = useMeStrict();
  const refreshAll = useRefreshAll();
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.reject(ev.id, comment.trim());
      refreshAll();
      onDone?.();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não deu para recusar. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={`Recusar "${ev.title}"`} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4 pb-4">
        <label className="block">
          <span className="mb-1 block text-[15px] font-bold">Quer dizer o motivo? (opcional)</span>
          <textarea
            autoFocus
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={500}
            placeholder="Ex.: tenho prova no dia seguinte"
            className="min-h-24 w-full rounded-xl border border-line bg-panel px-3 py-2 focus:border-ink focus:outline-none"
          />
        </label>
        <p className="text-[15px] text-muted">
          {me.partner.display_name} recebe uma notificação e pode chamar você no WhatsApp para conversar.
        </p>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" variant="danger" busy={busy}>Recusar</Button>
      </form>
    </Sheet>
  );
}
