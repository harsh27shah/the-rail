import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import sharp, { type OverlayOptions } from "sharp";
import type { Candidate, ModelFn, Plan, RawOutfit, Slot } from "./outfits";

/**
 * AI stylist for pairings (experimental — PROJECT.md §5 item 27, scripts/eval-stylist.ts):
 * looks at a top and a pair of bottoms together and scores how well they work as an outfit.
 *
 * Why this exists: the rule-based scorer (lib/pairings.ts) agreed with the owner's own
 * ratings barely better than a coin flip (58%) — it scores nearly everything the same, and
 * the colour rules added on top made no difference. "Do these two go together?" is a visual,
 * judgement-style question, which is what a vision model is for.
 *
 * Deliberately generic: the prompt says nothing about the owner's taste, so whatever agreement
 * it shows with the owner's ratings is not something it was told to say, and it would work the
 * same way for any user's wardrobe.
 */

export interface StylistPiece {
  name: string;
  color: string;
  material: string;
  pattern: string;
  formality: number;
  photo: { base64: string; mediaType: "image/jpeg" | "image/png" | "image/webp" };
}

export interface StylistVerdict {
  /** 1–10, higher = better outfit. */
  score: number;
  why: string;
  usage: { input: number; output: number };
}

const PROMPT =
  `You are a personal stylist for a time-poor professional man who dresses smart-casual and ` +
  `wants outfits he would actually wear to work, on dates and out with friends.\n\n` +
  `Image 1 is a TOP. Image 2 is a pair of BOTTOMS (trousers, jeans or similar). Both are ` +
  `product-style photos; ignore the backgrounds.\n\n` +
  `Judge ONLY how well these two pieces work together as an outfit: colour, tone and ` +
  `contrast, texture and fabric, proportion and fit, how well the formality matches, and the ` +
  `overall look. Do not judge whether each piece is nice on its own. Assume sensible shoes and ` +
  `nothing else.\n\n` +
  `Score from 1 to 10:\n` +
  `9-10: a clearly good, wearable combination you would recommend.\n` +
  `7-8: works well.\n` +
  `5-6: fine but unremarkable, or slightly off.\n` +
  `3-4: something clashes or feels wrong.\n` +
  `1-2: you would advise against it.\n` +
  `Be discriminating and use the whole range; most random pairings are not 8s.\n\n` +
  `Write the reason in British English (e.g. "grey", "colour").\n` +
  `Return ONLY a JSON object, no prose and no markdown fences, shaped exactly like:\n` +
  `{"score": <integer 1-10>, "why": "<one short sentence>"}`;

function client(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set — see .env.local.example");
  return new Anthropic({ apiKey });
}

const describe = (label: string, p: StylistPiece) =>
  `${label}: ${p.name} (${p.color}; ${p.material || "fabric unknown"}; ${p.pattern}; formality ${p.formality || 3}/5)`;

export function parseVerdict(text: string): { score: number; why: string } {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON in the stylist's reply");
  const json = JSON.parse(text.slice(start, end + 1)) as { score?: unknown; why?: unknown };
  const score = Number(json.score);
  if (!Number.isFinite(score) || score < 1 || score > 10) throw new Error(`bad score: ${String(json.score)}`);
  return { score, why: typeof json.why === "string" ? json.why : "" };
}

export async function rateTopAndBottom(top: StylistPiece, bottom: StylistPiece): Promise<StylistVerdict> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const message = await client().messages.create({
        model: "claude-sonnet-5",
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: top.photo.mediaType, data: top.photo.base64 } },
              { type: "image", source: { type: "base64", media_type: bottom.photo.mediaType, data: bottom.photo.base64 } },
              { type: "text", text: `${describe("Top", top)}\n${describe("Bottoms", bottom)}\n\n${PROMPT}` },
            ],
          },
        ],
      });
      const text = message.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      return {
        ...parseVerdict(text),
        usage: { input: message.usage.input_tokens, output: message.usage.output_tokens },
      };
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

// ── Whole outfits around one item (recommended outfits, M1) ──────────────────────────────
// See lib/outfits.ts for the rules and checks; this is only the part that talks to the model.
// The model is given the item ("hero"), numbered contact sheets of everything it could be worn
// with (one set per category), and a text list with the same numbers. It answers with labels,
// never names, so a mix-up between two similar-sounding pieces can't happen, and everything it
// says is checked by lib/outfits.ts before it is used.

const SLOT_TITLE: Record<Slot, string> = { top: "TOPS", bottom: "BOTTOMS", footwear: "SHOES", outerwear: "OUTERWEAR" };
const SLOT_WORD: Record<Slot, string> = { top: "a top", bottom: "a bottom", footwear: "shoes", outerwear: "an outerwear piece" };

const TILE_W = 180, TILE_H = 240, SHEET_COLS = 6, SHEET_MAX = 30;
const SHEET_BG = { r: 247, g: 246, b: 242 };

async function fetchPhoto(url: string, w: number, h: number): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`couldn't load a photo (${res.status})`);
  return sharp(Buffer.from(await res.arrayBuffer())).resize(w, h, { fit: "contain", background: SHEET_BG }).jpeg({ quality: 80 }).toBuffer();
}

