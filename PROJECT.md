# The Rail — Project Brief

> **Read this first.** This file is the **build brief** — current state, current
> priorities, kept short so any coding agent can pick up context fast. It is not the
> strategy document.
>
> **Full product strategy — target persona reasoning, competitive research, monetization
> options, and feature brainstorming — lives in the PRD (Google Doc):**
> https://docs.google.com/document/d/1kkXS5PqcRQm0tULCa8dwkfwHpVq71OBwgFfPsvhjhJ4/edit
>
> **The PRD is the source of truth for product decisions. This file is the source of truth
> for what to build right now.** A Google Doc can't sync to a git repo automatically, so
> when the two disagree, the PRD wins — tell the owner and update this file to match.
>
> **Owner:** product-led, non-technical. Explain decisions in product terms, not just
> implementation terms. Assume the owner can read code and direct the work but not write it
> from scratch.

---

## 1. Vision & persona

A personal wardrobe you can browse like a shop you already own — and a stylist that helps
you get more out of it, both by combining what you have and by telling you what to buy next.
Mission (long-term, from the PRD): help people amplify their self-identity through fashion.

The core insight: **"I have nothing to wear" is almost never a supply problem — it's a
recall problem.** People forget what they own. So the product treats your own closet as a
storefront: browsable, desirable, well-photographed, well-tagged. But cataloging is the
foundation, not the goal. Two equally important halves:

1. **Recall** — see everything you own, clearly enough that you actually use it.
2. **Guidance** — get inspiration for how to combine what you already have, and clear
   direction on what new pieces would expand the wardrobe most, based on what's actually
   in it.

**MVP target persona: time-poor professional men** who spend meaningfully on clothing,
repeatedly default to the same outfits, and care about looking appropriate for work, dates,
and social occasions. Chosen deliberately over targeting women's fashion first — lower
existing competition, narrower recommendation complexity, a more forgiving quality bar, and
a smaller ingestion burden. Full reasoning and the competitive comparison are in the PRD.

**The owner is persona zero** — genuinely fits the MVP target persona, not building a
personal tool that's being generalized later. This is being built as a product for other
people from the start. That said, near-term validation on the owner's own wardrobe and
habits doubles as real user research, so building for the owner first is still correct
practice, not a compromise.

**Primary usage surface is mobile, not desktop.** Most people will use this from their
phone — checking the wardrobe, uploading photos, granting camera-roll access. Desktop web
should work, but isn't the point of the app. This isn't new scope, it's a priority signal
on things already planned: the hover-overlay interaction (§3) needs its documented
tap-to-open mobile fallback actually built and tested, not just specified; and bulk photo
upload (camera roll access, not one-at-a-time) is a real MVP requirement, not a nice-to-have
— see the garment-cropping item in §5. Development so far has happened in a desktop browser
for convenience; don't mistake that for the intended primary experience.

---

## 2. Feature priorities (from the PRD)

| Pri | Feature |
|-----|---------|
| P0 | Storefront-like view of the existing wardrobe |
| P0 | Styling suggestions underneath each item of the existing wardrobe |
| P0 | Bulk deleting of items unreliably ingested |
| P1 | Outfit-of-the-day suggestions (occasion, weather), incl. push notifications |
| P1 | "Shop this new item to unlock outfits with something you already own" |
| P1 | Personalise suggestions based on what the user accepts / rejects |
| P1 | Build a style profile from uploaded looks or influencers the user likes |
| P1 | Expose different brands & colours in shopping suggestions, at the item level |
| P1 | Wardrobe-level gap analysis → recommend purchases that complete the wardrobe |
| P2 | Virtual try-on |
| P2 | Trip planning — capsule packing + destination-seeded shopping inspiration |
| P2 | Browser/shopping plug-in flagging new styles or "you own something like this" |
| P2 | In-person camera point-and-capture ("do I already own this or similar?") |
| P2 | Find-similar-while-shopping (budget/material-matched alternatives) |
| P3 | Guided NUX through styling decisions, monthly upgrade suggestions, influencer look-alike, gift wishlist |

