import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { CATEGORIES } from "./types";

/**
 * Server-only AI tagging. Ported from the retired prototype's `callClaude`/`readPhoto`
 * (PROJECT.md §4), but now the API key lives on the server (env var) instead of being
 * pasted into the browser by whoever's using the app.
 */

const SCHEMA = `Return ONLY a JSON object, no prose and no markdown fences:
{"name":"short descriptive name, max 5 words",
 "category":"one of: ${CATEGORIES.join(", ")}",
 "color":"primary colour in plain words",
 "palette":["#hex","#hex"],
 "pattern":"solid|striped|checked|printed|textured",
 "material":"best guess",
 "formality":1-5 where 1 is lounge and 5 is formal,
 "seasons":["spring","summer","autumn","winter"],
 "notes":"one short line on styling character"}`;

export interface TaggedFields {
  name: string;
  category: string;
  color: string;
  palette: string[];
  pattern: string;
  material: string;
  formality: number;
  seasons: string[];
  notes: string;
}

function client(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set — see .env.local.example");
  return new Anthropic({ apiKey });
}

function parseJsonReply(text: string): TaggedFields {
  const clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("The model didn't return JSON");
  return JSON.parse(clean.slice(start, end + 1));
}

/** Tags a garment photo. `base64` is the raw base64 image data (no data: prefix). */
export async function tagPhoto(base64: string, mediaType: string): Promise<TaggedFields> {
  const message = await client().messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1000,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
              data: base64,
            },
          },
          { type: "text", text: "Catalogue this garment for a personal wardrobe.\n" + SCHEMA },
        ],
      },
    ],
  });
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  return parseJsonReply(text);
}
