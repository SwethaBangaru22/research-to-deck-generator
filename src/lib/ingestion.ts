import { getPool } from "./db";
import { embedTexts, toPgvector } from "./embeddings";
import { fetchPdfText, searchPapers } from "./semanticScholar";
import type { SemanticScholarPaper } from "./types";

const CHUNK_SIZE_CHARS = 1800;
const CHUNK_OVERLAP_CHARS = 200;
const MIN_CHUNK_CHARS = 200;

export function chunkText(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length === 0) return [];

  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    const end = Math.min(start + CHUNK_SIZE_CHARS, clean.length);
    const chunk = clean.slice(start, end).trim();
    if (chunk.length >= MIN_CHUNK_CHARS || chunks.length === 0) {
      chunks.push(chunk);
    }
    if (end === clean.length) break;
    start = end - CHUNK_OVERLAP_CHARS;
  }
  return chunks;
}

export type IngestionProgress = (message: string) => void;

/**
 * Ingests up to `limit` papers for a topic: search Semantic Scholar, fetch PDF
 * text (falling back to the abstract), chunk, embed, and store in pgvector.
 * Papers already ingested (by semantic_scholar_id) are reused, not re-fetched.
 */
export async function ingestTopic(topic: string, limit = 50, onProgress?: IngestionProgress): Promise<number> {
  const pool = getPool();
  const papers = await searchPapers(topic, limit);
  onProgress?.(`Found ${papers.length} candidate papers for "${topic}"`);

  let ingestedCount = 0;

  for (const paper of papers) {
    if (!paper.title) continue;

    const client = await pool.connect();
    let paperId: string;
    try {
      const existing = await client.query<{ id: string }>(
        "SELECT id FROM papers WHERE semantic_scholar_id = $1",
        [paper.paperId]
      );

      if (existing.rows.length > 0) {
        paperId = existing.rows[0].id;
      } else {
        const text = (await fetchPdfText(paper)) ?? paper.abstract ?? "";
        if (!text) {
          client.release();
          continue;
        }

        const inserted = await client.query<{ id: string }>(
          `INSERT INTO papers (semantic_scholar_id, title, authors, year, venue, url, abstract)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [
            paper.paperId,
            paper.title,
            (paper.authors ?? []).map((a) => a.name),
            paper.year,
            paper.venue,
            paper.url,
            paper.abstract,
          ]
        );
        paperId = inserted.rows[0].id;

        const chunks = chunkText(text);
        if (chunks.length > 0) {
          const embeddings = await embedTexts(chunks, "document");
          for (let i = 0; i < chunks.length; i++) {
            await client.query(
              `INSERT INTO paper_chunks (paper_id, chunk_index, content, embedding)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (paper_id, chunk_index) DO NOTHING`,
              [paperId, i, chunks[i], toPgvector(embeddings[i])]
            );
          }
        }
        ingestedCount++;
      }

      await client.query(
        `INSERT INTO topic_papers (topic, paper_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [topic, paperId]
      );
    } finally {
      client.release();
    }
  }

  onProgress?.(`Ingested ${ingestedCount} new papers (${papers.length - ingestedCount} already known)`);
  return ingestedCount;
}

export type { SemanticScholarPaper };