**Why try-on is P2, not P1 or P0:** it's the most technically expensive item on this list —
photorealism is hard, and it needs full-resolution source images (the retired prototype's
640px pipeline was explicitly inadequate for it, see §4). It's best understood as a
shareable growth artifact, not a core utility. Building it early risks eating the whole MVP
timeline on a feature that isn't the wedge.

**Open question — not yet decided:** wear logging (did the user actually wear a suggested
outfit) isn't a named feature anywhere above, but the PRD's own north-star metric —
*"percentage of suggestions actually worn"* — can't be measured without it. Current plan is
to fold logging into whichever feature it naturally attaches to as that gets built, but no
feature owns it yet. Worth revisiting before outfit-of-the-day (P1) ships, since wear data
compounds and every week without it is data that's gone for good.

**Monetization** (referral take-rate, B2B white-label to brands, resale-flagging) is
optionality for later, not a constraint on the MVP build — don't let it shape technical
decisions right now. Full list in the PRD's Motivation section.

**Severity/frequency scoring of core user problems** (in the PRD) currently ties several
problems for top priority and isn't meant to drive build order today — P0 is fixed to
ingestion + storefront regardless, since it's the prerequisite for everything else. Revisit
the scoring once P0 is live, to decide what P1 problem to tackle first.

---

## 3. Design system

The look is **a boutique stockroom, not a retail site.** Cool stone ground, deep ink,
saturated cobalt. Condensed shop-signage display type; monospace for anything that reads as
garment data. Validated in the retired prototype (§4) — carry it forward into the real
build exactly as specified here.

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

### Item hover & detail (evolved past the original swing tag)

The prototype's original signature element was a small swing tag that rotated into view on
hover. It has since been **replaced** by a fuller interaction, validated in the retired
prototype (§4) and worth carrying forward as-is:

- **Hover** dims the garment image under a scrim and surfaces the item's info (name,
  formality dots, pattern, material, season codes, colour swatches) plus **3–4 pairing
  suggestion pills** at the bottom of the card. An "Edit" button sits top-right of the
  overlay and opens editing directly, without navigating away.
- **Clicking** a card (anywhere but the edit button) opens that item's own detail page:
  larger image, fuller facts, notes, and a "Styles well with" section showing paired items
  as their own clickable cards — clicking one navigates to *that* item's detail page, so a
  user can walk the wardrobe through pairings.
- On mobile (no hover state), tapping a tile should go straight to the item detail page.

`prefers-reduced-motion` should disable the lift/rotation transitions and leave hover
content in its revealed state.

**Planned upgrade, not yet built:** the pairing pills are currently text-only (item names).
The intended end state is small photo thumbnails of the paired items instead of text — but
this only looks good once garment cropping (§5) exists, so a pill shows just the isolated
garment rather than a whole photo of a person wearing it. Do this after cropping, not
before.

### Copy voice

Interface-voiced, never apologetic, always specific about what happened and what to do.
Empty state is an invitation: *"The rail is empty / Add your first piece and it gets read,
tagged, and hung here."* Errors state the problem: *"That file is not a rail export."*
Actions keep the same verb through the flow — "Add a piece" → "Hung on the rail."

**British English throughout** — a deliberate design choice, not incidental (colour, not
color; catalogue, not catalog; grey, not gray). This applies to hand-written UI copy and to
AI-generated text: the Claude tagging prompts (`src/lib/anthropic.ts`) explicitly instruct
British spelling for every free-text field they return (name, colour, notes, etc.), since
those values render straight into the UI. If new user-facing copy or a new AI prompt is
added anywhere, keep it consistent with this.

---

## 4. The prototype phase (retired — reference only)

