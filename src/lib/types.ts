export type JobStatus =
  | "queued"
  | "ingesting"
  | "retrieving"
  | "synthesizing"
  | "assembling"
  | "done"
  | "failed";

export interface Job {
  id: string;
  topic: string;
  status: JobStatus;
  progress: string | null;
  error: string | null;
  result_data: Buffer | null;
  download_token: string | null;
  created_at: string;
  updated_at: string;
}

export interface OpenAlexPaper {
  id: string;
  title: string;
  abstract: string | null;
  year: number | null;
  venue: string | null;
  url: string | null;
  authors: { name: string }[];
  pdfUrl: string | null;
}

export interface RankedChunk {
  chunkId: string;
  paperId: string;
  paperTitle: string;
  authors: string[];
  year: number | null;
  url: string | null;
  content: string;
  score: number;
}

export interface SlideSpec {
  title: string;
  bullets: string[];
  speaker_notes: string;
  citation_indices: number[];
}

export interface DeckSynthesis {
  deck_title: string;
  slides: SlideSpec[];
  citations: { index: number; title: string; authors: string[]; year: number | null; url: string | null }[];
}
