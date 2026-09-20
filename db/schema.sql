CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS papers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  openalex_id TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  authors TEXT[] NOT NULL DEFAULT '{}',
  year INT,
  venue TEXT,
  url TEXT,
  abstract TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS paper_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1024),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (paper_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS paper_chunks_embedding_idx
  ON paper_chunks USING hnsw (embedding vector_cosine_ops);

-- Links a research topic to the papers ingested for it (papers are reused across topics)
CREATE TABLE IF NOT EXISTS topic_papers (
  topic TEXT NOT NULL,
  paper_id UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  PRIMARY KEY (topic, paper_id)
);

CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'ingesting', 'retrieving', 'synthesizing', 'assembling', 'done', 'failed')),
  progress TEXT,
  error TEXT,
  result_data BYTEA,
  download_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
