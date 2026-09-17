import { createClient } from "@/lib/supabase/server";
import { formatMalaysiaDate } from "@/lib/format";
import type { DraftStatus } from "@/lib/types";

type Stage = "New match" | "Drafted" | "Approved" | "Sent" | "Rejected";

const STAGE_STYLES: Record<Stage, string> = {
  "New match": "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  Drafted: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  Approved: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  Sent: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",
  Rejected: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
};

function stageFor(draftStatus: DraftStatus | null): Stage {
  switch (draftStatus) {
    case "pending":
      return "Drafted";
    case "approved":
      return "Approved";
    case "sent":
      return "Sent";
    case "rejected":
      return "Rejected";
    default:
      return "New match";
  }
}

interface OpportunityRow {
  id: string;
  clientName: string;
  newsTitle: string;
  sourceUrl: string;
  topicTags: string[];
  relevanceScore: number;
  createdAt: string;
  stage: Stage;
}

export default async function OpportunitiesPage() {
  const supabase = await createClient();

  const [{ data: matches }, { data: drafts }] = await Promise.all([
    supabase
      .from("matches")
      .select("*, news_items(title, topic_tags, source_url), clients(name)")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("drafts").select("status, match_ids"),
  ]);

  const matchIdToDraftStatus = new Map<string, DraftStatus>();
  for (const draft of drafts ?? []) {
    for (const matchId of draft.match_ids ?? []) {
      matchIdToDraftStatus.set(matchId, draft.status);
    }
  }

  const rows: OpportunityRow[] = (matches ?? []).map((m) => {
    const newsItem = m.news_items as unknown as { title: string; topic_tags: string[] | null; source_url: string } | null;
    const client = m.clients as unknown as { name: string } | null;
    return {
      id: m.id,
      clientName: client?.name ?? "Unknown client",
      newsTitle: newsItem?.title ?? "(untitled)",
      sourceUrl: newsItem?.source_url ?? "#",
      topicTags: newsItem?.topic_tags ?? [],
      relevanceScore: m.relevance_score,
      createdAt: m.created_at,
      stage: stageFor(matchIdToDraftStatus.get(m.id) ?? null),
    };
  });

  const stageCounts = rows.reduce(
    (acc, r) => {
      acc[r.stage] = (acc[r.stage] ?? 0) + 1;
      return acc;
    },
    {} as Record<Stage, number>
  );

  const clientCounts = new Map<string, number>();
  for (const r of rows) {
    clientCounts.set(r.clientName, (clientCounts.get(r.clientName) ?? 0) + 1);
  }
  const topClients = [...clientCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Opportunities</h1>
        <p className="text-sm text-muted">
          Every client match tracked as a pipeline item, from first flagged to sent — the CRM view of what the
          agent has surfaced.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {(["New match", "Drafted", "Approved", "Sent", "Rejected"] as Stage[]).map((stage) => (
          <div
            key={stage}
            className="rounded-lg border border-border bg-surface p-4"
          >
            <p className="text-xs text-muted">{stage}</p>
            <p className="mt-1 text-2xl font-semibold">{stageCounts[stage] ?? 0}</p>
          </div>
        ))}
      </div>

      {topClients.length > 0 && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="mb-2 text-xs text-muted">Opportunities by client</p>
          <div className="flex flex-wrap gap-2">
            {topClients.map(([name, count]) => (
              <span key={name} className="rounded-full bg-surface-muted px-3 py-1 text-xs">
                {name} · {count}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted text-left text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-2">Client</th>
              <th className="px-4 py-2">Opportunity</th>
              <th className="px-4 py-2">Relevance</th>
              <th className="px-4 py-2">Stage</th>
              <th className="px-4 py-2">Matched</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border align-top">
                <td className="px-4 py-2 font-medium">{r.clientName}</td>
                <td className="px-4 py-2">
                  <a
                    href={r.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline decoration-dotted underline-offset-2"
                  >
                    {r.newsTitle}
                  </a>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {r.topicTags.map((tag) => (
                      <span key={tag} className="rounded-full bg-surface-muted px-2 py-0.5 text-xs">
                        {tag}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2">{Math.round(r.relevanceScore * 100)}%</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STAGE_STYLES[r.stage]}`}>
                    {r.stage}
                  </span>
                </td>
                <td className="px-4 py-2 whitespace-nowrap text-muted">{formatMalaysiaDate(r.createdAt)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted">
                  No opportunities tracked yet — matches appear here once the agent finds news relevant to a client.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
