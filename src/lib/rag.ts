import { CLAUDE_MODEL, extractText, getClaude } from "./claude";
import { getPool } from "./db";
import { embedTexts, rerank, toPgvector } from "./embeddings";
import type { RankedChunk } from "./types";

const SUB_QUERIES_COUNT = 4;
const PER_QUERY_TOP_K = 15;
const FINAL_TOP_K = 25;

/**
 * Multi-query expansion: ask Claude for diverse rephrasings/sub-angles of the
 * topic so retrieval surfaces findings a single query would miss.
 */
export async function expandQueries(topic: string): Promise<string[]> {
  const message = await getClaude().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: `<task>Generate ${SUB_QUERIES_COUNT} diverse search queries that together cover the important sub-angles of this research topic, for retrieving relevant passages from an academic paper corpus.</task>
<topic>${topic}</topic>
<output_format>Return ONLY a JSON array of ${SUB_QUERIES_COUNT} strings. No prose, no markdown fences.</output_format>`,
      },
    ],
  });

  const raw = extractText(message).trim();
  try {
    const queries = JSON.parse(raw) as string[];
    return [topic, ...queries];
  } catch {
    // Grounding fallback if the model doesn't return clean JSON — retrieval still works with just the topic.
    return [topic];
  }
}

interface ChunkRow {
  id: string;
  paper_id: string;
  title: string;
  authors: string[];
  year: number | null;
  url: string | null;
  content: string;
}

/**
 * Runs multi-query retrieval (vector similarity per sub-query, scoped to the
 * topic's ingested papers, merged and deduped) then re-ranks the merged pool
 * against the original topic to surface the highest-signal chunks.
 */
export async function retrieveForTopic(topic: string): Promise<RankedChunk[]> {
  const pool = getPool();
  const queries = await expandQueries(topic);
  const queryEmbeddings = await embedTexts(queries, "query");

  const seen = new Map<string, ChunkRow>();

  for (const embedding of queryEmbeddings) {
    const { rows } = await pool.query<ChunkRow>(
      `SELECT pc.id, pc.paper_id, p.title, p.authors, p.year, p.url, pc.content
       FROM paper_chunks pc
       JOIN papers p ON p.id = pc.paper_id
       JOIN topic_papers tp ON tp.paper_id = p.id AND tp.topic = $1
       ORDER BY pc.embedding <=> $2
       LIMIT $3`,
      [topic, toPgvector(embedding), PER_QUERY_TOP_K]
    );
    for (const row of rows) {
      seen.set(row.id, row);
    }
  }

  const candidates = [...seen.values()];
  if (candidates.length === 0) return [];

  const rerankResults = await rerank(
    topic,
    candidates.map((c) => c.content),
    FINAL_TOP_K
  );

  return rerankResults.map(({ index, relevanceScore }) => {
    const row = candidates[index];
    return {
      chunkId: row.id,
      paperId: row.paper_id,
      paperTitle: row.title,
      authors: row.authors,
      year: row.year,
      url: row.url,
      content: row.content,
      score: relevanceScore,
    };
  });
}
