export interface ChapterSection {
  title: string;
  text: string;
}

// Matches heading lines like "CHAPTER I", "Chapter 3: Comparability Analysis",
// "PART II — SPECIAL CONSIDERATIONS", "Annex 4". Kept intentionally loose
// since PDF-extracted text doesn't preserve font size/boldness, only the
// text itself.
const CHAPTER_HEADING_RE = /^[ \t]*(chapter|part|annex)[ \t]+([ivxlcdm]+|\d+)\b[^\n]{0,120}$/gim;

/**
 * Splits a long regulatory document into chapter/part-sized sections based
 * on detected headings, falling back to the whole document as one section
 * if fewer than two headings are found (e.g. a short document with no
 * chapter structure). Each section is later ingested as its own
 * document_source with its own source_ref, so a sync that times out
 * partway through a huge PDF resumes at the next unprocessed chapter
 * instead of restarting the whole file.
 */
export function splitIntoChapters(fullText: string, fallbackTitle: string): ChapterSection[] {
  const matches = [...fullText.matchAll(CHAPTER_HEADING_RE)];
  if (matches.length < 2) {
    return [{ title: fallbackTitle, text: fullText }];
  }

  const sections: ChapterSection[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index!;
    const end = i + 1 < matches.length ? matches[i + 1].index! : fullText.length;
    const title = matches[i][0].trim().replace(/\s+/g, " ");
    const text = fullText.slice(start, end).trim();
    if (text.length > 50) sections.push({ title, text });
  }
  return sections.length > 0 ? sections : [{ title: fallbackTitle, text: fullText }];
}
