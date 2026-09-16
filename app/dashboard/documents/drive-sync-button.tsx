"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DriveSyncButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSync() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/drive-sync/run", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      setMessage(
        `${data.clientsCreated} client(s) created, ${data.clientDocsIngested} client doc(s) and ${data.frameworkDocsIngested} framework doc(s) ingested, ${data.skipped} already up to date.` +
          (data.errors?.length ? ` ${data.errors.length} error(s) — check server logs.` : "")
      );
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={handleSync}
        disabled={busy}
        className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {busy ? "Syncing…" : "Sync from Drive"}
      </button>
      {message && <p className="max-w-xs text-right text-xs text-zinc-500">{message}</p>}
    </div>
  );
}
