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
| P1 | Dress for occasion — type a request, get an outfit built from what you own |
| P1 | Outfit-of-the-day suggestions (occasion, weather), incl. push notifications |
| P1 | "Shop this new item to unlock outfits with something you already own" |
| P1 | Personalise suggestions based on what the user accepts / rejects |
| P1 | Build a style profile from uploaded looks or influencers the user likes |
| P1 | Expose different brands & colours in shopping suggestions, at the item level |
| P1 | Wardrobe-level gap analysis → recommend purchases that complete the wardrobe |
| P1 | A generic model that visualises the wardrobe's outfits and styles the pairings together |
| P1 | Favourite ("starred") outfits |
| P2 | Virtual try-on |
| P2 | Trip planning — capsule packing + destination-seeded shopping inspiration |
| P2 | Browser/shopping plug-in flagging new styles or "you own something like this" |
| P2 | In-person camera point-and-capture ("do I already own this or similar?") |
| P2 | Find-similar-while-shopping (budget/material-matched alternatives) |
| P3 | Guided NUX through styling decisions, monthly upgrade suggestions, influencer look-alike, gift wishlist |

*Synced with the PRD's feature table on 2026-11-17: "Dress for occasion", the generic-model
visualisation, and favourite outfits were in the PRD as P1 but missing here. Note the
generic model (P1) is **not** virtual try-on (P2): it shows outfits on a stand-in model, not
on the user's own photo, so it doesn't carry try-on's photorealism / full-resolution cost.
Open items that fall out of the PRD's "MVP laundry list" tab are tracked in `BACKLOG.md`.*

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

