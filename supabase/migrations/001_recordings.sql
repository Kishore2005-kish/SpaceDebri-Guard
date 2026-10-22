create table if not exists public.recordings (id uuid primary key default gen_random_uuid(), record_type text not null, record_id text, payload jsonb not null, source text not null default 'sentinel', created_at timestamptz not null default now());
create index if not exists recordings_created_at_idx on public.recordings (created_at desc);
create index if not exists recordings_type_idx on public.recordings (record_type);
alter table public.recordings enable row level security;
drop policy if exists "public can read recordings" on public.recordings;
create policy "public can read recordings" on public.recordings for select using (true);
drop policy if exists "public can create recordings" on public.recordings;
create policy "public can create recordings" on public.recordings for insert with check (true);
