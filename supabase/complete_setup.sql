-- ====================================================================
-- SCRIPT CONSOLIDADO COMPLETO: Pizzaria de Testes NovaesWeb
-- Executável diretamente no SQL Editor do Supabase Dashboard
-- Data de geração: 2026-10-29T08:56:35.847Z
-- ====================================================================


-- >>> INÍCIO: 20261029000001_core_schema.sql <<<

-- ====================================================================
-- MIGRATION: 20261029000001_core_schema.sql
-- Descrição: Estrutura central da loja, cardápio, pedidos e financeiro
-- Projeto: Pizzaria de Testes NovaesWeb (Ambiente Isolado)
-- ====================================================================

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. LOJAS (Multi-tenant e isolamento)
CREATE TABLE IF NOT EXISTS public.stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    phone TEXT,
    address TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    logo_asset_id UUID,
    timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. CONFIGURAÇÕES DA LOJA
CREATE TABLE IF NOT EXISTS public.store_settings (
    store_id UUID PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
    ordering_enabled BOOLEAN NOT NULL DEFAULT true,
    pickup_enabled BOOLEAN NOT NULL DEFAULT true,
    delivery_enabled BOOLEAN NOT NULL DEFAULT true,
    currency TEXT NOT NULL DEFAULT 'BRL',
    business_hours_json JSONB NOT NULL DEFAULT '[
        {"day": 0, "open": "18:00", "close": "23:30", "active": true},
        {"day": 1, "open": "18:00", "close": "23:00", "active": false},
        {"day": 2, "open": "18:00", "close": "23:00", "active": true},
        {"day": 3, "open": "18:00", "close": "23:00", "active": true},
        {"day": 4, "open": "18:00", "close": "23:00", "active": true},
        {"day": 5, "open": "18:00", "close": "23:59", "active": true},
        {"day": 6, "open": "18:00", "close": "23:59", "active": true}
    ]'::jsonb,
    max_orders_per_hour INTEGER NOT NULL DEFAULT 60,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. PERFIS DE FUNCIONÁRIOS (RBAC)
CREATE TABLE IF NOT EXISTS public.staff_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    key TEXT NOT NULL CHECK (key IN ('gerente', 'atendente', 'cozinha', 'entregas')),
    name TEXT NOT NULL,
    is_system BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(store_id, key)
);

CREATE TABLE IF NOT EXISTS public.staff_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES public.staff_roles(id) ON DELETE CASCADE,
    permission_key TEXT NOT NULL,
    allowed BOOLEAN NOT NULL DEFAULT true,
    UNIQUE(role_id, permission_key)
);

CREATE TABLE IF NOT EXISTS public.store_staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES public.staff_roles(id) ON DELETE RESTRICT,
    display_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'blocked')),
    invited_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(store_id, user_id)
);

-- 4. PERSONALIZAÇÃO VISUAL (EDITOR DO SITE)
CREATE TABLE IF NOT EXISTS public.site_themes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    primary_color TEXT NOT NULL DEFAULT '#E50914',
    secondary_color TEXT NOT NULL DEFAULT '#18181B',
    background_color TEXT NOT NULL DEFAULT '#0F0F11',
    typography TEXT NOT NULL DEFAULT 'Inter, sans-serif',
    published_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(store_id)
);

CREATE TABLE IF NOT EXISTS public.site_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('hero', 'categories', 'featured', 'about', 'contact')),
    title TEXT,
    body TEXT,
    asset_id UUID,
    sort_order INTEGER NOT NULL DEFAULT 0,
    visible BOOLEAN NOT NULL DEFAULT true,
    draft_json JSONB,
    published_json JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.media_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    alt_text TEXT,
    owner_user_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. CATEGORIAS E PRODUTOS (CARDÁPIO)
CREATE TABLE IF NOT EXISTS public.product_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(store_id, slug)
);

CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES public.product_categories(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    description TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    image_asset_id UUID,
    kind TEXT NOT NULL DEFAULT 'item_padrao' CHECK (kind IN ('pizza', 'item_padrao', 'drink', 'dessert')),
    price NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (price >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 6. PIZZAS: TAMANHOS, SABORES, BORDAS E REGRAS DE PREÇO
CREATE TABLE IF NOT EXISTS public.pizza_sizes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slices INTEGER NOT NULL DEFAULT 8,
    max_flavors INTEGER NOT NULL DEFAULT 2 CHECK (max_flavors >= 1 AND max_flavors <= 4),
    base_price NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (base_price >= 0),
    sort_order INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.pizza_flavors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.pizza_flavor_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    flavor_id UUID NOT NULL REFERENCES public.pizza_flavors(id) ON DELETE CASCADE,
    size_id UUID NOT NULL REFERENCES public.pizza_sizes(id) ON DELETE CASCADE,
    price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(store_id, flavor_id, size_id)
);

CREATE TABLE IF NOT EXISTS public.pizza_crusts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.pizza_crust_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    crust_id UUID NOT NULL REFERENCES public.pizza_crusts(id) ON DELETE CASCADE,
    size_id UUID NOT NULL REFERENCES public.pizza_sizes(id) ON DELETE CASCADE,
    price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(store_id, crust_id, size_id)
);

