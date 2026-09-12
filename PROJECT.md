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
│ 48 PIECES · 4/5 CATEGORIES · 34% NON-NEUTRAL ▪▪▪ │  mono data strip
├──────────────────────────────────────────────────┤
│ [All][Tops][Bottoms][Outerwear][Footwear] [srch] │  filter rail w/ counts
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

**Built (§5): the pairing pills are photo thumbnails, not text.** Garment extraction (§5)
made this look right — each pill is a small 32×32 crop of the paired item's own isolated
photo (`.pair-pill-img`), not its name. Falls back to a text pill for the rare item with no
photo yet.

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
*(This is the prototype's original 8-category list — kept as historical record. The real
build has since simplified this to 5 categories; see §5 decision log, "category taxonomy
simplified.")*

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
   - **Known gap, deliberately not addressed here:** no minimum defined yet for Footwear or
     Accessories — there's no clear agreed number for "enough footwear" the way there is
     for tops/bottoms. Left unbadged rather than guess. Revisit if it becomes clear what
     those minimums should be.
   - **Revised: the hover-only tooltip didn't work well in practice.** A native `title`
     tooltip needed pixel-precise hovering over a 9px dot and was slow to appear — and
     doesn't exist at all on tap/mobile, this app's primary surface (§1). Replaced with a
     real popover (bigger tap target, opens instantly on hover, toggles on tap) rendered
     via a portal to `document.body`. That surfaced a second real bug worth recording: `.rail`
     has `overflow-x: auto`, which per the CSS spec forces `overflow-y` to clip too, so an
     inline absolutely-positioned popover was rendering but invisible, cut off by its own
     scrolling ancestor — same class of bug as the correction modal's containing-block issue
     (§5 item 6), same fix (escape via portal). Also added a second, more discoverable
     surface for the same message: once the owner actually clicks a short-on-coverage
     category's pill, a banner with the same text now shows above that category's grid —
     the moment they're looking right at how few pieces are there, not something they have
     to notice a small dot to find.
9. ✅ **Category taxonomy simplified: 8 categories → 5.** Live —
   `Tops, Bottoms, Outerwear, Footwear, Accessories`. Dropped Knitwear, Suiting, and
   Activewear, none of which survived scrutiny once the app had real data in it:
   - **Knitwear** isn't a layering role, it's a fabric construction — a jumper can
     function as either a top (worn alone) or an outer layer (a heavy cardigan/overshirt
     worn over another top), and the old category couldn't express that. Confirmed as a
     real problem in the owner's own data: a quarter-zip sweatshirt (functionally a top)
     was tagged Outerwear, while a heavier plaid wool overshirt (functionally outerwear)
     was tagged Knitwear — the boundary was already being applied inconsistently. Fixed by
     dropping the category and having the tagging prompt (`CATEGORY_NOTE` in
     `src/lib/anthropic.ts`) decide Tops vs. Outerwear per item by how it's actually worn.
   - **Suiting** doesn't fit this app's positioning — casual/smart-casual, not black-tie or
     office suits (see §1 persona). A blazer/suit jacket now catalogues as Outerwear, suit
     trousers as Bottoms; `formality` (already a 1–5 field) carries "how dressy," not a
     dedicated category.
   - **Activewear** isn't the target use case — this isn't a gym-log app. Athleisure that's
     genuinely worn as everyday clothing (joggers, leggings) now catalogues as Bottoms like
     anything else. Note: this doesn't make the app *reject* pure gym gear (a technical
     running tee still gets catalogued, just as a Top) — actively excluding gym-only items
     at ingestion would be a separate, bigger feature, not attempted here.
   - Ran a one-off backfill (`scripts/backfill-category.mjs`, same hand-synced-prompt
     pattern as the palette backfill) to re-derive `category` for all existing items under
     the new rules. Only 2 of 10 items actually changed — the Cream Quarter-Zip Sweatshirt
     (Outerwear → Tops) and the Multicoloured Plaid Wool Overshirt (Knitwear → Outerwear) —
     confirming the model applies the new layering-role rule the same way for both.
