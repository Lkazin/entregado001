-- Migração Aditiva: Expansão do Sistema de Feedback e Avaliações de Clientes (NovaesWeb)
-- Revisar antes de aplicar. NÃO aplicar em produção sem autorização explícita.
-- Adiciona suporte a avaliação separada de pedido/atendimento, avaliação do motoboy e comentário do cliente.

begin;

-- Garante existência da tabela base caso ainda não tenha sido criada
create table if not exists public.order_delivery_ratings (
  id uuid primary key default gen_random_uuid(),
  order_id text not null,
  tracking_token text not null,
  store_id text not null,
  driver_id text,
  driver_name text,
  stars integer not null check (stars between 1 and 5),
  created_at timestamptz not null default now()
);

-- Adiciona colunas para avaliação detalhada de atendimento, motoboy e comentários
alter table public.order_delivery_ratings
  add column if not exists order_number text,
  add column if not exists order_stars integer check (order_stars is null or (order_stars between 1 and 5)),
  add column if not exists driver_stars integer check (driver_stars is null or (driver_stars between 1 and 5)),
  add column if not exists comment text;

-- Garante retrocompatibilidade: preenche order_stars com stars onde estiver nulo
update public.order_delivery_ratings
set order_stars = stars
where order_stars is null;

-- Índices para unicidade e performance de consultas por loja e motoboy
create unique index if not exists idx_order_delivery_ratings_order_id on public.order_delivery_ratings(order_id);
create unique index if not exists idx_order_delivery_ratings_token on public.order_delivery_ratings(tracking_token);
create index if not exists idx_order_delivery_ratings_store_id on public.order_delivery_ratings(store_id);
create index if not exists idx_order_delivery_ratings_driver_id on public.order_delivery_ratings(driver_id);
create index if not exists idx_order_delivery_ratings_created_at on public.order_delivery_ratings(created_at desc);

-- RLS e privilégios
alter table public.order_delivery_ratings enable row level security;
revoke all on public.order_delivery_ratings from public, anon, authenticated;
grant select, insert on public.order_delivery_ratings to service_role;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'order_delivery_ratings'
      and policyname = 'service_role_all_order_delivery_ratings'
  ) then
    create policy service_role_all_order_delivery_ratings on public.order_delivery_ratings
      for all to service_role using (true) with check (true);
  end if;
end $$;

commit;