**Removed 2026-11-25 (§5 item 27): the hover pairing pills.** Whole recommended outfits on the item
page replaced them, so the overlay now shows only the item's details and the Edit and correction
buttons. The paragraph above is kept as history.

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
      else was in frame never touches storage at all. *(Item 28 changes this slightly: the full
      photo is now held for a short time in a private temporary bucket while the owner chooses,
      then deleted.)*
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
22. ✅ **Import from Google Photos.** Live — took several rounds of the owner's own live
    testing to get there, since the OAuth consent screen and the picking UI both live on
    Google's own domain and couldn't be exercised from this end at all beforehand. Picks up
    the original ingestion brainstorm from earlier in §5's history (letting a new user pull
    from their photo library instead of uploading one-by-one) using the
    **Google Photos Picker API**, not the older Photos Library API — Google restricted
    broad `photoslibrary.readonly`-style library scanning for new apps in 2025, so the
    Picker API (the owner picks specific photos on a page Google itself hosts; the app only
    ever sees exactly those photos) is the current, correct, and only realistically
    available approach. Matches the project's existing stance on consent from the
    multi-person work (item 18) — never broad access, only what's explicitly handed over.
    - **New files**: `lib/google-photos.ts` (OAuth token exchange/refresh + the Picker API
      calls — session create/poll/list/download), `lib/google-auth-store.ts` (token
      persistence — a `google_oauth_tokens` table; one fixed "owner" row when built, now one
      row per user, see item 23), three API routes (`authorize`, `callback`, plus
      `status`/`media`/`download` for the client to poll/list/download against), a server
      action (`add/google-photos-actions.ts`) for starting a session when already connected,
      and a new client component (`GooglePhotosImport.tsx`) rendered directly under the
      existing file input on `/add`.
    - **Deliberately does not add a new ingestion path.** Once photos are picked, they're
      downloaded server-side (the access token this needs can never reach the browser) and
      handed to the client as ordinary `File` objects — from that point on they go through
      the *exact same* pipeline as a locally-chosen file (multi-photo, multi-garment,
      multi-person disambiguation, all of it), via the parent form's existing `files` state.
    - **Where this actually adds value: desktop, not mobile.** On a phone, the existing plain
      file input already opens the OS's own picker, which itself usually reaches Google
      Photos/iCloud directly — so this mainly helps someone browsing from a desktop whose
      photos live in Google Photos but not on that machine. Worth knowing so the feature's
      value isn't overstated relative to what already worked.
    - **OAuth setup is a real, unavoidable manual step** — a Google Cloud project (the same
      one already used for the Gemini key works fine; OAuth credentials are a different kind
      of credential living in the same project, not a replacement for the API key) with the
      Photos Picker API enabled, an OAuth consent screen in Testing mode (skips Google's
      verification review — fine for single-owner use), and a Web-application OAuth client
      with `http://localhost:3000/api/google-photos/callback` as an authorized redirect URI.
      `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` go in `.env.local`, same as every other key.
    - **The new `google_oauth_tokens` table needs the owner to run the updated
      `supabase/schema.sql` by hand** (same manual-migration convention as every table
      before it) before any of this can actually be exercised.
    - **`listPickedPhotos`' response parsing worked on the first real run** — written from
      documentation with no way to test it against a live response beforehand (see below),
      it turned out to match the Picker API's actual shape exactly; no adjustment needed.
    - **Getting there needed three real rounds of config fixes, none of them code bugs**:
      a `redirect_uri_mismatch` traced to the deployed site's actual domain being
      `the-rail-wheat.vercel.app`, not the `rail-wheat.vercel.app` visible in Safari's
      truncated address bar (misread by the assistant, not the owner); an `access_denied`
      from the OAuth consent screen still being in Testing mode without the owner's own
      account added as a test user; and Google Cloud Console itself refusing to add that
      exact addition ("ineligible … account"), which turned out to be an unrelated console
      quirk — project owners are implicitly allowed regardless of the test-user list, so
      the fix was simply to retry, not to resolve that dialog.
    - **Bug found and fixed: the picker tab silently failed to open on iOS Safari.** The
      first working version called `window.open` right after `await`ing the session-creation
      call — Safari (iOS especially) only allows `window.open` when it happens perfectly
      synchronously inside a genuine tap, and that intervening `await` was enough delay for
      it to silently block the call as an unrequested popup, with nothing to catch. Fixed by
      never calling `window.open` anywhere except directly inside a real `onClick` — added
      an explicit "ready" phase (`GooglePhotosImport.tsx`) so creating the session and
      opening the tab are two separate taps, the second with zero delay before `window.open`
      fires. The same fix covers resuming after the OAuth callback redirect, which had the
      same problem in a worse form (no live user gesture at all at that point). Also now
      checks `window.open`'s return value and surfaces a clear error if a browser still
      blocks it, instead of silently doing nothing.
    - **A real desktop import surfaced an unrelated, pre-existing gap: no retry on a failed
      tagging call.** One imported photo came back as a blank "Untitled piece." Re-running
      the exact same tagging call against the exact same photo moments later succeeded
      cleanly — nothing wrong with the photo, just a one-off transient failure (a bad
      network blip, a truncated response) that had nowhere to go but straight to the blank
      fallback. `tagPhoto` (`lib/anthropic.ts`) now retries once before giving up, which this
      generalizes to every upload path, not just Google Photos imports. The real item this
      surfaced on was fixed directly with the successful retry's result rather than asking
      the owner to redo the upload.
    - **Reported after accounts shipped: picking photos in Google Photos succeeded, but
      nothing appeared back in the app.** Two causes, one of them mine twice over.
      **The real blocker:** `openPicker` called `window.open(url, "_blank",
      "noopener,noreferrer")` and treated a `null` return as "the browser blocked the popup"
      (that check was added in the iOS Safari fix above). Per the HTML spec a window opened
      with `noopener` *always* returns `null`, even when it opens perfectly — so every
      successful open was reported as blocked, and the code returned before `startPolling`
      ever ran. The picker tab opened, the app said "blocked", and nothing was watching for the
      photos. **That also means the earlier iOS diagnosis was wrong:** the "blocked" error seen
      on the iPhone after finishing in Google Photos was this same bug, not a second tap or a
      reloaded tab as first guessed. Fixed by opening without `noopener` (so `null` really
      does mean blocked) and cutting the opener link manually afterwards. Evidence for the
      cause is the owner's screenshot — the tab opened *and* the error showed, which a truly
      blocked popup can't do — plus the spec; it could not be reproduced in the dev
      environment's embedded browser, which blocks all new windows. **Confirmed fixed:** the owner
      retried on the deployed site after the fix and the import worked. One loose end: an import from Chrome worked about 15 minutes after
      the faulty check deployed, which doesn't fit unless that tab was still running older code.
    - **Also fixed on the way, since they made this impossible to diagnose:** the import had two
      paths that finished empty and said nothing (Google listing zero photos went quietly back
      to idle; a photo whose download failed was silently skipped, so if every download failed
      it still "succeeded" with an empty list). Every failure now reports what happened,
      including Google's own response for a refused download. The status poll is guarded
      against overlapping checks (two ticks both seeing "done" would start the import twice),
      and the routes log failures server-side (host only, never tokens or full URLs).