10. ✅ **Multi-photo upload.** Live — the Add page (`src/app/add/page.tsx` +
    `src/components/AddPhotosForm.tsx`) now takes a whole selection at once instead of one
    photo at a time. It uploads them **one request per photo, in sequence**, with a
    "Reading photo 3 of 8…" progress line, and doesn't abort the run if one photo fails
    (each failure is listed by filename at the end; everything that succeeded is already
    hung). Same post-upload navigation rule as the single-photo flow: exactly one new item
    → its detail page, anything else → the storefront.
    - **Why one request per photo, not one big multipart post:** a batch of
      full-resolution phone photos would blow past the Server Action body-size limit — and
      Vercel's own request-body ceiling — in production, even though it works locally.
      Per-photo requests keep every request small and every function invocation short
      (tagging only; extraction still runs in the background via `after()` per item, exactly
      as before). Client-side downscaling was the other option but was rejected — it would
      defeat the "store full-resolution originals" decision below. `addItemAction` was
      renamed to `addPhotoAction` and now returns `{ ok, ids }` instead of calling
      `redirect()`, so the client can drive the loop and navigate once at the end.
    - **Known limitation:** no resume. Close the tab mid-run and the photos not yet
      processed are simply not uploaded (the ones already done are saved). Fine for now;
      revisit if bulk runs get large enough that this bites.
11. ✅ **Undo for corrections.** Live — a regeneration sometimes comes out worse than what it
    replaced (confirmed in real use). New `previous_state jsonb` column on `items` holds a
    one-level snapshot (all catalogued fields + which image is shown) taken right before a
    correction. The correction dialog now offers **"Undo last correction"** (restores that
    snapshot, fields and photo) when one exists, and **"Reset to original photo"** (points
    the shown image back at the untouched upload — always safe, so it doesn't consume the
    undo slot). One level deep on purpose — "simple undo", not a full history.
12. ✅ **Low-confidence flag for inferred details.** Live — when a garment is only partly
    visible (a tee mostly hidden under an overshirt, a cropped shot), the tagger fills in
    the unseen parts and gets them wrong in ways the owner spots instantly (long sleeves on
    a short-sleeve tee). The tag schema now has `occluded` / `occludedNote`; an occluded
    item is stored with `needs_review = true` + a `review_note`, shown as a small "! CHECK"
    badge on the grid card and a one-line note on the detail page. Editing the item clears
    the flag (that counts as having reviewed it); a post-correction re-tag re-evaluates it.
