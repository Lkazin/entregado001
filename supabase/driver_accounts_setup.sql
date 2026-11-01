-- Reviewed additive setup for central driver accounts; no existing data changes.
-- Supabase CLI is unavailable in this checkout. Apply as one migration after review.
create table public.driver_accounts (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique check (phone ~ '^\+55[1-9][0-9]{9,10}$'),
  name text not null check (char_length(name) between 3 and 100),
  vehicle_plate text not null default '',
  vehicle_model text not null default '',
  password_hash text not null,
  active_session_hash text unique,
  session_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((active_session_hash is null) = (session_expires_at is null)),
  check (active_session_hash is null or active_session_hash ~ '^[a-f0-9]{64}$')
);
alter table public.driver_accounts enable row level security;
revoke all on public.driver_accounts from public, anon, authenticated;
grant select, insert, update on public.driver_accounts to service_role;

-- Ownership is claimed only after proof of the existing merchant-issued token
-- or invite. Phone/name matching is not proof of ownership.
create table public.driver_account_memberships (
  membership_id text primary key,
  account_id uuid not null references public.driver_accounts(id),
  driver_id text not null,
  store_id text not null,
  claimed_at timestamptz not null default now()
);
create index driver_account_memberships_account_idx on public.driver_account_memberships(account_id);
alter table public.driver_account_memberships enable row level security;
revoke all on public.driver_account_memberships from public, anon, authenticated;
grant select, insert, update on public.driver_account_memberships to service_role;

create table public.driver_auth_limits (
  key_hash text primary key,
  window_start timestamptz not null,
  attempts integer not null check (attempts >= 1)
);
alter table public.driver_auth_limits enable row level security;
revoke all on public.driver_auth_limits from public, anon, authenticated;
grant select, insert, update, delete on public.driver_auth_limits to service_role;

create table public.driver_auth_events (
  id uuid primary key default gen_random_uuid(),
  event text not null check (event in ('registered','login_failed','login_session_replaced','logout','rate_limited')),
  account_id uuid references public.driver_accounts(id),
  key_hash text,
  created_at timestamptz not null default now()
);
create index driver_auth_events_created_idx on public.driver_auth_events(created_at);
alter table public.driver_auth_events enable row level security;
revoke all on public.driver_auth_events from public, anon, authenticated;
grant select, insert on public.driver_auth_events to service_role;

create function public.driver_auth_consume_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare current_attempts integer;
begin
  if p_key !~ '^[a-f0-9]{64}$' or p_limit < 1 or p_limit > 100 or p_window_seconds < 60 or p_window_seconds > 3600 then
    raise exception 'Invalid rate-limit parameters';
  end if;
  insert into public.driver_auth_limits(key_hash, window_start, attempts)
  values(p_key, clock_timestamp(), 1)
  on conflict (key_hash) do update set
    attempts = case when driver_auth_limits.window_start <= clock_timestamp() - make_interval(secs => p_window_seconds)
      then 1 else least(driver_auth_limits.attempts + 1, 1000000) end,
    window_start = case when driver_auth_limits.window_start <= clock_timestamp() - make_interval(secs => p_window_seconds)
      then clock_timestamp() else driver_auth_limits.window_start end
  returning attempts into current_attempts;
  return current_attempts <= p_limit;
end;
$$;
revoke all on function public.driver_auth_consume_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.driver_auth_consume_limit(text, integer, integer) to service_role;

-- Private authoritative logistics state. The legacy public Storage object is
-- deliberately not read by request handlers and is not overwritten here.
create table public.driver_logistics_state (
  id text primary key check (id = 'primary'),
  revision bigint not null check (revision >= 1),
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.driver_logistics_state enable row level security;
revoke all on public.driver_logistics_state from public, anon, authenticated;
grant select, insert, update on public.driver_logistics_state to service_role;

-- Serializes a driver commit against session replacement by locking the same
-- account row login updates. Session validation and the CAS write are one DB
-- transaction, so an old device cannot commit after a newer login commits.
create function public.driver_logistics_commit(
  p_state jsonb, p_revision bigint,
  p_account_id uuid default null, p_session_hash text default null
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare next_revision bigint;
begin
  if (p_account_id is null) <> (p_session_hash is null) then
    raise exception 'ACCOUNT_SESSION_REPLACED';
  end if;
  if p_account_id is not null then
    perform id from public.driver_accounts
    where id = p_account_id and active_session_hash = p_session_hash
      and session_expires_at > clock_timestamp()
    for update;
    if not found then raise exception 'ACCOUNT_SESSION_REPLACED'; end if;
  end if;
  if p_state is null or jsonb_typeof(p_state) <> 'object' or p_revision < 1 then
    raise exception 'INVALID_LOGISTICS_STATE';
  end if;
  update public.driver_logistics_state
    set state = p_state, revision = revision + 1, updated_at = clock_timestamp()
    where id = 'primary' and revision = p_revision
    returning revision into next_revision;
  if not found then raise exception 'LOGISTICS_CONFLICT'; end if;
  return next_revision;
end;
$$;
revoke all on function public.driver_logistics_commit(jsonb, bigint, uuid, text) from public, anon, authenticated;
grant execute on function public.driver_logistics_commit(jsonb, bigint, uuid, text) to service_role;
