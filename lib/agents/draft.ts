import { anthropic, MODELS } from "@/lib/anthropic";
import { getResend, FROM_EMAIL } from "@/lib/resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Client, Match, NewsItem } from "@/lib/types";

const SYSTEM_PROMPT = `You draft weekly transfer pricing news briefings for Big 4 clients, in the voice of the client's engagement partner. Professional, concise, no legal advice framing — this flags what to be aware of, not a formal opinion.

Structure:
- Short opening line acknowledging it's the weekly TP news roundup.
- One short paragraph per news item: what happened, why it matters to THIS client specifically (use the provided reasoning), then "Read more: <source link>".
- Brief closing line inviting the client to reach out to discuss any item.
- No markdown, no subject line in the body — plain professional email text.

Respond with strict JSON only: {"subject": string, "body": string}`;

interface MatchWithNews extends Match {
  news_items: NewsItem;
}

/**
 * Generates one bundled weekly draft per client that has new matches since
 * their last draft (PRD §8.4), writes it to `drafts`, and emails the
 * assigned manager for review via Resend.
 */
export async function generateDraftsForPendingMatches(supabase: SupabaseClient): Promise<number> {
  const { data: clients, error: clientsError } = await supabase
    .from("clients")
    .select("*")
    .not("manager_id", "is", null);
  if (clientsError) throw clientsError;

  let draftsCreated = 0;

  for (const client of (clients ?? []) as Client[]) {
    const { data: lastDraft } = await supabase
      .from("drafts")
      .select("created_at")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let matchQuery = supabase
      .from("matches")
      .select("*, news_items(*)")
      .eq("client_id", client.id);

    if (lastDraft?.created_at) {
      matchQuery = matchQuery.gt("created_at", lastDraft.created_at);
    }

    const { data: matches, error: matchesError } = await matchQuery;
    if (matchesError) throw matchesError;
    if (!matches || matches.length === 0) continue;

    const typedMatches = matches as MatchWithNews[];
    const itemsText = typedMatches
      .map(
        (m, i) =>
          `${i + 1}. Title: ${m.news_items.title}\nSummary: ${m.news_items.summary}\nWhy it matters: ${m.reasoning}\nSource: ${m.news_items.source_url}`
      )
      .join("\n\n");

    const message = await anthropic.messages.create({
      model: MODELS.sonnet,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Client: ${client.name} (${client.jurisdiction})\n\nMatched news items this week:\n\n${itemsText}`,
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") continue;

    let subject: string;
    let body: string;
    try {
      const cleaned = textBlock.text.trim().replace(/^```json\s*/i, "").replace(/```$/, "");
      ({ subject, body } = JSON.parse(cleaned));
    } catch {
      continue;
    }

    const { data: draft, error: draftError } = await supabase
      .from("drafts")
      .insert({
        client_id: client.id,
        manager_id: client.manager_id,
        match_ids: typedMatches.map((m) => m.id),
        email_subject: subject,
        email_body: body,
        status: "pending",
      })
      .select()
      .single();

    if (draftError || !draft) continue;
    draftsCreated++;

    const { data: manager } = await supabase
      .from("managers")
      .select("email, name")
      .eq("id", client.manager_id)
      .maybeSingle();

    if (manager?.email) {
      await getResend().emails.send({
        from: FROM_EMAIL,
        to: manager.email,
        subject: `[Review needed] TP news draft for ${client.name}`,
        text: `A new weekly TP news draft is ready for your review.\n\nClient: ${client.name}\nSubject: ${subject}\n\n${body}\n\nOpen the dashboard to Approve, Edit, or Reject this draft before anything reaches the client.`,
      });
    }
  }

  return draftsCreated;
}