13. ✅ **Duplicate detection.** Live — background check after every upload (in
    `addPhotoAction`'s `after()`, right after extraction), using the same Claude visual
    comparison validated in the earlier spike (5/5 correct on genuinely-different pairs at
    0.98–0.99 confidence; conservative on true dupes rather than inventing false ones — see
    `compareGarmentPhotos` in `lib/anthropic.ts`). Scoped to same-category items and
    pre-filtered to plausible candidates (`findDuplicateCandidates` — shares a colour word or
    a name word with the new item, capped to 5) so a 50-item wardrobe doesn't mean 50 vision
    calls per upload. A match at ≥0.6 confidence sets `duplicate_of` (+ `duplicate_note`,
    `duplicate_confidence`) on the newer item, pointing at the earlier one.
    - **Review UX, not auto-delete, ever.** A small "≈ Possible dupe" badge appears on both
      grid cards (same monochrome treatment as the "! Check" occlusion badge — stacked
      together in `.card-badges` when an item has both). The real work happens on a
      dedicated **`/duplicates`** page, reached via a **"Review duplicates · N"** pill in the
      filter rail (only shown when N > 0) — a full list of every pending pair, each with both
      photos side by side, the model's one-line reasoning, and three actions: keep both
      (dismiss), remove this one, remove that one. Deliberately a scannable list rather than
      a one-pair-at-a-time modal — a single bulk upload can flag a dozen pairs at once, and a
      list lets the owner work through them in any order or leave and come back, instead of
      being marched through a stepper.
    - `duplicate_of` is a self-referencing FK with `on delete set null`, so deleting either
      item through *any* path (not just the review page — the ordinary bulk-delete/select
      flow works too) can't leave a dangling reference; the leftover `duplicate_note`/
      `duplicate_confidence` text is harmless since the UI only reads them when
      `duplicate_of` is actually set.
    - **Real bulk-upload batch missed 5 genuine duplicate pairs — took three attempts to
      actually fix.** Each attempt was empirically checked against the owner's real wardrobe
      before the next one; the failures were as informative as the fix.
      1. **Original design: compare each item's current `image_path`.** Missed several
         duplicates in one bulk batch: `image_path` gets replaced by a several-second
         background extraction job, so a candidate created moments earlier can still be
         mid-extraction when a same-batch check runs — comparing a fresh isolated photo
         against another item's still-raw upload.
      2. **Attempt 1: compare `original_image_path` on both sides instead** — it never
         changes, so it's always ready. Worse, not better: a photo showing several garments
         (an ordinary mirror-selfie upload) gives every garment detected in it its own *copy*
         of that same multi-subject scene as its "original", so comparing two items'
         originals often compares whichever garment is most visually prominent in each scene,
         not the specific item in question. Confirmed directly — it flagged a t-shirt as a
         duplicate of an unrelated jacket because both original photos happened to feature a
         similar-looking coat elsewhere in frame — and on a real backfill it missed 3 of the
         5 known pairs the owner had already spotted by eye.
      3. **Attempt 2: compare only the extracted (isolated single-garment) photo** — avoids
         the wrong-subject problem, matches what the original validation spike tested. Still
         not enough: it now *under*-detected, missing confirmed real duplicates (a pair of
         trousers, a pair of trainers) that attempt 1 had actually — if accidentally — gotten
         right. Two independent Gemini generations of the same physical garment can render it
         differently enough (crop, exact shade, whether a logo variant renders) that comparing
         only the generated photos loses the resemblance.
      4. **Landed on: send BOTH photos (original + extracted) for BOTH items, one verdict,
         explicitly told to trust the original when they disagree.** Combines each design's
         strength without its failure mode — the isolated shot keeps the comparison on the
         right garment, the original supplies ground truth the generation might have drifted
         from. Re-validated against the same known pairs: caught every confirmed duplicate
         the single-image attempts had individually missed (0.85–0.98 confidence), while
         still correctly calling the t-shirt/jacket pair "different" (0.98).
      `findDuplicateCandidates` only returns a candidate once its own extraction has actually
      finished (`image_path !== original_image_path`) — a still-processing candidate is
      skipped for now rather than compared with a stand-in; the periodic backfill catches it
      once ready. `scripts/backfill-duplicates.mjs` mirrors the live comparison logic exactly
      (kept in sync by hand, as with the other backfill scripts). Also bumped `max_tokens`
      300 → 600 for this comparison call — the richer 4-image prompt sometimes reasons at
      more length before the JSON, and 300 truncated a handful of responses mid-object on
      the backfill that validated this design; the candidate loop (live and backfill both)
      now also survives one bad response instead of abandoning the rest of that item's
      candidates.
      Ran the corrected backfill against the whole wardrobe: **3 of the owner's 5 reported
      pairs are now correctly flagged** (the trainers, the navy trousers, and the cream
      quarter-zip — which turned out to have three copies, not two, all now linked
      together). **One of the remaining two turned out to genuinely be different garments
      on closer inspection**, confirmed both by the model (0.72, citing a real difference in
      collar construction, one shirt showing a visible brand neck tag the other doesn't) and
      by looking at the actual photos directly — not a detection miss. **The last pair
      (khaki chinos vs. a similar pair of stretch trousers) is still genuinely unresolved** —
      the model consistently calls them different (0.75, citing cropped vs. full length and
      a belt in one photo but not the other) and a direct look at both photos didn't settle
      it either way. Left unflagged rather than forced; the owner is the actual authority on
      whether it's one pair of trousers or two. Logged all of this here rather than silently
      "fixed" because it's a real reminder that this feature is a nudge to check, not a
      ground-truth judge of the owner's own wardrobe.
14. ✅ **Pairing pills upgraded from text to photo thumbnails.** Live — each pairing
    suggestion on the hover overlay (`ItemCard.tsx`) is now a small (44×44) crop of that
    item's own isolated photo (`.pair-pill-img`) instead of its name. This was the §3
    "planned upgrade" gated on garment extraction actually existing — it does now, so a pill
    shows just the clean cropped garment rather than a whole photo of someone wearing it.
    Falls back to the old text pill for the rare item with no photo yet.
15. ✅ **Accessories descoped from this MVP.** `CATEGORIES` is now Tops/Bottoms/Outerwear/
    Footwear only — Accessories dropped, not folded into another category like Knitwear/
    Suiting/Activewear were (§5 item 9), since nothing else fits a belt or a watch. It
    wasn't pulling its weight: one item, no natural pairing "slot" (`pairings.ts` special-
    cased it as always-compatible), nothing meaningful yet to say about coverage for it.
    The tagger now skips accessories outright — belts, jewellery, watches, bags — even if
    one is the clear subject of a photo, rather than cataloguing them.
    - **One pre-existing item is now an orphaned category.** "Brown Leather Belt" is still
      in the database with `category = "Accessories"`, a value no longer in the active
      list. Deliberately left untouched rather than silently deleted or recategorised —
      that's the owner's call, not a good one to make automatically. It still shows under
      "All" and in search, just without a dedicated filter chip. One real consequence worth
      knowing: opening its edit page will show the category dropdown defaulted to "Tops"
      (the first option, since "Accessories" no longer matches any of them) — saving that
      page without deliberately picking a category would silently reclassify it.
17. ✅ **"All" reorganised into per-category shelves.** Live — the default "All" view
    (`Storefront.tsx`) is no longer one flat interleaved grid. It's now one horizontal-
    scroll row per category, in order (Tops, Bottoms, Outerwear, Footwear), each with its
    own header showing the category name and count. Picking a specific category chip, or
    typing a search, still drops back to the flat grid exactly as before — that's still the
    right view for "show me every one of these" and for bulk-select; a sectioned browse view
    doesn't make sense for "find this one thing". A genuinely empty wardrobe (no items at
    all) keeps the single big first-run empty state rather than several small "no X yet"
    rows with no unifying CTA.
    - The coverage-gap red dot (§5 item 8) now also appears on each shelf's header, not just
      the filter chip — same trigger, same popover, just a second place it can appear from.
      Considered dropping it from the chip once the shelf carries it, but they're both
      visible at the same time on "All" anyway, so left both rather than adding a special
      case for no real benefit.
