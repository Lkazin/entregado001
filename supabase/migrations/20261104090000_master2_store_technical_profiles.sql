-- Perfil técnico por loja, sem segredos; UUID oficial do Master 1 é a chave.
create table if not exists public.master2_store_technical_profiles (
  store_id uuid primary key references public.master2_received_stores(id) on delete cascade,
  repository_url text not null default '',
  staging_project_ref text not null default '',
  production_project_ref text not null default '',
  updated_at timestamptz not null default now(),
  constraint master2_technical_repository check (repository_url = '' or repository_url ~ '^https://github[.]com/[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+([.]git)?$'),
  constraint master2_technical_staging check (staging_project_ref = '' or staging_project_ref ~ '^[a-z0-9]{20}$'),
  constraint master2_technical_production check (production_project_ref = '' or production_project_ref ~ '^[a-z0-9]{20}$'),
  constraint master2_distinct_supabase_environments check (
    staging_project_ref = '' or production_project_ref = '' or staging_project_ref <> production_project_ref
  )
);
create index if not exists master2_technical_updated_idx on public.master2_store_technical_profiles(updated_at desc);
alter table public.master2_store_technical_profiles enable row level security;
revoke all on public.master2_store_technical_profiles from public, anon, authenticated;
grant select, insert, update, delete on public.master2_store_technical_profiles to service_role;
