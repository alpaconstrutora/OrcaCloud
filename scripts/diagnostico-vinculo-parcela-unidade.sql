-- ════════════════════════════════════════════════════════════════════════════
-- DIAGNÓSTICO — Parcela comercial → Unidade → Torre → Obra → Empreendimento
--
-- Mede o tamanho do problema ANTES da Fase 3.4 de PLANO_RENTABILIDADE_COMERCIAL.md:
-- quantas parcelas comerciais conseguem ser ligadas à obra pelo caminho de FK
-- (determinístico) e quantas hoje só se ligam pelo casamento de NOME
-- (`includes()` bidirecional em utils/commercialInstallments.ts).
--
-- O caminho determinístico é:
--   parcela.propertyId  →  commercial_properties.id
--                       →  empreendimento_units.commercial_property_id  (venda)
--                       ou empreendimento_units.rental_property_id      (locação)
--                       →  empreendimento_towers.project_id   = A OBRA
--                       →  empreendimento_towers.empreendimento_id
--
-- ⚠️ SOMENTE LEITURA. Nenhum INSERT/UPDATE/DELETE/DDL. Pode rodar em produção.
--
-- As parcelas NÃO estão em tabela: vivem como JSON em
-- `projects.settings.financialInfo.installments` (é justamente o que a Fase 0.2
-- do plano de Vendas pretende migrar). Por isso o `jsonb_array_elements`.
--
-- Rode um BLOCO por vez no SQL Editor do Supabase.
-- ════════════════════════════════════════════════════════════════════════════


-- ─── BLOCO 1 — Resumo geral (um número por linha) ───────────────────────────
-- É este que decide o tamanho da Fase 3.4.

WITH parcelas AS (
    SELECT
        p.id   AS project_id,
        p.name AS project_name,
        i      AS parcela
    FROM public.projects p
    CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(p.settings->'financialInfo'->'installments', '[]'::jsonb)
    ) AS i
),
norm AS (
    SELECT
        project_id,
        project_name,
        NULLIF(parcela->>'propertyId', '')   AS property_id_raw,
        NULLIF(parcela->>'propertyName', '') AS property_name,
        parcela->>'status'                   AS status,
        COALESCE((parcela->>'value')::numeric, 0) AS value
    FROM parcelas
),
tipada AS (
    SELECT
        n.*,
        -- Só tenta o cast quando o texto tem cara de UUID: `propertyId` já
        -- recebeu lixo (nome, string vazia) em dado legado.
        CASE
            WHEN n.property_id_raw ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN n.property_id_raw::uuid
        END AS property_id
    FROM norm n
),
resolvida AS (
    SELECT
        t.*,
        u.id       AS unit_id,
        tw.project_id      AS obra_id,
        tw.empreendimento_id
    FROM tipada t
    LEFT JOIN public.empreendimento_units u
           ON u.commercial_property_id = t.property_id
           OR u.rental_property_id     = t.property_id
    LEFT JOIN public.empreendimento_towers tw ON tw.id = u.tower_id
)
SELECT metrica, qtd, valor_total FROM (
    SELECT 1 AS ord, 'Parcelas comerciais (total)' AS metrica,
           COUNT(*) AS qtd, SUM(value) AS valor_total
      FROM resolvida
    UNION ALL
    SELECT 2, '  ├─ sem propertyId (só nome pode ligar)',
           COUNT(*), SUM(value)
      FROM resolvida WHERE property_id IS NULL
    UNION ALL
    SELECT 3, '  │    └─ destas, propertyId com lixo (não-UUID)',
           COUNT(*), SUM(value)
      FROM resolvida WHERE property_id IS NULL AND property_id_raw IS NOT NULL
    UNION ALL
    SELECT 4, '  └─ com propertyId válido',
           COUNT(*), SUM(value)
      FROM resolvida WHERE property_id IS NOT NULL
    UNION ALL
    SELECT 5, '       ├─ RESOLVE por FK até a unidade',
           COUNT(*), SUM(value)
      FROM resolvida WHERE unit_id IS NOT NULL
    UNION ALL
    SELECT 6, '       │    └─ e a torre tem obra (project_id) vinculada',
           COUNT(*), SUM(value)
      FROM resolvida WHERE unit_id IS NOT NULL AND obra_id IS NOT NULL
    UNION ALL
    SELECT 7, '       │    └─ torre SEM obra vinculada (project_id NULL)',
           COUNT(*), SUM(value)
      FROM resolvida WHERE unit_id IS NOT NULL AND obra_id IS NULL
    UNION ALL
    SELECT 8, '       └─ NÃO resolve (órfão / não publicado / legado)  ← o custo da 3.4',
           COUNT(*), SUM(value)
      FROM resolvida WHERE property_id IS NOT NULL AND unit_id IS NULL
) x
ORDER BY ord;


