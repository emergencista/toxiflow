create table if not exists public.admin_audit_logs (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  action text not null,
  actor text not null,
  success boolean not null default false,
  ip text not null,
  target text,
  details jsonb not null default '{}'::jsonb,
  user_agent text
);

create index if not exists admin_audit_logs_created_at_idx
  on public.admin_audit_logs (created_at desc);

create index if not exists admin_audit_logs_action_idx
  on public.admin_audit_logs (action);
node tox-radar.js
