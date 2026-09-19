---
name: research-to-deck-generator
description: Build brief for Portfolio P3 — Research-to-Deck Generator. Activates when the user asks to build, resume, or extend the RAG-to-PPTX pipeline described in Deliverable.md (Semantic Scholar ingestion, pgvector RAG, Claude synthesis, python-pptx deck assembly, Next.js API, Vercel deploy). Does not activate for unrelated tasks.
---

## Objective
Build the Research-to-Deck Generator: given a research topic, run RAG over 50+ relevant papers, synthesize the findings with Claude, and auto-generate a branded, cited PPTX deck — triggered via a Next.js API route and reachable at a live Vercel URL. This is the pipeline behind deep-research.intelliforge.tech.

## Context
Target stack:
- Next.js (App Router, latest stable) for the API layer
- Postgres with the pgvector extension for embeddings storage
- BullMQ + Redis for background job processing (ingestion and deck generation are long-running)
- Semantic Scholar API for paper discovery and PDF retrieval
- Claude API (current model, e.g. claude-sonnet-5 — do not hardcode a deprecated slug) for synthesis
- python-pptx for deck assembly, invoked from the Node worker via a Python subprocess (child_process) — do not stand up a separate microservice for this

## Target State
Five working stages, wired end-to-end:
1. **Ingestion**: Semantic Scholar API search for a topic → fetch PDFs → chunk → embed → store in pgvector
2. **RAG**: multi-query retrieval with re-ranking to surface the highest-signal chunks for a given topic
3. **Synthesis**: Claude call that turns retrieved chunks into slide titles, bullets, and citation mappings back to source papers
4. **PPTX assembly**: a Python script (invoked via subprocess) uses python-pptx to build a branded deck — template styling, speaker notes, inline citations — from the synthesis output
5. **API**: `POST /api/generate` `{ topic }` → enqueues a BullMQ job → returns a job id; `GET /api/status/:jobId` returns job state and a signed download link once the PPTX is ready

Deployed to Vercel and reachable at a live URL: topic in, downloadable cited PPTX out.

## Scope
- Work only within this project directory; create the Next.js app, ingestion scripts, RAG module, synthesis module, PPTX generation script, worker/queue setup, and deployment config from scratch.
- Do NOT touch: `.claude/`, `.kilo/`.

## Constraints
- All secrets (Claude API key, Semantic Scholar API key if used, `DATABASE_URL`, `REDIS_URL`) must be read from environment variables only — never hardcoded or committed.
- Respect Semantic Scholar's published rate limits in the ingestion client.
- Only add dependencies genuinely required for the five stages above; ask before introducing any external service not already listed here.
- Only build what's requested — no auth, billing, multi-tenancy, or UI beyond what's needed to trigger a generation job and fetch its download link.

## Acceptance Criteria
- [ ] `POST /api/generate` with a topic returns a job id
- [ ] Ingestion fetches papers for that topic and stores embeddings in pgvector
- [ ] RAG retrieval returns re-ranked, high-signal chunks for a synthesis query
- [ ] Synthesis output includes slide titles, bullets, and citation mappings traceable to source papers
- [ ] Generated PPTX opens correctly, includes speaker notes and citations, and matches a defined brand template
- [ ] `GET /api/status/:jobId` returns a working download link once the job completes
- [ ] Deployed and reachable on Vercel at a live URL, full topic-to-download flow working

## Action Boundaries
- Proceed with reversible, in-scope inspection, edits, and validation without asking.
- Stop and ask before: deleting any file, adding a new external dependency or service not listed above, changing the database schema, or deploying to production.

## Progress Evidence
After each stage (ingestion, RAG, synthesis, PPTX, API) output ✅ [stage] complete with the files created/changed and how it was verified (e.g., command run, sample query result, opened test PPTX). Do not report a stage done without grounding it in an actual tool result.

## Session Strategy
New session — this is a greenfield build. If a prior session already progressed through some stages, treat this brief as the target state and resume from wherever the codebase actually is (verify current state with tools rather than assuming).

## Setup Prerequisites
Before starting, confirm these exist or provision them: Postgres with pgvector enabled, a Redis instance, and an `ANTHROPIC_API_KEY`. Set them as `DATABASE_URL`, `REDIS_URL`, and `ANTHROPIC_API_KEY` env vars — never inline them in code.

---
This brief targets an agentic tool with real system access (e.g. Claude Code). Review the scope locks, forbidden actions, and stop conditions above before executing. Confirm file paths, directories, and permissions match the actual project.