18. ✅ **Multi-person photo disambiguation.** Live — solves the ingestion question raised
    while brainstorming photo-library import for a new user: if the app can read a whole
    camera roll, what stops someone else's clothes (a partner, a friend, a stranger in the
    background) from silently ending up in the owner's wardrobe? Confirmed as a real gap
    first, not assumed — a synthetic two-person test photo run through the existing
    `tagPhoto` prompt catalogued all 7 garments from both people with nothing marking which
    belonged to whom.
    - **How it works.** `tagPhoto` (`src/lib/anthropic.ts`) now reports `peopleCount`
      alongside its garments, at no extra latency on the common single-person case (folded
      into the existing tagging call, not a separate check). When `peopleCount > 1`,
      nothing is catalogued automatically — instead `detectPeople` (`src/lib/gemini.ts`)
      finds each person's bounding box, and the Add flow (`AddPhotosForm.tsx`) pauses the
      upload and shows "Multiple people — tap the one that's you" over the actual photo.
      Whichever box the owner taps is real-pixel-cropped (`src/lib/crop.ts`, using `sharp`
      — a true crop, not a Gemini regeneration, deliberately, so nothing about the garment
      can drift the way a regeneration sometimes does, see item 13 below) and only that
      crop re-enters the ordinary tagging/extraction pipeline. The full multi-person photo
      is never stored — only the single-person crop becomes the item's photo, so whoever
      else was in frame never touches storage at all.
    - **Deliberately not biometric.** The app never builds or stores any notion of "what
      does the owner look like." Nothing about a person is remembered across photos —
      identity is established solely by the owner's own tap, in the moment, on the one
      photo in front of them. This was a hard design line, not a corner cut for time: aside
      from being unnecessary here, persisting "what a specific person looks like" is
      biometric data under laws like Illinois' BIPA and the EU GDPR's "special category"
      rules, a real liability this app has no reason to take on.
    - **Provider choice was tested, not assumed.** Both Claude and Gemini were tried on a
      synthetic 3-person test photo with known ground-truth positions. Gemini's normalized
      `box_2d` coordinates matched real pixel positions within a few percent; Claude's were
      directionally sensible but didn't reliably respect the requested 0–1000 scale. Gemini
      was chosen for this one capability on that basis, alongside Claude still doing all
      tagging/comparison work as before.
    - **Bug found and fixed during end-to-end testing: tapping a person silently created
      zero items, with no error shown.** A tight single-person crop, even with 15% padding,
      could still include a sliver of the next person over — and Claude, correctly seeing
      a second (barely-visible) person in that crop, reported `peopleCount: 2` on it. Under
      the original tagging prompt's universal rule ("if more than one person, return no
      garments"), that meant the post-selection re-tag also came back empty, and the client
      treated "zero failures, zero skips" as a clean success and redirected to the rail —
      masking the failure entirely. Fixed with a second tagging mode
      (`"single-person"`, used only for the post-crop re-tag) that explicitly says to
      ignore anyone else visible at the frame's edge and catalogue only the main, central
      person. Verified against the exact crop that triggered the bug, then re-verified with
      a full browser end-to-end run: uploading the two-person test photo, tapping the
      correct box, and confirming via a direct database query that exactly the right
      garments were created, each pointing at a freshly-stored crop, with nothing from the
      other person anywhere in the result.