Before the real build, the product was explored as a single-file HTML + vanilla JS
prototype (`wardrobe.html`) — no build step, no backend, no accounts. Everything lived in
one browser's local storage, with AI calls made directly from the browser using a
user-pasted Anthropic API key. It was never meant to reach anyone but the owner, and it
structurally can't: no accounts, no server, no multi-user data isolation. That gap is the
main reason the real build (§5) is starting now instead of continuing to extend this file.

**It is retired, not deleted.** Don't add new features to it — it's kept as a design and
data-model reference for the real build below.

### What it got right — preserve these in the real build

- The visual design system (§3) — validated, carry it forward exactly.
- The hover/detail interaction pattern (§3) — validated, carry it forward.
- Splitting metadata from images in storage (garment rows vs. an object-storage bucket for
  images is the same instinct, done properly).
- Every AI-tagged field is user-editable before saving — auto-tagging *will* get things
  wrong; don't make the edit path optional.
- Merge-on-import semantics (skip already-existing IDs) — useful for any future
  export/import or migration tooling.

### What it got wrong — don't carry forward

- **640px / quality-0.72 JPEG compression.** Nowhere near enough resolution for virtual
  try-on later. The real build must store full-resolution originals (object storage, not
  browser local storage).
- **No accounts, no backend.** API calls went directly from the browser using a key the
  owner pasted in themselves. The real build needs a server that owns the API key.
- **URL-based product-page reading was flaky** — retailers block scrapers aggressively.
  Bulk photo ingestion is the more reliable path forward (see §5).
- **Pairing suggestions were hand-authored mock data**, not real computation — a stand-in
  used to validate the hover/detail UI (§3) before building real pairing logic.

### Data model (carry forward into the real schema)

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

### AI calls made by the prototype (reference for the real build's server-side calls)

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

### Portability

Prototype export format, useful as the importer format for the real build so nothing
catalogued so far is lost:

```jsonc
{
  "format":   "the-rail/v1",
  "exported": "2026-07-25T...",
  "items":    [ /* full item array */ ],
  "images":   { "<id>": "<base64 jpeg>" }
}
```

---

## 5. Now building: the real MVP

Starting the actual product now, scoped strictly to the three **P0** features in §2:
storefront view, per-item styling suggestions, and bulk delete of bad ingestions. No push
notifications, no multi-tenant/B2B anything, no try-on — those come later, per §2.

Stack: Next.js + Postgres + S3-compatible object storage for full-resolution images. Needs
real accounts and a backend that holds the Anthropic API key server-side — no more
user-pasted keys.

Suggested build order:

1. ✅ **Backend that owns the Anthropic API key + real database/storage (Supabase).**
   Done — single-owner mode, no accounts yet (deliberately deferred, see below).
2. ✅ **Wardrobe ingestion + storefront view (P0).** Live and tested end-to-end: upload a
   photo → Claude tags it → stored in Supabase → shows on the storefront. Reused the
   prototype's data model (§4) and visual design (§3). See item 7 — no longer strictly
   one-photo-per-item.
3. ✅ **Bulk delete of bad ingestions (P0).** Live — "Select" mode on the storefront.
4. ✅ **Per-item styling suggestions (P0).** Live — real rule-based computation
   (`src/lib/pairings.ts`) replacing the prototype's hand-authored mock data. Whether this
   becomes AI-computed later is still open.
5. ✅ **Garment extraction from photos.** Live — `src/lib/gemini.ts` sends the uploaded photo
   to Gemini's image model, asking it to remove any person/background and return an
   isolated product-style shot of just the garment. Runs via `next/server`'s `after()` in
   the background so "Add a piece" stays fast (~1-3s, same as before) — the original photo
   shows immediately, and the storefront/detail page picks up the cleaned image on its next
   fetch once ready (a few more seconds), no polling or realtime needed since both pages
   already re-fetch fresh on every request. A one-off backfill script
   (`scripts/backfill-garment-extraction.mjs`) re-processes existing items; re-runnable if
   the extraction prompt improves later.
