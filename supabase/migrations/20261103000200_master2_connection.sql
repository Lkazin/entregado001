create table public.master2_received_stores (
  id uuid primary key,
  revision bigint not null check (revision > 0),
  profile jsonb not null,
  status text not null default 'pending_diagnosis',
  updated_at timestamptz not null default now()
);
create table public.master2_connection_events (
  event_id text primary key,
  store_id uuid not null,
  fingerprint text not null,
  outcome text not null,
  created_at timestamptz not null default now()
);
alter table public.master2_received_stores enable row level security;
alter table public.master2_connection_events enable row level security;
revoke all on public.master2_received_stores, public.master2_connection_events from public, anon, authenticated;
grant select, insert, update on public.master2_received_stores to service_role;
grant select, insert on public.master2_connection_events to service_role;

create function public.master2_receive_store(p_event text, p_id uuid, p_revision bigint, p_profile jsonb, p_fingerprint text)
returns text language plpgsql security invoker set search_path = '' as $$
declare previous public.master2_connection_events%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('master2:event:' || p_event, 0));
  select * into previous from public.master2_connection_events where event_id = p_event;
  if found then
    if previous.fingerprint <> p_fingerprint then return 'event_conflict'; end if;
    return previous.outcome;
  end if;
  insert into public.master2_received_stores (id, revision, profile)
    values (p_id, p_revision, p_profile)
    on conflict (id) do update set revision = excluded.revision, profile = excluded.profile, updated_at = now()
    where public.master2_received_stores.revision < excluded.revision;
  if not found then
    insert into public.master2_connection_events values (p_event, p_id, p_fingerprint, 'stale_revision', now());
    return 'stale_revision';
  end if;
  insert into public.master2_connection_events values (p_event, p_id, p_fingerprint, 'received', now());
  return 'received';
end;
$$;
revoke all on function public.master2_receive_store(text, uuid, bigint, jsonb, text) from public, anon, authenticated;
grant execute on function public.master2_receive_store(text, uuid, bigint, jsonb, text) to service_role;
