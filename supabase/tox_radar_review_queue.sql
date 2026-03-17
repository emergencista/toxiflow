create table if not exists public.tox_radar_review_queue (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  applied_at timestamptz,
  status text not null default 'pending',
  drug_slug text not null,
  drug_name text not null,
  article_url text not null,
  article_title text,
  source text,
  update_scope text,
  suggested_alert_message text,
  suggested_clinical_presentation text,
  review_notes text,
  reviewed_by text,
  constraint tox_radar_review_queue_status_check check (status in ('pending', 'approved', 'rejected', 'applied')),
  constraint tox_radar_review_queue_unique_drug_article unique (drug_slug, article_url)
);

create index if not exists tox_radar_review_queue_status_idx
  on public.tox_radar_review_queue (status, created_at desc);

create index if not exists tox_radar_review_queue_drug_slug_idx
  on public.tox_radar_review_queue (drug_slug);

create or replace function public.set_tox_radar_review_queue_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_tox_radar_review_queue_updated_at on public.tox_radar_review_queue;
create trigger trg_tox_radar_review_queue_updated_at
before update on public.tox_radar_review_queue
for each row
execute function public.set_tox_radar_review_queue_updated_at();

alter table public.tox_radar_review_queue enable row level security;

grant usage on schema public to service_role;
grant select, insert, update on public.tox_radar_review_queue to service_role;

drop policy if exists tox_radar_review_queue_service_role_all on public.tox_radar_review_queue;
create policy tox_radar_review_queue_service_role_all
  on public.tox_radar_review_queue
  for all
  to service_role
  using (true)
  with check (true);

notify pgrst, 'reload schema';