19. ✅ **"Too occluded to catalogue" gate, and owner-driven manual duplicate marking.** Live
    — two fixes prompted by the same real photo: a hotpot-dinner selfie run through the
    multi-person flow (item 18), cropped down to one person whose trousers were almost
    entirely hidden below a table edge. The tagger still confidently invented a material,
    pattern, and formality for them from a patch of plain black fabric — and that invented
    item then got auto-flagged as a duplicate of an unrelated pair of black trousers, purely
    because "both are black" was the only thing either photo actually showed.
    - **Stricter gate before a garment gets catalogued at all.** `TOO_OCCLUDED_NOTE`
      (`src/lib/anthropic.ts`) now runs before the existing `OCCLUSION_NOTE`: if nothing
      distinctive about a garment is visible — no cut, hem, hardware, or pattern, just a
      rough colour — it's left out of the response entirely rather than catalogued with
      guessed specifics. This is deliberately a *stricter, separate* bar from the existing
      "occluded" flag, not a replacement for it: a garment that's genuinely identifiable
      despite a hidden part (a striped tee with its sleeves covered by an open jacket, say)
      should still be catalogued and flagged for review, same as before — only a garment
      with *nothing* distinctive visible gets dropped. Verified directly against the real
      photo that motivated this (the trousers are now correctly excluded, the shirt above
      them still catalogued normally) and against a synthetic case built to check the gate
      doesn't over-trigger (a striped t-shirt with its sleeves hidden under an open hoodie —
      still catalogued, correctly flagged as occluded, not excluded).
    - **Owner-driven manual duplicate marking**, because automatic detection was never going
      to be foolproof (this same photo is proof: an occluded item gives it too little to
      compare, and see item 13's whole saga on how hard reliable auto-matching already is).
      A **"Mark as duplicate"** button on the item detail page (`MarkDuplicate.tsx`) opens a
      searchable picker over the rest of the wardrobe (same-category items surfaced first);
      picking one calls `markManualDuplicate` (`lib/items.ts`), which sets the exact same
      `duplicate_of`/`duplicate_note`/`duplicate_confidence` columns the automatic check
      does. A manual flag is then indistinguishable from an automatic one — it shows up in
      the same `/duplicates` review queue, with the same keep-both/remove-either actions,
      nothing removed until the owner says so. Verified end-to-end in the browser: marked
      the real trousers item as a duplicate of an existing pair, confirmed it appeared
      correctly in the review queue, then dismissed it to leave the wardrobe as found.
20. ✅ **Extracted product photos normalised to the card's aspect ratio.** Live — found from
    the same hotpot/bridge photos as item 19: the three garments extracted from the multi-
    person crop displayed badly on the storefront — the chinos looked cropped at both the
    top and bottom, and the trainers' thumbnail showed the shoe split across a gap with
    blank space above and below. Traced to a real, measurable cause: every card image
    displays at a fixed 3:4 with `object-fit: cover` (§3), but Gemini's isolated product
    shots don't reliably land on any particular aspect ratio or fill their own canvas —
    confirmed directly (the real chinos' generated photo measured 0.32:1, a narrow tall
    strip nothing like a normal product photo) — so `cover` was centre-cropping away
    whatever didn't fit, cutting a perfectly fine photo in half.
    - **Fix: `normalizeProductPhoto` (`src/lib/product-photo.ts`)** runs on every photo
      `extractGarmentImage`/`correctGarmentImage` (`lib/gemini.ts`) return, before it's ever
      stored. It trims the excess plain background down to the actual garment (`sharp`'s
      `trim()`), then letterboxes the result to the app's own 3:4 — so by the time a photo
      reaches storage, its own ratio already matches the display box and `cover` never needs
      to crop anything away. Verified directly: the real chinos and trainers photos, re-run
      through the fixed pipeline, now display fully and correctly on the storefront.
      - **First version of this fix padded with a fixed colour matching `--card`, and
        introduced a visible seam of its own** — caught immediately in the owner's own
        screenshot of the result: a band where the fixed pad colour met Gemini's actual
        generated background, which isn't the same tone every generation (a warm cream one
        time, a cooler grey another). **Fixed properly** by sampling the letterboxed photo's
        own background colour (averaging a few points inset from each corner, so one noisy
        pixel at the trim boundary can't skew it) instead of a fixed value, so the padding
        always continues the same photo's own tone. Verified side by side on the same real
        chinos photo — the fixed-colour version shows a visible seam, the sampled version
        doesn't — then re-applied to all three real items and confirmed seamless in the
        browser.
    - **Considered and rejected: widening the multi-person crop itself** (item 18) to a more
      normal aspect ratio, so Gemini would have a less extreme canvas to work with in the
      first place. Rejected because widening would extend the crop sideways — directly
      toward wherever the other detected person is standing — reintroducing more of them
      into the stored photo, which is exactly the exposure item 18 already accepted as a
      necessary trade-off and shouldn't be made worse for a display-layer fix. Fixing this
      at the extraction/post-processing layer instead leaves the crop itself untouched.
    - **Also tightened the extraction prompt** (both `extractGarmentImage` and
      `correctGarmentImage`) to ask for one single consistent view and a frame mostly filled
      by the garment — tested across several trials and it measurably reduces (but, being a
      generative model, doesn't fully eliminate) a separate stochastic failure mode: Gemini
      occasionally producing a collage of duplicate views, or even leaving the original
      person in frame, instead of one clean product shot. An automated "is this a clean
      single product shot?" verification-and-retry step was tried and abandoned — asking
      Gemini to judge its own output this way answered "no" even on the clean, correct
      results, so it couldn't reliably distinguish good from bad. The existing "Not quite
      right?" correction flow remains the safety net for the residual failure rate.
    - Applied directly to the three real items that surfaced this (the polo, chinos, and
      trainers from item 18's photo) by re-running them through the corrected pipeline —
      the trainers needed a second attempt (the first attempt's generation failed outright
      and returned the original photo unchanged); the working result was kept. Also kept in
      sync by hand in `scripts/backfill-garment-extraction.mjs` (same pattern as the other
      backfill scripts) so a future full backfill run gets the fix too.
    - **A later bulk upload surfaced a fourth, distinct failure mode: the garment bleeding
      off its own canvas edge.** The owner flagged three items from one batch as looking
      wrong. One (a white football jersey) had a real defect: Gemini's own generated photo
      showed the garment's sleeve cut off by the edge of its own canvas — not a cropping or
      letterboxing problem this time, since trimming/letterboxing can't restore content
      Gemini simply never drew. Added an explicit instruction to both `extractGarmentImage`
      and `correctGarmentImage` ("show the ENTIRE garment fully within the frame, never let
      any part of it extend past the edge") and re-ran the real item through it — first
      retry came out clean and was kept, confirming the instruction helps, though (consistent
      with the other stochastic failure modes above) a second retry on the same item still
      produced a bad duplicate-view collage, so this is a reduction in rate, not a guarantee.
      A second flagged item (a Mexico jersey) turned out to already display correctly by the
      time it was checked. **The third (a pink knit top) was initially — and wrongly — also
      called a non-issue "timing artifact."** The owner pushed back, correctly: it really was
      occupying only ~68% of its frame height versus ~93%+ for a normally-composed item in
      the same row, a real and measurable defect that self-correcting timing couldn't explain
      away. That follow-up is its own bullet below, since it uncovered a deeper problem with
      the trimming step itself, not just this one item.
    - **`sharp`'s `trim()` turned out to be an unreliable way to find a generated photo's
      real content bounds, in both directions.** Confirmed on the pink top: `trim()` at its
      default threshold found nothing to trim, even though the garment plainly occupied well
      under 70% of the frame. Escalating the threshold to compensate fixed that one image but
      changed non-monotonically photo to photo — a threshold that helped one item's excess
      margin did nothing, or overshot into the garment itself, on another; there was no single
      safe fixed (or escalating) value. **Replaced `trim()` entirely** with
      `findContentBBox` (`src/lib/product-photo.ts`): downscales the photo, compares every
      pixel's actual colour distance from the photo's own sampled corner colour, and keeps
      the tightest row/column bounds where enough of a line differs from that background to
      count as content — deterministic and grounded in the photo's own colours rather than a
      threshold guessed in advance. Verified directly against six real cases before shipping,
      including the two riskiest ones for over-trimming (a white sneaker, a white sweatshirt,
      both pale against a similarly pale background) — none were clipped, while the
      pink top, the white jersey, and a Mexico jersey all tightened correctly. Re-applied to
      all three flagged items (plus the earlier white-jersey fix) and confirmed in the
      browser: all four now fill their card at a consistent, correct proportion. Kept in sync
      in `scripts/backfill-garment-extraction.mjs` as usual.
    - **The owner pushed back a second time — correctly, again.** Two follow-up reports:
      (1) two jerseys still had a sleeve visibly cut off by their own canvas edge, worse
      than the earlier "fixed" white jersey; (2) every item catalogued that day looked
      noticeably larger/more filled-in than anything catalogued on prior days. Both were
      real, and both had the same root cause: the Germany and Mexico jerseys' *original*
      Gemini generations predated the "show the ENTIRE garment, never let it extend past
      the edge" prompt fix (added ~30 minutes after they were extracted) — every fix applied
      to them since had only ever re-processed those same already-bled pixels
      (crop/letterbox/background-sampling), which can tighten a photo but can't restore
      content Gemini never drew in the first place. Fixed by actually re-running extraction
      (not just post-processing) for both jerseys plus one more retry on the white jersey
      under the current prompt — 2-3 attempts each were needed (the same duplicate-view-
      collage failure mode from item 20 showed up again in some attempts), and the clean
      result from each was kept.
    - **Then backfilled the whole wardrobe**, since the underlying inconsistency wasn't
      about any one item — it was that `normalizeProductPhoto`'s tightening logic (and its
      `findContentBBox` replacement for `trim()`) didn't exist yet when most of the wardrobe
      was first catalogued, so those items kept their original, looser framing while
      anything touched since read as visibly bigger by comparison. `scripts/backfill-photo-
      normalization.mjs` re-tightens every existing item's *current* photo the same way —
      deliberately without calling Gemini again, so it carries none of the stochastic-
      generation risk a fresh extraction would. Ran it against the real wardrobe: 25 of 33
      items were re-tightened, 8 were already fine, 0 failed. Confirmed in the browser that
      every category now reads at one consistent scale.
21. ✅ **Fixed: the multi-person crop silently cut off everything below the chest on some
    real photos.** The owner uploaded a photo (green jersey, grey trousers, brown boots),
    tapped himself in the "which one is you?" picker, and only the jersey got catalogued —
    trousers and boots, both plainly visible in the photo, never showed up. Root cause: a
    phone photo taken in portrait is very often stored as raw *landscape* pixel data plus an
    EXIF orientation tag telling a viewer to rotate it for display — `sharp`'s own
    `metadata()`/`extract()` (used in `cropToPersonBox`, `src/lib/crop.ts`) read that raw,
    unrotated pixel grid unless explicitly told otherwise. `detectPeople`'s bounding box
    (Gemini) is computed against the photo the way a person actually views it — the
    *oriented* image — so applying its percentages to the raw grid silently cropped the
    wrong region: a tall sliver containing only the head and torso, with the box's real
    target (a full standing person) never actually inside it.
    - **Verified the exact mechanism before fixing it**, not just patched and hoped: built a
      test photo with a real EXIF rotation tag (simulating exactly how a phone encodes a
      portrait shot), ran the real `detectPeople` call against it, then applied the *current*
      crop math and a *fixed* version (with `sharp().rotate()` — bakes the EXIF rotation into
      the pixel data and clears the tag — run first) side by side. The unfixed version
      produced a sideways crop of just the head and shoulders; the fixed version produced a
      correctly oriented, full-length crop showing the trousers and boots intact.
    - **Fix**: `cropToPersonBox` now runs `sharp(buffer).rotate()` before reading any
      dimensions or extracting, so the box-percentage math and the final pixel crop both
      operate on the same, correctly oriented image `detectPeople` actually analysed.
    - Verified end-to-end through the real Add flow (not just the isolated crop function):
      uploaded the same simulated EXIF-rotated photo, tapped the correct person in the
      picker, and confirmed via the database that all three real garments — the top, the
      trousers, and the boots — were catalogued this time, not just the top. Test items and
      files cleaned up after.
    - **The real item that surfaced this (the owner's green jersey) can't be retroactively
      repaired** — the full two-person original that produced its crop was never stored, by
      design (§5 item 18), so there's nothing left to re-crop. Scanned the rest of the
      wardrobe's stored crops for the same signature and found no other confirmed cases; the
      owner can re-upload that same photo to get the complete top/trousers/boots set now
      that the bug is fixed.
22. ⬜ **Accounts.** Deliberately deferred until the core loop (above) is validated on the
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
- **Multi-person photos are handled by a per-photo tap, never by recognising a person.**
  Considered and rejected: building any notion of "what does the owner look like" and
  matching against it automatically. Chosen instead: detect that a photo has more than one
  person (purely spatial — bounding boxes, nothing about appearance is stored) and ask the
  owner to tap which one is them, every time, with no memory across photos. Slightly more
  friction than automatic recognition would be, but avoids taking on biometric-data
  liability (BIPA, GDPR special-category data) for a problem a one-tap UI already solves
  cleanly. See §5 item 18.
