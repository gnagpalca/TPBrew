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
    <div className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-950">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">{client.name}</p>
          <p className="text-xs text-zinc-500">
            {client.jurisdiction}
            {client.industry ? ` · ${client.industry}` : ""}
          </p>
        </div>
        <button
          onClick={() => setEditing((v) => !v)}
          className="rounded-md border border-black/10 px-3 py-1.5 text-xs dark:border-white/10"
        >
          {editing ? "Close" : "Edit"}
        </button>
      </div>

      {editing ? (
        <div className="mt-3">
          <ClientForm client={client} onDone={() => setEditing(false)} />
        </div>
      ) : (
        <p className="mt-2 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">{client.fact_narrative}</p>
      )}

      <ContactManager clientId={client.id} contacts={contacts} />
    </div>
  );
}
