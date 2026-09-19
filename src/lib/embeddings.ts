// Embeddings and re-ranking via Voyage AI's REST API (chosen because it pairs
// naturally with Claude and covers both embed + rerank in one provider — the
// architecture brief named Claude for synthesis but did not name an embeddings
// provider, so this is a default worth confirming rather than a hard requirement).

const VOYAGE_API_BASE = "https://api.voyageai.com/v1";
const EMBED_MODEL = "voyage-3";
const RERANK_MODEL = "rerank-2";
const EMBED_BATCH_SIZE = 96;

function voyageApiKey(): string {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) {
    throw new Error("VOYAGE_API_KEY is not set");
  }
  return key;
}

async function voyageFetch(pathname: string, body: unknown): Promise<any> {
  const res = await fetch(`${VOYAGE_API_BASE}${pathname}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${voyageApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Voyage API ${pathname} failed (${res.status}): ${text}`);
  }

  return res.json();
}

export async function embedTexts(
  texts: string[],
  inputType: "document" | "query" = "document"
): Promise<number[][]> {
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
    const data = await voyageFetch("/embeddings", {
      input: batch,
      model: EMBED_MODEL,
      input_type: inputType,
    });
    for (const item of data.data) {
      results.push(item.embedding);
    }
  }

  return results;
}

export function toPgvector(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

export interface RerankResult {
  index: number;
  relevanceScore: number;
}

export async function rerank(query: string, documents: string[], topK: number): Promise<RerankResult[]> {
  if (documents.length === 0) return [];
  const data = await voyageFetch("/rerank", {
    query,
    documents,
    model: RERANK_MODEL,
    top_k: Math.min(topK, documents.length),
  });

  return data.data.map((item: { index: number; relevance_score: number }) => ({
    index: item.index,
    relevanceScore: item.relevance_score,
  }));
}
