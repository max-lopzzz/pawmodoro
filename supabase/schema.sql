-- Run this in the Supabase SQL editor once the project exists.
-- Also enable Authentication → Providers → Anonymous Sign-Ins.

create table rooms (
  id uuid primary key default gen_random_uuid(),
  join_code text unique not null,
  created_at timestamptz not null default now()
);

alter table rooms enable row level security;

create policy "anyone can read rooms" on rooms
  for select using (true);

create policy "anyone can create rooms" on rooms
  for insert with check (true);
