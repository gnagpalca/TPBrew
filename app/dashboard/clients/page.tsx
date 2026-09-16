import { createClient } from "@/lib/supabase/server";
import ClientForm from "./client-form";
import ClientRow from "./client-row";
import type { Client } from "@/lib/types";

export default async function ClientsPage() {
  const supabase = await createClient();
  const { data: clients } = await supabase
    .from("clients")
    .select("*, contacts(id, name, email, role)")
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Clients</h1>
        <p className="text-sm text-zinc-500">
          The fact narrative drives embedding quality — be specific about intercompany services, IP licensing,
          loans, and manufacturing structure.
        </p>
      </div>

      <div className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-950">
        <p className="mb-3 text-sm font-medium">Add a client</p>
        <ClientForm />
      </div>

      <div className="flex flex-col gap-3">
        {(clients as (Client & { contacts: { id: string; name: string | null; email: string; role: string | null }[] })[] | null)?.map(
          (client) => (
            <ClientRow key={client.id} client={client} contacts={client.contacts ?? []} />
          )
        )}
        {(!clients || clients.length === 0) && (
          <p className="rounded-lg border border-dashed border-black/10 p-6 text-center text-sm text-zinc-500 dark:border-white/10">
            No clients yet — add one above.
          </p>
        )}
      </div>
    </div>
  );
}