6. ✅ **Image correction ("Not quite right?").** Live — a button (a text link on the detail
   page, a small "↻" icon directly on each grid card so it doesn't require a trip to the
   detail page first) opens a dialog that regenerates the photo against the true original,
   using the owner's own free-text description of what's wrong. Required adding
   `original_image_path` (§3 data model) so corrections have true ground truth to check
   against, not just whatever the last (possibly-already-wrong) generated attempt was.
   The dialog also shows that original photo, so the owner has something real to check
   their own memory against while writing feedback (e.g. confirming the true shade of
   blue) — the correction call already sent it to Gemini for grounding, but it wasn't
   visible to the person giving the feedback until now.
   - **Went through two iterations on the input design.** First version: quick-select
     "reason" chips (wrong color, too shiny, etc.) plus an optional free-text field — built
     after directly verifying that vague feedback like "something's off" barely changes
     the result while specific feedback measurably does, so the chips existed to steer
     people toward specificity without requiring fashion vocabulary. In practice the preset
     reasons felt arbitrary. **Second version (current): free-form text only** — the field
     itself asks for specificity ("be as specific as you can") and the placeholder
     demonstrates the level of detail that works, rather than pre-guessing a fixed set of
     reasons. Chips are gone entirely, not just de-emphasized.
   - **Fixed: correction feedback wasn't updating catalogued fields, only the photo.**
     Found in real use — feedback like "it's not a sweatshirt, it's a half-sleeve t-shirt"
     correctly fixed the *image* but the item's name/category still said "sweatshirt"
     afterward, because `correctImageAction` only ever called `replaceItemImage`. Now,
     after the photo is regenerated, `retagItem` (`src/lib/anthropic.ts`) re-catalogues the
     item from the corrected photo + the feedback text, and the result is merged into the
     item's stored fields (falling back to the existing value for anything the model
     leaves blank). Best-effort and non-fatal — if re-tagging fails, the photo fix still
     stands and only the text lags, same "editing is never optional" fallback as ingestion.
