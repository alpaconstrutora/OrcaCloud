-- ==========================================================================
-- vw_unit_property_map — imóvel do Comercial → unidade → torre → obra → empreendimento
-- Date: 2026-07-30
-- ==========================================================================
-- CONTEXTO
-- A ligação entre uma parcela comercial e a obra é feita hoje por casamento de
-- NOME, com `includes()` bidirecional em minúsculas
-- (utils/commercialInstallments.ts, `mergeInstallments`):
--
--     pName === sName || pName.includes(sName) || sName.includes(pName)
--
-- Isso foi escrito em fev/2024 (commercial_module), quando não existiam
-- Empreendimento nem Torre. O módulo de Empreendimentos (20261228000000, dez/2026)
-- trouxe o modelo correto, com FK, e o código nunca foi atualizado. A heurística
-- "quase sempre acerta", então nunca deu erro visível — mas "Torre A" casa com
-- "Torre A2", e a parcela vai somar na obra errada sem que ninguém descubra.
--
-- A hierarquia real já está no banco:
--
--   empreendimentos                                  ← raiz
--     └── empreendimento_towers                      ← "Torres / Blocos (= obra)"
--           ├── project_id → projects                ← a OBRA, quando multi-torre
--           └── empreendimento_units
--                 ├── commercial_property_id → commercial_properties  (venda)
--                 └── rental_property_id     → commercial_properties  (locação)
--
-- E `parcela.propertyId = deal.property_id → commercial_properties.id`
-- (commercialFinanceService.ts:122), fechando o caminho determinístico.
--
-- ⚠️ O VÍNCULO COM A OBRA MORA EM DOIS LUGARES
-- `empreendimentos.project_id` é a obra principal (empreendimento de torre
-- única) e `empreendimento_towers.project_id` é a obra por torre (multi-torre)
-- — ver empreendimentoService.ts:196-197. Hoje, nesta base, 100% das parcelas
-- chegam na obra pelo EMPREENDIMENTO e nenhuma pela torre, porque os
-- empreendimentos cadastrados são de torre única. A view expõe
-- `COALESCE(torre, empreendimento)` com a TORRE tendo precedência: é o vínculo
-- mais específico, e sem essa ordem o primeiro multi-torre cadastrado passaria
-- a atribuir todas as torres à mesma obra.
--
-- MEDIÇÃO QUE MOTIVOU A VIEW (scripts/diagnostico-vinculo-parcela-unidade.sql,
-- rodado em produção em 30/07/2026):
--   166 parcelas comerciais / R$ 2.525.116
--   166 (100%) resolvem por FK até a unidade
--   166 (100%) chegam até a obra via empreendimentos.project_id
--     0 órfãs, 0 sem propertyId, 0 com propertyId não-UUID
-- Ou seja: a troca do casamento por nome não perde nenhuma parcela.
--
-- ESCOPO DESTA MIGRATION
-- Só CREATE VIEW. Nenhum ALTER, nenhuma FK, nenhum índice novo em tabela
-- existente — DDL em tabela quente deste módulo já deadlockou antes. A view não
-- altera comportamento nenhum até o código passar a consultá-la
-- (PLANO_RENTABILIDADE_COMERCIAL.md, Fase 3.4).
--
-- Os índices de busca reversa que esta view usa já existem:
--   empr_units_commercial_prop_idx  (20261228000000)
--   empr_units_rental_prop_idx      (20270717000002)
-- ==========================================================================

-- security_invoker=on é OBRIGATÓRIO: sem ele a view roda com os privilégios do
-- dono e ignora a RLS das tabelas de baixo, virando um vazamento cross-tenant
-- de empreendimentos/unidades.
CREATE OR REPLACE VIEW public.vw_unit_property_map
WITH (security_invoker = on) AS
SELECT
    u.commercial_property_id       AS property_id,
    'SALE'::text                   AS purpose,
    u.id                           AS unit_id,
    u.name                         AS unit_name,
    u.floor                        AS unit_floor,
    u.typology                     AS unit_typology,
    tw.id                          AS tower_id,
    tw.name                        AS tower_name,
    e.id                           AS empreendimento_id,
    e.name                         AS empreendimento_name,
    e.organization_id              AS organization_id,
    -- Torre tem precedência sobre empreendimento: é o vínculo mais específico.
    COALESCE(tw.project_id, e.project_id) AS project_id,
    CASE
        WHEN tw.project_id IS NOT NULL THEN 'TOWER'
        WHEN e.project_id  IS NOT NULL THEN 'EMPREENDIMENTO'
        ELSE NULL
    END                            AS project_source
