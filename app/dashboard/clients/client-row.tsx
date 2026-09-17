"use client";

import { useState } from "react";
import ClientForm from "./client-form";
import ContactManager from "./contact-manager";
import type { Client } from "@/lib/types";

interface Contact {
  id: string;
  name: string | null;
  email: string;
  role: string | null;
}

export default function ClientRow({ client, contacts }: { client: Client; contacts: Contact[] }) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">{client.name}</p>
          <p className="text-xs text-muted">
            {client.jurisdiction}
            {client.industry ? ` · ${client.industry}` : ""}
          </p>
        </div>
        <button
          onClick={() => setEditing((v) => !v)}
          className="rounded-md border border-border px-3 py-1.5 text-xs hover:border-accent/50"
        >
          {editing ? "Close" : "Edit"}
        </button>
      </div>

      {editing ? (
        <div className="mt-3">
          <ClientForm client={client} onDone={() => setEditing(false)} />
        </div>
      ) : (
        <p className="mt-2 line-clamp-2 text-sm text-zinc-300">{client.fact_narrative}</p>
      )}

      <ContactManager clientId={client.id} contacts={contacts} />
    </div>
  );
}
