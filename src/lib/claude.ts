import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getClaude(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

// Update if your account's available model slug differs — see the current
// Claude model routing guidance if this needs to change.
export const CLAUDE_MODEL = "claude-sonnet-5";

export function extractText(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}
