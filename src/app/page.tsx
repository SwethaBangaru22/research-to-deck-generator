"use client";

import { useEffect, useRef, useState } from "react";

interface StatusResponse {
  jobId: string;
  topic: string;
  status: string;
  progress: string | null;
  error: string | null;
  downloadUrl: string | null;
}

const TERMINAL_STATUSES = new Set(["done", "failed"]);

export default function Home() {
  const [topic, setTopic] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim()) return;

    setSubmitting(true);
    setStatus(null);

    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setStatus({
        jobId: "",
        topic,
        status: "failed",
        progress: null,
        error: data.error ?? "Failed to start job",
        downloadUrl: null,
      });
      setSubmitting(false);
      return;
    }

    const { jobId } = await res.json();

    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const statusRes = await fetch(`/api/status/${jobId}`);
      if (!statusRes.ok) return;
      const data: StatusResponse = await statusRes.json();
      setStatus(data);
      if (TERMINAL_STATUSES.has(data.status) && pollRef.current) {
        clearInterval(pollRef.current);
        setSubmitting(false);
      }
    }, 3000);
  }

  return (
    <main>
      <h1>Research-to-Deck Generator</h1>
      <p className="subtitle">
        Enter a research topic. We&apos;ll pull 50+ papers, synthesize the findings, and hand you back a cited slide deck.
      </p>

      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="e.g. retrieval-augmented generation for enterprise search"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          disabled={submitting}
        />
        <button type="submit" disabled={submitting || !topic.trim()}>
          {submitting ? "Working…" : "Generate"}
        </button>
      </form>

      {status && (
        <div className="status-card">
          <span className="status-badge">{status.status}</span>
          {status.progress && <p>{status.progress}</p>}
          {status.error && <p className="error-text">{status.error}</p>}
          {status.downloadUrl && (
            <a className="download-link" href={status.downloadUrl}>
              Download deck (.pptx)
            </a>
          )}
        </div>
      )}
    </main>
  );
}
