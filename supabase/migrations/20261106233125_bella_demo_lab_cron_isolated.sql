-- Aplicada ao projeto 'entregador' em 2026-11-06 (migração 20261106233125).
-- Tabelas isoladas: não alimentam pedidos reais nem o app Entregador.
create extension if not exists pg_cron;
create schema if not exists bella_internal;
revoke all on schema bella_internal from public, anon, authenticated;
create table if not exists public.bella_demo_settings (
  store_id text primary key check (store_id = 'store_bella_pizza'),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
create table if not exists public.bella_demo_orders (
  id uuid primary key default gen_random_uuid(),
  store_id text not null check (store_id = 'store_bella_pizza'),
  business_day date not null,
  slot_hour integer not null check (slot_hour between 0 and 23),
  source text not null check (source in ('daily_schedule','manual')),
  kind text not null default 'simulation' check (kind='simulation'),
  status text not null default 'recebido' check (status in ('recebido','preparando','despacho','em_entrega','concluido','cancelado')),
  customer_label text not null,
  items jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(store_id,business_day,slot_hour,source)
);
create index if not exists bella_demo_orders_day_idx on public.bella_demo_orders(business_day desc,created_at desc);
alter table public.bella_demo_settings enable row level security;
alter table public.bella_demo_orders enable row level security;
revoke all on public.bella_demo_settings from anon,authenticated;
revoke all on public.bella_demo_orders from anon,authenticated;
grant select,insert,update,delete on public.bella_demo_settings to service_role;
grant select,insert,update,delete on public.bella_demo_orders to service_role;
insert into public.bella_demo_settings(store_id,enabled) values ('store_bella_pizza',false)
on conflict(store_id) do nothing;
create or replace function bella_internal.run_bella_demo_tick()
returns integer language plpgsql security invoker set search_path = ''
as $$
declare local_date date := (now() at time zone 'America/Sao_Paulo')::date;
declare local_hour integer := extract(hour from now() at time zone 'America/Sao_Paulo')::integer;
declare inserted integer := 0;
begin
 if not exists (select 1 from public.bella_demo_settings where store_id='store_bella_pizza' and enabled) then return 0; end if;
 insert into public.bella_demo_orders(store_id,business_day,slot_hour,source,kind,status,customer_label,items,metadata)
 select 'store_bella_pizza',local_date,s.hour,'daily_schedule','simulation','recebido',
   'Cliente fictício '||s.n,
   jsonb_build_array(jsonb_build_object('name','Pizza fictícia '||s.n,'quantity',1,'price',0)),
   jsonb_build_object('non_billable',true,'no_dispatch',true,'no_notifications',true)
 from (
   select v.n, v.base_hour + (ascii(substr(md5(local_date::text||':'||v.n),1,1)) % 2) as hour
   from (values (1,10),(2,12),(3,15),(4,18),(5,21)) as v(n,base_hour)
 ) s
 where s.hour <= local_hour
 on conflict(store_id,business_day,slot_hour,source) do nothing;
 get diagnostics inserted = row_count;
 return inserted;
end;
$$;
revoke all on function bella_internal.run_bella_demo_tick() from public, anon, authenticated;
select cron.schedule('novaesweb-bella-demo-hourly','29 * * * *',$$select bella_internal.run_bella_demo_tick();$$);
