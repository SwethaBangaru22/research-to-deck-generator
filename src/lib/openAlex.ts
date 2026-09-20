import type { OpenAlexPaper } from "./types";

const API_BASE = "https://api.openalex.org/works";
const SELECT_FIELDS =
  "id,title,abstract_inverted_index,publication_year,primary_location,authorships,open_access,best_oa_location";

/**
 * OpenAlex has no API key — the `mailto` param just opts into the "polite pool"
 * for higher, more reliable rate limits.
 */
function mailtoParam(): string {
  const email = process.env.OPENALEX_MAILTO;
  return email ? `&mailto=${encodeURIComponent(email)}` : "";
}

async function fetchWithRetry(url: string, attempt = 1): Promise<Response> {
  const res = await fetch(url);
  if (res.status === 429 && attempt <= 4) {
    const delayMs = 1000 * 2 ** attempt;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return fetchWithRetry(url, attempt + 1);
  }
  return res;
}

/**
 * OpenAlex returns abstracts as an inverted index ({ word: [positions] })
 * instead of plain text, so it has to be reconstructed.
 */
function reconstructAbstract(index: Record<string, number[]> | null | undefined): string | null {
  if (!index) return null;

  const positioned: [number, string][] = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const position of positions) positioned.push([position, word]);
  }
  if (positioned.length === 0) return null;

  positioned.sort((a, b) => a[0] - b[0]);
  return positioned.map(([, word]) => word).join(" ");
}

function toOpenAlexPaper(work: any): OpenAlexPaper {
  return {
    id: work.id,
    title: work.title ?? "",
    abstract: reconstructAbstract(work.abstract_inverted_index),
    year: work.publication_year ?? null,
    venue: work.primary_location?.source?.display_name ?? null,
    url: work.primary_location?.landing_page_url ?? work.id,
    authors: (work.authorships ?? []).map((a: any) => ({ name: a.author?.display_name ?? "Unknown" })),
    pdfUrl: work.best_oa_location?.pdf_url ?? work.open_access?.oa_url ?? null,
  };
}

export async function searchPapers(topic: string, limit = 50): Promise<OpenAlexPaper[]> {
  const params = new URLSearchParams({
    search: topic,
    select: SELECT_FIELDS,
    per_page: String(Math.min(limit, 100)),
  });

  const res = await fetchWithRetry(`${API_BASE}?${params.toString()}${mailtoParam()}`);
  if (!res.ok) {
    throw new Error(`OpenAlex search failed (${res.status}): ${await res.text()}`);
  }

  const data = await res.json();
  return ((data.results ?? []) as any[]).map(toOpenAlexPaper);
}

/**
 * Fetches and extracts text from a paper's open-access PDF, if one exists.
 * Falls back to null so callers can use the abstract instead.
 */
export async function fetchPdfText(paper: OpenAlexPaper): Promise<string | null> {
  if (!paper.pdfUrl) return null;

  try {
    const res = await fetch(paper.pdfUrl);
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
