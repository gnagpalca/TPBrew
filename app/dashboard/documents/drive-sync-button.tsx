"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Target = "clients" | "framework";

export default function DriveSyncButton() {
  const router = useRouter();
  const [busy, setBusy] = useState<Target | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSync(target: Target) {
    setBusy(target);
    setMessage(null);
    try {
      const res = await fetch("/api/drive-sync/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync failed");

      const errorDetail = (data.errors as string[] | undefined)?.length
        ? "\n\n" + (data.errors as string[]).slice(0, 5).join("\n")
        : "";

      if (target === "clients") {
        setMessage(
          `${data.clientsCreated} client(s) created, ${data.clientDocsIngested} doc(s) ingested, ${data.skipped} already up to date.` +
            (data.ranOutOfTime
              ? " Ran out of time for this pass (embeddings are throttled to stay on the free tier) — click again to continue."
              : "") +
            (data.errors?.length ? ` ${data.errors.length} error(s).` : "") +
            errorDetail
        );
      } else {
        setMessage(
          `${data.chaptersIngested} chapter(s) ingested across ${data.filesFullyProcessed} file(s), ${data.skipped} already up to date.` +
            (data.ranOutOfTime
              ? " Ran out of time for this pass — click again to continue from where it left off."
              : "") +
            (data.errors?.length ? ` ${data.errors.length} error(s).` : "") +
            errorDetail
        );
      }
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        <button
          onClick={() => handleSync("clients")}
          disabled={busy !== null}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition hover:brightness-110 disabled:opacity-50"
        >
          {busy === "clients" ? "Syncing…" : "Sync clients"}
        </button>
        <button
          onClick={() => handleSync("framework")}
          disabled={busy !== null}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:border-accent/50 disabled:opacity-50"
        >
          {busy === "framework" ? "Syncing…" : "Sync framework docs"}
        </button>
      </div>
      <p className="max-w-xs text-right text-xs text-muted">
        Embeddings are throttled to stay on Voyage&apos;s free tier, so a large batch may need a few
        clicks — each run picks up where the last one left off.
      </p>
      {message && <p className="max-w-xs whitespace-pre-line text-right text-xs text-muted">{message}</p>}
    </div>
  );
}
