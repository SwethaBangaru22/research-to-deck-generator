import "dotenv/config";
import { execFile } from "node:child_process";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { Worker } from "bullmq";
import { getPool } from "../lib/db";
import { ingestTopic } from "../lib/ingestion";
import { QUEUE_NAME, getRedisConnection, type DeckJobPayload } from "../lib/queue";
import { retrieveForTopic } from "../lib/rag";
import { generateDownloadToken, tempDeckFilePath, tempDir } from "../lib/storage";
import { synthesizeDeck } from "../lib/synthesis";
import type { JobStatus } from "../lib/types";

const execFileAsync = promisify(execFile);

async function setStatus(jobId: string, status: JobStatus, progress?: string) {
  await getPool().query(
    `UPDATE jobs SET status = $2, progress = COALESCE($3, progress), updated_at = now() WHERE id = $1`,
    [jobId, status, progress ?? null]
  );
}

async function setFailed(jobId: string, error: string) {
  await getPool().query(
    `UPDATE jobs SET status = 'failed', error = $2, updated_at = now() WHERE id = $1`,
    [jobId, error]
  );
}

async function processJob(payload: DeckJobPayload) {
  const { jobId, topic } = payload;

  await setStatus(jobId, "ingesting", "Searching and ingesting papers from OpenAlex");
  await ingestTopic(topic, 50, (message) => setStatus(jobId, "ingesting", message));

  await setStatus(jobId, "retrieving", "Running multi-query retrieval with re-ranking");
  const rankedChunks = await retrieveForTopic(topic);
  if (rankedChunks.length === 0) {
    throw new Error(`No relevant chunks retrieved for topic "${topic}" — check ingestion results`);
  }

  await setStatus(jobId, "synthesizing", "Synthesizing slide content with Claude");
  const synthesis = await synthesizeDeck(topic, rankedChunks);

  await setStatus(jobId, "assembling", "Assembling branded PPTX with python-pptx");
  await mkdir(tempDir(), { recursive: true });

  const specPath = path.join(tempDir(), `${jobId}.input.json`);
  const tempOutputPath = tempDeckFilePath(jobId);
  await writeFile(specPath, JSON.stringify({ ...synthesis, topic }, null, 2), "utf-8");

  const pythonBin = process.env.PYTHON_BIN ?? "python";
  const scriptPath = path.join(process.cwd(), "scripts", "generate_deck.py");
  await execFileAsync(pythonBin, [scriptPath, specPath, tempOutputPath]);

  const deckBytes = await readFile(tempOutputPath);
  await unlink(specPath).catch(() => {});
  await unlink(tempOutputPath).catch(() => {});

  const downloadToken = generateDownloadToken();
  await getPool().query(
    `UPDATE jobs
     SET status = 'done', result_data = $2, download_token = $3, progress = 'Deck ready', updated_at = now()
     WHERE id = $1`,
    [jobId, deckBytes, downloadToken]
  );
}

const worker = new Worker<DeckJobPayload>(
  QUEUE_NAME,
  async (job) => {
    try {
      await processJob(job.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await setFailed(job.data.jobId, message);
      throw err;
    }
  },
  { connection: getRedisConnection(), concurrency: 2 }
);

worker.on("completed", (job) => {
  console.log(`✅ job ${job.data.jobId} (${job.data.topic}) completed`);
});

worker.on("failed", (job, err) => {
  console.error(`❌ job ${job?.data.jobId} (${job?.data.topic}) failed:`, err.message);
});

console.log(`Worker listening on queue "${QUEUE_NAME}"...`);
