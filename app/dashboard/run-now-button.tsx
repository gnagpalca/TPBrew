"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RunNowButton() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const router = useRouter();

  async function handleRun() {
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch("/api/agent/run", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Run failed");
      setResult(`Found ${data.itemsFound} items, ${data.itemsMatched} matched, ${data.draftsCreated} drafts created.`);
      router.refresh();
    } catch (err) {
      setResult(err instanceof Error ? err.message : "Run failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={handleRun}
        disabled={running}
        className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {running ? "Running…" : "Run now"}
      </button>
      {result && <p className="max-w-xs text-right text-xs text-zinc-500">{result}</p>}
    </div>
  );
}
