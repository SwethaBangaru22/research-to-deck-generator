import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import type { Job } from "@/lib/types";

export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const token = req.nextUrl.searchParams.get("token");

  const { rows } = await getPool().query<Job>(`SELECT * FROM jobs WHERE id = $1`, [jobId]);
  const job = rows[0];

  if (!job || job.status !== "done" || !job.result_data || !job.download_token) {
    return NextResponse.json({ error: "Deck not ready" }, { status: 404 });
  }

  if (!token || token !== job.download_token) {
    return NextResponse.json({ error: "Invalid or missing download token" }, { status: 403 });
  }

  const filename = job.topic.replace(/[^a-z0-9]+/gi, "-").slice(0, 60) || "deck";

  return new NextResponse(new Uint8Array(job.result_data), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="${filename}.pptx"`,
      "Content-Length": String(job.result_data.length),
    },
  });
}