FROM public.empreendimento_units  u
JOIN public.empreendimento_towers tw ON tw.id = u.tower_id
JOIN public.empreendimentos       e  ON e.id  = tw.empreendimento_id
WHERE u.commercial_property_id IS NOT NULL

UNION ALL

SELECT
    u.rental_property_id           AS property_id,
    'RENTAL'::text                 AS purpose,
    u.id,
    u.name,
    u.floor,
    u.typology,
    tw.id,
    tw.name,
    e.id,
    e.name,
    e.organization_id,
    COALESCE(tw.project_id, e.project_id),
    CASE
        WHEN tw.project_id IS NOT NULL THEN 'TOWER'
        WHEN e.project_id  IS NOT NULL THEN 'EMPREENDIMENTO'
        ELSE NULL
    END
FROM public.empreendimento_units  u
JOIN public.empreendimento_towers tw ON tw.id = u.tower_id
JOIN public.empreendimentos       e  ON e.id  = tw.empreendimento_id
WHERE u.rental_property_id IS NOT NULL;

COMMENT ON VIEW public.vw_unit_property_map IS
'Resolve um imóvel do Comercial (commercial_properties.id) até unidade, torre, obra e empreendimento. Substitui o casamento de parcela↔obra por nome. project_id = COALESCE(torre, empreendimento), com a torre tendo precedência (multi-torre). Uma linha por (property_id, purpose): SALE via commercial_property_id, RENTAL via rental_property_id.';

-- ⚠️ NÃO É GARANTIDAMENTE 1:1. Nada no schema impede duas unidades apontarem
-- para o mesmo commercial_property_id, o que produziria duas linhas para o
-- mesmo property_id e multiplicaria linhas em quem fizer JOIN direto. Isso não
-- ocorre nesta base (a medição achou 166 parcelas resolvendo para 166 unidades),
-- mas o consumidor deve tratar a view como mapa N:1 e não como chave única.
-- O guard real seria um UNIQUE INDEX nas duas colunas — deliberadamente NÃO
-- criado aqui: é DDL em tabela quente e falharia de imediato se já existir
-- duplicata, derrubando a migration inteira.

-- View nova = REVOKE PUBLIC **e** REVOKE anon. O Supabase tem
-- `ALTER DEFAULT PRIVILEGES ... GRANT SELECT ON TABLES TO anon, authenticated,
-- service_role` no schema public: isso cria um grant EXPLÍCITO para anon no
-- momento do CREATE, e `REVOKE ... FROM PUBLIC` não toca grant explícito de
-- papel. Sem nomear anon, a view nasce legível sem autenticação — mesma lição
-- de 20270840000001.
REVOKE ALL    ON public.vw_unit_property_map FROM PUBLIC;
REVOKE ALL    ON public.vw_unit_property_map FROM anon;
GRANT  SELECT ON public.vw_unit_property_map TO   authenticated;

-- ==========================================================================
-- VERIFICAÇÃO (rodar após aplicar — o histórico de migrations deste projeto é
-- furado, então confira o EFEITO no schema, nunca o registro em schema_migrations)
--
--   -- 1. A view resolve as 166 parcelas? Espera-se 166 / 166.
--   SELECT COUNT(*) AS parcelas, COUNT(m.project_id) AS com_obra
--   FROM (
--       SELECT ((i->>'propertyId'))::uuid AS pid
--       FROM public.projects p
--       CROSS JOIN LATERAL jsonb_array_elements(
--           COALESCE(p.settings->'financialInfo'->'installments','[]'::jsonb)) i
--       WHERE NULLIF(i->>'propertyId','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
--   ) t
--   LEFT JOIN public.vw_unit_property_map m ON m.property_id = t.pid;
--
--   -- 2. anon NÃO pode ler (deve retornar 0 linhas):
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--   WHERE table_name = 'vw_unit_property_map' AND grantee = 'anon';
--
--   -- 3. security_invoker está ligado (deve conter security_invoker=true):
--   SELECT reloptions FROM pg_class WHERE relname = 'vw_unit_property_map';
-- ==========================================================================
-- FIM: 20270842000000_vw_unit_property_map.sql
-- ==========================================================================