-- ─── BLOCO 2 — Quebra por projeto ───────────────────────────────────────────
-- Mostra onde o problema se concentra. "Gestão Comercial" é o cofre; as demais
-- linhas são obras que têm parcelas próprias.

WITH parcelas AS (
    SELECT p.id AS project_id, p.name AS project_name, i AS parcela
    FROM public.projects p
    CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(p.settings->'financialInfo'->'installments', '[]'::jsonb)
    ) AS i
),
tipada AS (
    SELECT
        project_id, project_name,
        CASE
            WHEN NULLIF(parcela->>'propertyId','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN (parcela->>'propertyId')::uuid
        END AS property_id,
        COALESCE((parcela->>'value')::numeric, 0) AS value
    FROM parcelas
)
SELECT
    t.project_name                                              AS projeto,
    COUNT(*)                                                    AS parcelas,
    COUNT(*) FILTER (WHERE u.id IS NOT NULL)                    AS resolve_por_fk,
    COUNT(*) FILTER (WHERE t.property_id IS NOT NULL AND u.id IS NULL) AS nao_resolve,
    COUNT(*) FILTER (WHERE t.property_id IS NULL)               AS sem_property_id,
    ROUND(
        100.0 * COUNT(*) FILTER (WHERE u.id IS NOT NULL) / NULLIF(COUNT(*), 0)
    , 1)                                                        AS pct_resolvido,
    SUM(t.value) FILTER (WHERE t.property_id IS NOT NULL AND u.id IS NULL) AS valor_nao_resolvido
FROM tipada t
LEFT JOIN public.empreendimento_units u
       ON u.commercial_property_id = t.property_id
       OR u.rental_property_id     = t.property_id
GROUP BY t.project_name
ORDER BY nao_resolve DESC, parcelas DESC;


-- ─── BLOCO 3 — Amostra do que NÃO resolve (para inspeção manual) ────────────
-- Cada linha aqui é uma parcela que hoje é atribuída por NOME e que, depois da
-- Fase 3.4, apareceria como "sem vínculo de unidade" até alguém religar.

WITH parcelas AS (
    SELECT p.id AS project_id, p.name AS project_name, i AS parcela
    FROM public.projects p
    CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(p.settings->'financialInfo'->'installments', '[]'::jsonb)
    ) AS i
),
tipada AS (
    SELECT
        project_name,
        parcela->>'description' AS descricao,
        parcela->>'propertyName' AS imovel_na_parcela,
        parcela->>'status'       AS status,
        parcela->>'dueDate'      AS vencimento,
        COALESCE((parcela->>'value')::numeric, 0) AS valor,
        NULLIF(parcela->>'propertyId','') AS property_id_raw,
        CASE
            WHEN NULLIF(parcela->>'propertyId','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN (parcela->>'propertyId')::uuid
        END AS property_id
    FROM parcelas
)
SELECT
    t.project_name AS projeto,
    t.imovel_na_parcela,
    t.descricao,
    t.status,
    t.vencimento,
    t.valor,
    t.property_id_raw,
    CASE
        WHEN t.property_id IS NULL AND t.property_id_raw IS NULL THEN 'sem propertyId'
        WHEN t.property_id IS NULL                               THEN 'propertyId não-UUID'
        WHEN cp.id IS NULL                                       THEN 'imóvel não existe mais (órfão)'
        ELSE                                                          'imóvel existe, mas não é unidade de empreendimento'
    END AS motivo
FROM tipada t
LEFT JOIN public.empreendimento_units u
       ON u.commercial_property_id = t.property_id
       OR u.rental_property_id     = t.property_id
LEFT JOIN public.commercial_properties cp ON cp.id = t.property_id
WHERE u.id IS NULL
ORDER BY t.valor DESC
LIMIT 100;


-- ─── BLOCO 4 — Unidades ainda não publicadas no Comercial ───────────────────
-- Contramão do Bloco 3: unidades que existem no Empreendimento mas nunca foram
-- publicadas para venda nem locação. Nenhuma parcela consegue apontar para elas.

SELECT
    e.name                                   AS empreendimento,
    tw.name                                  AS torre,
    tw.project_id IS NOT NULL                AS torre_tem_obra,
    COUNT(*)                                 AS unidades,
    COUNT(*) FILTER (WHERE u.commercial_property_id IS NULL
                       AND u.rental_property_id     IS NULL) AS nao_publicadas
FROM public.empreendimento_units u
JOIN public.empreendimento_towers tw ON tw.id = u.tower_id
JOIN public.empreendimentos      e  ON e.id  = tw.empreendimento_id
GROUP BY e.name, tw.name, tw.project_id
HAVING COUNT(*) FILTER (WHERE u.commercial_property_id IS NULL
                          AND u.rental_property_id     IS NULL) > 0
ORDER BY nao_publicadas DESC;
