import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./dashboard/sign-out-button";

const PIPELINE_STAGES = [
  {
    stage: "1. Scrape & classify",
    model: "Haiku",
    description:
      "Pulls from RSS feeds, Google Alerts, and NewsData.io, then cheaply filters out anything that isn't genuinely TP/international-tax news before it ever reaches a client.",
  },
  {
    stage: "2. Embed",
    model: "Voyage",
    description:
      "Every news item and every client fact pattern is embedded into the same vector space, so relevance can be judged by meaning, not keyword overlap.",
  },
  {
    stage: "3. Match & ground",
    model: "Sonnet + RAG",
    description:
      "A vector search shortlists candidate clients, then the TP specialist agent judges genuine relevance grounded in that client's own TP documentation and the Malaysia/OECD regulatory framework — not just the fact narrative.",
  },
  {
    stage: "4. Draft",
    model: "Sonnet",
    description:
      "Bundles the week's genuine matches into one bespoke client email, written in the engagement partner's voice, citing exactly why each item matters to that client.",
  },
  {
    stage: "5. Human approval gate",
    model: "You",
    description:
      "Nothing reaches a client without a manager reviewing, editing, or rejecting the draft first — approval is the only path that sends an email.",
  },
];

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ count: clientsCount }, { count: documentsCount }, { count: matchesCount }, { count: sentCount }] =
    await Promise.all([
      supabase.from("clients").select("*", { count: "exact", head: true }),
      supabase.from("document_sources").select("*", { count: "exact", head: true }),
      supabase.from("matches").select("*", { count: "exact", head: true }),
      supabase.from("drafts").select("*", { count: "exact", head: true }).eq("status", "sent"),
    ]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <span className="font-semibold tracking-tight">TPBrew</span>
        <div className="flex items-center gap-3 text-sm text-muted">
          <span>{user?.email}</span>
          <SignOutButton />
        </div>
      </header>

      <main className="flex-1 bg-background px-6 py-12">
        <div className="mx-auto flex max-w-3xl flex-col gap-12">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">TPBrew</h1>
            <p className="mt-3 text-lg text-zinc-300">
              An agentic transfer pricing news intelligence system: it scrapes tax/TP news, judges what&rsquo;s genuinely
              relevant to each client using their own TP documentation and the regulatory framework, and drafts a
              bespoke client email — with a mandatory human approval gate before anything is ever sent.
            </p>
            <Link
              href="/dashboard"
              className="mt-6 inline-block rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground transition hover:brightness-110"
            >
              Open dashboard
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-lg border border-border bg-surface p-4">
              <p className="text-xs text-muted">Clients tracked</p>
              <p className="mt-1 text-2xl font-semibold text-accent">{clientsCount ?? 0}</p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-4">
              <p className="text-xs text-muted">Reference documents</p>
              <p className="mt-1 text-2xl font-semibold text-accent">{documentsCount ?? 0}</p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-4">
              <p className="text-xs text-muted">Matches found</p>
              <p className="mt-1 text-2xl font-semibold text-accent">{matchesCount ?? 0}</p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-4">
              <p className="text-xs text-muted">Emails sent</p>
              <p className="mt-1 text-2xl font-semibold text-accent">{sentCount ?? 0}</p>
            </div>
          </div>

          <div>
            <h2 className="mb-4 text-sm font-medium text-muted uppercase tracking-wide">
              How the agent pipeline works
            </h2>
            <div className="flex flex-col gap-3">
              {PIPELINE_STAGES.map((s) => (
                <div key={s.stage} className="rounded-lg border border-border bg-surface p-4">
                  <div className="flex items-center justify-between gap-4">
                    <p className="font-medium">{s.stage}</p>
                    <span className="whitespace-nowrap rounded-full bg-accent/15 px-2.5 py-0.5 text-xs text-accent">
                      {s.model}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm text-zinc-300">{s.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