async function contactSheet(tiles: { label: string; photo: Buffer }[]): Promise<Buffer> {
  const rows = Math.ceil(tiles.length / SHEET_COLS);
  const layers: OverlayOptions[] = [];
  tiles.forEach((t, i) => {
    const x = (i % SHEET_COLS) * TILE_W, y = Math.floor(i / SHEET_COLS) * TILE_H;
    layers.push({ input: t.photo, left: x, top: y });
    layers.push({
      input: Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_W}" height="44" font-family="Helvetica, Arial, sans-serif">` +
          `<rect x="4" y="4" width="${14 + t.label.length * 17}" height="32" fill="white" stroke="#1a1a18"/>` +
          `<text x="11" y="29" font-size="26" font-weight="bold" fill="#1a1a18">${t.label}</text></svg>`
      ),
      left: x, top: y,
    });
  });
  return sharp({ create: { width: TILE_W * Math.min(SHEET_COLS, tiles.length), height: TILE_H * rows, channels: 3, background: SHEET_BG } })
    .composite(layers).jpeg({ quality: 80 }).toBuffer();
}

const line = (c: Candidate) =>
  `${c.label}: ${c.item.name} (${c.item.color}; ${c.item.material || "fabric unknown"}; ${c.item.pattern}; formality ${c.item.formality || 3}/5)`;

export function outfitPrompt(plan: Plan, feedback: string[]): string {
  const need = plan.required.map((s) => SLOT_WORD[s]);
  const parts: string[] = [
    `You are a personal stylist for a time-poor professional man who dresses smart-casual and wants outfits he would actually wear to work, on dates and out with friends.`,
    `Build outfits around ONE piece, the HERO (the first image: a ${plan.hero.category.toLowerCase().replace(/s$/, "")}, "${plan.hero.name}"). Every outfit includes the hero; do not list it in your answer.`,
    `The rest of his wardrobe is shown as numbered contact sheets, one set per category, and listed in text with the same labels. Use only those labels.`,
    `Each outfit adds exactly one piece from each of these categories: ${need.join(", ")}.` +
      (plan.outerwearOptional
        ? ` It may also add one outerwear piece. Across your outfits, at least 1 and at most 3 of the ${plan.count} should include outerwear, and the rest should not.`
        : ""),
    `Judge each outfit as a whole: colour, tone and contrast, texture and fabric, proportion and fit, how well the formality matches, and the overall look. Choose the best pieces for the hero, not just the first that fit.`,
    `Give up to ${plan.count} outfits, best first. Make them genuinely different: any two outfits should differ in at least two of the pieces you add. A piece may appear in more than one outfit if it truly is the best choice, but do not produce near-copies.`,
    `For each outfit write one short sentence on why it works, in plain British English (e.g. "grey", "colour"), in sentence case, without dashes or hyphens used as punctuation.`,
    `Return ONLY a JSON object, no prose and no markdown fences, shaped exactly like:\n{"outfits":[{"items":["B3","F2"],"why":"..."}]}`,
  ];
  if (feedback.length) parts.push(`Your previous answer had these problems. Fix all of them:\n- ${feedback.join("\n- ")}`);
  return parts.join("\n\n");
}

export function parseOutfits(text: string): RawOutfit[] {
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON in the stylist's reply");
  const json = JSON.parse(text.slice(start, end + 1)) as { outfits?: unknown };
  if (!Array.isArray(json.outfits)) throw new Error("the stylist's reply had no outfits");
  return json.outfits as RawOutfit[];
}

/** The real stylist, for lib/outfits.ts's generateOutfits. */
export function claudeOutfitModel(): ModelFn {
  return async (plan, feedback) => {
    const content: Anthropic.ContentBlockParam[] = [];
    const heroPhoto = await fetchPhoto(plan.hero.imageUrl!, 640, 640);
    content.push({ type: "text", text: "HERO:" });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: heroPhoto.toString("base64") } });

    const slots = (["top", "bottom", "footwear", "outerwear"] as Slot[]).filter((s) => plan.candidates.some((c) => c.slot === s));
    const listing: string[] = [];
    for (const slot of slots) {
      const cands = plan.candidates.filter((c) => c.slot === slot);
      listing.push(`${SLOT_TITLE[slot]}\n${cands.map(line).join("\n")}`);
      for (let i = 0; i < cands.length; i += SHEET_MAX) {
        const chunk = cands.slice(i, i + SHEET_MAX);
        const tiles = await Promise.all(chunk.map(async (c) => ({ label: c.label, photo: await fetchPhoto(c.item.imageUrl!, TILE_W, TILE_H) })));
        content.push({ type: "text", text: `${SLOT_TITLE[slot]} (${chunk[0].label} to ${chunk[chunk.length - 1].label}):` });
        content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: (await contactSheet(tiles)).toString("base64") } });
      }
    }
    content.push({ type: "text", text: `HERO: ${plan.hero.name} (${plan.hero.color}; ${plan.hero.material || "fabric unknown"}; ${plan.hero.pattern}; formality ${plan.hero.formality || 3}/5)\n\n${listing.join("\n\n")}\n\n${outfitPrompt(plan, feedback)}` });

    const message = await client().messages.create({ model: "claude-sonnet-5", max_tokens: 1500, messages: [{ role: "user", content }] });
    const text = message.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
    return { outfits: parseOutfits(text), usage: { input: message.usage.input_tokens, output: message.usage.output_tokens } };
  };
}
