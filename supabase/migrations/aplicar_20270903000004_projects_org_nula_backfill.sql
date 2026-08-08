-- ═════════════════════════════════════════════════════════════════════════════
-- Obras com `organization_id` NULO — backfill por evidência
-- ═════════════════════════════════════════════════════════════════════════════
-- Descoberto em 2026-08-07 investigando por que `vw_project_cost_comparison`
-- expunha um projeto que o usuário não enxergava em `projects`.
--
-- NÃO ERA VAZAMENTO — era o oposto. O projeto `1929b16f` ("Obra: Coronel
-- Lambert") tem `organization_id IS NULL`, e a policy de `projects` usa
-- `is_org_member(organization_id)`. Como `is_org_member(NULL)` devolve FALSE,
-- a obra é invisível para TODOS: ninguém é membro de NULL.
--
-- E não é um resto esquecido: **8 das 13 ordens de serviço do sistema apontam
-- para ela** (OE-0001 a OE-0008). Ou seja, uma obra ativa no módulo
-- Operacional, com custo entrando em relatório agregado, que não aparece em
-- nenhuma lista de obra. É o pior formato de dado quebrado: alimenta número e
-- não abre tela.
--
-- ⚠️ NÃO CONFUNDIR com os empreendimentos homônimos. Existem dois
-- (`006 - Coronel Lambert 316` e `028 - Coronel Lambert 345`), ambos com
-- `organization_id` correto e cada um apontando para OUTRO `project_id`.
-- Nenhum deles referencia `1929b16f`. A obra órfã é uma terceira coisa — a
-- cascata Empreendimento → Obra não a alcança, porque ela não está pendurada
-- em empreendimento nenhum.
--
-- DERIVAÇÃO EM CASCATA, da evidência mais forte para a mais fraca. Nenhuma
-- delas chuta: se as três falharem, o projeto fica como está e é relatado.
--
--   1. `settings->>'organizationId'` — o descasamento conhecido entre a coluna
--      nativa e o JSON (ver a memória do projeto sobre isso).
--   2. `empresa_id` → `companies.org_id` (a coluna em `companies` é `org_id`,
--      não `organization_id`).
--   3. organização das ordens de serviço que apontam para o projeto — e SÓ se
--      todas concordarem. Duas orgs diferentes entre as OSs = ambíguo, e
--      ambíguo não se resolve por maioria.
--
-- No caso conhecido, a regra 3 resolve: as 8 OSs de `1929b16f` são todas de
-- `926cf626`, a mesma organização dos empreendimentos homônimos.

SET lock_timeout = '5s';

DO $$
DECLARE
    v_antes     BIGINT;
    v_r1        BIGINT := 0;
    v_r2        BIGINT := 0;
    v_r3        BIGINT := 0;
    v_restantes BIGINT;
    v_rec       RECORD;
BEGIN
    SELECT count(*) INTO v_antes FROM public.projects WHERE organization_id IS NULL;

    IF v_antes = 0 THEN
        RAISE NOTICE 'Nada a fazer: nenhum projeto com organization_id nulo.';
        RETURN;
    END IF;
    RAISE NOTICE 'Projetos com organizacao nula: %', v_antes;

    -- ── Regra 1 — settings.organizationId ────────────────────────────────
    WITH alvo AS (
        SELECT p.id, (p.settings->>'organizationId')::UUID AS org
          FROM public.projects p
         WHERE p.organization_id IS NULL
           AND p.settings->>'organizationId' IS NOT NULL
           AND p.settings->>'organizationId' <> ''
    )
    UPDATE public.projects p
       SET organization_id = a.org
      FROM alvo a
     WHERE p.id = a.id
       AND EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = a.org);
    GET DIAGNOSTICS v_r1 = ROW_COUNT;

    -- ── Regra 2 — empresa_id → companies.org_id ──────────────────────────
    UPDATE public.projects p
       SET organization_id = c.org_id
      FROM public.companies c
     WHERE p.organization_id IS NULL
       AND p.empresa_id = c.id
       AND c.org_id IS NOT NULL;
    GET DIAGNOSTICS v_r2 = ROW_COUNT;

    -- ── Regra 3 — organização das OSs, SÓ se todas concordarem ───────────
    -- `min(uuid)` NÃO existe no Postgres — uuid não tem agregado de ordenação.
    -- Como o HAVING já garante um único valor distinto, pegar o primeiro do
    -- array_agg é exato, não aproximação.
    WITH consenso AS (
        SELECT wo.project_id, (array_agg(DISTINCT wo.org_id))[1] AS org
          FROM public.work_orders wo
         WHERE wo.org_id IS NOT NULL
         GROUP BY wo.project_id
        HAVING count(DISTINCT wo.org_id) = 1
    )
    UPDATE public.projects p
       SET organization_id = c.org
      FROM consenso c
     WHERE p.id = c.project_id
       AND p.organization_id IS NULL;
    GET DIAGNOSTICS v_r3 = ROW_COUNT;

    SELECT count(*) INTO v_restantes FROM public.projects WHERE organization_id IS NULL;

    RAISE NOTICE 'Resolvidos: settings=%  empresa=%  ordens_de_servico=%', v_r1, v_r2, v_r3;
    RAISE NOTICE 'Ainda sem organizacao: %', v_restantes;

    -- Não abortar: o que foi resolvido está correto e deve valer. Mas o que
    -- sobrou tem de ficar VISÍVEL, senão vira dívida silenciosa de novo.
    IF v_restantes > 0 THEN
        RAISE NOTICE '── Projetos que precisam de decisao manual:';
        FOR v_rec IN
            SELECT id, name, empresa_id, created_at
              FROM public.projects
             WHERE organization_id IS NULL
             ORDER BY created_at
        LOOP
            RAISE NOTICE '   % | % | empresa=% | criado=%',
                v_rec.id, v_rec.name, COALESCE(v_rec.empresa_id::text, '—'), v_rec.created_at;
        END LOOP;
    END IF;
END $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- RESULTADO — este SELECT existe porque o SQL Editor NÃO exibe RAISE NOTICE.
-- Sem ele, a execução devolve "0 rows" e os avisos acima se perdem (aconteceu
-- duas vezes nesta sessão).
--
--   0 linhas  → todos os projetos ficaram com organização. Terminou.
--   N linhas  → esses N precisam de decisão manual; as três regras não tinham
--               evidência para eles.
-- ═════════════════════════════════════════════════════════════════════════════

SELECT id,
       name,
       empresa_id,
       settings->>'organizationId' AS settings_org,
       created_at
  FROM public.projects
 WHERE organization_id IS NULL
 ORDER BY created_at;

-- ═════════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO ADICIONAL
-- ═════════════════════════════════════════════════════════════════════════════
-- E a prova que importa, com sessão de usuário real:
--
--      curl "$URL/rest/v1/projects?select=id,name&id=eq.1929b16f-f4b9-4f56-b106-03a7a9675fc0" \
--           -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN"
--    Esperado: a obra "Obra: Coronel Lambert" passa a aparecer (era `[]`).
--
-- E na tela: a obra deve surgir nas listas de obra, e
-- `vw_project_cost_comparison` deixa de apontar para projeto invisível.
