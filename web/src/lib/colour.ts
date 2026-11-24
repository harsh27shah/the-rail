/**
 * Colour logic for pairing suggestions — how well two garments' main colours go together.
 *
 * Deliberately small and explainable. The rules are the standard stylist ones (and the
 * "Outfit Matching Research" doc's findings), set BEFORE looking at how they score against
 * the owner's real outfits — scripts/eval-pairings.ts is the check, not the thing they were
 * tuned on:
 *   - Neutrals (black, white, grey, cream, navy, browns/tans/khaki/olive, denim blues) go
 *     with everything, so they never cause a clash.
 *   - Between neutrals the useful signal is light-against-dark: some contrast reads as
 *     deliberate, near-identical shades read flat, and stark black-on-white is fine but not
 *     the sweet spot (the research's "not too matched, not too different").
 *   - Two genuinely colourful pieces are scored on the colour wheel: close neighbours or
 *     opposites work, the middle distances clash.
 *
 * The research also warns plain colour-wheel rules are too crude on their own, which is why
 * they only apply when BOTH pieces are colourful and why colour is a modest part of the total.
 */

export interface Hsl {
  h: number; // 0–360
  s: number; // 0–1
  l: number; // 0–1
}

export interface ColourProfile {
  hsl: Hsl;
  neutral: boolean;
}

export function hexToHsl(hex: string): Hsl | null {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let hue: number;
  if (max === r) hue = ((g - b) / d) % 6;
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  hue = (hue * 60 + 360) % 360;
  return { h: hue, s, l };
}

export function isNeutral({ h, s, l }: Hsl): boolean {
  if (s < 0.2) return true; // black, white, greys, very muted
  if (l < 0.22 || l > 0.9) return true; // near-black (incl. dark navy), near-white
  if (h >= 15 && h <= 100 && s < 0.5) return true; // earth tones: brown, tan, cream, khaki, olive
  if (h >= 195 && h <= 235 && s < 0.6) return true; // denim and navy-leaning blues
  return false;
}

/** The garment's main colour (first palette entry is the dominant one), or null if it has
 * no usable colour — in which case colour simply doesn't influence its pairings. */
export function colourProfile(palette: string[] | undefined): ColourProfile | null {
  for (const hex of palette ?? []) {
    const hsl = hexToHsl(hex);
    if (hsl) return { hsl, neutral: isNeutral(hsl) };
  }
  return null;
}

/** Light-against-dark contrast, 0–2. */
function lightnessContrast(a: Hsl, b: Hsl): number {
  const d = Math.abs(a.l - b.l);
  if (d < 0.1) return 0; // same shade — flat
  if (d < 0.25) return 1; // gentle contrast
  if (d <= 0.65) return 2; // the sweet spot
  return 1; // stark
}

/** Colour-wheel fit for two colourful pieces, −2…+1. */
function hueFit(a: Hsl, b: Hsl): number {
  const raw = Math.abs(a.h - b.h);
  const d = Math.min(raw, 360 - raw);
  if (d <= 30) return 1; // neighbours
  if (d >= 150) return 1; // opposites
  if (d >= 60 && d <= 120) return -2; // the clashing middle
  return 0;
}

/** How well two garments' colours go together: roughly −2 … +3. 0 when either has no colour. */
export function colourScore(a: ColourProfile | null, b: ColourProfile | null): number {
  if (!a || !b) return 0;
  let s = lightnessContrast(a.hsl, b.hsl);
  if (!a.neutral && !b.neutral) s += hueFit(a.hsl, b.hsl);
  return s;
}
