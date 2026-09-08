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
  image_path text,          -- path inside the `wardrobe-images` storage bucket, if any
  source text,               -- originating product URL, if added via a link
  added timestamptz not null default now()
);

create index if not exists items_category_idx on items (category);
create index if not exists items_added_idx on items (added desc);

-- Storage bucket for garment photos. Public read (URLs are unguessable UUID paths, and
-- there's nothing sensitive in a photo of a shirt) — reconsider before a multi-user phase.
insert into storage.buckets (id, name, public)
values ('wardrobe-images', 'wardrobe-images', true)
on conflict (id) do nothing;
