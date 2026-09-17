"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DocumentCategory } from "@/lib/types";

interface ClientOption {
  id: string;
  name: string;
}

export default function DocumentForm({ clients }: { clients: ClientOption[] }) {
  const router = useRouter();
  const [category, setCategory] = useState<DocumentCategory>("regulatory_framework");
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [jurisdiction, setJurisdiction] = useState("Malaysia");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);

    const res = await fetch("/api/documents/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category,
        client_id: category === "client_tp_doc" ? clientId : undefined,
        title,
        jurisdiction: category === "regulatory_framework" ? jurisdiction : undefined,
        text,
      }),
    });

    setBusy(false);
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error ?? "Ingestion failed");
      return;
    }

    setMessage(`Ingested ${data.chunkCount} chunk(s).`);
    setTitle("");
    setText("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex gap-3">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as DocumentCategory)}
          className="rounded-md border border-border bg-transparent px-3 py-2 text-sm"
        >
          <option value="regulatory_framework">Malaysia regulatory framework</option>
          <option value="client_tp_doc">Client TP document</option>
        </select>

        {category === "client_tp_doc" ? (
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            required
            className="flex-1 rounded-md border border-border bg-transparent px-3 py-2 text-sm"
          >
            {clients.length === 0 && <option value="">Add a client first</option>}
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={jurisdiction}
            onChange={(e) => setJurisdiction(e.target.value)}
            placeholder="Jurisdiction (e.g. Malaysia, OECD-wide)"
            className="flex-1 rounded-md border border-border bg-transparent px-3 py-2 text-sm"
          />
        )}
      </div>

      <input
        required
        placeholder="Document title (e.g. 'LHDN TP Guidelines 2024', 'FY24 TP Policy Memo')"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="rounded-md border border-border bg-transparent px-3 py-2 text-sm"
      />
      <textarea
        required
        placeholder="Paste the document text here — it'll be chunked and embedded for the TP specialist agent to reference."
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        className="rounded-md border border-border bg-transparent px-3 py-2 text-sm"
      />

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy || (category === "client_tp_doc" && !clientId)}
          className="w-fit rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "Ingesting…" : "Ingest document"}
        </button>
        {message && <p className="text-sm text-muted">{message}</p>}
      </div>
    </form>
  );
}
