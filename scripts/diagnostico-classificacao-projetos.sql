-- ============================================================================
-- DIAGNÓSTICO: quantos projetos estão sem `classification` definido?
-- ============================================================================
-- Rode no SQL Editor do Supabase. Só lê, não altera nada.
--
-- Serve para decidir uma coisa: projeto legado SEM classification deve contar
-- como obra ou não? Ver utils/projectClassification.ts (constante
-- TRATAR_SEM_CLASSIFICACAO_COMO_OBRA).
--
-- Como ler o resultado:
--   - "sem classificacao" = 0  → decisão não importa, pode manter o estrito
--   - poucos e claramente obras → considere classificá-los em vez de afrouxar
--     a regra para todo o sistema
--   - muitos → me mande o número; provavelmente vale um backfill dirigido,
--     não afrouxar o predicado
-- ============================================================================

-- 1) Distribuição geral
SELECT
    COALESCE(settings->>'classification', '(sem classificacao)') AS classificacao,
    COUNT(*)                                                     AS qtd
FROM projects
GROUP BY 1
ORDER BY qtd DESC;

-- 2) Quem são os sem classificação (para julgar se são obras de verdade)
SELECT
    id,
    name,
    settings->>'code'        AS codigo,
    settings->>'city'        AS cidade,
    settings->>'obraStatus'  AS status_obra,
    settings->>'area'        AS area,
    created_at
FROM projects
WHERE settings->>'classification' IS NULL
   OR TRIM(settings->>'classification') = ''
ORDER BY created_at DESC
LIMIT 50;

-- 3) Conferência do fix anterior: projetos de sistema marcados?
--    (esperado: todas as linhas com marcado = true, depois da migration
--     20270718000001_backfill_is_system_project.sql)
SELECT
    name,
    settings->>'isSystemProject' AS marcado,
    settings->>'classification'  AS classificacao,
    COUNT(*)                     AS qtd
FROM projects
WHERE name = 'Gestão Comercial'
GROUP BY 1, 2, 3;
