# Research-to-Deck Generator

Turns a research topic into a cited, branded slide deck: RAG over 50+ papers pulled from Semantic Scholar, synthesized by Claude, assembled into a `.pptx` with python-pptx, triggered through a Next.js API and downloaded via a signed link.

## Architecture

```
topic
  │
  ▼
POST /api/generate ──► jobs row (queued) ──► BullMQ queue
                                                  │
                                                  ▼
                                        worker (src/worker/worker.ts)
                                                  │
        ┌─────────────┬─────────────┬────────────┼────────────┐
        ▼             ▼             ▼            ▼            ▼
   Ingestion        RAG        Synthesis     PPTX assembly   done
 (Semantic       (multi-query  (Claude:      (python-pptx    (download
  Scholar →      retrieval +    slides,       via subprocess) token issued)
  chunk →        Voyage         bullets,
  embed →        rerank)        citations)
  pgvector)
```

GET `/api/status/:jobId` polls job state. When `status: "done"`, it returns a `downloadUrl` pointing at `GET /api/download/:jobId?token=...`.

## Two decisions this build made that weren't in the original spec

The architecture brief named Next.js, Postgres/pgvector, BullMQ/Redis, Semantic Scholar, Claude, and python-pptx — but didn't name an embeddings/re-ranking provider, and "deploy to Vercel" doesn't by itself say where the background worker runs. Both were necessary to actually build the pipeline, so here's what was chosen and why — flag either one if you want a different call:

1. **Embeddings + re-ranking: Voyage AI** (`voyage-3` for embeddings, `rerank-2` for re-ranking). It pairs naturally with Claude, covers both jobs from one provider, and needs one more API key (`VOYAGE_API_KEY`). Swap it in [src/lib/embeddings.ts](src/lib/embeddings.ts) if you'd rather use something else.
2. **Worker hosting: a separate long-lived process, not a Vercel serverless function.** Vercel functions are stateless and time-limited — they can't run a persistent BullMQ worker or reliably shell out to a Python subprocess. So the split is: **Next.js app (API routes + UI) deploys to Vercel**; **the worker (`npm run worker`) needs a persistent host** — Railway, Render, Fly.io, or a small VM — with Python 3 and `requirements.txt` installed. Both processes point at the same `DATABASE_URL` and `REDIS_URL`.

## Local setup

1. **Install dependencies**
   ```
   npm install
   python -m pip install -r requirements.txt
   ```

2. **Start Postgres (with pgvector) and Redis**
   ```
   docker compose up -d
   ```
   (No Docker? Point `DATABASE_URL`/`REDIS_URL` in `.env` at any Postgres 16+ with the `vector` and `pgcrypto` extensions available, and any Redis 6+.)

3. **Configure environment**
   ```
   cp .env.example .env
   ```
   Fill in `ANTHROPIC_API_KEY` and `VOYAGE_API_KEY` at minimum. `SEMANTIC_SCHOLAR_API_KEY` is optional but raises rate limits.

4. **Run the migration**
   ```
   npm run db:migrate
   ```

5. **Run the app and the worker (two terminals)**
   ```
   npm run dev      # Next.js on http://localhost:3000
   npm run worker   # BullMQ worker — must be running for jobs to process
   ```

6. **Try it**
   Open http://localhost:3000, enter a topic, and watch the status card. Or drive it via curl:
   ```
   curl -X POST http://localhost:3000/api/generate -H "Content-Type: application/json" -d '{"topic":"retrieval-augmented generation for enterprise search"}'
   curl http://localhost:3000/api/status/<jobId>
   ```

## What's been verified so far

Without live credentials/services (Postgres, Redis, an Anthropic key, a Voyage key) in this environment, the parts that need them couldn't be run end-to-end here. What was verified directly:

- `npm install` succeeds; `npm run typecheck` and `npm run build` both pass cleanly.
- `chunkText` (src/lib/ingestion.ts) unit-verified: correct overlap, handles empty and short inputs.
- `scripts/generate_deck.py` smoke-tested with a synthetic synthesis payload — produced a valid 4-slide `.pptx` (title, 2 content slides with speaker notes and citation markers, references slide), reopened and inspected programmatically to confirm structure.

Still to verify once you provide credentials and run `docker compose up`:
- [ ] `npm run db:migrate` applies the schema cleanly
- [ ] Ingestion actually pulls papers from Semantic Scholar and populates `paper_chunks`
- [ ] Retrieval returns sensible re-ranked chunks for a real topic
- [ ] Claude synthesis output parses and cites correctly against real retrieved content
- [ ] Full `POST /api/generate` → worker → `GET /api/download` loop with a real topic
- [ ] Vercel deploy of the Next.js app + worker deploy on its own host

## Deploying

- **Next.js app → Vercel**: standard `vercel deploy`, set `DATABASE_URL`, `REDIS_URL`, `ANTHROPIC_API_KEY` as Vercel env vars. (The app itself never runs python-pptx or long jobs — it only enqueues and reads job status/results.)
- **Worker → Railway/Render/Fly/VM**: needs Node + Python 3 + `pip install -r requirements.txt`, same `DATABASE_URL`/`REDIS_URL`, plus `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, and a writable `DECK_OUTPUT_DIR` for the brief local temp file python-pptx saves to before it's read into Postgres.
- Generated decks are stored as `bytea` in `jobs.result_data` (see [src/lib/storage.ts](src/lib/storage.ts)), not on disk — so `/api/download` works from Vercel even though the worker that generated the file runs on a different host entirely. If deck volume/size ever makes bytea impractical, move to object storage (S3/R2) — that would add a new external dependency, so it's a deliberate future call, not the default.
