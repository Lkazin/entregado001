-- Additive setup, server-only. Do not apply to production without authorization.
-- Phone-only recognition is explicitly unverified: it is not proof of ownership.
begin;
create table if not exists public.nw_customer_profiles (
 id uuid primary key default gen_random_uuid(), store_id text not null,
 phone text, name text not null check(char_length(name) between 1 and 120),
 deleted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(id,store_id), check(phone is null or phone ~ '^55[0-9]{10,11}$')
);
create unique index if not exists nw_customer_active_phone on public.nw_customer_profiles(store_id,phone) where deleted_at is null;
create table if not exists public.nw_customer_sessions (
 token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'), profile_id uuid not null, store_id text not null,
 expires_at timestamptz not null, revoked_at timestamptz, created_at timestamptz not null default now(),
 foreign key(profile_id,store_id) references public.nw_customer_profiles(id,store_id)
);
create index if not exists nw_customer_sessions_profile on public.nw_customer_sessions(profile_id,store_id);
create table if not exists public.nw_customer_addresses (
 id uuid primary key default gen_random_uuid(), profile_id uuid not null, store_id text not null,
 label text not null check(char_length(label) between 1 and 40), data jsonb not null check(jsonb_typeof(data)='object'),
 is_default boolean not null default false, updated_at timestamptz not null default now(),
 foreign key(profile_id,store_id) references public.nw_customer_profiles(id,store_id)
);
create index if not exists nw_customer_addresses_profile on public.nw_customer_addresses(profile_id,store_id);
create unique index if not exists nw_customer_address_default on public.nw_customer_addresses(profile_id) where is_default;
create table if not exists public.nw_customer_orders (
 store_id text not null, order_id text not null, profile_id uuid not null, tracking_token text not null,
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object'), created_at timestamptz not null default now(),
 primary key(store_id,order_id), foreign key(profile_id,store_id) references public.nw_customer_profiles(id,store_id)
);
create index if not exists nw_customer_orders_profile on public.nw_customer_orders(profile_id,store_id,created_at desc);
alter table public.nw_customer_profiles enable row level security;
alter table public.nw_customer_sessions enable row level security;
alter table public.nw_customer_addresses enable row level security;
alter table public.nw_customer_orders enable row level security;
revoke all on public.nw_customer_profiles,public.nw_customer_sessions,public.nw_customer_addresses,public.nw_customer_orders from public,anon,authenticated;
grant select,insert,update,delete on public.nw_customer_profiles,public.nw_customer_sessions,public.nw_customer_addresses,public.nw_customer_orders to service_role;

-- Row lock serializes address edits and enforces a single default per profile.
create or replace function public.nw_customer_save_address(p_profile uuid,p_store text,p_id uuid,p_label text,p_data jsonb,p_default boolean)
returns uuid language plpgsql security invoker set search_path='' as $$
declare result uuid; count_now integer;
begin
 perform 1 from public.nw_customer_profiles where id=p_profile and store_id=p_store and deleted_at is null for update;
 if not found then raise exception 'CUSTOMER_NOT_FOUND'; end if;
 select count(*) into count_now from public.nw_customer_addresses where profile_id=p_profile and store_id=p_store;
 if p_id is not null then
  perform 1 from public.nw_customer_addresses where id=p_id and profile_id=p_profile and store_id=p_store;
  if not found then raise exception 'ADDRESS_NOT_FOUND'; end if;
 elsif count_now>=10 then raise exception 'ADDRESS_LIMIT'; end if;
 if p_default or count_now=0 then
  update public.nw_customer_addresses set is_default=false where profile_id=p_profile and store_id=p_store and is_default;
 end if;
 if p_id is null then
  insert into public.nw_customer_addresses(profile_id,store_id,label,data,is_default)
   values(p_profile,p_store,p_label,p_data,p_default or count_now=0) returning id into result;
 else
  update public.nw_customer_addresses set label=p_label,data=p_data,
   is_default=p_default or count_now=1,updated_at=now()
   where id=p_id and profile_id=p_profile and store_id=p_store returning id into result;
 end if;
 return result;
end $$;
create or replace function public.nw_customer_update_profile(p_profile uuid,p_store text,p_name text,p_phone text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare current_profile public.nw_customer_profiles%rowtype; updated_profile public.nw_customer_profiles%rowtype; phone_changed boolean;
begin
 select * into current_profile from public.nw_customer_profiles where id=p_profile and store_id=p_store and deleted_at is null for update;
 if not found then return null; end if;
 phone_changed := p_phone is not null and p_phone is distinct from current_profile.phone;
 update public.nw_customer_profiles set name=coalesce(p_name,name),phone=coalesce(p_phone,phone),updated_at=now()
  where id=p_profile and store_id=p_store returning * into updated_profile;
 if phone_changed then
  update public.nw_customer_sessions set revoked_at=now() where profile_id=p_profile and store_id=p_store and revoked_at is null;
 end if;
 return to_jsonb(updated_profile)||jsonb_build_object('phone_changed',phone_changed);
end $$;
create or replace function public.nw_customer_delete_profile(p_profile uuid,p_store text)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 update public.nw_customer_profiles set deleted_at=now(),updated_at=now(),phone=null,name='Cliente excluído'
  where id=p_profile and store_id=p_store and deleted_at is null;
 if not found then return false; end if;
 update public.nw_customer_sessions set revoked_at=now() where profile_id=p_profile and store_id=p_store and revoked_at is null;
 delete from public.nw_customer_addresses where profile_id=p_profile and store_id=p_store;
 return true;
end $$;
create or replace function public.nw_customer_remove_address(p_profile uuid,p_store text,p_id uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.nw_customer_profiles where id=p_profile and store_id=p_store and deleted_at is null for update;
 if not found then return false; end if;
 delete from public.nw_customer_addresses where id=p_id and profile_id=p_profile and store_id=p_store;
 if not found then return false; end if;
 if not exists(select 1 from public.nw_customer_addresses where profile_id=p_profile and store_id=p_store and is_default) then
  update public.nw_customer_addresses set is_default=true where id=(select id from public.nw_customer_addresses
   where profile_id=p_profile and store_id=p_store order by updated_at desc,id limit 1);
 end if;
 return true;
end $$;
revoke all on function public.nw_customer_save_address(uuid,text,uuid,text,jsonb,boolean),public.nw_customer_delete_profile(uuid,text),public.nw_customer_remove_address(uuid,text,uuid),public.nw_customer_update_profile(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.nw_customer_save_address(uuid,text,uuid,text,jsonb,boolean),public.nw_customer_delete_profile(uuid,text),public.nw_customer_remove_address(uuid,text,uuid),public.nw_customer_update_profile(uuid,text,text,text) to service_role;
commit;
