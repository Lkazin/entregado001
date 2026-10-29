-- ====================================================================
-- SCRIPT CONSOLIDADO: full_schema_and_seed.sql
-- Projeto: Pizzaria de Testes NovaesWeb
-- Executável diretamente no SQL Editor do Supabase Dashboard
-- ====================================================================

\ir migrations/20261029000001_core_schema.sql
\ir migrations/20261029000002_logistics_schema.sql
\ir migrations/20261029000003_rls_and_security.sql
\ir migrations/20261029000004_seed_data.sql
