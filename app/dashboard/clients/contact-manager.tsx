"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Contact {
  id: string;
  name: string | null;
  email: string;
  role: string | null;
}

export default function ContactManager({ clientId, contacts }: { clientId: string; contacts: Contact[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [busy, setBusy] = useState(false);

  async function addContact(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch(`/api/clients/${clientId}/contacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, role }),
    });
    setBusy(false);
    if (res.ok) {
      setName("");
      setEmail("");
      setRole("");
      router.refresh();
    }
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="mb-2 text-xs font-medium text-muted">Client contacts (receive approved emails)</p>
      <ul className="mb-2 flex flex-col gap-1">
        {contacts.map((c) => (
          <li key={c.id} className="text-xs text-zinc-300">
            {c.name ? `${c.name} · ` : ""}
            {c.email}
            {c.role ? ` · ${c.role}` : ""}
          </li>
        ))}
        {contacts.length === 0 && <li className="text-xs text-zinc-400">No contacts yet — add one below.</li>}
      </ul>
      <form onSubmit={addContact} className="flex flex-wrap gap-2">
        <input
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-md border border-border bg-transparent px-2 py-1 text-xs"
        />
        <input
          required
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-md border border-border bg-transparent px-2 py-1 text-xs"
        />
        <input
          placeholder="Role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="rounded-md border border-border bg-transparent px-2 py-1 text-xs"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-accent-foreground transition hover:brightness-110 disabled:opacity-50"
        >
          Add
        </button>
      </form>
    </div>
  );
}
