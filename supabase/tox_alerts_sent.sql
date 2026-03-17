create table if not exists public.tox_alerts_sent (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  url text not null unique,
  title text,
  source text
);

create index if not exists tox_alerts_sent_created_at_idx
  on public.tox_alerts_sent (created_at desc);

alter table public.tox_alerts_sent enable row level security;

grant usage on schema public to anon, authenticated, service_role;
grant select, insert on public.tox_alerts_sent to anon, authenticated, service_role;

drop policy if exists "tox_alerts_sent_select" on public.tox_alerts_sent;
create policy "tox_alerts_sent_select"
  on public.tox_alerts_sent
  for select
  to anon, authenticated, service_role
  using (true);

drop policy if exists "tox_alerts_sent_insert" on public.tox_alerts_sent;
create policy "tox_alerts_sent_insert"
  on public.tox_alerts_sent
  for insert
  to anon, authenticated, service_role
  with check (true);

notify pgrst, 'reload schema';
