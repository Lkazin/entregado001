-- Additive first-access flow for the effective delivery database only.
-- Review and apply explicitly. Existing accounts keep normal phone/password login.
alter table public.driver_accounts add column home_address text not null default ''
  check (char_length(home_address) <= 500);

create table public.driver_first_access_invites (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique check (code_hash ~ '^[a-f0-9]{64}$'),
  name text not null check (char_length(name) between 3 and 100),
  phone text not null check (phone ~ '^\+55[1-9][0-9]{9,10}$'),
  store_id text not null,
  membership_id text not null,
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  account_id uuid references public.driver_accounts(id),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index driver_first_access_store_created_idx on public.driver_first_access_invites(store_id,created_at desc);
create index driver_first_access_phone_store_idx on public.driver_first_access_invites(phone,store_id);
alter table public.driver_first_access_invites enable row level security;
revoke all on public.driver_first_access_invites from public, anon, authenticated;
grant select, insert, update on public.driver_first_access_invites to service_role;

create function public.driver_first_access_store_key(p_store text)
returns text language sql immutable security invoker set search_path = ''
as $$ select case when btrim(p_store) in ('11111111-1111-1111-1111-111111111111','store_bella_pizza','bella-pizza')
  then 'store_bella_pizza' else btrim(p_store) end $$;
revoke all on function public.driver_first_access_store_key(text) from public, anon, authenticated;
grant execute on function public.driver_first_access_store_key(text) to service_role;

create function public.driver_first_access_phone_key(p_phone text)
returns text language sql immutable security invoker set search_path = ''
as $$ select case when length(digits) in (10,11) then '+55'||digits
  when digits ~ '^55[1-9][0-9]{9,10}$' then '+'||digits else null end
  from (select regexp_replace(coalesce(p_phone,''),'[^0-9]','','g') as digits) p $$;
revoke all on function public.driver_first_access_phone_key(text) from public, anon, authenticated;
grant execute on function public.driver_first_access_phone_key(text) to service_role;

create function public.driver_first_access_issue(
  p_name text, p_phone text, p_store_id text, p_code_hash text, p_expires_at timestamptz
)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare
  logistics jsonb; driver jsonb; driver_index integer; matches integer; revision_now bigint;
  store_key text; membership_id text; membership_expiry timestamptz; code_expiry timestamptz;
  issued public.driver_first_access_invites%rowtype; store_name text;
begin
  store_key := public.driver_first_access_store_key(p_store_id);
  if store_key is null or store_key = '' or p_phone !~ '^\+55[1-9][0-9]{9,10}$'
    or char_length(p_name) not between 3 and 100 or p_code_hash !~ '^[a-f0-9]{64}$'
    or p_expires_at <= clock_timestamp() or p_expires_at > clock_timestamp() + interval '7 days 1 minute'
  then raise exception 'DRIVER_LINK_FORBIDDEN'; end if;
  -- All mutation RPCs lock logistics first, so reissue and completion serialize
  -- with each other and with normal optimistic logistics writes.
  select state,revision into logistics,revision_now from public.driver_logistics_state where id = 'primary' for update;
  if not found then raise exception 'LOGISTICS_UNAVAILABLE'; end if;
  if exists(select 1 from public.driver_accounts where phone = p_phone) then raise exception 'ACCOUNT_EXISTS'; end if;
  select count(*) into matches from jsonb_array_elements(coalesce(logistics->'drivers','[]'::jsonb)) d
    where public.driver_first_access_store_key(d->>'storeId') = store_key
      and public.driver_first_access_phone_key(d->>'phone') = p_phone;
  if matches > 1 then raise exception 'DRIVER_LINK_FORBIDDEN'; end if;
  select d.value,(d.ordinality-1)::integer into driver,driver_index
    from jsonb_array_elements(coalesce(logistics->'drivers','[]'::jsonb)) with ordinality d(value,ordinality)
    where public.driver_first_access_store_key(d.value->>'storeId') = store_key
      and public.driver_first_access_phone_key(d.value->>'phone') = p_phone limit 1;
  if driver is not null then
    if coalesce(driver->>'status','') in ('bloqueado','revogado','vinculo_removido')
      or exists(select 1 from public.driver_account_memberships m where m.membership_id = driver->>'id')
    then raise exception 'DRIVER_LINK_FORBIDDEN'; end if;
    membership_id := driver->>'id';
    if membership_id is null or membership_id = '' then raise exception 'DRIVER_LINK_FORBIDDEN'; end if;
    membership_expiry := nullif(driver->>'expiresAt','')::timestamptz;
    if membership_expiry is null or membership_expiry <= clock_timestamp() then
      membership_expiry := clock_timestamp() + interval '7 days';
      driver := driver || jsonb_build_object('status','aguardando_motoboy','isExpired',false);
    end if;
    driver := driver || jsonb_build_object('name',p_name,'driverName',p_name,'phone',p_phone,
      'expiresAt',membership_expiry,'firstAccessPending',true,'status','aguardando_motoboy',
      'shiftStatus','aguardando_cadastro','presence','indisponivel','sessionToken',null,'tokenHash',null);
    logistics := jsonb_set(logistics,array['drivers',driver_index::text],driver,true);
  else
    membership_id := gen_random_uuid()::text;
    membership_expiry := clock_timestamp() + interval '7 days';
    select s.value->>'storeName' into store_name from jsonb_each(coalesce(logistics->'settingsByStore','{}'::jsonb)) s
      where public.driver_first_access_store_key(s.key) = store_key limit 1;
    driver := jsonb_build_object('id',membership_id,'driverId',membership_id,'name',p_name,'driverName',p_name,
      'phone',p_phone,'storeId',store_key,'storeName',coalesce(nullif(store_name,''),'Loja'),
      'status','aguardando_motoboy','shiftStatus','aguardando_cadastro','presence','indisponivel','inviteCode',null,
      'createdAt',clock_timestamp(),'expiresAt',membership_expiry,'validityDays',7,
      'firstAccessPending',true,'accountInviteVersion',1,'sessionToken',null,'tokenHash',null);
    logistics := jsonb_set(logistics,'{drivers}',coalesce(logistics->'drivers','[]'::jsonb) || jsonb_build_array(driver),true);
  end if;
  code_expiry := least(p_expires_at,membership_expiry);
  update public.driver_first_access_invites set revoked_at = clock_timestamp()
    where phone = p_phone and store_id = store_key and redeemed_at is null and revoked_at is null;
  insert into public.driver_first_access_invites(code_hash,name,phone,store_id,membership_id,expires_at)
    values(p_code_hash,p_name,p_phone,store_key,membership_id,code_expiry) returning * into issued;
  logistics := logistics || jsonb_build_object('stateVersion',greatest(coalesce((logistics->>'stateVersion')::bigint,0),revision_now)+1,'updatedAt',clock_timestamp());
  update public.driver_logistics_state set state = logistics,revision = revision_now+1,updated_at = clock_timestamp() where id = 'primary';
  return jsonb_build_object('id',issued.id,'name',issued.name,'phone',issued.phone,'expires_at',issued.expires_at);
end;
$$;
revoke all on function public.driver_first_access_issue(text,text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.driver_first_access_issue(text,text,text,text,timestamptz) to service_role;

create function public.driver_first_access_start(p_code_hash text,p_phone text)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare invite public.driver_first_access_invites%rowtype; logistics jsonb; driver jsonb;
begin
  select * into invite from public.driver_first_access_invites where code_hash = p_code_hash and phone = p_phone;
  if not found or invite.redeemed_at is not null or invite.revoked_at is not null or invite.expires_at <= clock_timestamp()
    then raise exception 'INVALID_FIRST_ACCESS_CODE'; end if;
  select state into logistics from public.driver_logistics_state where id = 'primary';
  if not found then raise exception 'LOGISTICS_UNAVAILABLE'; end if;
  select d into driver from jsonb_array_elements(coalesce(logistics->'drivers','[]'::jsonb)) d where d->>'id' = invite.membership_id limit 1;
  if driver is null or public.driver_first_access_store_key(driver->>'storeId') is distinct from invite.store_id
    or public.driver_first_access_phone_key(driver->>'phone') is distinct from invite.phone
    or coalesce(driver->>'status','') in ('bloqueado','revogado','vinculo_removido','expirado')
    or (nullif(driver->>'expiresAt','') is not null and (driver->>'expiresAt')::timestamptz <= clock_timestamp())
    or exists(select 1 from public.driver_account_memberships where membership_id = invite.membership_id)
    then raise exception 'INVALID_FIRST_ACCESS_CODE'; end if;
  if exists(select 1 from public.driver_accounts where phone = p_phone) then raise exception 'ACCOUNT_EXISTS'; end if;
  return jsonb_build_object('invite_id',invite.id,'name',invite.name,'phone',invite.phone,
    'store_name',coalesce(nullif(driver->>'storeName',''),'Loja'),'expires_at',invite.expires_at);
end;
$$;
revoke all on function public.driver_first_access_start(text,text) from public, anon, authenticated;
grant execute on function public.driver_first_access_start(text,text) to service_role;

create function public.driver_first_access_complete(
  p_invite_id uuid,p_code_hash text,p_phone text,p_password_hash text,p_home_address text,
  p_vehicle_model text,p_vehicle_plate text,p_session_hash text,p_session_expires_at timestamptz,p_challenge_expires_at timestamptz
)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare
  invite public.driver_first_access_invites%rowtype; account public.driver_accounts%rowtype;
  logistics jsonb; driver jsonb; driver_index integer; revision_now bigint; driver_id text; membership_expiry timestamptz;
begin
  select state,revision into logistics,revision_now from public.driver_logistics_state where id = 'primary' for update;
  if not found then raise exception 'LOGISTICS_UNAVAILABLE'; end if;
  select * into invite from public.driver_first_access_invites where id = p_invite_id and code_hash = p_code_hash and phone = p_phone for update;
  if not found or invite.redeemed_at is not null or invite.revoked_at is not null or invite.expires_at <= clock_timestamp()
    or p_challenge_expires_at is null or p_challenge_expires_at <= clock_timestamp()
    then raise exception 'INVALID_FIRST_ACCESS_CODE'; end if;
  select d.value,(d.ordinality-1)::integer into driver,driver_index
    from jsonb_array_elements(coalesce(logistics->'drivers','[]'::jsonb)) with ordinality d(value,ordinality)
    where d.value->>'id' = invite.membership_id limit 1;
  if driver is null or public.driver_first_access_store_key(driver->>'storeId') is distinct from invite.store_id
    or public.driver_first_access_phone_key(driver->>'phone') is distinct from invite.phone
    or coalesce(driver->>'status','') in ('bloqueado','revogado','vinculo_removido')
    or exists(select 1 from public.driver_account_memberships where membership_id = invite.membership_id)
    then raise exception 'INVALID_FIRST_ACCESS_CODE'; end if;
  if exists(select 1 from public.driver_accounts where phone = p_phone) then raise exception 'ACCOUNT_EXISTS'; end if;
  if char_length(p_home_address) not between 8 and 500 or char_length(p_vehicle_model) not between 2 and 100
    or char_length(p_vehicle_plate) > 12 or p_password_hash !~ '^scrypt\$32768\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{64}$'
    or p_session_hash !~ '^[a-f0-9]{64}$' or p_session_expires_at <= clock_timestamp()
    then raise exception 'INVALID_FIRST_ACCESS_CODE'; end if;
  insert into public.driver_accounts(phone,name,vehicle_plate,vehicle_model,password_hash,home_address,active_session_hash,session_expires_at)
    values(invite.phone,invite.name,coalesce(p_vehicle_plate,''),p_vehicle_model,p_password_hash,p_home_address,p_session_hash,p_session_expires_at)
    returning * into account;
  driver_id := coalesce(nullif(driver->>'driverId',''),driver->>'id');
  insert into public.driver_account_memberships(membership_id,account_id,driver_id,store_id)
    values(invite.membership_id,account.id,driver_id,invite.store_id);
  membership_expiry := nullif(driver->>'expiresAt','')::timestamptz;
  if membership_expiry is null or membership_expiry <= clock_timestamp() then membership_expiry := clock_timestamp()+interval '7 days'; end if;
  driver := (driver - 'home_address' - 'address') || jsonb_build_object(
    'driverId',driver_id,'accountId',account.id,'name',invite.name,'driverName',invite.name,'phone',invite.phone,
    'vehiclePlate',account.vehicle_plate,'vehicleModel',account.vehicle_model,
    'status','ativo','shiftStatus','em_plantao','presence','disponivel','isExpired',false,'firstAccessPending',false,
    'firstAccessCompletedAt',clock_timestamp(),'expiresAt',membership_expiry,
    'activatedAt',coalesce(nullif(driver->>'activatedAt',''),clock_timestamp()::text),'sessionToken',null,'tokenHash',null);
  logistics := jsonb_set(logistics,array['drivers',driver_index::text],driver,true);
  -- Preserve assignments/history exactly. Only pending broadcast eligibility
  -- gains this same preserved driver ID and membership ID.
  logistics := jsonb_set(logistics,'{offers}',coalesce((select jsonb_agg(case
    when public.driver_first_access_store_key(o->>'storeId') = invite.store_id and o->>'status' = 'pendente'
      and (o->>'distributionMode' = 'broadcast_enabled' or (nullif(o->>'targetDriverId','') is null and nullif(o->>'driverId','') is null))
      and jsonb_typeof(o->'eligibleDriverIds') = 'array'
    then jsonb_set(o,'{eligibleDriverIds}',(select jsonb_agg(v) from (select distinct value as v
      from jsonb_array_elements((o->'eligibleDriverIds') || jsonb_build_array(driver_id,invite.membership_id))) eligible))
    else o end) from jsonb_array_elements(coalesce(logistics->'offers','[]'::jsonb)) o),'[]'::jsonb),true);
  logistics := logistics || jsonb_build_object('stateVersion',greatest(coalesce((logistics->>'stateVersion')::bigint,0),revision_now)+1,'updatedAt',clock_timestamp());
  update public.driver_logistics_state set state = logistics,revision = revision_now+1,updated_at = clock_timestamp() where id = 'primary';
  update public.driver_first_access_invites set redeemed_at = clock_timestamp(),account_id = account.id where id = invite.id;
  insert into public.driver_auth_events(event,account_id) values('registered',account.id);
  return jsonb_build_object('id',account.id,'name',account.name,'phone',account.phone,'vehicle_plate',account.vehicle_plate,
    'vehicle_model',account.vehicle_model,'home_address',account.home_address,'created_at',account.created_at);
end;
$$;
revoke all on function public.driver_first_access_complete(uuid,text,text,text,text,text,text,text,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.driver_first_access_complete(uuid,text,text,text,text,text,text,text,timestamptz,timestamptz) to service_role;
