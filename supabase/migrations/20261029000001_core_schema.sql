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
