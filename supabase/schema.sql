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

alter table rooms add column phase text not null default 'work';
alter table rooms add column duration_seconds integer not null default 1500;
alter table rooms add column started_at timestamptz;
alter table rooms add column is_running boolean not null default false;
alter table rooms add column completed_work integer not null default 0;

create policy "anyone can update rooms" on rooms
  for update using (true) with check (true);

-- Required for timer sync: without this, Realtime rejects postgres_changes
-- subscriptions on `rooms` with "Unable to subscribe to changes... Please
-- check Realtime is enabled for the given connect parameters" (confirmed via
-- live testing against this project — see the timer-sync task-2 report).
-- Not needed for presence, which is why the rooms-foundation task never hit
-- this.
alter publication supabase_realtime add table rooms;
