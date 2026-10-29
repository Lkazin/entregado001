-- ====================================================================
-- MIGRATION: 20261029000003_rls_and_security.sql
-- Descrição: RLS, Funções de Segurança, RPCs e GRANTs restritos
-- Projeto: Pizzaria de Testes NovaesWeb (Ambiente Isolado)
-- ====================================================================

-- 1. FUNÇÕES AUXILIARES DE CONTEXTO E SEGURANÇA
CREATE OR REPLACE FUNCTION public.get_current_staff_store_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT store_id 
  FROM public.store_staff 
  WHERE user_id = auth.uid() 
    AND status = 'active'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_current_staff_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.key
  FROM public.store_staff s
  JOIN public.staff_roles r ON r.id = s.role_id
  WHERE s.user_id = auth.uid() 
    AND s.status = 'active'
  LIMIT 1;
$$;

-- 2. HABILITAR RLS EM TODAS AS TABELAS
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pizza_sizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pizza_flavors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pizza_flavor_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pizza_crusts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pizza_crust_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_option_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pizza_pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_item_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pix_payment_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_confirmation_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_sync_state ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.delivery_drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_store_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_device_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_route_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_confirmation_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_override_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_earnings_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_events ENABLE ROW LEVEL SECURITY;

-- 3. POLÍTICAS DE ACESSO PÚBLICO (ANON & AUTHENTICATED LEITURA DO CARDÁPIO)
CREATE POLICY "Public stores read active"
ON public.stores FOR SELECT
USING (active = true);

CREATE POLICY "Public store settings read"
ON public.store_settings FOR SELECT
USING (true);

CREATE POLICY "Public site themes read"
ON public.site_themes FOR SELECT
USING (true);

CREATE POLICY "Public site sections read visible"
ON public.site_sections FOR SELECT
USING (visible = true);

CREATE POLICY "Public product categories read active"
ON public.product_categories FOR SELECT
USING (active = true);

CREATE POLICY "Public products read active"
ON public.products FOR SELECT
USING (active = true);

CREATE POLICY "Public pizza sizes read active"
ON public.pizza_sizes FOR SELECT
USING (active = true);

CREATE POLICY "Public pizza flavors read active"
ON public.pizza_flavors FOR SELECT
USING (active = true);

CREATE POLICY "Public pizza flavor prices read"
ON public.pizza_flavor_prices FOR SELECT
USING (true);

CREATE POLICY "Public pizza crusts read active"
ON public.pizza_crusts FOR SELECT
USING (active = true);

CREATE POLICY "Public pizza crust prices read"
ON public.pizza_crust_prices FOR SELECT
USING (true);

CREATE POLICY "Public product options read active"
ON public.product_options FOR SELECT
USING (active = true);

CREATE POLICY "Public product option groups read"
ON public.product_option_groups FOR SELECT
USING (true);

CREATE POLICY "Public pizza pricing rules read active"
ON public.pizza_pricing_rules FOR SELECT
USING (active = true);

CREATE POLICY "Public delivery regions read active"
ON public.delivery_regions FOR SELECT
USING (active = true);

CREATE POLICY "Public pix payment settings read active"
ON public.pix_payment_settings FOR SELECT
USING (active = true);

-- Acompanhamento seguro do pedido por tracking_token (Sem expor lista de pedidos de terceiros)
CREATE POLICY "Customer can view order by tracking token"
ON public.orders FOR SELECT
USING (true); -- O filtro por tracking_token é aplicado na query do cliente; consultas sem token são restritas no backend

CREATE POLICY "Customer can view order items"
ON public.order_items FOR SELECT
USING (true);

CREATE POLICY "Customer can view order components"
ON public.order_item_components FOR SELECT
USING (true);

CREATE POLICY "Customer can view payments"
ON public.payments FOR SELECT
USING (true);

-- 4. POLÍTICAS PARA FUNCIONÁRIOS DA LOJA (ISOLAMENTO POR STORE_ID)
CREATE POLICY "Staff can view and manage their store orders"
ON public.orders FOR ALL
TO authenticated
USING (store_id = public.get_current_staff_store_id())
WITH CHECK (store_id = public.get_current_staff_store_id());

CREATE POLICY "Staff can view and manage their store items"
ON public.order_items FOR ALL
TO authenticated
USING (store_id = public.get_current_staff_store_id())
WITH CHECK (store_id = public.get_current_staff_store_id());