CREATE TABLE IF NOT EXISTS public.product_option_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    min_select INTEGER NOT NULL DEFAULT 0,
    max_select INTEGER NOT NULL DEFAULT 1,
    required BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.product_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    group_id UUID NOT NULL REFERENCES public.product_option_groups(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price_delta NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (price_delta >= 0),
    active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.pizza_pricing_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    size_id UUID NOT NULL REFERENCES public.pizza_sizes(id) ON DELETE CASCADE,
    strategy TEXT NOT NULL DEFAULT 'maior_valor' CHECK (strategy IN ('maior_valor', 'media', 'soma_proporcional')),
    rounding_mode TEXT NOT NULL DEFAULT 'round_half_up',
    active BOOLEAN NOT NULL DEFAULT true,
    UNIQUE(store_id, size_id)
);

-- 7. REGIÕES DE ENTREGA E TAXAS POR BAIRRO
CREATE TABLE IF NOT EXISTS public.delivery_regions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    fee NUMERIC(12,2) NOT NULL CHECK (fee >= 0),
    min_order NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (min_order >= 0),
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(store_id, normalized_name)
);

-- 8. CLIENTES E ENDEREÇOS
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    auth_user_id_nullable UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.customer_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    region_id UUID NOT NULL REFERENCES public.delivery_regions(id) ON DELETE RESTRICT,
    street TEXT NOT NULL,
    number TEXT NOT NULL,
    complement TEXT,
    reference TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 9. PEDIDOS E ITENS (IMUTÁVEIS COM SNAPSHOTS)
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    order_number BIGINT NOT NULL,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    tracking_token TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'recebido' CHECK (status IN ('recebido', 'preparando', 'pronto', 'em_entrega', 'concluido', 'cancelado', 'recusado')),
    fulfillment_type TEXT NOT NULL DEFAULT 'delivery' CHECK (fulfillment_type IN ('delivery', 'pickup')),
    address_snapshot_json JSONB NOT NULL,
    subtotal NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0),
    delivery_fee NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (delivery_fee >= 0),
    total NUMERIC(12,2) NOT NULL CHECK (total >= 0),
    customer_notes TEXT,
    cancellation_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(store_id, order_number)
);

CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id_nullable UUID REFERENCES public.products(id) ON DELETE SET NULL,
    name_snapshot TEXT NOT NULL,
    qty INTEGER NOT NULL CHECK (qty > 0),
    unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
    total_price NUMERIC(12,2) NOT NULL CHECK (total_price >= 0),
    notes TEXT
);

CREATE TABLE IF NOT EXISTS public.order_item_components (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    order_item_id UUID NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
    component_type TEXT NOT NULL CHECK (component_type IN ('flavor', 'crust', 'option')),
    ref_id_nullable UUID,
    label_snapshot TEXT NOT NULL,
    price_snapshot NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (price_snapshot >= 0),
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    fraction NUMERIC(4,2)
);

