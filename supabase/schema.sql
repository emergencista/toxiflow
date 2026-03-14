create extension if not exists pgcrypto;

create table if not exists public.drugs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  category text not null,
  synonyms jsonb not null default '[]'::jsonb,
  toxic_dose_text text,
  toxic_dose_value numeric,
  toxic_dose_unit text,
  half_life text,
  is_dose_unknown boolean not null default false,
  alert_message text,
  clinical_presentation text,
  treatment jsonb not null default '[]'::jsonb,
  antidote jsonb,
  activated_charcoal text not null check (activated_charcoal in ('recommended', 'conditional', 'contraindicated')),
  lavage text not null check (lavage in ('consider', 'not-routine', 'contraindicated')),
  supportive_care text,
  guideline_ref text,
  notes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create or replace function public.set_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists drugs_set_timestamp on public.drugs;

create trigger drugs_set_timestamp
before update on public.drugs
for each row
execute function public.set_timestamp();

alter table public.drugs enable row level security;

drop policy if exists "Public read drugs" on public.drugs;
create policy "Public read drugs"
on public.drugs
for select
using (true);

alter table public.drugs drop constraint if exists drugs_unknown_dose_requires_alert;

alter table public.drugs
  add constraint drugs_unknown_dose_requires_alert
  check ((not is_dose_unknown) or (alert_message is not null));