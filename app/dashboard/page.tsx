import { createClient } from "@/lib/supabase/server";
import RunNowButton from "./run-now-button";
import type { AgentRun } from "@/lib/types";

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-950">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: runs } = await supabase
    .from("agent_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(20);

  // Server Component computing a per-request cutoff, not client render state.
  // eslint-disable-next-line react-hooks/purity
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [{ count: matchesTotal }, { count: matchesThisWeek }, { data: decidedDrafts }, { data: matchesWithTopics }] =
    await Promise.all([
      supabase.from("matches").select("*", { count: "exact", head: true }),
      supabase.from("matches").select("*", { count: "exact", head: true }).gte("created_at", sevenDaysAgo),
      supabase.from("drafts").select("status").neq("status", "pending"),
      supabase.from("matches").select("news_items(topic_tags)").limit(200),
    ]);

  const approvedOrSent = (decidedDrafts ?? []).filter((d) => d.status === "approved" || d.status === "sent").length;
  const approvalRate =
    decidedDrafts && decidedDrafts.length > 0 ? Math.round((approvedOrSent / decidedDrafts.length) * 100) : null;

  const topicCounts = new Map<string, number>();
  for (const row of matchesWithTopics ?? []) {
    const tags = (row as unknown as { news_items: { topic_tags: string[] | null } | null }).news_items?.topic_tags;
    for (const tag of tags ?? []) {
      topicCounts.set(tag, (topicCounts.get(tag) ?? 0) + 1);
    }
  }
  const topTopics = [...topicCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Agent run history</h1>
        <RunNowButton />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Matches (all time)" value={String(matchesTotal ?? 0)} />
        <StatCard label="Matches (last 7 days)" value={String(matchesThisWeek ?? 0)} />
        <StatCard label="Approval rate" value={approvalRate === null ? "—" : `${approvalRate}%`} />
        <StatCard label="Decided drafts" value={String(decidedDrafts?.length ?? 0)} />
      </div>

      {topTopics.length > 0 && (
        <div className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-950">
          <p className="mb-2 text-xs text-zinc-500">Top matched topics</p>
          <div className="flex flex-wrap gap-2">
            {topTopics.map(([tag, count]) => (
              <span key={tag} className="rounded-full bg-zinc-100 px-3 py-1 text-xs dark:bg-zinc-800">
                {tag} · {count}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-zinc-100 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-2">Started</th>
              <th className="px-4 py-2">Trigger</th>
              <th className="px-4 py-2">Sources checked</th>
              <th className="px-4 py-2">Items found</th>
              <th className="px-4 py-2">Items matched</th>
              <th className="px-4 py-2">Errors</th>
            </tr>
          </thead>
          <tbody>
            {(runs as AgentRun[] | null)?.map((run) => (
              <tr key={run.id} className="border-t border-black/5 dark:border-white/5">
                <td className="px-4 py-2">{new Date(run.started_at).toLocaleString()}</td>
                <td className="px-4 py-2 capitalize">{run.trigger_type}</td>
                <td className="px-4 py-2">{run.sources_checked ?? "—"}</td>
                <td className="px-4 py-2">{run.items_found ?? "—"}</td>
                <td className="px-4 py-2">{run.items_matched ?? "—"}</td>
                <td className="px-4 py-2 text-red-600">
                  {Array.isArray(run.errors) ? `${run.errors.length} error(s)` : "—"}
                </td>
              </tr>
            ))}
            {(!runs || runs.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-zinc-500">
                  No runs yet — click &ldquo;Run now&rdquo; to trigger the pipeline.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
