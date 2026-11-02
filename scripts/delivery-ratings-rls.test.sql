\set ON_ERROR_STOP on
begin;

-- 1. Inserção autorizada pelo backend (service_role)
insert into public.order_delivery_ratings(order_id, tracking_token, store_id, driver_id, driver_name, stars)
values ('ord-test-101', 'tk-valid-token-101', 'store_bella_pizza', 'drv_alpha', 'Carlos Silva', 5);

-- 2. Teste de unicidade: reatribuição de entregador não permite segunda avaliação do mesmo order_id
do $$ begin
  begin
    insert into public.order_delivery_ratings(order_id, tracking_token, store_id, driver_id, driver_name, stars)
    values ('ord-test-101', 'tk-valid-token-101', 'store_bella_pizza', 'drv_beta', 'João Santos', 4);
    raise exception 'Deveria falhar por duplicidade de order_id';
  exception when unique_violation then
    -- Sucesso: bloqueado por unicidade de order_id
    null;
  end;
end $$;

-- 3. Teste de unicidade por tracking_token
do $$ begin
  begin
    insert into public.order_delivery_ratings(order_id, tracking_token, store_id, driver_id, driver_name, stars)
    values ('ord-test-102', 'tk-valid-token-101', 'store_bella_pizza', 'drv_alpha', 'Carlos Silva', 3);
    raise exception 'Deveria falhar por duplicidade de tracking_token';
  exception when unique_violation then
    null;
  end;
end $$;

-- 4. Teste de restrição de nota (check constraint stars 1..5)
do $$ begin
  begin
    insert into public.order_delivery_ratings(order_id, tracking_token, store_id, driver_id, driver_name, stars)
    values ('ord-test-103', 'tk-valid-token-103', 'store_bella_pizza', 'drv_alpha', 'Carlos Silva', 6);
    raise exception 'Deveria falhar por estrelas > 5';
  exception when check_violation then
    null;
  end;

  begin
    insert into public.order_delivery_ratings(order_id, tracking_token, store_id, driver_id, driver_name, stars)
    values ('ord-test-104', 'tk-valid-token-104', 'store_bella_pizza', 'drv_alpha', 'Carlos Silva', 0);
    raise exception 'Deveria falhar por estrelas < 1';
  exception when check_violation then
    null;
  end;
end $$;

-- 5. Teste de isolamento por loja: loja diferente pode ter outro pedido com mesmo prefixo local
insert into public.order_delivery_ratings(order_id, tracking_token, store_id, driver_id, driver_name, stars)
values ('ord-storeB-101', 'tk-valid-token-storeB', 'store_outra_pizzaria', 'drv_gamma', 'Ana Paula', 4);

-- 6. Teste de permissão: acesso negado para anon e authenticated
set local role anon;
do $$ begin
  begin
    select * from public.order_delivery_ratings;
    raise exception 'Anon não deve ter permissão de leitura';
  exception when insufficient_privilege then
    null;
  end;

  begin
    insert into public.order_delivery_ratings(order_id, tracking_token, store_id, driver_id, driver_name, stars)
    values ('ord-forged', 'tk-forged', 'store_bella_pizza', 'drv_hacker', 'Invasor', 5);
    raise exception 'Anon não deve ter permissão de escrita';
  exception when insufficient_privilege then
    null;
  end;
end $$;

set local role authenticated;
do $$ begin
  begin
    select * from public.order_delivery_ratings;
    raise exception 'Authenticated não deve ter permissão de leitura direta';
  exception when insufficient_privilege then
    null;
  end;

  begin
    insert into public.order_delivery_ratings(order_id, tracking_token, store_id, driver_id, driver_name, stars)
    values ('ord-forged-auth', 'tk-forged-auth', 'store_bella_pizza', 'drv_auth', 'Auth User', 5);
    raise exception 'Authenticated não deve ter permissão de escrita direta';
  exception when insufficient_privilege then
    null;
  end;
end $$;

rollback;
select 'PASS: ratings schema, constraints, uniqueness, RLS and store isolation verified' as result;
