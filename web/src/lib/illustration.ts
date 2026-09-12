import type { Category, Pattern } from "./types";

/**
 * Flat garment-silhouette illustration, as a data: URI SVG. Ported from the retired
 * prototype (PROJECT.md §4) — used as a fallback when an item has no real photo yet
 * (e.g. mock/demo data, or an ingestion that hasn't finished uploading an image).
 * Never used in place of a real photo once one exists.
 */
export function garmentIllustration(
  id: string,
  category: Category,
  palette: string[],
  pattern: Pattern
): string {
  const CARDBG = "#F7F6F2";
  const INK = "#1A1A18";
  const poly = (pts: number[][]) => pts.map((p) => p.join(",")).join(" ");
  const clipId = "clip-" + id;
  const c1 = palette[0] || "#CCCCCC";
  const c2 = palette[1] || palette[0] || "#CCCCCC";

  function deco(): string {
    if (pattern === "striped") {
      return `<g clip-path="url(#${clipId})">${Array.from({ length: 12 })
        .map((_, i) => `<rect x="0" y="${i * 48}" width="400" height="24" fill="${c2}"/>`)
        .join("")}</g>`;
    }
    if (pattern === "checked") {
      return (
        `<g clip-path="url(#${clipId})">` +
        Array.from({ length: 9 })
          .map((_, i) => `<rect x="${i * 48}" y="0" width="24" height="533" fill="${c2}" opacity="0.55"/>`)
          .join("") +
        Array.from({ length: 9 })
          .map((_, i) => `<rect x="0" y="${i * 60}" width="400" height="24" fill="${c2}" opacity="0.55"/>`)
          .join("") +
        `</g>`
      );
    }
    if (pattern === "textured") {
      return `<g clip-path="url(#${clipId})"><rect width="400" height="533" fill="${c2}" opacity="0.18"/></g>`;
    }
    return "";
  }

  function markup(): string {
    if (category === "Bottoms") {
      return `
        <rect x="145" y="150" width="110" height="30" fill="${c1}" stroke="${INK}" stroke-width="2"/>
        <polygon points="${poly([[150, 180], [197, 180], [190, 430], [155, 430]])}" fill="${c1}" stroke="${INK}" stroke-width="2"/>
        <polygon points="${poly([[203, 180], [250, 180], [245, 430], [210, 430]])}" fill="${c1}" stroke="${INK}" stroke-width="2"/>`;
    }
    if (category === "Footwear") {
      return `
        <rect x="80" y="372" width="235" height="20" rx="8" fill="#DEDBD1" stroke="${INK}" stroke-width="2"/>
        <polygon points="${poly([[90, 375], [95, 340], [120, 320], [160, 305], [210, 298], [260, 300], [285, 315], [300, 340], [305, 375]])}" fill="${c1}" stroke="${INK}" stroke-width="2"/>`;
    }
    if (category === "Outerwear") {
      const outer = [[270, 165], [235, 145], [165, 145], [130, 165], [75, 195], [95, 285], [135, 240], [140, 460], [260, 460], [265, 240], [305, 285], [325, 195]];
      const cutout = [[200, 150], [170, 260], [230, 260]];
      const d = "M" + outer.map((p) => p.join(",")).join(" L") + " Z M" + cutout.map((p) => p.join(",")).join(" L") + " Z";
      return `
        <clipPath id="${clipId}"><path d="${d}" fill-rule="evenodd"/></clipPath>
        <path d="${d}" fill-rule="evenodd" fill="${c1}" stroke="${INK}" stroke-width="2"/>
        ${deco()}`;
    }
    const pts = [[260, 155], [225, 140], [200, 172], [175, 140], [140, 155], [85, 180], [105, 265], [145, 225], [150, 430], [250, 430], [255, 225], [295, 265], [315, 180]];
    return `
      <clipPath id="${clipId}"><polygon points="${poly(pts)}"/></clipPath>
      <polygon points="${poly(pts)}" fill="${c1}" stroke="${INK}" stroke-width="2"/>
      ${deco()}`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="533" viewBox="0 0 400 533">
    <rect width="400" height="533" fill="${CARDBG}"/>
    ${markup()}
  </svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}
