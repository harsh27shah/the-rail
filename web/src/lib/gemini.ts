import "server-only";
import { GoogleGenAI, Modality } from "@google/genai";

/**
 * Garment extraction — takes a photo (which may show a person wearing the item, a messy
 * background, etc.) and asks Gemini's image model to produce a clean, isolated product
 * shot of just the garment, similar to a minimalist retailer's catalogue photo. This is a
 * different kind of AI capability than tagging (src/lib/anthropic.ts) — image generation,
 * not just vision/text — hence the separate provider. See PROJECT.md §5.
 */

const MODEL = "gemini-3.1-flash-image"; // cheaper "flash" tier; gemini-3-pro-image is the
// higher-quality (higher-cost) option if extractions aren't clean enough in practice.

function client(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set — see .env.local.example");
  return new GoogleGenAI({ apiKey });
}

export interface ExtractedImage {
  data: string; // base64
  mimeType: string;
}

function firstImagePart(
  response: Awaited<ReturnType<GoogleGenAI["models"]["generateContent"]>>
): ExtractedImage | null {
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    if (part.inlineData?.data) {
      return { data: part.inlineData.data, mimeType: part.inlineData.mimeType ?? "image/png" };
    }
  }
  return null;
}

/**
 * `base64Image` is raw base64 (no data: prefix). `description` should be a short, specific
 * description of the garment to isolate (e.g. "cream suede overshirt jacket") — the more
 * specific, the better Gemini can tell it apart from anything else in the photo.
 * Returns null (rather than throwing) if the model didn't return an image, so callers can
 * fall back to keeping the original photo instead of failing the whole add flow.
 */
export async function extractGarmentImage(
  base64Image: string,
  mimeType: string,
  description: string
): Promise<ExtractedImage | null> {
  const ai = client();
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        text:
          `Remove any person, mannequin, hanger, or background clutter from this photo and ` +
          `produce a clean, isolated product photograph of just the ${description}. ` +
          `Style: flat lay or ghost-mannequin look on a plain, light neutral studio ` +
          `background, centred, well-lit, no shadows of a body — like a minimalist ` +
          `online clothing retailer's catalogue photo. Keep the garment's true colour, ` +
          `pattern, and shape faithful to the original photo.`,
      },
      { inlineData: { data: base64Image, mimeType } },
    ],
    config: {
      responseModalities: [Modality.IMAGE],
    },
  });

  return firstImagePart(response);
}

/**
 * Regenerates a garment photo using feedback about what's wrong with the current attempt —
 * e.g. "too shiny, should be matte" or "wrong colour". Grounds the correction against the
 * true original photo (not just the possibly-already-wrong generated one), so repeated
 * corrections don't drift further from reality each time. Verified empirically (not just in
 * theory) that specific feedback measurably changes the result while vague feedback
 * ("something's off") mostly doesn't — see PROJECT.md §5.
 */
export async function correctGarmentImage(
  original: { base64: string; mimeType: string },
  current: { base64: string; mimeType: string },
  feedback: string,
  description: string
): Promise<ExtractedImage | null> {
  const ai = client();
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        text:
          `Image 1 is the original source photo of a garment (the ${description}; may ` +
          `include a person wearing it). Image 2 is a generated attempt at an isolated ` +
          `product photo of that garment, but the owner says something is wrong with it: ` +
          `"${feedback}". Look at image 1 again to check the true appearance, and produce ` +
          `a corrected isolated product photo (same style: flat lay / ghost-mannequin, ` +
          `plain neutral studio background, no person) that fixes the described problem ` +
          `while staying faithful to image 1.`,
      },
      { inlineData: { data: original.base64, mimeType: original.mimeType } },
      { inlineData: { data: current.base64, mimeType: current.mimeType } },
    ],
    config: {
      responseModalities: [Modality.IMAGE],
    },
  });

  return firstImagePart(response);
}

// Multi-person disambiguation (PROJECT.md §5) — when tagPhoto (lib/anthropic.ts) reports
// more than one person with visible clothing in a photo, this finds each one's approximate
// location so the owner can tap "which one is me" instead of the photo being silently
// mixed across people (confirmed as a real bug: a synthetic two-person test photo had both
// people's garments catalogued together with no indication which belonged to whom) or just
// rejected outright. This is spatial detection only — "where is each body in this one
// photo, right now" — never identity: no face recognition, nothing persisted about what
// any person looks like across photos. Validated empirically against a real test photo
// before this was written: Gemini's normalized-0-1000 box convention lined up with the
// actual pixel positions within a few percent. Claude was tried too and was directionally
// sensible but didn't reliably follow the requested 0-1000 scale — Gemini is the
// purpose-built tool here, matching the existing Claude-tags/Gemini-images split.
const PEOPLE_DETECT_PROMPT =
  `Detect every distinct person in this photo who has clothing visible on them. For each ` +
  `one, output a JSON object with "box_2d": [ymin,xmin,ymax,xmax] normalized to 0-1000 ` +
  `(top-left origin) tightly bounding that person's visible body, and "label": a short ` +
  `phrase naming their most distinctive visible clothing (e.g. "red jacket") so a person ` +
  `can recognise them from the label alone. Return ONLY a JSON array, no prose, no markdown ` +
  `fences.`;

export interface PersonBox {
  /** [ymin, xmin, ymax, xmax], each normalized 0-1000, top-left origin. */
  box: [number, number, number, number];
  label: string;
}

function parsePersonBoxes(text: string): PersonBox[] {
  const clean = text.replace(/```json|```/g, "");
  const re = /\{\s*"box_2d"\s*:\s*\[\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\]\s*,\s*"label"\s*:\s*"([^"]*)"\s*\}/g;
  const seen = new Set<string>();
  const results: PersonBox[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(clean))) {
    const box: [number, number, number, number] = [
      Number(match[1]),
      Number(match[2]),
      Number(match[3]),
      Number(match[4]),
    ];
    // The model occasionally emits a draft attempt followed by a corrected one for the same
    // person (seen in testing) — dedupe near-identical boxes rather than showing doubles.
    const key = box.map((n) => Math.round(n / 10) * 10).join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ box, label: match[5] });
  }
  return results;
}

/** Finds every distinct person with visible clothing in a photo, with an approximate
 * bounding box for each — used only to let the owner pick which one is them
 * (src/app/add/actions.ts), never to identify who anyone is. */
export async function detectPeople(base64Image: string, mimeType: string): Promise<PersonBox[]> {
  const ai = client();
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ text: PEOPLE_DETECT_PROMPT }, { inlineData: { data: base64Image, mimeType } }],
  });
  const text = (response.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text)
    .filter((t): t is string => !!t)
    .join("");
  return parsePersonBoxes(text);
}
