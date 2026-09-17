import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import RunNowButton from "./run-now-button";
import { formatMalaysiaDateTime } from "@/lib/format";
import type { AgentRun } from "@/lib/types";

function AttentionCard({
  label,
  value,
  href,
  cta,
}: {
  label: string;
  value: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="flex flex-col justify-between rounded-lg border border-border bg-surface p-4">
      <div>
        <p className="text-xs text-muted">{label}</p>
        <p className="mt-1 text-3xl font-semibold text-accent">{value}</p>
      </div>
      <Link href={href} className="mt-3 text-xs font-medium text-accent hover:brightness-110">
        {cta} →
      </Link>
    </div>
  );
}

function LastRunCard({ run }: { run: AgentRun | null }) {
  const errorCount = run && Array.isArray(run.errors) ? run.errors.length : 0;
  return (
    <div className="flex flex-col justify-between rounded-lg border border-border bg-surface p-4">
      <div>
        <p className="text-xs text-muted">Last run</p>
        {run ? (
          <>
            <p className="mt-1 text-sm font-medium">{formatMalaysiaDateTime(run.started_at)}</p>
            <p className="mt-1 text-xs text-muted">
              {run.items_found ?? 0} found · {run.items_matched ?? 0} matched
              {errorCount > 0 ? ` · ${errorCount} error(s)` : ""}
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted">Never run yet</p>
        )}
      </div>
      <Link href="/dashboard/activity" className="mt-3 text-xs font-medium text-accent hover:brightness-110">
        View activity →
      </Link>
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();

  // eslint-disable-next-line react-hooks/purity
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { count: pendingDraftsCount },
    { data: pendingDrafts },
    { count: matchesThisWeekCount },
    { data: recentMatches },
    { data: lastRun },
  ] = await Promise.all([
    supabase.from("drafts").select("*", { count: "exact", head: true }).eq("status", "pending"),
    supabase
      .from("drafts")
      .select("id, email_subject, created_at, clients(name)")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase.from("matches").select("*", { count: "exact", head: true }).gte("created_at", sevenDaysAgo),
    supabase
      .from("matches")
      .select("id, created_at, relevance_score, clients(name), news_items(title)")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase.from("agent_runs").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Dashboard</h1>
          <p className="text-sm text-muted">What needs your attention today.</p>
        </div>
        <RunNowButton />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <AttentionCard
          label="Pending drafts"
          value={String(pendingDraftsCount ?? 0)}
          href="/dashboard/drafts"
          cta="Review drafts"
        />
        <AttentionCard
          label="New opportunities (7 days)"
          value={String(matchesThisWeekCount ?? 0)}
          href="/dashboard/opportunities"
          cta="View opportunities"
        />
        <LastRunCard run={(lastRun as AgentRun | null) ?? null} />
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium">Pending drafts</p>
            <Link href="/dashboard/drafts" className="text-xs text-accent hover:brightness-110">
              View all →
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            {(
              pendingDrafts as
                | { id: string; email_subject: string; created_at: string; clients: { name: string } | null }[]
                | null
            )?.map((d) => (
              <div key={d.id} className="rounded-md bg-surface-muted px-3 py-2 text-sm">
                <p className="font-medium">{d.clients?.name ?? "Unknown client"}</p>
                <p className="text-xs text-muted">{d.email_subject}</p>
              </div>
            ))}
            {(!pendingDrafts || pendingDrafts.length === 0) && (
              <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted">
                Nothing pending — you&rsquo;re caught up.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium">Recent opportunities</p>
            <Link href="/dashboard/opportunities" className="text-xs text-accent hover:brightness-110">
              View all →
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            {(
              recentMatches as
                | {
                    id: string;
                    relevance_score: number;
                    clients: { name: string } | null;
                    news_items: { title: string } | null;
                  }[]
                | null
            )?.map((m) => (
              <div key={m.id} className="rounded-md bg-surface-muted px-3 py-2 text-sm">
                <p className="font-medium">{m.clients?.name ?? "Unknown client"}</p>
                <p className="text-xs text-muted">{m.news_items?.title ?? "(untitled)"}</p>
              </div>
            ))}
            {(!recentMatches || recentMatches.length === 0) && (
              <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted">
                No opportunities yet — click &ldquo;Run now&rdquo; to check for news.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
