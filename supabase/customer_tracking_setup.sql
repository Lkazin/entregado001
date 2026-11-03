-- Additive setup: run once before enabling private customer tracking.
-- Anonymous Supabase Auth viewers are identities only, never driver accounts.
begin;

-- Billing/Master is authoritative. A merchant preference cannot grant a plan.
create table if not exists public.store_feature_entitlements (
  store_id text not null,
  feature text not null check (feature = 'customer_live_tracking'),
  enabled boolean not null default false,
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (store_id, feature)
);
alter table public.store_feature_entitlements enable row level security;
revoke all on public.store_feature_entitlements from public, anon, authenticated;
grant select, insert, update, delete on public.store_feature_entitlements to service_role;

create table if not exists public.customer_tracking_grants (
  viewer_id uuid not null references auth.users(id) on delete cascade,
  topic text not null check (topic ~ '^customer-tracking:[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (viewer_id, topic)
);
create index if not exists customer_tracking_grants_expiry_idx on public.customer_tracking_grants(expires_at);
alter table public.customer_tracking_grants enable row level security;
revoke all on public.customer_tracking_grants from public, anon, authenticated;
grant select on public.customer_tracking_grants to authenticated;
grant select, insert, update, delete on public.customer_tracking_grants to service_role;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='customer_tracking_grants' and policyname='tracking_viewer_reads_own_grants') then
    create policy tracking_viewer_reads_own_grants on public.customer_tracking_grants
      for select to authenticated using (viewer_id = (select auth.uid()) and expires_at > now());
  end if;
  if not exists (select 1 from pg_policies where schemaname='realtime' and tablename='messages' and policyname='tracking_private_receive') then
    create policy tracking_private_receive on realtime.messages for select to authenticated using (
      extension = 'broadcast' and exists (select 1 from public.customer_tracking_grants g
        where g.viewer_id = (select auth.uid()) and g.topic = (select realtime.topic()) and g.expires_at > now())
    );
  end if;
  -- Restrictive guard also protects this prefix if another permissive policy exists.
  if not exists (select 1 from pg_policies where schemaname='realtime' and tablename='messages' and policyname='tracking_private_receive_boundary') then
    create policy tracking_private_receive_boundary on realtime.messages as restrictive for select to authenticated using (
      (select realtime.topic()) not like 'customer-tracking:%' or
      (extension = 'broadcast' and exists (select 1 from public.customer_tracking_grants g
        where g.viewer_id = (select auth.uid()) and g.topic = (select realtime.topic()) and g.expires_at > now()))
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname='realtime' and tablename='messages' and policyname='tracking_no_unauthenticated_receive') then
    create policy tracking_no_unauthenticated_receive on realtime.messages as restrictive for select to anon
      using ((select realtime.topic()) not like 'customer-tracking:%');
  end if;
  if not exists (select 1 from pg_policies where schemaname='realtime' and tablename='messages' and policyname='tracking_server_only_publish') then
    create policy tracking_server_only_publish on realtime.messages as restrictive for insert to anon, authenticated
      with check ((select realtime.topic()) not like 'customer-tracking:%');
  end if;
end $$;

commit;
