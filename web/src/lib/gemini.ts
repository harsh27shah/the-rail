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
