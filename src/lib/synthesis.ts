import { CLAUDE_MODEL, extractText, getClaude } from "./claude";
import type { DeckSynthesis, RankedChunk } from "./types";

function buildSourcesBlock(chunks: RankedChunk[]): { block: string; paperOrder: string[] } {
  const paperOrder: string[] = [];
  const byPaper = new Map<string, RankedChunk[]>();

  for (const chunk of chunks) {
    if (!byPaper.has(chunk.paperId)) {
      byPaper.set(chunk.paperId, []);
      paperOrder.push(chunk.paperId);
    }
    byPaper.get(chunk.paperId)!.push(chunk);
  }

  const block = paperOrder
    .map((paperId, index) => {
      const paperChunks = byPaper.get(paperId)!;
      const { paperTitle, authors, year, url } = paperChunks[0];
      const excerpts = paperChunks.map((c) => c.content).join("\n---\n");
      return `<source index="${index + 1}">
<title>${paperTitle}</title>
<authors>${authors.join(", ")}</authors>
<year>${year ?? "unknown"}</year>
<url>${url ?? "unknown"}</url>
<excerpts>
${excerpts}
</excerpts>
</source>`;
    })
    .join("\n\n");

  return { block, paperOrder };
}

/**
 * Synthesizes retrieved findings into a slide deck spec: titles, bullets,
 * speaker notes, and citation indices mapped back to source papers.
 */
export async function synthesizeDeck(topic: string, chunks: RankedChunk[]): Promise<DeckSynthesis> {
  if (chunks.length === 0) {
    throw new Error(`No retrieved chunks for topic "${topic}" — cannot synthesize a deck`);
  }

  const { block: sourcesBlock, paperOrder } = buildSourcesBlock(chunks);

  const message = await getClaude().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `<context>
You are a research analyst producing a presentation deck that synthesizes findings from the sources below for the topic: "${topic}".
Use only information you are highly confident is supported by the sources. Do not fabricate citations, numbers, or claims not present in the excerpts. If a source is thin, say less about it rather than inventing detail.
</context>

<sources>
${sourcesBlock}
</sources>

<task>
Produce a slide-by-slide deck synthesizing the highest-signal findings across these sources. Aim for 6-10 content slides (not counting a title slide, which you should not include here).
Every substantive claim on a slide must map to at least one source index from the <sources> block above via citation_indices.
</task>

<output_format>
Return ONLY valid JSON matching this exact shape, no markdown fences, no prose outside the JSON:
{
  "deck_title": string,
  "slides": [
    {
      "title": string,
      "bullets": string[],
      "speaker_notes": string,
      "citation_indices": number[]
    }
  ]
}
citation_indices must reference the "index" attribute of a <source> above (1-based).
</output_format>`,
      },
    ],
  });

  const raw = extractText(message).trim();
  const parsed = JSON.parse(raw) as { deck_title: string; slides: DeckSynthesis["slides"] };

  const citations = paperOrder.map((paperId, i) => {
    const chunk = chunks.find((c) => c.paperId === paperId)!;
    return {
      index: i + 1,
      title: chunk.paperTitle,
      authors: chunk.authors,
      year: chunk.year,
      url: chunk.url,
    };
  });

  return {
    deck_title: parsed.deck_title,
    slides: parsed.slides,
    citations,
  };
}
