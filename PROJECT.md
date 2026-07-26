# The Rail — Project Brief

> **Read this first.** This file is the complete handoff context for an AI wardrobe app.
> It is written to be pasted into Cursor, Claude Code, ChatGPT, or any other agent with
> zero prior context. Companion file: `wardrobe.html` (the working P0 prototype).

---

## 1. Vision

A personal wardrobe you can browse like a shop you already own — and a stylist that helps
you get more out of it, both by combining what you have and by telling you what to buy next.

The core insight: **"I have nothing to wear" is almost never a supply problem — it's a
recall problem.** People forget what they own. So the product treats your own closet as a
storefront: browsable, desirable, well-photographed, well-tagged. But cataloging is the
foundation, not the goal. The actual vision is broader and has two equally important halves:

1. **Recall** — see everything you own, clearly enough that you actually use it.
2. **Guidance** — get inspiration for how to combine what you already have, and clear
   direction on what new pieces would expand the wardrobe most, based on what's actually
   in it.

Long-term the product should generalize beyond a single user — anyone can catalog their
wardrobe and develop a point of view about their own style. For now, the owner is building
this for their own personal use, and isn't concerned with how many other apps already do
something similar.

**Owner:** product-led, non-technical. Decisions should be explained in product terms, not
just implementation terms. Assume the owner can read code and direct the work but not
write it from scratch.

---

## 2. Feature priorities

### As originally specced by the owner

| Pri | Feature |
|-----|---------|
| P0 | Storefront-like view of all wardrobe items. Upload via photo **or** by pasting a retailer URL. |
| P1 | Under each item, suggestions for what pairs well with it — from the wardrobe, or from online for shopping inspiration. |
| P1 | Overall wardrobe analysis → recommend purchases that fill gaps (e.g. no winter coat, too few coloured pieces). |
| P2 | Photorealistic virtual try-on. User uploads a few photos of themselves; outfits get rendered onto them. |
| P2 | Shopping integration — direct links to retailers, with budget constraints as an input. |

### Recommended resequencing (and why)

This is a **revision** of the above, not a replacement. The reasoning matters more than the
order:

1. **P0 — Low-friction ingestion, then the storefront view.**
   The original spec's two upload paths (one photo per item, one URL per item) are both
   manual per-item work — 60–100 discrete actions before the app does anything useful.
   This is the single biggest reason wardrobe apps have terrible retention. Two cheaper
   paths should be added:
   - **Bulk extraction from existing photos of the user wearing outfits.** One folder of
     5–10 full-body photos, one pass, dozens of garments isolated and rebuilt as clean
     standalone images. (This technique was publicly demonstrated in mid-2026 by Thijs
     Simonian using an agentic model with camera-roll access; the safer version uses a
     small user-selected folder instead of the whole library.)
   - **Retailer order-confirmation email parsing.** Purchase history is already structured
     data: product name, image, price, and URL. Likely covers a large share of what
     someone owns at near-zero effort.

2. **P0.5 — Taste calibration.**
   Nothing in the original spec represents what the user actually *likes*. Without it,
   every recommendation regresses to the mean and everyone gets suggested a white tee and
   dark denim. Cheap fix: rate 20–30 looks during onboarding, or name 3–5 people whose
   style the user wants. High leverage on everything downstream.

3. **P1 — Wardrobe analysis, framed by occasion not category.**
   "Not enough coloured items, no winter jackets" is a checklist against a generic ideal
   wardrobe — which is what any LLM produces for free, and it's mediocre. The useful
   version is coverage against the user's *actual life*: how they work, where they eat,
   where they travel and in what climate. Occasion-driven gaps, not category-driven ones.

4. **P1 — "What do I wear today," plus wear logging.**
   **This is the biggest gap in the original spec.** Every specced feature is either
   build-your-closet or buy-more-clothes. Nothing gives a reason to open the app twice.
   Outfit-for-today is the only recurring use case, and wear data is the only thing here
   that compounds. With it, gap analysis stops being "you need a winter jacket" and becomes
   "you own four shirts you never touch — here's the one piece that would activate them."

5. **P2 — Pairing suggestions + retailer search links.**
   Note: the "shopping inspiration" half of the original P1 depends on the same product-data
   infrastructure as the original P2 shopping integration. Don't build a product catalog.
   Deep-link to a retailer *search query* instead — enormously less effort, small loss in
   user value at this stage.