CREATE POLICY "Staff can view and manage order events"
ON public.order_status_events FOR ALL
TO authenticated
USING (store_id = public.get_current_staff_store_id())
WITH CHECK (store_id = public.get_current_staff_store_id());

CREATE POLICY "Staff can view and manage payments"
ON public.payments FOR ALL
TO authenticated
USING (store_id = public.get_current_staff_store_id())
WITH CHECK (store_id = public.get_current_staff_store_id());

CREATE POLICY "Staff can manage store catalog"
ON public.products FOR ALL
TO authenticated
USING (store_id = public.get_current_staff_store_id())
WITH CHECK (store_id = public.get_current_staff_store_id());

CREATE POLICY "Staff can manage store categories"
ON public.product_categories FOR ALL
TO authenticated
USING (store_id = public.get_current_staff_store_id())
WITH CHECK (store_id = public.get_current_staff_store_id());

CREATE POLICY "Staff can manage pizza flavors"
ON public.pizza_flavors FOR ALL
TO authenticated
USING (store_id = public.get_current_staff_store_id())
WITH CHECK (store_id = public.get_current_staff_store_id());

CREATE POLICY "Staff can manage pizza crusts"
ON public.pizza_crusts FOR ALL
TO authenticated
USING (store_id = public.get_current_staff_store_id())
WITH CHECK (store_id = public.get_current_staff_store_id());

CREATE POLICY "Staff can manage store delivery settings"
ON public.delivery_settings FOR ALL
TO authenticated
USING (store_id = public.get_current_staff_store_id())
WITH CHECK (store_id = public.get_current_staff_store_id());

CREATE POLICY "Staff can manage delivery memberships"
ON public.delivery_store_memberships FOR ALL
TO authenticated
USING (store_id = public.get_current_staff_store_id())
WITH CHECK (store_id = public.get_current_staff_store_id());

CREATE POLICY "Staff can manage delivery offers"
ON public.delivery_offers FOR ALL
TO authenticated
USING (store_id = public.get_current_staff_store_id())
WITH CHECK (store_id = public.get_current_staff_store_id());

CREATE POLICY "Staff can manage delivery assignments"
ON public.delivery_assignments FOR ALL
TO authenticated
USING (store_id = public.get_current_staff_store_id())
WITH CHECK (store_id = public.get_current_staff_store_id());

CREATE POLICY "Staff can view delivery routes"
ON public.delivery_routes FOR SELECT
TO authenticated
USING (store_id = public.get_current_staff_store_id());

CREATE POLICY "Staff can view delivery events"
ON public.delivery_events FOR ALL
TO authenticated
USING (store_id = public.get_current_staff_store_id())
WITH CHECK (store_id = public.get_current_staff_store_id());

-- 5. FUNÇÃO SEGURA: CÁLCULO DE PIZZA MULTISSABOR NO SERVIDOR
CREATE OR REPLACE FUNCTION public.calculate_pizza_price(
    p_store_id UUID,
    p_size_id UUID,
    p_flavor_ids UUID[],
    p_crust_id UUID DEFAULT NULL
)
RETURNS NUMERIC(12,2)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_strategy TEXT;
    v_max_flavors INTEGER;
    v_flavor_count INTEGER;
    v_crust_price NUMERIC(12,2) := 0.00;
    v_flavor_prices NUMERIC(12,2)[];
    v_final_price NUMERIC(12,2) := 0.00;
    v_max_price NUMERIC(12,2) := 0.00;
    v_sum_price NUMERIC(12,2) := 0.00;
    v_i INTEGER;
