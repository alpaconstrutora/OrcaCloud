-- ==========================================================================
-- Tapa o ponto cego da trava de organização em cascata: `empresa_id`
-- ==========================================================================
-- CONTEXTO
-- `20270821000003` criou `trg_org_cascade_project` para impedir que orçamento/
-- planejamento fiquem numa organização diferente da obra-pai. Ela dispara em:
--
--     BEFORE INSERT OR UPDATE OF organization_id, settings
--
-- E `projects_sync_org` (20260710000001) dispara em `UPDATE OF empresa_id` e
-- **reescreve `NEW.organization_id`** a partir de `companies.org_id`.
--
-- 🔴 O BURACO: o Postgres decide se dispara uma trigger `UPDATE OF` pelas colunas
--    que o COMANDO menciona — não pelas que outra trigger BEFORE modificou no
--    caminho. Um `UPDATE projects SET empresa_id = ...` portanto:
--      1. chama `projects_sync_org`, que troca a organização do projeto;
--      2. NÃO chama `trg_org_cascade_project`, porque o comando não mencionou
--         `organization_id` nem `settings`.
--    Resultado: dá para mudar a organização de um projeto filho, por baixo da
--    trava, sem erro nenhum.
--
--    A migration de 2026-07-21 raciocinou sobre a ORDEM de disparo das duas
--    (alfabética, `projects_sync_org` primeiro) e concluiu que a validação
--    aconteceria depois — o que está certo QUANDO as duas disparam. O caso em
--    que a segunda não dispara não foi considerado.
--
-- A CORREÇÃO é uma palavra: `empresa_id` entra na lista de colunas. A ordem
-- alfabética continua garantindo que `projects_sync_org` resolva a org da
-- empresa antes de a cascata validar contra o pai.
--
-- Só o TRIGGER é recriado; `fn_org_cascade_project()` fica como está.
--
-- ⚠️ LIMITE CONHECIDO, NÃO COBERTO AQUI: a trava valida o FILHO quando o filho
--    muda. Se a organização do PAI mudar, os filhos existentes passam a divergir
--    e nenhuma trigger dispara neles. Cobrir isso exige validar a outra direção
--    (AFTER UPDATE em projects, varrendo os filhos) — decisão separada, com
--    custo em tabela quente.
--
-- ⚠️ `projects` é tabela QUENTE — FK/DDL nela já deadlockou ≥3× neste projeto.
--    `lock_timeout` curto de propósito. Se der `55P03`, feche as abas e repita:
--    é idempotente.
-- ⚠️ APLICAR À MÃO PELO SQL EDITOR — NUNCA `supabase db push`.
-- ==========================================================================

SET lock_timeout = '800ms';

DROP TRIGGER IF EXISTS trg_org_cascade_project ON public.projects;

CREATE TRIGGER trg_org_cascade_project
  BEFORE INSERT OR UPDATE OF organization_id, settings, empresa_id ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_org_cascade_project();

-- ==========================================================================
-- CONFERÊNCIA
-- ==========================================================================

-- 1. A lista de colunas agora tem empresa_id:
-- SELECT pg_get_triggerdef(t.oid)
--   FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
--  WHERE c.relname = 'projects' AND t.tgname = 'trg_org_cascade_project';

-- 2. DIVERGÊNCIAS QUE JÁ EXISTEM — a trava só guarda escrita NOVA; linha que já
--    estava torta continua torta e só aparece aqui. (Em 28/08/2026 esta consulta
--    devolvia o orçamento "Garden": filho na Alpa, obra-pai na SPE.)
-- SELECT f.id, f.name, f.settings->>'classification' AS classificacao,
--        COALESCE(f.organization_id::text, f.settings->>'organizationId') AS org_do_filho,
--        p.name AS pai,
--        COALESCE(p.organization_id::text, p.settings->>'organizationId') AS org_do_pai
--   FROM public.projects f
--   JOIN public.projects p ON p.id::text = f.settings->>'linkedProjectId'
--  WHERE COALESCE(f.organization_id::text, f.settings->>'organizationId')
--     <> COALESCE(p.organization_id::text, p.settings->>'organizationId');

-- 3. A trava responde pelo caminho novo? (teste destrutivo — rode em transação
--    e sempre com ROLLBACK). Esperado: erro 'Organização em cascata: ...'
-- BEGIN;
--   UPDATE public.projects SET empresa_id = empresa_id
--    WHERE id = '<id de um orçamento cuja empresa seja de outra org que a obra>';
-- ROLLBACK;

-- ==========================================================================
-- FIM: aplicar_20270914000015_org_cascade_project_empresa.sql
-- ==========================================================================
