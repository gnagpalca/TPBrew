import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const MODELS = {
  // High-volume, low-reasoning extraction/classification (PRD §4).
  haiku: "claude-haiku-4-5",
  // Judgment calls and client-facing drafting (PRD §4).
  sonnet: "claude-sonnet-5",
} as const;
