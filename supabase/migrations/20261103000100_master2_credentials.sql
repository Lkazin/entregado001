create table public.master2_credentials (
  id text primary key check (id = 'master2'),
  pin_digest text not null check (pin_digest ~ '^[a-f0-9]{64}$')
);

alter table public.master2_credentials enable row level security;
revoke all on public.master2_credentials from public, anon, authenticated;
grant select, insert, update on public.master2_credentials to service_role;
