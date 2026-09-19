import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import type { Job } from "@/lib/types";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;

  const { rows } = await getPool().query<Job>(`SELECT * FROM jobs WHERE id = $1`, [jobId]);
  const job = rows[0];
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({
    jobId: job.id,
    topic: job.topic,
    status: job.status,
    progress: job.progress,
    error: job.error,
    downloadUrl:
      job.status === "done" && job.download_token
        ? `/api/download/${job.id}?token=${job.download_token}`
        : null,
  });
}