6. **P2 — Virtual try-on.**
   Correctly deprioritized for build order, but it should be understood as the **shareable
   artifact and growth surface**, not a utility feature. It's the only thing here that
   produces a "show someone this" moment.

### Known strategic tension

The owner wants this both as a personal project *and* as something generalizable. These
pull in different directions — the owner is the ideal user of a wardrobe app for exactly
zero other people. Building for themselves first is correct, but track which decisions are
self-serving versus generalizable.

Note: other apps in this space (Sty AI, Wardrowbe, Pronti and others) already ship photo
cataloging, AI outfit suggestions, and try-on. That's not a blocker — the owner is building
this for personal use first and isn't optimizing for competitive differentiation right now.
If and when this generalizes to other users, differentiation is worth revisiting then
(likely candidates: lower ingestion friction, or accumulated wear/outcome data) — but it's
not a constraint on what gets built today.

---

## 3. Design system

The look is **a boutique stockroom, not a retail site.** Cool stone ground, deep ink,
saturated cobalt. Condensed shop-signage display type; monospace for anything that reads as
garment data.

Deliberately avoided: warm cream + high-contrast serif + terracotta accent (the default
AI-generated aesthetic), near-black with an acid accent, and broadsheet layouts.

### Colour tokens

```css
--ground:      #E6E4DD;  /* page — cool stone */
--card:        #F7F6F2;  /* frames, inputs */
--ink:         #1A1A18;  /* text, borders, primary buttons */
--muted:       #7A776E;  /* secondary text, data labels */
--line:        #C9C6BC;  /* hairline dividers */
--accent:      #2B4CD4;  /* cobalt — denim-adjacent, retail/workwear */
--accent-soft: #E0E4F7;  /* drop-target hover */
```

### Type

| Role | Face | Usage |
|------|------|-------|
| Display | **Anton** | Wordmark and section heads only. Uppercase, tight letter-spacing. Used with restraint. |
| Body | **Archivo** (400/500/600) | Item names, prose, form inputs. |
| Utility | **Space Mono** (400/700) | All data: buttons, chips, tags, stats, category labels. 9–11px, uppercase, `letter-spacing: .07em`. |

The mono/uppercase treatment is what makes metadata read as *garment tag data* rather than
UI chrome. Keep it.

### Layout

```
┌──────────────────────────────────────────────────┐
│ THE RAIL.              [Export][Import][+ Add]   │  sticky-feel top bar
├──────────────────────────────────────────────────┤
│ 48 PIECES · 7/8 CATEGORIES · 34% NON-NEUTRAL ▪▪▪ │  mono data strip
├──────────────────────────────────────────────────┤
│ [All][Tops][Knitwear][Bottoms][Outerwear] [srch] │  filter rail w/ counts
├──────────────────────────────────────────────────┤
│  ┌─────┐   ┌─────┐   ┌─────┐   ┌─────┐           │
│  │ 3:4 │   │ 3:4 │   │ 3:4 │   │ 3:4 │           │  garment cards
│  └─────┘   └─────┘   └─────┘   └─────┘           │  auto-fill, min 190px
│  name      name      name      name              │
│  CAT·COLOR CAT·COLOR CAT·COLOR CAT·COLOR         │
└──────────────────────────────────────────────────┘
```

Zero border-radius throughout. 1px borders, no shadows.

### Signature element — the swing tag

The one memorable thing. Everything else stays quiet.

A small paper tag pinned to the top-right of each garment frame, with a punched hole
rendered as a bordered circle. It is invisible at rest; on hover or keyboard focus the card
lifts 6px and the tag rotates in from `-4deg / scale(.82) / opacity 0` to
`2.5deg / scale(1) / opacity 1`, with `transform-origin: 50% 8px` so it pivots from the
hole like real swing tags do.

The tag shows: formality as filled dots, pattern, season codes abbreviated to two letters,
and a row of colour swatches.

`prefers-reduced-motion` disables the lift and rotation and leaves the tag permanently
visible.

### Copy voice

Interface-voiced, never apologetic, always specific about what happened and what to do.
Empty state is an invitation: *"The rail is empty / Add your first piece and it gets read,
tagged, and hung here."* Errors state the problem: *"That file is not a rail export."*
Actions keep the same verb through the flow — "Add a piece" → "Hung on the rail."