7. ✅ **Multi-garment detection from one photo.** Live — `tagPhoto` (Claude) no longer
   assumes one garment per photo; it identifies every distinct main garment visible (e.g.
   a top *and* a bottom, sometimes a third outer layer) and returns one entry per garment.
   `add/actions.ts` creates a separate item per detected garment and runs a separate
   background extraction for each, so a single mirror-selfie photo can produce several
   clean, correctly-cropped items instead of one. This is the original "bulk extraction
   from outfit photos" ingestion strategy from §2 item 1, not new scope — just now actually
   built. Verified directly on a real photo: correctly split into jacket, sweatshirt, and
   trousers, each extracted as its own distinct, correctly-cropped image.
   - **Known gap, deliberately not addressed here:** no duplicate detection against the
     existing wardrobe. If the same real garment appears in two different uploaded photos,
     it becomes two separate items — same as single-garment uploads already behaved.
     Real duplicate detection would need visual similarity matching against every existing
     item, a substantially harder, separate problem. Revisit if duplicate items become a
     real nuisance in practice.
   - **Fixed: `palette` was returning two near-identical shades for solid-coloured
     garments.** Found in real use — the hover overlay's colour swatches (§3) showed two
     visibly different chips for garments that are really just one colour (e.g. plain olive
     tee, plain brown trousers). Root cause: `ITEM_SCHEMA` in `src/lib/anthropic.ts` showed
     `"palette":["#hex","#hex"]` as the example shape, which nudged the model into always
     filling both slots. Fixed the prompt to explicitly require exactly one hex for a solid
     garment, and only add a second/third when there's a genuinely distinct colour (contrast
     trim, colour-blocking, stripes, a print).
   - **Second pass, same fix — palette should match how a person describes a colour, not a
     pixel survey.** First fix wasn't quite right: a denim jacket's brass rivets/buttons and
     a jumper's tiny embroidered logo were technically-correct second colours but not what
     "what colour is this" means. `PALETTE_NOTE` now explicitly excludes hardware/trim/
     stitching/small logos from ever counting as a garment colour, and for genuinely
     multi-coloured garments (a busy plaid, a print) caps the list at the 2-3 most dominant
     colours by coverage — skipping thin accent lines/flecks a person wouldn't mention (an
     orange-and-black check with a few thin yellow lines is "orange, black", not "orange,
     black, yellow"). Colour-based sort/filter is a plausible future feature this also sets
     up for, though not built yet. Ran `scripts/backfill-palette.mjs` (kept in sync by hand
     with the live prompt, since it can't import the `.ts` file — see its header) to
     re-derive `palette` for every existing item under each version of the prompt —
     verified several by hand against their real photos both times.
8. ✅ **Wardrobe coverage nudge.** Live — `src/lib/coverage.ts` defines a minimum item count
   for the categories every outfit structurally needs (Tops: 5, Bottoms: 5) plus a softer
   one for a contextual category (Outerwear: 2). A category under its minimum gets a small
   red indicator on its filter pill (`src/components/Storefront.tsx`), with the "why" on
   hover — e.g. "Add 4 more bottoms — every outfit needs one, and five gives enough real
   rotation." Prompted by real use: the owner's own ingestion so far skewed heavily toward
   outerwear (the visible outer layer in a mirror selfie) and under-covered tops/bottoms,
   which are what an outfit actually needs. A category with a defined minimum but zero items
   still shows its pill (normally a category with 0 items doesn't appear in the filter rail
   at all) so a completely missing essential still nudges. Purely a nudge, not a gate —
   filtering/browsing/uploading all work identically regardless.
   - **Known gap, deliberately not addressed here:** no minimum defined yet for Knitwear,
     Suiting, Footwear, Activewear, or Accessories — there's no clear agreed number for
     "enough footwear" the way there is for tops/bottoms. Left unbadged rather than guess.
     Revisit if it becomes clear what those minimums should be.
9. ⬜ **Accounts.** Deliberately deferred until the core loop (above) is validated on the
   owner's own wardrobe — see decision log below.

**Do not** start with try-on or shopping integration. They're demo-shaped and will eat the
whole timeline — confirmed P2, see §2.

### Decisions made building this (keep in sync with the PRD if they change)

- **No accounts in phase 1.** Single-owner mode was chosen deliberately so ingestion + UI
  could be validated before spending time on auth. Add accounts before inviting other
  people to use it, not before then.
- **Anthropic key is server-side and owner-billed.** No more per-user pasted keys (the
  prototype's stopgap). This means the owner's own Anthropic account is billed for all
  usage until real accounts + usage limits exist.
- **Pairing logic is rule-based, not AI-computed, for now.** Category compatibility +
  formality closeness + pattern-clash avoidance + season overlap. Free to run, no API cost
  per view. Revisit if the suggestions aren't good enough once there's a real wardrobe to
  test against.
- **Images are stored as uploaded, full resolution** (via Supabase Storage) — no more of
  the prototype's lossy 640px compression.
- **Garment extraction uses a second AI provider (Google Gemini), not Anthropic.** Claude
  can tag/describe a photo but can't edit or generate images — a genuinely different
  capability, hence a second server-side key (`GEMINI_API_KEY`). Owner-billed, same as
  Anthropic, until real accounts exist.
- **Extraction runs async, not blocking the upload.** Chosen over making the user wait
  through both AI calls (tagging + image generation, ~10-20s combined) — the item appears
  with its original photo immediately and upgrades to the clean shot a few seconds later.
- **`original_image_path` is tracked explicitly and never overwritten**, separate from
  `image_path` (whatever should currently display). Needed once corrections existed —
  without a true "ground truth" reference, a second correction would be checked against the
  first (possibly already wrong) generated image instead of reality, and errors would
  compound. Existing items get this backfilled the first time the backfill script runs.
- **Corrections run synchronously, unlike the initial extraction.** The owner is actively
  watching and waiting for this one (they just clicked "regenerate"), so a ~5-15s wait with
  a visible pending state is the right call here — the opposite tradeoff from the upload
  flow, deliberately.
