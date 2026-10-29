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

    -- Entregador Teste e Vínculo com a Loja A
    INSERT INTO public.delivery_drivers (id, identity_subject, display_name, optional_phone)
    VALUES (v_driver_id, 'driver_rodrigo_silva_test', 'Rodrigo Silva (Motoboy 01)', '(11) 97777-8888')
    ON CONFLICT DO NOTHING;

    INSERT INTO public.delivery_store_memberships (id, driver_id, store_id, status, valid_from, expires_at)
    VALUES (v_membership_id, v_driver_id, v_store_a_id, 'ativo', timezone('utc'::text, now()), timezone('utc'::text, now()) + INTERVAL '30 days')
    ON CONFLICT DO NOTHING;

    INSERT INTO public.delivery_presence (driver_id, active_store_id, manual_enabled, last_heartbeat_at)
    VALUES (v_driver_id, v_store_a_id, true, timezone('utc'::text, now()))
    ON CONFLICT (driver_id) DO NOTHING;

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
