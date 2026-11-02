-- Migração Aditiva Mínima: Armazenamento e Unicidade de Avaliações de Entrega
-- Revisar antes de aplicar. NÃO aplicar em produção sem autorização explícita.
-- Compatível com os identificadores reais do sistema (store_id TEXT, order_id TEXT, tracking_token TEXT).

begin;

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

-- 1. Garante exatamente uma avaliação por pedido (mesmo com reatribuição de motoboy ou requisições concorrentes)
create unique index if not exists idx_order_delivery_ratings_order_id on public.order_delivery_ratings(order_id);

-- 2. Garante unicidade também por token de acompanhamento
create unique index if not exists idx_order_delivery_ratings_token on public.order_delivery_ratings(tracking_token);

-- 3. Índice para consultas e relatórios por loja
create index if not exists idx_order_delivery_ratings_store_id on public.order_delivery_ratings(store_id);

-- 4. Habilita Row Level Security
alter table public.order_delivery_ratings enable row level security;

-- 5. Revoga acesso direto da web pública (anon e authenticated) para impedir gravação pelo navegador
revoke all on public.order_delivery_ratings from public, anon, authenticated;
grant select, insert on public.order_delivery_ratings to service_role;

-- 6. Criação de políticas com validação prévia em pg_policies (sem CREATE POLICY IF NOT EXISTS inválido)
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