23. ✅ **Accounts.** Live — the trigger the decision log below set ("before inviting other
    people to use it") arrived when the owner wanted a friend to dogfood the app with their
    own clothes. Chosen over the quick alternative of a second, separate deployment because
    it's the correct long-term shape and means the *next* friend costs nothing to add.
    - **Sign-in is a magic link, emailed.** Supabase Auth (`lib/supabase-auth.ts`,
      `lib/auth.ts`, `proxy.ts`, `app/login`, `app/auth/callback`). A typed 6-digit code
      was built first and is the better design on a phone — an emailed link opens in whatever
      browser the mail app picks, not necessarily the one the person started in — but
      Supabase only lets the code go in the email once a custom email sender is connected,
      and the default template carries just the link. Switched to links rather than wiring up
      custom SMTP now.
      - **Known limitation:** the link must be opened in the *same browser* that asked for it
        (the sign-in uses a secret stored there). A link opened elsewhere lands on
        `/login?error=link` with an explanation. The case most likely to bite: signing in
        from the home-screen (installed) web app on iOS, where the emailed link opens in
        Safari instead. Fix when it matters: connect custom SMTP and go back to the code flow.
      - Supabase's built-in email sending is rate-limited to a few emails an hour — fine for
        the owner plus a friend; the same custom-SMTP step removes that ceiling.
    - **Invite-only.** Open sign-ups are switched off in the Supabase dashboard, and
      `signInWithOtp` is called with `shouldCreateUser: false`. Every AI key in this app is
      billed to the owner (see the decision log), so anyone who found the URL must not be able
      to create an account and spend it. `scripts/create-user.mjs <email>` is how someone gets
      in. An unknown email gets the same response as a known one, so the form doesn't reveal
      who has an account.
    - **Data isolation is enforced in code, with row-level security as a second layer.** The
      app still reads and writes through the service-role key (which bypasses RLS), so every
      function in `lib/items.ts` and `lib/google-auth-store.ts` takes a *required* `userId`
      and scopes by it — forgetting one is a compile error, and adding accounts surfaced every
      call site that needed updating at once. Anything that names two rows (flagging a
      duplicate pair) verifies *both* belong to the caller, since scoping only the row being
      written would still let one user point their item at another's. RLS is on for `items`
      and `google_oauth_tokens` with **no policies**: it denies everything to the public
      anon key, so even someone holding that key (not a secret in most Supabase apps) reads
      zero rows. Per Next's own auth guidance, the proxy only does a fast cookie check to
      bounce signed-out visitors — real authorization (`requireUser()`/`getCurrentUser()`)
      sits next to the data, because Server Actions and Route Handlers are separately
      callable and a proxy check protects neither. It's called *before* any try/catch in
      actions, since `redirect()` throws and a catch-all would swallow it.
    - **Google Photos connection is now per user** (it was one fixed "owner" row, which would
      have let any user's "Import from Google Photos" open the owner's library). The old
      table was dropped by the migration — its tokens expired within days anyway — so the
      owner reconnects once. Also tightened while here: `/api/google-photos/download` took a
      URL from the browser and fetched it carrying the user's Google bearer token; with
      untrusted users that was a request-forgery hole, so it now only fetches from Google
      domains.
    - **Verified, not assumed.** `scripts/test-tenant-isolation.ts` creates two real users in
      the real database and has one attack the other through *every* function in the data
      layer — reads, edits, photo swaps, undo, duplicate-flagging, the duplicate queue, bulk
      delete (including mixed own/other lists), Google tokens, and the anon key against RLS —
      importing the real code, not a copy. 27/27 pass. Then two user filters were
      deliberately removed to prove the test can fail: it caught both (5 failures), and the
      code was restored. Also driven through the real running app with a throwaway signed-in
      user: signed-out visitors are bounced from every page and get a 401 from the API; a new
      user sees only their own item; opening another user's item by URL (view and edit)
      returns 404 with no leak; sign-out clears the session. Test users and rows were deleted
      afterwards.
    - **Existing data**: `items.user_id` was added nullable, then
      `scripts/assign-existing-items.mjs` claimed all 45 existing items for the owner (none
      left unowned). Optional follow-up once confident:
      `alter table items alter column user_id set not null`.
    - **The emailed-link path was the one thing not testable from this end** (it needs the
      owner's inbox) — everything around it was tested with a session minted directly. The
      owner then signed in with a real emailed link on the deployed site: confirmed working.
    - `scripts/backfill-duplicates.mjs` now only compares items belonging to the same user.
      The other backfill scripts act on every row regardless of owner — fine as owner tools,
      worth revisiting if one ever needs to run against a single user.
24. ✅ **A failed tag no longer means "one person" — and uploads are read by their bytes, not
    their label.** Live — found from four Google Photos imports: in one mirror selfie the app
    extracted the *girlfriend's* coat without ever showing "which one is you?" (the owner had
    got that picker on another photo), and another item came out titled "Untitled piece".
    Same root cause for both, confirmed rather than guessed:
    - **The trigger: a wrong image label.** Google's Picker reports iPhone photos as
      `image/heif` even when the file it serves is plain JPEG. The upload trusted that label,
      stored the file as `image/heif`, and passed it to Claude — which rejects any media type
      outside jpeg/png/webp/gif with a 400 (reproduced directly). Tagging failed on both
      attempts.
    - **The real design hole: a failed tag was treated as "one person".** `addPhotoAction`'s
      fallback was `{ peopleCount: 1, garments: [blank] }`, which skipped the multi-person
      check entirely. The whole two-person photo became an item named "Untitled piece", and
      extraction was then told only to extract "Untitled piece" — so Gemini picked a garment
      itself: her maroon coat in the mirror selfie; his navy sweater, by luck, in the street
      photo (still titled Untitled, since nothing had ever read it). Also, a tagger that said
      "several people" while person detection returned nothing fell straight through to
      cataloguing the unsplit photo.
    - **Evidence it hit earlier uploads too:** the brown polo and a white tee carried correction
      snapshots (`previous_state`) showing they had been "Untitled piece" / mis-read until the
      owner fixed them with "Not quite right?" — that correction is what had been quietly
      repairing the title.
    - **Fix (`lib/ingest.ts`, wired into both Add actions).** `normalizeUpload` decides the type
      from the bytes (sharp): Claude-readable formats keep their original bytes with the true
      label; anything else decodable (real HEIC/AVIF/TIFF, if the host's libvips can) becomes a
      high-quality JPEG; a non-image gets a plain error. `analysePhoto` never assumes: a failed
      tag falls back to person detection (retried once — it varies run to run); two or more
      people → the picker; only a photo confirmed to have at most one person gets a blank
      editable item; if the tagger says several people but detection can't find two, or both
      calls fail, nothing is added and the failure is listed — never a guess. The download
      route also labels responses by their bytes.
    - **Verified** by `scripts/test-ingest.ts`: ten fake-dependency cases covering every branch
      (including the reported one: tag fails + two people → picker), five byte-vs-label cases,
      then the real photos from the report run with the wrong `heif` label on — all five now
      reach "which one is you?", including the white-tee photo that had previously skipped it.
    - **Known limit, not solvable here:** if Claude *undercounts* people on a photo it did read
      successfully (says one when there are two), the picker still won't appear — the white-tee
      case before this fix is not fully explained by the label bug, and counting is a model
      judgement. Running person detection on every photo would close it, at the cost of an
      extra Gemini call each and false prompts from background strangers. Not done; revisit if
      it recurs.
    - **Existing items are not retroactively fixed.** Items already hung from a bad import keep
      whatever they got; the owner removed or corrected the ones noticed.
25. ✅ **Two generator failures fixed: doubled product photos, and a "ghost" item from a
    sliver of clothing.** Both found in one screenshot of the storefront after the imports in
    item 24.
    - **Doubled photos.** Two items (a navy jumper, a brown polo) showed the garment twice,
      front stacked above back. This is the stochastic "collage" failure already noted in
      item 20 — the prompt asks for one view, which only lowers the rate. Prompting couldn't
      be the fix and asking Gemini to judge its own output had already failed (item 20), so
      it's now detected in code: `findStackedViewTopBox` (`lib/product-photo.ts`) finds an
      empty horizontal band through the middle with a garment-sized block above and below it
      of similar height *and* width, and `normalizeProductPhoto` keeps just the top (front)
      view. Every condition has to hold, so a single garment, a hairline seam, a side-by-side
      pair of shoes, or an unequal stack are left alone — all covered in
      `scripts/test-product-photo.ts`. Run across all 52 stored product photos before
      shipping: flagged exactly the two known cases, no false positives.
      `scripts/backfill-stacked-views.ts` repairs existing ones (dry run unless `--apply`);
      by the time it was run the owner had already fixed those items with "Not quite right?",
      so it had nothing left to change.
    - **White tee that showed a fleece.** The tagger had catalogued a "white crew neck tee"
      from a photo where only a sliver of its collar showed under a cream fleece. With almost
      nothing of the tee visible, the extractor — told to draw a white tee — drew the fleece,
      so two items had the same picture (the review badge was correct; the item shouldn't
      have existed). The "too hidden to catalogue" rule (`TOO_OCCLUDED_NOTE`, item 19) now
      also covers a mere sliver (a collar or hem peeking out from under another layer); a
      layered garment is only included when a good part of its body is visible.
      Checked against all 52 stored originals under the old and new prompts: the sliver-tee
      is dropped from all three photos that had it; the only other change was two photos
      losing a "black trousers" that was just a patch of black behind a table or mostly out
      of frame — the same kind of invented item item 19 set out to exclude. 46 of 52 photos
      otherwise unchanged. One unrelated oddity seen in the new run: a tan baseball cap
      catalogued as a Top on the rain-jacket photo (accessories are meant to be skipped);
      single occurrence, not obviously caused by this change — watch for it.
26. ✅ **A dead Google Photos connection no longer traps the import button.** Found 2026-11-23:
    the Add page showed Google's raw "token refresh failed: 400 invalid_grant — Token has been
    expired or revoked", and "Try again" hit the same dead connection every time, with no way
    to reconnect. Cause: the stored connection had died. Most likely because the Google
    consent screen is still in **Testing** mode, where (as far as we know) Google expires
    connections after 7 days — it had been about 8 days since reconnecting. A manual
    revocation in the Google account would look identical.
    - **Fix.** `refresh` (`lib/google-photos.ts`) now recognises `invalid_grant`, forgets the
      stored connection (`deleteTokens`, `lib/google-auth-store.ts`) and throws
      `GoogleReconnectNeeded`, whose message is plain English. The import button's server
      action turns that into the same "needs-auth" answer as a first-time connect, so the
      person is sent straight back through Google's consent screen. The Picker API rejecting
      an access token with 401 (revoked while our stored expiry still said valid) is handled
      the same way. Anything that isn't proof the connection is dead — a wrong client secret,
      a Google outage, a 500 — leaves the stored connection alone.
    - **Verified** by `scripts/test-google-reconnect.ts` (10 checks): a throwaway user with a
      fake expired connection against Google's *real* token endpoint (a made-up refresh
      token gets the same `invalid_grant`), then stubbed responses for the don't-over-reach
      cases. Throwaway user cleaned up.
    - **Not fixed — the cause.** Until the Google consent screen leaves Testing mode, every
      connection will expire weekly, for every user. Needs a look at Google's current rules
      for this permission first (warning screen, user limits); tracked in `BACKLOG.md`.
27. 🟡 **Recommended outfits (ROs), milestone M1 — built and verified locally, not live.** Replaces
    the item page's row of single "styles well with" items with up to four whole outfits built
    around that item (top, bottom, shoes, sometimes outerwear), pieces side by side, each with a
    one-line reason. M2 (worn by a generic model) and M3 (worn by the user's own avatar) come
    later; decisions, rules and deferred items are in `BACKLOG.md` ("Planned: recommended
    outfits"). The grid's hover pairing pills were removed on 2026-11-25, after the owner confirmed these look good.
    - **Why the AI stylist, and what it rests on.** The rule-based pairing scorer was no better than
      chance against the owner's ratings, and rules plus colour was worse. Against four other
      people's ratings of the same 24 top-and-bottom pairs, an AI stylist tracked the crowd at
      0.45 (0 = unrelated, 1 = identical), about as well as a typical single rater tracks the
      rest (0.32, 0.40, 0.52); today's rules scored -0.23. Only top-and-bottom pairs were rated,
      so shoes and outerwear choices are unvalidated (tracked in the backlog). Details and data:
      `web/eval-data/`, `scripts/eval-*.ts`. The owner's own taste was deliberately NOT turned
      into rules: his "no" reasons were mostly not shared by the others.
    - **How it works.** `lib/outfits.ts` holds the rules and checks (pure logic, tested with a fake
      stylist in `scripts/test-outfits.ts`, 43 checks); `lib/stylist.ts` (`claudeOutfitModel`) asks
      Claude with the item's photo, numbered contact sheets of the wardrobe by category, and a text
      list, and gets back labels plus a reason, never names. Every answer is checked before use:
      right categories, hero in every outfit, one piece per category, outerwear in at least 1
      and at most 3 outfits (when owned and when the item isn't outerwear), outfits differing in
      at least two pieces (relaxed to one if too few remain), reasons tidied to sentence case with
      no dashes. One retry with the problems spelled out; if still bad it shows fewer outfits or a
      failure message, never invalid ones. Duplicates flagged on the rail are never used. Below 5
      tops or 5 bottoms (the existing coverage minimums) the page shows an explainer and makes no
      AI request. A category the person doesn't own is left out.
    - **Saved, not recomputed.** Table `outfit_sets` (one row per user and item; RLS on, no
      policies; schema in `supabase/schema.sql`, **run by hand**) via `lib/outfit-store.ts`. Outfits
      are generated from the item page when none are saved (`outfit-actions.ts`, a server action
      called by `components/OutfitsSection.tsx`, not during page render, so prefetching can't cost
      money) and reused until: a piece in them is deleted or flagged a duplicate, the wardrobe
      size moves by 5, or `OUTFIT_ENGINE_VERSION` changes. A "generating" claim stops two tabs
      paying twice (a claim older than 3 minutes is treated as dead). If the table is missing the
      page falls back to the old single-item suggestions instead of breaking.
    - **Cost and speed (measured, rates assumed at $3 / $15 per million tokens):** about 2.5 cents
      and 6 to 11 seconds per item, so roughly $1.40 for the whole 54-item wardrobe if every item
      were opened once. Per-user AI caps are still open (see backlog).
    - **Verified:** logic tests; a real run on six items from every category (all valid first
      try); in the running app, signed in: loading state, generation, reuse on reload (one AI
      request only), clicking a piece to its own outfits, the failure state and its retry button,
      automatic regeneration of outdated outfits, "another tab is generating" waiting then
      updating itself, the small-wardrobe explainer (a throwaway 2 tops and 2 bottoms account),
      another account getting a 404 for the owner's item, and a phone-width layout with no
      sideways scroll. `scripts/test-tenant-isolation.ts` gained 12 checks (39 total), and was
      shown able to fail by deliberately disabling the ownership guard (4 failures), then restored.
    - **Known limits:** quality on shoes and outerwear is unmeasured; outerwear can be chosen in
      summer (seasonality is deferred); the wardrobe-size drift rule means a person adding 5 pieces
      sees a few seconds of "putting outfits together" per item opened afterwards; outfits with and
      without outerwear shift the tiles left because tiles aren't aligned by category; the "failed"
      state doesn't retry by itself, only on the button; the failure path was tested by forcing the
      stored state, not by a real outage.

28. ✅ **Big photos: upload straight to storage, and always send the AI a sensibly sized copy —
    live, and confirmed on the live site.** Prompted by a Fuji camera photo failing on the live site
    with "An unexpected response was received from the server". The likely cause is Vercel
    refusing request bodies over ~4.5 MB (our own 25 MB limit only applies locally); phone and
    camera photos are often bigger. Two problems, one fix:
    - **Upload path.** The Add flow no longer posts each photo through a Server Action. The browser
      asks for a one-time upload link (`createUploadAction`), sends the photo straight to a
      **private temporary bucket** (`incoming-photos`, created by the app on first use; 40 MB per
      photo; `lib/incoming.ts`), then gives the server only the photo's storage path
      (`addPhotoAction` / `addPhotoWithPersonAction` read it back with `readUpload`). The temporary
      copy is deleted as soon as the photo is processed, skipped or has failed; anything walked
      away from is swept after two hours, and each account can only name its own folder.
    - **Privacy trade-off (decided in passing, worth the owner's veto):** item 18 said the full
      multi-person photo "never touches storage". With direct upload it now sits in the private
      bucket (no public link) while the owner picks which person is them, then is deleted at the
      next step or at the latest two hours later. Only the single-person crop becomes part of the
      wardrobe, as before. Nothing is recognised or remembered about anyone.
    - **The second, hidden limit.** Claude rejects any single image over about 5 MB. It was never
      reached before because big photos never got that far, so it would have turned every big photo
      into a silent "couldn't read it". `shrinkForAi` (`lib/ingest.ts`) now sends every AI call
      (tagging, person detection, extraction, duplicate comparison, "Not quite right?") a copy
      capped at 2048 px and 3.5 MB, upright, while the wardrobe keeps the full-resolution original
      (a stored crop of the 10 MB test photo stayed at full size). Small photos are sent untouched.
    - **Verified:** `scripts/test-incoming.ts` (29 checks against the real storage: path safety,
      limits, 6 MB round trip, another account refused, no public link, link works once, deletion,
      two-hour sweep); 5 new checks in `scripts/test-ingest.ts` (a >5 MB photo is shrunk, small is
      untouched, sideways photos made upright). In the running app, on a throwaway account: a
      10.2 MB, 24-megapixel photo uploaded and was read, shown the "which one is you?" picker, cropped
      to two items with the stored originals still 12 MB; the skip path deleted the held photo; an
      ordinary small photo still produced three items; temporary storage was empty after each run.
      It couldn't be tested on Vercel itself (the limit doesn't exist locally), so the real test was
      the Fuji photo that originally failed: **the owner re-tried it on the live site after the
      upload and it went through**, which also confirms the 4.5 MB diagnosis.
    - **Known limits:** no upload progress bar (a "Uploading" step shows instead); no resume if the
      tab closes mid-batch; the 40 MB per-photo ceiling; the upload goes straight from the browser to
      Supabase, so it needs Supabase's storage reachable from the person's network (same as the
      photos already shown on the site).

29. ✅ **Sign in with Google, and an owner-only invite page — live, and confirmed on the live site.**
    Replaces "type your email, open the emailed link" as the main way in (item 23); the emailed
    link stays as a small fallback under "No Google account?".
    - **Google sign-in.** "Continue with Google" on `/login` goes through Supabase's Google
      provider and lands on the same `/auth/callback` as the emailed link. Still invite-only:
      Supabase's open sign-ups stay off, so a Google account whose email has no waiting account
      is sent back to `/login?error=invite` ("that Google account hasn't been invited"). For an
      invited email, Google attaches to the account created in advance, so it's the same wardrobe.
      Setup done by the owner: Supabase redirect address added to the existing Google OAuth client,
      and the Google provider switched on in Supabase with that client's ID and secret.
    - **Invite page (`/invite`), instead of `scripts/create-user.mjs`.** Only the owner can open it
      (anyone else gets a 404, and the top bar's "Invite" link only appears for the owner). Type a
      friend's Google email, tap Invite: it creates their account ahead of time, same as the
      script. The page also lists everyone with an account and whether they've signed in yet.
      The owner flag is `app_metadata.role = "owner"` on the account, which only the server's
      service key can write (set with `scripts/make-owner.mjs`; done for the owner's account).
      The invite action checks ownership itself (`requireOwner`), not just the page.
    - **Considered and rejected: one-use shareable links** that any first-comer could redeem.
      It would need open sign-ups plus an "is this person approved?" check on every action
      (reopening what item 23 locked down) and a forwarded link could be claimed by the wrong
      person. Revisit only if invites ever outgrow typing an email.
    - **Known limit:** the email must match the person's Google account address exactly. A Gmail
      address with or without dots can differ, and the page says so. If they get turned away,
      check the exact address on their Google account.
    - **Verified:** `scripts/test-invites.ts` (5 checks, real database, throwaway email); in the
      running app: signed-out visitors bounced from `/invite`; the Google button reaches Google's
      account chooser with the right return address; a non-owner gets a 404 and sees no Invite
      link; the owner invites an email and the list updates. All throwaway accounts deleted.
      **Full Google sign-in:** couldn't be tested from this end (needs a real Google login); the owner
      then signed in on the live site with their own Google account and it worked.

30. ✅ **Per-person AI spend tracking — live, and confirmed on the live site (the owner saw the spend lines on the Invite page).** Every Claude and Gemini
    call writes one row to a new `ai_usage` table (who it was for, what kind of call, tokens, and an
    **estimated** cost); the Invite page (item 29) shows each person's spend this month, all time, and
    their number of AI calls, plus a total. This is tracking only: nothing stops a person at a limit yet
    (see `BACKLOG.md`, "Per-user usage limits").
    - **Why it exists.** Both providers only show account-wide totals, because every call uses the
      owner's one key. Per-person numbers have to come from the app itself.
    - **How.** `lib/usage.ts` holds the price estimates, the recorder and the totals; each AI function
      logs its own reply (`read-photo`, `find-people`, `background-removal`, `duplicate-check`,
      `correction`, `correction-retag`, `outfits`). Who a call is for travels in an
      `AsyncLocalStorage` tag set by each Server Action right after `await requireUser()`
      (`trackUsageFor`); the background tasks that run after an upload re-apply it
      (`withUsageUser`). A call with no tag is still recorded, with no person, so spend is never lost.
      Recording never throws into the app. The tag must be set *after* the first await (see the code
      comment): set before any await it would also tag the caller.
    - **Estimates, not invoices.** Prices are list-price assumptions at the top of `lib/usage.ts`
      (Claude $3 / $15 per million tokens in / out; Gemini $0.30 in, $30 per million image-output
      tokens). A real upload cost about 1.7 cents to read plus 4 cents for the background removal.
      Compare the Invite page's total with the real Anthropic and Google bills now and then and adjust.
    - **Database step (run by hand):** the `ai_usage` table and the `ai_spend_by_user()` function at the
      end of `supabase/schema.sql` (done by the owner). RLS is on with no policies; the totals function
      can only be run with the server's key. Deleting an account keeps its rows (person set to none) so
      totals stay honest. Until the table exists the Invite page says so instead of breaking.
    - **Verified:** `scripts/test-usage.ts` (23 checks against the real database: cost maths, tags
      surviving waits and not leaking between concurrent requests, per-person totals, this-month vs
      all-time, untagged calls kept, bad writes never throw, the public key reading nothing). In the
      running app on a throwaway account: a real photo upload logged both of its calls (the reading, and
      the background removal that runs after the upload) against that account, and the Invite page showed
      them. Throwaway accounts, photos and rows deleted afterwards. **Not exercised end to end:** the
      outfits, "Not quite right?" and duplicate-check calls (same tagging pattern as the upload, but not
      driven through the browser).
    - **Spend limits set the same day:** Anthropic monthly limit $25, email alert at $10, $50 prepaid
      credit bought (balance $53.84, auto-reload off). Google: $15 monthly budget alert (emails only),
      $50 prepaid Gemini credit (balance $53.64, auto-reload off). On both, the prepaid balance is the real
      hard stop; when it runs out, that provider's calls stop for everyone.

31. 🟡 **Landing page for signed-out visitors — built and checked locally, not live.** `/login` (where
    signed-out visitors already land) is now the front page. **Positioning (owner's call, 2026-11-25):**
    "an AI fashion assistant that helps you find your style"; the value is removing decision fatigue
    from everyday styling and helping people shop smarter (shopping is labelled "coming"). Sections:
    hero, "what it's for", how it works in three steps, real outfits for one piece, "working today"
    (easy wardrobe ingestion; recommended outfits) against "coming next, not built yet" (outfits that
    learn your taste, trip planning, style inspiration, photorealistic avatars, smarter shopping), a
    privacy section, and the Google sign-in button at the top and bottom (`components/Landing.tsx`,
    `app/login/page.tsx`, styles at the end of `globals.css`). Meant to be enough for someone who has
    never heard of the app to decide whether to sign in, once there are more than ~10 users.
    - **Everything shown is real.** The 16 product photos are clean catalogue shots of the owner's own
      pieces (no people in them), copied small (~244 KB total) into `public/landing/`; the tag card is
      one real piece's catalogued details; the three outfits are real output of the recommended-outfits
      feature for that piece. The "planned" list is labelled as not built. Keep it honest as features
      ship (move items across) or change.
    - **Privacy copy is deliberately narrow.** It says only the owner of an account can see a wardrobe
      in the app, that each photo is sent to Anthropic and Google to be read, and that other people in
      a photo aren't kept. It does NOT claim private storage, because wardrobe photos are in a public
      bucket (see `BACKLOG.md`).
    - **Checked:** desktop and a 390px-wide view in a real browser: no sideways scroll, single column,
      consistent outfit tile sizes, normal-width buttons. Error messages (invite, Google, link) still
      show beside the first button. **Not checked:** a real phone, and it hasn't been seen by anyone else.
    - **Not done (the next chunks):** the first-run onboarding on the empty rail and Add page, and a
      prompt after the first upload pointing to the outfits.

**Do not** start with try-on or shopping integration. They're demo-shaped and will eat the
whole timeline — confirmed P2, see §2.

### Decisions made building this (keep in sync with the PRD if they change)

- **No accounts in phase 1** *(superseded — accounts shipped, see §5 item 23)*. Single-owner
  mode was chosen deliberately so ingestion + UI could be validated before spending time on
  auth, with the rule "add accounts before inviting other people to use it". That moment
  came, and the rule held.
- **Anthropic key is server-side and owner-billed.** No more per-user pasted keys (the
  prototype's stopgap). This means the owner's own Anthropic account is billed for all
  usage — which is why the app is invite-only. Real accounts exist now, but there are still
  no per-user usage limits, so each invited person's AI usage lands on the owner's bill.
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
