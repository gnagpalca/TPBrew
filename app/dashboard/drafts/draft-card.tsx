"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface DraftCardProps {
  id: string;
  clientName: string;
  matchCount: number;
  emailSubject: string;
  emailBody: string;
}

export default function DraftCard({ id, clientName, matchCount, emailSubject, emailBody }: DraftCardProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(emailSubject);
  const [body, setBody] = useState(emailBody);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function saveEdit() {
    setBusy(true);
    const res = await fetch(`/api/drafts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email_subject: subject, email_body: body }),
    });
    setBusy(false);
    if (res.ok) {
      setEditing(false);
      router.refresh();
    } else {
      const data = await res.json();
      setMessage(data.error ?? "Failed to save");
    }
  }

  async function decide(action: "approve" | "reject") {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/drafts/${id}/${action}`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (res.ok) {
      setMessage(action === "approve" ? (data.status === "sent" ? "Sent to client." : data.error) : "Rejected.");
      router.refresh();
    } else {
      setMessage(data.error ?? "Action failed");
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">{clientName}</p>
          <p className="text-xs text-muted">{matchCount} matched item(s) bundled</p>
        </div>
        <div className="flex gap-2">
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              disabled={busy}
              className="rounded-md border border-border px-3 py-1.5 text-xs hover:border-accent/50"
            >
              Edit
            </button>
          )}
          <button
            onClick={() => decide("reject")}
            disabled={busy}
            className="rounded-md border border-red-900/50 px-3 py-1.5 text-xs text-red-400"
          >
            Reject
          </button>
          <button
            onClick={() => decide("approve")}
            disabled={busy}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition hover:brightness-110"
          >
            Approve & send
          </button>
        </div>
      </div>

      {editing ? (
        <div className="mt-3 flex flex-col gap-2">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="rounded-md border border-border bg-transparent px-3 py-2 text-sm"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            className="rounded-md border border-border bg-transparent px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              onClick={saveEdit}
              disabled={busy}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition hover:brightness-110"
            >
              Save
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setSubject(emailSubject);
                setBody(emailBody);
              }}
              className="rounded-md border border-border px-3 py-1.5 text-xs hover:border-accent/50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 text-sm">
          <p className="font-medium">{subject}</p>
          <p className="mt-1 whitespace-pre-wrap text-zinc-600 dark:text-zinc-400">{body}</p>
        </div>
      )}

      {message && <p className="mt-2 text-xs text-muted">{message}</p>}
    </div>
  );
}
