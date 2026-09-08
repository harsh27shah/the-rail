# The Rail — web app

The real MVP build. See `../PROJECT.md` for product context — this file is just how to run
the code.

## Running it locally

```bash
npm install
npm run dev
```

Opens at http://localhost:3000. Without any setup it runs on **placeholder data** (19
illustrated sample pieces) so the UI is fully browsable with zero configuration.

## Connecting real data

1. Copy `.env.local.example` to `.env.local`.
2. Fill in `ANTHROPIC_API_KEY` (from [console.anthropic.com](https://console.anthropic.com)).
3. Fill in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (from your Supabase project →
   Settings → Data API).
4. In your Supabase project's SQL Editor, run `supabase/schema.sql` once to create the
   `items` table and the image storage bucket.
5. Restart `npm run dev`.

Once connected, "Add a piece" actually uploads a photo, tags it with Claude, and stores it
for real — and the placeholder-data banner disappears.

## What's here (P0 only, see PROJECT.md §2)

- `/` — the storefront: hover a card for info + pairing suggestions, click to open its
  detail page, or enter "Select" mode to bulk-delete bad ingestions.
- `/item/[id]` — an item's detail page, with "styles well with" pairings you can click
  through.
- `/item/[id]/edit` — fix anything auto-tagging got wrong, or delete the piece.
- `/add` — upload a photo to catalogue a new piece.

Pairing suggestions (`src/lib/pairings.ts`) are rule-based for now (category, formality,
pattern, season) — not an AI call. See PROJECT.md §2 for the open question on whether that
stays rule-based or becomes AI-computed later; either way, no UI code changes when it does.
