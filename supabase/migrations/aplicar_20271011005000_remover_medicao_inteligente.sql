-- ============================================================================
-- Medição Inteligente — remover do banco
--
-- O módulo (Engenharia › Medição Inteligente) saiu do app no commit 45817d6f:
-- tudo o que ele fazia — planta em PDF calibrada, camadas, formas, envio ao
-- orçamento — a Planta Inteligente já faz. O usuário pediu, em 11/10/2026,
-- que os dados também saíssem: "remover dados do banco, nao preciso delas".
--
-- O que havia, medido antes de apagar: 1 projeto, 2 arquivos, 6 formas,
-- 5 camadas, 3 itens de biblioteca, 2 PDFs no bucket `measure-plants`.
--
-- Escopo levantado no banco (não no histórico de migrations):
--   • nenhuma FK de tabela de fora aponta para `measure_*`;
--   • nenhuma view depende delas;
--   • `fn_measure_projeto_acessivel` só é usada pelas policies das próprias
--     tabelas. (`partner_portal_set_measurement_invoice` e
--     `fn_project_measurements_by_budget_item` são da medição de OBRA — outro
--     módulo, ficam. `blueprint_measurements` é da Planta — fica.)
--
-- ⚠️ Os 2 PDFs foram apagados ANTES, pela API do Storage
--    (`supabase storage rm`). Apagar a linha de `storage.objects` por SQL
--    deixaria o arquivo órfão no armazenamento — é por isso que a trigger
--    `protect_delete` existe. Aqui só sai o bucket, já vazio.
--
-- Sem CASCADE de propósito: se surgir dependência que o levantamento não viu,
-- o DROP falha e a transação inteira volta, em vez de levar algo junto calado.
-- ============================================================================

BEGIN;

-- ═══ 1. Storage: policies e bucket (vazio) ═════════════════════════════════
DROP POLICY IF EXISTS "measure_plants_read_authenticated"            ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated insert to measure-plants" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated update to measure-plants" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated delete to measure-plants" ON storage.objects;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'measure-plants') THEN
    RAISE EXCEPTION 'measure-plants ainda tem arquivos — apagar pela API do Storage antes';
  END IF;
END $$;

SET LOCAL storage.allow_delete_query = 'true';
DELETE FROM storage.buckets WHERE id = 'measure-plants';

-- ═══ 2. Tabelas (filhas antes da mãe) — as policies vão junto ═══════════════
DROP TABLE IF EXISTS public.measure_shapes;
DROP TABLE IF EXISTS public.measure_library_items;
DROP TABLE IF EXISTS public.measure_layers;
DROP TABLE IF EXISTS public.measure_files;
DROP TABLE IF EXISTS public.measure_projects;

-- ═══ 3. Função de acesso (só servia às policies acima) ══════════════════════
DROP FUNCTION IF EXISTS public.fn_measure_projeto_acessivel(uuid);

-- ═══ 4. Conferência — sobrou alguma peça, nada é gravado ════════════════════
DO $$
DECLARE
  v_sobra int;
BEGIN
  SELECT
      (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname LIKE 'measure\_%')
    + (SELECT count(*) FROM pg_proc WHERE proname = 'fn_measure_projeto_acessivel')
    + (SELECT count(*) FROM pg_policies WHERE schemaname = 'storage'
        AND (qual ILIKE '%measure-plants%' OR with_check ILIKE '%measure-plants%'))
    + (SELECT count(*) FROM storage.buckets WHERE id = 'measure-plants')
  INTO v_sobra;

  IF v_sobra <> 0 THEN
    RAISE EXCEPTION 'Medição Inteligente: sobraram % objeto(s) no banco', v_sobra;
  END IF;
END $$;

COMMIT;

SELECT 'medicao inteligente removida' AS resultado,
       (SELECT count(*) FROM pg_class WHERE relname LIKE 'measure\_%') AS tabelas_restantes,
       (SELECT count(*) FROM storage.buckets WHERE id = 'measure-plants') AS bucket_restante;
