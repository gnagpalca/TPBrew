"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RematchButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleRematch() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/agent/rematch", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Re-match failed");

      const errorDetail = (data.errors as string[] | undefined)?.length
        ? "\n\n" + (data.errors as string[]).slice(0, 5).join("\n")
        : "";
      setMessage(
        `Checked ${data.itemsChecked} item(s), ${data.itemsMatched} matched a client, ${data.draftsCreated} draft(s) created.` +
          (data.errors?.length ? ` ${data.errors.length} error(s).` : "") +
          errorDetail
      );
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Re-match failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={handleRematch}
        disabled={busy}
        className="whitespace-nowrap rounded-md border border-border px-3 py-1.5 text-xs hover:border-accent/50 disabled:opacity-50"
      >
        {busy ? "Re-matching…" : "Re-match against clients"}
      </button>
      <p className="max-w-xs text-right text-xs text-muted">
        Checks all scraped news against clients as they exist right now — use this after syncing new
        clients instead of waiting for fresh news to trigger matching.
      </p>
      {message && <p className="max-w-xs whitespace-pre-line text-right text-xs text-muted">{message}</p>}
    </div>
  );
}
