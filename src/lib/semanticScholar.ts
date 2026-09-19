import type { SemanticScholarPaper } from "./types";

const API_BASE = "https://api.semanticscholar.org/graph/v1";
const FIELDS = "title,abstract,year,venue,url,authors,openAccessPdf";

function headers(): Record<string, string> {
  const key = process.env.SEMANTIC_SCHOLAR_API_KEY;
  return key ? { "x-api-key": key } : {};
}

async function fetchWithRetry(url: string, attempt = 1): Promise<Response> {
  const res = await fetch(url, { headers: headers() });
  if (res.status === 429 && attempt <= 4) {
    const delayMs = 1000 * 2 ** attempt;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return fetchWithRetry(url, attempt + 1);
  }
  return res;
}

export async function searchPapers(topic: string, limit = 50): Promise<SemanticScholarPaper[]> {
  const params = new URLSearchParams({
    query: topic,
    fields: FIELDS,
    limit: String(Math.min(limit, 100)),
  });

  const res = await fetchWithRetry(`${API_BASE}/paper/search?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Semantic Scholar search failed (${res.status}): ${await res.text()}`);
  }

  const data = await res.json();
  return (data.data ?? []) as SemanticScholarPaper[];
}

/**
 * Fetches and extracts text from a paper's open-access PDF, if one exists.
 * Falls back to null so callers can use the abstract instead.
 */
export async function fetchPdfText(paper: SemanticScholarPaper): Promise<string | null> {
  const pdfUrl = paper.openAccessPdf?.url;
  if (!pdfUrl) return null;

  try {
    const res = await fetch(pdfUrl);
    if (!res.ok) return null;

    const buffer = Buffer.from(await res.arrayBuffer());
    const pdfParse = (await import("pdf-parse")).default;
    const parsed = await pdfParse(buffer);
    return parsed.text || null;
  } catch {
    // PDF fetch/parse is best-effort — ingestion falls back to the abstract.
    return null;
  }
}
