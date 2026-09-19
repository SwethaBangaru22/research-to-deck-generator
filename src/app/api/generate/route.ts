import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { getDeckQueue } from "@/lib/queue";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
  }

  const topic = (body as { topic?: unknown })?.topic;
  if (typeof topic !== "string" || topic.trim().length === 0) {
    return NextResponse.json({ error: "`topic` is required and must be a non-empty string" }, { status: 400 });
  }

  const trimmedTopic = topic.trim().slice(0, 300);

  const { rows } = await getPool().query<{ id: string }>(
    `INSERT INTO jobs (topic, status) VALUES ($1, 'queued') RETURNING id`,
    [trimmedTopic]
  );
  const jobId = rows[0].id;

  await getDeckQueue().add(
    "generate-deck",
    { jobId, topic: trimmedTopic },
    { jobId, removeOnComplete: true, removeOnFail: false }
  );

  return NextResponse.json({ jobId }, { status: 202 });
}
