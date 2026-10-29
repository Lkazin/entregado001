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