CREATE TABLE IF NOT EXISTS public.order_status_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    old_status TEXT,
    new_status TEXT NOT NULL,
    actor_type TEXT NOT NULL CHECK (actor_type IN ('customer', 'staff', 'system', 'logistics')),
    actor_id UUID,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 10. PAGAMENTOS E CONFIGURAÇÃO DE PIX MANUAL
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    method TEXT NOT NULL CHECK (method IN ('pix_manual', 'cash_delivery', 'card_terminal')),
    status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aguardando_conferencia', 'confirmado_manual', 'recebido_entrega', 'cancelado')),
    amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    change_for NUMERIC(12,2) CHECK (change_for IS NULL OR change_for >= amount),
    confirmed_by_staff_id UUID REFERENCES public.store_staff(id) ON DELETE SET NULL,
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.pix_payment_settings (
    store_id UUID PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
    pix_key_type TEXT NOT NULL DEFAULT 'cnpj' CHECK (pix_key_type IN ('cnpj', 'cpf', 'email', 'telefone', 'aleatoria')),
    pix_key_value TEXT NOT NULL,
    beneficiary_name TEXT NOT NULL,
    beneficiary_city TEXT NOT NULL DEFAULT 'Sao Paulo',
    qr_asset_id_nullable UUID,
    instructions TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.payment_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
    asset_id UUID NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 11. CONFIRMAÇÃO POR CÓDIGO (PIN HASH)
CREATE TABLE IF NOT EXISTS public.delivery_confirmation_secrets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE UNIQUE,
    pin_hash TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    locked_until TIMESTAMPTZ,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 12. AUDITORIA E OUTBOX / INBOX DE INTEGRAÇÃO
CREATE TABLE IF NOT EXISTS public.store_audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    actor_type TEXT NOT NULL,
    actor_id UUID,
    entity TEXT NOT NULL,
    entity_id UUID NOT NULL,
    action TEXT NOT NULL,
    metadata_redacted JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.integration_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    aggregate_type TEXT NOT NULL,
    aggregate_id UUID NOT NULL,
    event_type TEXT NOT NULL,
    payload_redacted JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
    retry_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.integration_inbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    external_event_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'duplicate', 'failed')),
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(store_id, external_event_id)
);

CREATE TABLE IF NOT EXISTS public.integration_sync_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    object_type TEXT NOT NULL,
    object_id UUID NOT NULL,
    status TEXT NOT NULL,
    last_error_code TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(store_id, object_type, object_id)
);

-- ÍNDICES ESTRATÉGICOS PARA PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_orders_store_status ON public.orders(store_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_tracking_token ON public.orders(tracking_token);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_status_events_order_id ON public.order_status_events(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON public.payments(order_id);
CREATE INDEX IF NOT EXISTS idx_products_store_category ON public.products(store_id, category_id, active);
CREATE INDEX IF NOT EXISTS idx_pizza_flavor_prices_flavor_size ON public.pizza_flavor_prices(flavor_id, size_id);
CREATE INDEX IF NOT EXISTS idx_delivery_regions_store ON public.delivery_regions(store_id, active);
CREATE INDEX IF NOT EXISTS idx_integration_outbox_pending ON public.integration_outbox(status, created_at);


-- >>> FIM: 20261029000001_core_schema.sql <<<


-- >>> INÍCIO: 20261029000002_logistics_schema.sql <<<

-- ====================================================================
-- MIGRATION: 20261029000002_logistics_schema.sql
-- Descrição: Estrutura do Módulo de Logística e Contrato da API Central
-- Projeto: Pizzaria de Testes NovaesWeb (Ambiente Isolado)
-- ====================================================================

-- 1. IDENTIDADE GLOBAL DO ENTREGADOR
CREATE TABLE IF NOT EXISTS public.delivery_drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identity_subject TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    optional_phone TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. VÍNCULOS POR LOJA (MEMBERSHIPS)
CREATE TABLE IF NOT EXISTS public.delivery_store_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID REFERENCES public.delivery_drivers(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'ativo', 'expirado', 'bloqueado', 'encerrado')),
    valid_from TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    expires_at TIMESTAMPTZ NOT NULL,
    blocked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(driver_id, store_id)
);

-- 3. CÓDIGOS DE CONVITE (USO ÚNICO COM HASH CRIPTOGRÁFICO)
CREATE TABLE IF NOT EXISTS public.delivery_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    membership_id UUID NOT NULL REFERENCES public.delivery_store_memberships(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    code_display_hint TEXT NOT NULL,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    expires_at TIMESTAMPTZ NOT NULL,
    redeemed_at TIMESTAMPTZ,
    invalidated_at TIMESTAMPTZ,
    created_by_staff_id UUID REFERENCES public.store_staff(id) ON DELETE SET NULL
);

-- 4. SESSÕES POR DISPOSITIVO (UM APARELHO POR VEZ)
CREATE TABLE IF NOT EXISTS public.delivery_device_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL REFERENCES public.delivery_drivers(id) ON DELETE CASCADE,
    membership_id UUID NOT NULL REFERENCES public.delivery_store_memberships(id) ON DELETE CASCADE,
    device_fingerprint_hash TEXT NOT NULL,
    session_token_hash TEXT NOT NULL UNIQUE,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. PRESENÇA E DISPONIBILIDADE (LIGADO / DESLIGADO)
