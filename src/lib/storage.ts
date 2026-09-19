import { randomBytes } from "node:crypto";
import path from "node:path";

/**
 * The worker writes the .pptx to a local temp path (python-pptx needs a real
 * file path to save to) then reads it back into Postgres as bytea and deletes
 * the temp file. Final storage is the `jobs.result_data` column, not disk —
 * that's what lets /api/download work regardless of which host generated the
 * deck (the API and the worker are expected to run on separate hosts; see
 * README). Swap this for object storage (S3/R2) only if deck sizes or volume
 * make bytea impractical — that would be a new external dependency.
 */
export function tempDir(): string {
  return process.env.DECK_OUTPUT_DIR ?? "./generated";
}

export function tempDeckFilePath(jobId: string): string {
  return path.join(tempDir(), `${jobId}.pptx`);
}

export function generateDownloadToken(): string {
  return randomBytes(24).toString("hex");
}
