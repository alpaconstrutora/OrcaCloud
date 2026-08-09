-- ============================================================================
-- Medição Inteligente — fechar o bucket `measure-plants`
-- Auditoria: docs/planos/2026-08-09-auditoria-rls-measure.md (Fase 1)
--
-- O bucket nasceu `public = true` em 20261120000000. O rollout de 08/02
-- (20270208000003) removeu as policies anon de ESCRITA e tratou a de leitura
-- como inócua — corretamente, pela lógica dele: com a flag pública, derrubar a
-- policy de SELECT não mudaria nada. A flag continuou de pé.
--
-- O caminho do arquivo é `{projectId}/{uuid}.{ext}` — dois UUID, não
-- enumerável. O risco nunca foi varredura: foi PERMANÊNCIA. A URL funcionava
-- para sempre, sem autenticação e sem expirar, para qualquer um que a
-- recebesse. Quem saía da empresa seguia com acesso a toda planta cujo link
-- tivesse guardado. Planta de cliente traz endereço e nome do proprietário.
--
-- ⚠️ QUALQUER LINK COMPARTILHADO ANTES DEIXA DE FUNCIONAR. É o objetivo.
--
-- CUSTO NA APLICAÇÃO: NENHUM. `getPlantPublicUrl` não tinha um único chamador —
-- o app lê por `downloadPlantFile`, que já é chamada autenticada e funciona em
-- bucket privado. (A função virou `getPlantSignedUrl` no mesmo commit, para que
-- um uso futuro caia no caminho assinado.)
--
-- ⚠️ APLICAR À MÃO, UM BLOCO POR VEZ.
-- ============================================================================

-- ═══ BLOCO 1 — fechar o bucket ══════════════════════════════════════════════
SET lock_timeout = '5s';

UPDATE storage.buckets SET public = FALSE WHERE id = 'measure-plants';

-- ═══ BLOCO 2 — a leitura passa a exigir sessão ══════════════════════════════
-- A policy antiga não declarava papel, e sem `TO` ela vale para PUBLIC — o que
-- inclui `anon`. Com o bucket fechado isso deixaria de ser inócuo: quem tivesse
-- a chave anônima poderia ler pelo endpoint autenticado, que é exatamente o
-- buraco que este bloco fecha.
SET lock_timeout = '5s';

DROP POLICY IF EXISTS "Allow read access to measure-plants for select" ON storage.objects;

CREATE POLICY "measure_plants_read_authenticated" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'measure-plants');

-- ═══ BLOCO 3 — conferência ══════════════════════════════════════════════════
-- Rodar sozinho, por último.
-- Esperado: publico=0, leitura_anon=0, leitura_autenticada=1

SELECT
  (SELECT count(*) FROM storage.buckets
    WHERE id = 'measure-plants' AND public)                                     AS publico,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND cmd = 'SELECT'
      AND qual LIKE '%measure-plants%'
      AND (roles::text LIKE '%anon%' OR roles::text = '{public}'))              AS leitura_anon,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname = 'measure_plants_read_authenticated')                     AS leitura_autenticada;
