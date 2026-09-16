"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Client } from "@/lib/types";

interface ClientFormProps {
  client?: Client;
  onDone?: () => void;
}

export default function ClientForm({ client, onDone }: ClientFormProps) {
  const router = useRouter();
  const [name, setName] = useState(client?.name ?? "");
  const [jurisdiction, setJurisdiction] = useState(client?.jurisdiction ?? "");
  const [industry, setIndustry] = useState(client?.industry ?? "");
  const [factNarrative, setFactNarrative] = useState(client?.fact_narrative ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const url = client ? `/api/clients/${client.id}` : "/api/clients";
    const method = client ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, jurisdiction, industry, fact_narrative: factNarrative }),
    });

    setBusy(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Save failed");
      return;
    }

    if (!client) {
      setName("");
      setJurisdiction("");
      setIndustry("");
      setFactNarrative("");
    }
    router.refresh();
    onDone?.();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <input
          required
          placeholder="Client name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
        />
        <input
          required
          placeholder="Jurisdiction (e.g. Malaysia)"
          value={jurisdiction}
          onChange={(e) => setJurisdiction(e.target.value)}
          className="rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
        />
      </div>
      <input
        placeholder="Industry (optional)"
        value={industry}
        onChange={(e) => setIndustry(e.target.value)}
        className="rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
      />
      <textarea
        required
        placeholder="Fact pattern narrative — intercompany services, IP licensing, loans, manufacturing structure, etc. This drives match quality."
        value={factNarrative}
        onChange={(e) => setFactNarrative(e.target.value)}
        rows={5}
        className="rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="w-fit rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {busy ? "Saving…" : client ? "Save changes" : "Add client"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </form>
  );
}
