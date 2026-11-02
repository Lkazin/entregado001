-- ==============================================================================
-- NOVAESWEB ENTREGADOR — Web Push Notifications Subscriptions
-- Migration: 20261101_push_subscriptions.sql
-- ==============================================================================

create table if not exists public.driver_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.driver_accounts(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text default '',
  device_type text default 'unknown',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists driver_push_subs_account_idx on public.driver_push_subscriptions(account_id);
create index if not exists driver_push_subs_active_idx on public.driver_push_subscriptions(is_active);

alter table public.driver_push_subscriptions enable row level security;
revoke all on public.driver_push_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on public.driver_push_subscriptions to service_role;