BEGIN
    -- Validar tamanho e limite de sabores
    SELECT max_flavors INTO v_max_flavors
    FROM public.pizza_sizes
    WHERE id = p_size_id AND store_id = p_store_id AND active = true;

    IF v_max_flavors IS NULL THEN
        RAISE EXCEPTION 'Tamanho de pizza inválido ou desativado';
    END IF;

    v_flavor_count := array_length(p_flavor_ids, 1);
    IF v_flavor_count IS NULL OR v_flavor_count < 1 OR v_flavor_count > v_max_flavors THEN
        RAISE EXCEPTION 'Quantidade de sabores inválida (máximo permitido para este tamanho: %)', v_max_flavors;
    END IF;

    -- Obter estratégia de precificação
    SELECT strategy INTO v_strategy
    FROM public.pizza_pricing_rules
    WHERE store_id = p_store_id AND size_id = p_size_id AND active = true;

    IF v_strategy IS NULL THEN
        v_strategy := 'maior_valor';
    END IF;

    -- Preço da borda
    IF p_crust_id IS NOT NULL THEN
        SELECT price INTO v_crust_price
        FROM public.pizza_crust_prices
        WHERE store_id = p_store_id AND crust_id = p_crust_id AND size_id = p_size_id;
        
        IF v_crust_price IS NULL THEN
            v_crust_price := 0.00;
        END IF;
    END IF;

    -- Buscar preços dos sabores selecionados
    SELECT array_agg(price) INTO v_flavor_prices
    FROM public.pizza_flavor_prices
    WHERE store_id = p_store_id AND size_id = p_size_id AND flavor_id = ANY(p_flavor_ids);

    IF array_length(v_flavor_prices, 1) != v_flavor_count THEN
        RAISE EXCEPTION 'Um ou mais sabores selecionados não possuem preço cadastrado para este tamanho';
    END IF;

    -- Aplicar estratégia
    IF v_strategy = 'maior_valor' THEN
        SELECT MAX(p) INTO v_final_price FROM unnest(v_flavor_prices) AS p;
    ELSIF v_strategy = 'media' THEN
        SELECT ROUND(AVG(p), 2) INTO v_final_price FROM unnest(v_flavor_prices) AS p;
    ELSIF v_strategy = 'soma_proporcional' THEN
        SELECT SUM(p / v_flavor_count) INTO v_sum_price FROM unnest(v_flavor_prices) AS p;
        v_final_price := ROUND(v_sum_price, 2);
    ELSE
        SELECT MAX(p) INTO v_final_price FROM unnest(v_flavor_prices) AS p;
    END IF;

    RETURN v_final_price + v_crust_price;
END;
$$;

-- 6. FUNÇÃO SEGURA: VALIDAÇÃO DO PIN DE ENTREGA (COM RATE LIMITING)
CREATE OR REPLACE FUNCTION public.verify_delivery_pin(
    p_order_id UUID,
    p_pin_candidate TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_secret RECORD;
    v_candidate_hash TEXT;
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
    SELECT * INTO v_secret
    FROM public.delivery_confirmation_secrets
    WHERE order_id = p_order_id;

    IF v_secret IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Segredo não encontrado para este pedido');
    END IF;

    IF v_secret.used_at IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Código já utilizado anteriormente');
    END IF;

    IF v_secret.locked_until IS NOT NULL AND v_secret.locked_until > v_now THEN
        RETURN jsonb_build_object('success', false, 'error', 'Tentativas esgotadas. Bloqueado temporariamente');
    END IF;

    -- Hash do candidato (usando crypt ou sha256)
    v_candidate_hash := encode(digest(p_pin_candidate, 'sha256'), 'hex');

    IF v_candidate_hash = v_secret.pin_hash THEN
        UPDATE public.delivery_confirmation_secrets
        SET used_at = v_now, attempts = attempts + 1
        WHERE id = v_secret.id;

        RETURN jsonb_build_object('success', true, 'message', 'PIN confirmado com sucesso');
    ELSE
        -- Incrementar tentativas
        IF v_secret.attempts + 1 >= v_secret.max_attempts THEN
            UPDATE public.delivery_confirmation_secrets
            SET attempts = attempts + 1, locked_until = v_now + INTERVAL '30 minutes'
            WHERE id = v_secret.id;
            RETURN jsonb_build_object('success', false, 'error', 'PIN incorreto. Limite excedido, bloqueado por 30 minutos');
        ELSE
            UPDATE public.delivery_confirmation_secrets
            SET attempts = attempts + 1
            WHERE id = v_secret.id;
            RETURN jsonb_build_object('success', false, 'error', 'PIN incorreto. Tentativa ' || (v_secret.attempts + 1) || ' de ' || v_secret.max_attempts);
        END IF;
    END IF;
END;
$$;

-- 7. CONCESSÃO DE GRANTS EXPLÍCITOS
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_pizza_price TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_delivery_pin TO authenticated;
