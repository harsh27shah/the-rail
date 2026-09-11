-- The Rail — database schema (Supabase / Postgres)
--
-- How to use: open your Supabase project → SQL Editor → paste this whole file → Run.
-- Safe to re-run: each statement only creates something if it doesn't already exist.
--
-- Phase 1 (see PROJECT.md §5): single-owner mode, no accounts yet, so there is no
-- `user_id` column and no row-level security. Revisit both before inviting other people.

create extension if not exists pgcrypto; -- for gen_random_uuid()

create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  color text not null default '',
  palette text[] not null default '{}',
  pattern text not null default 'solid',
  material text not null default '',
  formality smallint not null default 3,
  seasons text[] not null default '{}',
  notes text not null default '',
  image_path text,          -- path inside the `wardrobe-images` storage bucket, if any —
                             -- this is whatever should currently be *displayed* (the
                             -- original upload, or a cleaned-up/corrected version of it)
  original_image_path text, -- the true source photo, set once at upload and never
                             -- overwritten — corrections are grounded against this, not
                             -- against a possibly-already-wrong generated image
  previous_state jsonb,      -- one-level undo: the full catalogued state (fields + the
                             -- image_path) as it was just before the last correction, so
                             -- "undo this correction" can put everything back. Cleared once
                             -- undone. Null when there's nothing to undo.
  needs_review boolean not null default false, -- the tagger inferred details it couldn't
                             -- actually see (a garment partly hidden behind another layer,
                             -- cropped, folded) — surface a "check this" nudge. Cleared
                             -- when the owner edits the item (that counts as reviewing it).
  review_note text,          -- short phrase on what was inferred, e.g. "sleeve length
                             -- hidden under jacket"
  duplicate_of uuid references items(id) on delete set null, -- set on the newer of a
                             -- suspected-duplicate pair, pointing at the earlier item. Null
                             -- = not flagged. `on delete set null` so deleting the other
                             -- item (via any path, not just the duplicate-review flow)
                             -- can't leave a dangling reference.
  duplicate_note text,       -- why the model thinks so
  duplicate_confidence real, -- 0-1, for tuning the flagging threshold later
  source text,               -- originating product URL, if added via a link
  added timestamptz not null default now()
);

-- Existing tables from before these columns existed:
alter table items add column if not exists original_image_path text;
alter table items add column if not exists previous_state jsonb;
alter table items add column if not exists needs_review boolean not null default false;
alter table items add column if not exists review_note text;
alter table items add column if not exists duplicate_of uuid references items(id) on delete set null;
alter table items add column if not exists duplicate_note text;
alter table items add column if not exists duplicate_confidence real;

create index if not exists items_category_idx on items (category);
create index if not exists items_added_idx on items (added desc);
create index if not exists items_duplicate_of_idx on items (duplicate_of);

-- Storage bucket for garment photos. Public read (URLs are unguessable UUID paths, and
-- there's nothing sensitive in a photo of a shirt) — reconsider before a multi-user phase.
insert into storage.buckets (id, name, public)
values ('wardrobe-images', 'wardrobe-images', true)
on conflict (id) do nothing;
