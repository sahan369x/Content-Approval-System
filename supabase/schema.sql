-- =====================================================================
-- Content Approval System — Supabase schema
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Run it once on a fresh project.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- Team members ------------------------------------------------
create table if not exists public.members (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  role        text not null check (role in ('director', 'editor')),
  pin_hash    text,              -- only the director has a PIN; editors sign in by name
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------- Reference-video submissions --------------------------------
create table if not exists public.submissions (
  id             uuid primary key default gen_random_uuid(),
  editor_id      uuid not null references public.members(id) on delete restrict,
  title          text not null check (char_length(title) between 1 and 200),
  reference_url  text not null check (reference_url ~* '^https?://'),
  notes          text check (char_length(notes) <= 4000),
  status         text not null default 'pending'
                 check (status in ('pending', 'approved', 'rejected')),
  progress       text not null default 'not_started'
                 check (progress in ('not_started', 'in_progress', 'done')),
  trello_url     text check (trello_url ~* '^https?://([a-z0-9-]+\.)?trello\.com/'),
  created_at     timestamptz not null default now(),
  reviewed_at    timestamptz,
  reviewed_by    uuid references public.members(id) on delete set null,
  started_at     timestamptz,
  completed_at   timestamptz,
  updated_at     timestamptz not null default now(),
  -- "Delete" in the app only hides a row. Nothing is ever erased.
  deleted_at     timestamptz,
  deleted_by     uuid references public.members(id) on delete set null
);
create index if not exists submissions_editor_idx  on public.submissions (editor_id);
create index if not exists submissions_created_idx on public.submissions (created_at desc);
create index if not exists submissions_live_idx    on public.submissions (deleted_at) where deleted_at is null;

-- ---------- Comments (editor <-> director) -----------------------------
create table if not exists public.comments (
  id             uuid primary key default gen_random_uuid(),
  submission_id  uuid not null references public.submissions(id) on delete cascade,
  author_id      uuid not null references public.members(id) on delete restrict,
  body           text not null check (char_length(body) between 1 and 4000),
  created_at     timestamptz not null default now()
);
create index if not exists comments_submission_idx on public.comments (submission_id);

-- ---------- Activity log (every change, time-stamped) ------------------
create table if not exists public.activity (
  id             bigserial primary key,
  submission_id  uuid not null references public.submissions(id) on delete cascade,
  actor_id       uuid references public.members(id) on delete set null,
  action         text not null,
  detail         text,
  created_at     timestamptz not null default now()
);
create index if not exists activity_submission_idx on public.activity (submission_id);

-- ---------- Lock everything down ---------------------------------------
-- RLS on with NO policies = the public "anon" key can read/write nothing.
-- Only the website's server (using the secret key) can.
alter table public.members     enable row level security;
alter table public.submissions enable row level security;
alter table public.comments    enable row level security;
alter table public.activity    enable row level security;

-- ---------- PIN helpers (PINs are stored hashed, never in plain text) --
create or replace function public.verify_pin(p_member uuid, p_pin text)
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.members
    where id = p_member and active and pin_hash is not null and pin_hash = crypt(p_pin, pin_hash)
  );
$$;

create or replace function public.create_member(p_name text, p_role text, p_pin text default null)
returns uuid
language sql
security definer
set search_path = public, extensions
as $$
  insert into public.members (name, role, pin_hash)
  values (trim(p_name), p_role, case when p_pin is null then null else crypt(p_pin, gen_salt('bf')) end)
  returning id;
$$;

create or replace function public.set_member_pin(p_member uuid, p_pin text)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  update public.members set pin_hash = crypt(p_pin, gen_salt('bf')) where id = p_member;
$$;

revoke execute on function public.verify_pin(uuid, text)          from public, anon, authenticated;
revoke execute on function public.create_member(text, text, text) from public, anon, authenticated;
revoke execute on function public.set_member_pin(uuid, text)      from public, anon, authenticated;

-- ---------- Your team ---------------------------------------------------
-- Abdullah's PIN is 0011 (change it later from his dashboard → Team).
-- Editors have no PIN; they just pick their name.
select public.create_member('Abdullah',   'director', '0011');
select public.create_member('Amir Mahdi', 'editor');
select public.create_member('Alizera',    'editor');
select public.create_member('Sahan',      'editor');
select public.create_member('Thomas',     'editor');
select public.create_member('Jhully',     'editor');
select public.create_member('Dhruv',      'editor');