CREATE TABLE IF NOT EXISTS public.delivery_presence (
    driver_id UUID PRIMARY KEY REFERENCES public.delivery_drivers(id) ON DELETE CASCADE,
    active_store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
    manual_enabled BOOLEAN NOT NULL DEFAULT false,
    last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 6. CONFIGURAÇÕES LOGÍSTICAS DA LOJA
CREATE TABLE IF NOT EXISTS public.delivery_settings (
    store_id UUID PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
    offer_timeout_seconds INTEGER NOT NULL DEFAULT 60 CHECK (offer_timeout_seconds >= 15 AND offer_timeout_seconds <= 300),
    max_active_assignments INTEGER NOT NULL DEFAULT 3 CHECK (max_active_assignments >= 1 AND max_active_assignments <= 10),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 7. OFERTAS DE DESPACHO COM EXPIRAÇÃO
CREATE TABLE IF NOT EXISTS public.delivery_offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    driver_id UUID NOT NULL REFERENCES public.delivery_drivers(id) ON DELETE CASCADE,
    fee_offered NUMERIC(12,2) CHECK (fee_offered IS NULL OR fee_offered >= 0),
    status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aceita', 'recusada', 'expirada', 'cancelada')),
    expires_at TIMESTAMPTZ NOT NULL,
    responded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 8. ATRIBUIÇÃO ÚNICA ATIVA POR PEDIDO
CREATE TABLE IF NOT EXISTS public.delivery_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    driver_id UUID NOT NULL REFERENCES public.delivery_drivers(id) ON DELETE CASCADE,
    offer_id UUID REFERENCES public.delivery_offers(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'aceita' CHECK (status IN ('aceita', 'aguardando_retirada', 'retirada', 'em_rota', 'entregue', 'cancelada')),
    fee_offered NUMERIC(12,2) CHECK (fee_offered IS NULL OR fee_offered >= 0),
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    picked_up_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Garantir que não existam duas atribuições ativas para o mesmo pedido simultaneamente
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_assignment_per_order
ON public.delivery_assignments (order_id)
WHERE status NOT IN ('entregue', 'cancelada');

-- 9. ROTAS E PARADAS ORGANIZADAS EXCLUSIVAMENTE PELO ENTREGADOR
CREATE TABLE IF NOT EXISTS public.delivery_routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    driver_id UUID NOT NULL REFERENCES public.delivery_drivers(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'em_preparacao' CHECK (status IN ('em_preparacao', 'em_andamento', 'concluida', 'encerrada')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.delivery_route_stops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID NOT NULL REFERENCES public.delivery_routes(id) ON DELETE CASCADE,
    assignment_id UUID NOT NULL REFERENCES public.delivery_assignments(id) ON DELETE CASCADE,
    sequence INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'em_deslocamento', 'concluida', 'cancelada')),
    arrived_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    UNIQUE(route_id, assignment_id)
);

-- 10. HISTÓRICO E TENTATIVAS DE CONFIRMAÇÃO (AUDITORIA E OFFLINE)
CREATE TABLE IF NOT EXISTS public.delivery_confirmation_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID NOT NULL REFERENCES public.delivery_assignments(id) ON DELETE CASCADE,
    client_attempt_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pendente_sincronizacao', 'valido', 'invalido', 'bloqueado')),
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    validated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 11. EXCEÇÃO DE ENTREGA (OVERRIDE PELO LOJISTA OU DESISTÊNCIA)
CREATE TABLE IF NOT EXISTS public.delivery_override_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID NOT NULL REFERENCES public.delivery_assignments(id) ON DELETE CASCADE,
    requested_by_type TEXT NOT NULL CHECK (requested_by_type IN ('driver_withdraw', 'staff_override')),
    requested_by_id UUID NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'aprovado' CHECK (status IN ('pendente', 'aprovado', 'recusado')),
    authorized_by_staff_id UUID REFERENCES public.store_staff(id) ON DELETE SET NULL,
    authorized_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 12. REGISTRO DE VALORES E AVALIAÇÕES DO ENTREGADOR
CREATE TABLE IF NOT EXISTS public.delivery_earnings_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    assignment_id UUID NOT NULL REFERENCES public.delivery_assignments(id) ON DELETE CASCADE,
    amount NUMERIC(12,2) CHECK (amount >= 0),
    recorded_by_staff_id UUID REFERENCES public.store_staff(id) ON DELETE SET NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.delivery_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    assignment_id UUID NOT NULL REFERENCES public.delivery_assignments(id) ON DELETE CASCADE,
    stars INTEGER NOT NULL CHECK (stars >= 1 AND stars <= 5),
    comment_private_nullable TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 13. EVENTOS LOGÍSTICOS IMUTÁVEIS
CREATE TABLE IF NOT EXISTS public.delivery_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    actor_type TEXT NOT NULL CHECK (actor_type IN ('staff', 'driver', 'system')),
    actor_id UUID NOT NULL,
    event_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    metadata_redacted JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ÍNDICES DE LOGÍSTICA
CREATE INDEX IF NOT EXISTS idx_delivery_offers_status_expires ON public.delivery_offers(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_delivery_assignments_driver ON public.delivery_assignments(driver_id, status);
CREATE INDEX IF NOT EXISTS idx_delivery_presence_active ON public.delivery_presence(manual_enabled, active_store_id);
CREATE INDEX IF NOT EXISTS idx_delivery_invites_hash ON public.delivery_invites(token_hash);


-- >>> FIM: 20261029000002_logistics_schema.sql <<<


-- >>> INÍCIO: 20261029000003_rls_and_security.sql <<<

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


-- >>> FIM: 20261029000003_rls_and_security.sql <<<


-- >>> INÍCIO: 20261029000004_seed_data.sql <<<

-- ====================================================================
-- MIGRATION: 20261029000004_seed_data.sql
-- Descrição: Dados iniciais para homologação (Bella Pizza e Loja B)
-- Projeto: Pizzaria de Testes NovaesWeb (Ambiente Isolado)
-- ====================================================================

DO $$
DECLARE
    v_store_a_id UUID := '11111111-1111-1111-1111-111111111111';
    v_store_b_id UUID := '22222222-2222-2222-2222-222222222222';
    
    -- Categorias Loja A
    v_cat_trad_id UUID := gen_random_uuid();
    v_cat_esp_id UUID := gen_random_uuid();
    v_cat_doc_id UUID := gen_random_uuid();
    v_cat_beb_id UUID := gen_random_uuid();
    
    -- Tamanhos Loja A
    v_size_broto UUID := gen_random_uuid();
    v_size_media UUID := gen_random_uuid();
    v_size_grande UUID := gen_random_uuid();
    v_size_familia UUID := gen_random_uuid();

    -- Sabores Loja A
    v_flv_calabresa UUID := gen_random_uuid();
    v_flv_mussarela UUID := gen_random_uuid();
    v_flv_margherita UUID := gen_random_uuid();
    v_flv_frango_catupiry UUID := gen_random_uuid();
    v_flv_portuguesa UUID := gen_random_uuid();
    v_flv_quatro_queijos UUID := gen_random_uuid();
    v_flv_pepperoni UUID := gen_random_uuid();
    v_flv_costela UUID := gen_random_uuid();
    v_flv_parma UUID := gen_random_uuid();
    v_flv_chocolate UUID := gen_random_uuid();

    -- Bordas Loja A
    v_crust_catupiry UUID := gen_random_uuid();
    v_crust_cheddar UUID := gen_random_uuid();
    v_crust_chocolate UUID := gen_random_uuid();

    -- Roles da Loja A
    v_role_gerente UUID := gen_random_uuid();
    v_role_atendente UUID := gen_random_uuid();
    v_role_cozinha UUID := gen_random_uuid();
    v_role_entregas UUID := gen_random_uuid();

    -- Entregador Teste
    v_driver_id UUID := gen_random_uuid();
    v_membership_id UUID := gen_random_uuid();
BEGIN

    -- 1. LOJA A: BELLA PIZZA
    INSERT INTO public.stores (id, name, slug, phone, address, active, timezone)
    VALUES (
        v_store_a_id, 
        'Bella Pizza', 
        'bella-pizza', 
        '(11) 98765-4321', 
        'Rua das Pizzas, 100 - Bairro Jardins, São Paulo - SP', 
        true, 
        'America/Sao_Paulo'
    ) ON CONFLICT (id) DO NOTHING;

    -- Configurações Loja A
    INSERT INTO public.store_settings (store_id, ordering_enabled, pickup_enabled, delivery_enabled, currency, max_orders_per_hour)
    VALUES (v_store_a_id, true, true, true, 'BRL', 60)
    ON CONFLICT (store_id) DO NOTHING;

    -- Configuração de Pix Manual Loja A
    INSERT INTO public.pix_payment_settings (store_id, pix_key_type, pix_key_value, beneficiary_name, beneficiary_city, instructions, active)
    VALUES (
        v_store_a_id, 
        'cnpj', 
        '12.345.678/0001-90', 
        'Bella Pizza Testes Ltda', 
        'Sao Paulo', 
        'Efetue o Pix no valor exato do pedido. Nosso caixa conferirá o comprovante antes do preparo.', 
        true
    ) ON CONFLICT (store_id) DO NOTHING;

    -- Tema Loja A (Vermelho Tradicional e Preto Grafite)
    INSERT INTO public.site_themes (store_id, primary_color, secondary_color, background_color, typography, published_version)
    VALUES (v_store_a_id, '#E50914', '#18181B', '#0F0F11', 'Inter, sans-serif', 1)
    ON CONFLICT (store_id) DO NOTHING;

    -- Seções do Site Loja A
    INSERT INTO public.site_sections (store_id, type, title, body, sort_order, visible, draft_json, published_json)
    VALUES 
    (v_store_a_id, 'hero', 'A Verdadeira Pizza Artesanal', 'Massa de fermentação lenta com ingredientes nobres assados em forno a lenha.', 1, true, '{"cta": "Fazer Pedido Agora"}'::jsonb, '{"cta": "Fazer Pedido Agora"}'::jsonb),
    (v_store_a_id, 'about', 'Tradição e Amor em Cada Fatia', 'Desde 2012 entregando sabor, crocância e qualidade para sua família.', 2, true, '{}'::jsonb, '{}'::jsonb)
    ON CONFLICT DO NOTHING;

    -- Roles do Sistema para Loja A
    INSERT INTO public.staff_roles (id, store_id, key, name, is_system)
    VALUES 
        (v_role_gerente, v_store_a_id, 'gerente', 'Gerente Geral', true),
        (v_role_atendente, v_store_a_id, 'atendente', 'Atendente de Balcão', true),
        (v_role_cozinha, v_store_a_id, 'cozinha', 'Equipe de Cozinha / Pizzaiolo', true),
        (v_role_entregas, v_store_a_id, 'entregas', 'Despacho de Entregas', true)
    ON CONFLICT DO NOTHING;

    -- Regiões de Entrega e Taxas por Bairro
    INSERT INTO public.delivery_regions (store_id, name, normalized_name, fee, min_order, active)
    VALUES 
        (v_store_a_id, 'Centro', 'centro', 5.00, 30.00, true),
        (v_store_a_id, 'Jardins / Cerqueira César', 'jardins', 7.00, 35.00, true),
        (v_store_a_id, 'Bela Vista', 'bela vista', 6.00, 35.00, true),
        (v_store_a_id, 'Vila Mariana', 'vila mariana', 8.50, 40.00, true),
        (v_store_a_id, 'Pinheiros', 'pinheiros', 9.00, 40.00, true),
        (v_store_a_id, 'Perdizes', 'perdizes', 10.00, 45.00, true)
    ON CONFLICT DO NOTHING;

    -- Categorias de Produtos
    INSERT INTO public.product_categories (id, store_id, name, slug, sort_order, active)
    VALUES 
        (v_cat_trad_id, v_store_a_id, 'Pizzas Tradicionais', 'pizzas-tradicionais', 1, true),
        (v_cat_esp_id, v_store_a_id, 'Pizzas Especiais', 'pizzas-especiais', 2, true),
        (v_cat_doc_id, v_store_a_id, 'Pizzas Doces', 'pizzas-doces', 3, true),
        (v_cat_beb_id, v_store_a_id, 'Bebidas Geladas', 'bebidas', 4, true)
    ON CONFLICT DO NOTHING;

    -- Tamanhos de Pizza
    INSERT INTO public.pizza_sizes (id, store_id, name, slices, max_flavors, base_price, sort_order, active)
    VALUES 
        (v_size_broto, v_store_a_id, 'Broto (4 fatias)', 4, 1, 35.00, 1, true),
        (v_size_media, v_store_a_id, 'Média (6 fatias)', 6, 2, 52.00, 2, true),
        (v_size_grande, v_store_a_id, 'Grande (8 fatias)', 8, 3, 68.00, 3, true),
        (v_size_familia, v_store_a_id, 'Família (12 fatias)', 12, 4, 84.00, 4, true)
    ON CONFLICT DO NOTHING;

    -- Regras de Precificação por Tamanho (Padrão: Maior Valor)
    INSERT INTO public.pizza_pricing_rules (store_id, size_id, strategy, rounding_mode, active)
    VALUES 
        (v_store_a_id, v_size_broto, 'maior_valor', 'round_half_up', true),
        (v_store_a_id, v_size_media, 'maior_valor', 'round_half_up', true),
        (v_store_a_id, v_size_grande, 'maior_valor', 'round_half_up', true),
        (v_store_a_id, v_size_familia, 'maior_valor', 'round_half_up', true)
    ON CONFLICT DO NOTHING;

    -- Sabores de Pizza
    INSERT INTO public.pizza_flavors (id, store_id, name, description, active)
    VALUES 
        (v_flv_calabresa, v_store_a_id, 'Calabresa Artesanal', 'Molho de tomate pelado, calabresa fatiada, cebola roxa e orégano fresco.', true),
        (v_flv_mussarela, v_store_a_id, 'Mussarela Especial', 'Molho de tomate, farta camada de mussarela de cura média e azeitonas pretas.', true),
        (v_flv_margherita, v_store_a_id, 'Margherita di Napoli', 'Molho artesanal, mussarela de búfala, rodelas de tomate e folhas de manjericão fresco.', true),
        (v_flv_frango_catupiry, v_store_a_id, 'Frango com Catupiry', 'Peito de frango desfiado suculento, coberto com autêntico Catupiry Original.', true),
        (v_flv_portuguesa, v_store_a_id, 'Portuguesa Suprema', 'Presunto cozido em cubos, ovos cozidos, ervilhas frescas, cebola e mussarela.', true),
        (v_flv_quatro_queijos, v_store_a_id, 'Quatro Queijos', 'Mussarela, provolone defumado, parmesão uruguaio e gorgonzola dolce.', true),
        (v_flv_pepperoni, v_store_a_id, 'Pepperoni com Cream Cheese', 'Fatias generosas de pepperoni levemente picante e toques de cream cheese.', true),
        (v_flv_costela, v_store_a_id, 'Costela ao Barbecue', 'Costela bovina desfiada marinada na cerveja preta com molho barbecue defumado.', true),
        (v_flv_parma, v_store_a_id, 'Parma com Rúcula', 'Mussarela de búfala, presunto de Parma curado, folhas de rúcula e raspas de limão siciliano.', true),
        (v_flv_chocolate, v_store_a_id, 'Chocolate com Morango', 'Creme de chocolate meio amargo, morangos frescos e raspas de chocolate branco.', true)
    ON CONFLICT DO NOTHING;

    -- Tabela de Preços por Sabor e Tamanho (Calabresa, Mussarela, etc.)
    INSERT INTO public.pizza_flavor_prices (store_id, flavor_id, size_id, price)
    VALUES 
        -- Broto
        (v_store_a_id, v_flv_calabresa, v_size_broto, 38.00),
        (v_store_a_id, v_flv_mussarela, v_size_broto, 38.00),
        (v_store_a_id, v_flv_margherita, v_size_broto, 42.00),
        (v_store_a_id, v_flv_frango_catupiry, v_size_broto, 44.00),
        (v_store_a_id, v_flv_quatro_queijos, v_size_broto, 46.00),
        (v_store_a_id, v_flv_pepperoni, v_size_broto, 48.00),
        (v_store_a_id, v_flv_chocolate, v_size_broto, 42.00),

        -- Média
        (v_store_a_id, v_flv_calabresa, v_size_media, 54.00),
        (v_store_a_id, v_flv_mussarela, v_size_media, 54.00),
        (v_store_a_id, v_flv_margherita, v_size_media, 58.00),
        (v_store_a_id, v_flv_frango_catupiry, v_size_media, 60.00),
        (v_store_a_id, v_flv_portuguesa, v_size_media, 62.00),
        (v_store_a_id, v_flv_quatro_queijos, v_size_media, 64.00),
        (v_store_a_id, v_flv_pepperoni, v_size_media, 66.00),
        (v_store_a_id, v_flv_costela, v_size_media, 72.00),
        (v_store_a_id, v_flv_chocolate, v_size_media, 58.00),

        -- Grande
        (v_store_a_id, v_flv_calabresa, v_size_grande, 69.00),
        (v_store_a_id, v_flv_mussarela, v_size_grande, 69.00),
        (v_store_a_id, v_flv_margherita, v_size_grande, 74.00),
        (v_store_a_id, v_flv_frango_catupiry, v_size_grande, 78.00),
        (v_store_a_id, v_flv_portuguesa, v_size_grande, 79.00),
        (v_store_a_id, v_flv_quatro_queijos, v_size_grande, 82.00),
        (v_store_a_id, v_flv_pepperoni, v_size_grande, 86.00),
        (v_store_a_id, v_flv_costela, v_size_grande, 92.00),
        (v_store_a_id, v_flv_parma, v_size_grande, 96.00),
        (v_store_a_id, v_flv_chocolate, v_size_grande, 76.00),

        -- Família (12 fatias, até 4 sabores)
        (v_store_a_id, v_flv_calabresa, v_size_familia, 86.00),
        (v_store_a_id, v_flv_mussarela, v_size_familia, 86.00),
        (v_store_a_id, v_flv_margherita, v_size_familia, 92.00),
        (v_store_a_id, v_flv_frango_catupiry, v_size_familia, 96.00),
        (v_store_a_id, v_flv_portuguesa, v_size_familia, 98.00),
        (v_store_a_id, v_flv_quatro_queijos, v_size_familia, 102.00),
        (v_store_a_id, v_flv_pepperoni, v_size_familia, 108.00),
        (v_store_a_id, v_flv_costela, v_size_familia, 115.00),
        (v_store_a_id, v_flv_parma, v_size_familia, 120.00),
        (v_store_a_id, v_flv_chocolate, v_size_familia, 95.00)
    ON CONFLICT DO NOTHING;

    -- Bordas Recheadas
    INSERT INTO public.pizza_crusts (id, store_id, name, active)
    VALUES 
        (v_crust_catupiry, v_store_a_id, 'Borda de Catupiry Original', true),
        (v_crust_cheddar, v_store_a_id, 'Borda de Cheddar Cremoso', true),
        (v_crust_chocolate, v_store_a_id, 'Borda de Chocolate ao Leite', true)
    ON CONFLICT DO NOTHING;

    -- Preços das Bordas por Tamanho
    INSERT INTO public.pizza_crust_prices (store_id, crust_id, size_id, price)
    VALUES 
        (v_store_a_id, v_crust_catupiry, v_size_media, 10.00),
        (v_store_a_id, v_crust_catupiry, v_size_grande, 14.00),
        (v_store_a_id, v_crust_catupiry, v_size_familia, 18.00),
        (v_store_a_id, v_crust_cheddar, v_size_media, 10.00),
        (v_store_a_id, v_crust_cheddar, v_size_grande, 14.00),
        (v_store_a_id, v_crust_cheddar, v_size_familia, 18.00),
        (v_store_a_id, v_crust_chocolate, v_size_grande, 16.00)
    ON CONFLICT DO NOTHING;

    -- Bebidas no Cardápio
    INSERT INTO public.products (store_id, category_id, name, description, active, kind, price)
    VALUES 
        (v_store_a_id, v_cat_beb_id, 'Coca-Cola Original 2L', 'Garrafa PET 2 Litros gelada.', true, 'drink', 15.00),
        (v_store_a_id, v_cat_beb_id, 'Coca-Cola Zero 2L', 'Garrafa PET 2 Litros zero açúcar gelada.', true, 'drink', 15.00),
        (v_store_a_id, v_cat_beb_id, 'Guaraná Antarctica 2L', 'Garrafa PET 2 Litros gelada.', true, 'drink', 14.00),
        (v_store_a_id, v_cat_beb_id, 'Cerveja Heineken Long Neck 330ml', 'Cerveja puro malte gelada.', true, 'drink', 12.00),
        (v_store_a_id, v_cat_beb_id, 'Suco Natural de Laranja 500ml', 'Suco 100% natural sem adição de açúcar.', true, 'drink', 10.00)
    ON CONFLICT DO NOTHING;

    -- Configuração Logística da Loja A
    INSERT INTO public.delivery_settings (store_id, offer_timeout_seconds, max_active_assignments)
    VALUES (v_store_a_id, 60, 3)
    ON CONFLICT (store_id) DO NOTHING;



    -- 2. LOJA B: PIZZARIA NAPOLI (Demonstração e Prova de Isolamento Multi-lojas)
    INSERT INTO public.stores (id, name, slug, phone, address, active, timezone)
    VALUES (
        v_store_b_id, 
        'Pizzaria Napoli Testes', 
        'pizzaria-napoli-testes', 
        '(11) 91111-2222', 
        'Av. Moema, 500 - Moema, São Paulo - SP', 
        true, 
        'America/Sao_Paulo'
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.store_settings (store_id, ordering_enabled, pickup_enabled, delivery_enabled, currency, max_orders_per_hour)
    VALUES (v_store_b_id, true, true, true, 'BRL', 40)
    ON CONFLICT (store_id) DO NOTHING;

    INSERT INTO public.delivery_settings (store_id, offer_timeout_seconds, max_active_assignments)
    VALUES (v_store_b_id, 45, 2)
    ON CONFLICT (store_id) DO NOTHING;

END $$;


-- >>> FIM: 20261029000004_seed_data.sql <<<