---

## 4. Current implementation (P0)

Single-file HTML + vanilla JS, no build step, no framework. See `wardrobe.html`.

### Data model

```jsonc
// item
{
  "id":        "i1abc2xyz",        // generated, stable
  "name":      "Oxford shirt",
  "category":  "Tops",             // one of the 8 below
  "color":     "pale blue",        // plain words
  "palette":   ["#B8CBE0", "#FFF"],// hex, drives swatches + colour analysis
  "pattern":   "solid",            // solid|striped|checked|printed|textured
  "material":  "cotton",           // best guess
  "formality": 3,                  // 1 lounge → 5 formal
  "seasons":   ["spring", "autumn"],
  "notes":     "one line on styling character",
  "remote":    null,               // remote image URL if added via product link
  "source":    null,               // originating product URL
  "added":     1753400000000       // epoch ms, used for sort
}
```

Categories (fixed list, order matters for the filter rail):
`Tops, Knitwear, Bottoms, Outerwear, Suiting, Footwear, Activewear, Accessories`

### Storage keys

| Key | Contents |
|-----|----------|
| `wardrobe:index` | JSON array of all item objects (metadata only) |
| `wardrobe:img:<id>` | Raw base64 JPEG for one item |

Split deliberately: metadata rewrites on every edit, images don't. Also dodges the
per-key size cap. Images load in parallel after first paint so cards appear immediately and
fill in progressively.

### Image pipeline

Uploaded files are drawn to a canvas, resized so the longest edge is **640px**, and encoded
as JPEG at **quality 0.72** (~30–60KB each).

> ⚠️ **640px is not enough resolution to feed a try-on model later.** If virtual try-on is
> still on the roadmap, the real backend must retain originals. This compression is a
> prototype-storage compromise, not a design decision.

### AI calls

Two, both to `claude-sonnet-4-6`, both returning strict JSON (no prose, no fences; the
parser also slices between the first `{` and last `}` as a safety net).

1. **Photo → tags.** Image block (base64 JPEG) + instruction to catalog the garment.
2. **URL → tags.** Text prompt with the product URL plus the `web_search_20250305` tool,
   also asked to return `imageUrl`.

Shared response schema:

```
{"name", "category", "color", "palette":[hex], "pattern",
 "material", "formality":1-5, "seasons":[], "notes"}
```

Every field is editable by the user before saving — auto-tagging *will* get things wrong,
and the edit path is not optional.

### Portability

Export writes one self-contained JSON file:

```jsonc
{
  "format":   "the-rail/v1",
  "exported": "2026-07-25T...",
  "items":    [ /* full item array */ ],
  "images":   { "<id>": "<base64 jpeg>" }
}
```

Import **merges** — it skips any item whose `id` already exists, so re-importing is safe and
non-destructive. On the receiving side this is ~20 lines to parse.

---

## 5. Known limitations of the current build

1. **Storage caps out around 100–120 items.** Real wardrobes may exceed this.
2. **Images are 640px.** Fine for the grid, insufficient for try-on. See warning above.
3. **URL reading is flaky.** Retailers block scrapers aggressively; expect meaningful
   failure rates. The reliable long-term path for bulk ingest is order-confirmation email
   parsing, not URL fetching.
4. **Not deployable.** It runs in a sandboxed environment tied to one account — no shareable
   URL, no proper mobile access. Export/import exists precisely because of this.
5. **No wear logging, no outfit generation, no taste model.** All three are the highest-value
   next additions (see §2).

---

## 6. Suggested next steps for whichever agent picks this up

1. Port to a real stack. Suggested: Next.js + Postgres + S3-compatible object storage for
   images at full resolution. Keep the single-file prototype's visual system exactly —
   it's specified in §3 and it works.
2. Write the `the-rail/v1` importer first, so nothing catalogued in the prototype is lost.
3. Build bulk photo ingestion (§2 item 1) before adding any new surface. Ingestion friction
   is the thing that kills this category.
4. Then wear logging + outfit-for-today, because that's what makes everything else good.

**Do not** start with try-on or shopping integration. They're demo-shaped, and they'll eat
the whole timeline.
