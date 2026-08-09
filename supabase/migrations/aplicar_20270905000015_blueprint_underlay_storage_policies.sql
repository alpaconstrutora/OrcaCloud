-- ============================================================================
-- Planta Inteligente — corrige as policies de storage da planta de fundo
-- Plano: docs/planos/2026-08-09-estado-e-continuacao.md
--
-- Dois defeitos nas policies criadas pelo bloco 5 da `000009`. Nenhum dos dois
-- tinha como aparecer até agora: o bucket está VAZIO — a conferência de
-- 09/08/2026 mostrou 1 estudo, 0 pranchas, 2 medições. Prancha nunca foi
-- importada, então o caminho nunca rodou.
--
-- 1. NÃO HÁ POLICY DE UPDATE, e `uploadUnderlay` sobe com `upsert: true`. O
--    caminho é derivado do sha256 do arquivo, então reimportar o MESMO arquivo
--    cai no mesmo objeto — e o upsert precisa de UPDATE. Sem ela, a segunda
--    importação do mesmo documento falha com 403, num ponto em que o usuário
--    não tem como suspeitar de permissão de storage.
--
-- 2. AS TRÊS POLICIES SÃO CEGAS À ORGANIZAÇÃO: `USING (bucket_id =
--    'blueprint_underlays')` deixa qualquer usuário autenticado do SaaS ler,
--    gravar e apagar a planta de fundo de QUALQUER cliente. A tabela
--    `blueprint_underlays` está corretamente recortada por `is_org_member`; o
--    objeto no bucket, não — e é o objeto que contém o desenho.
--
--    O caminho é `{organization_id}/{study_id}/{sha}.png`, então o recorte sai
--    do primeiro segmento, como em `20260528100000_create_services_commercial_module`.
--
-- ⚠️ APLICAR À MÃO pelo SQL Editor, UM BLOCO POR VEZ.
-- ⚠️ `storage.objects` é tabela quente. Se der 40P01, o `lock_timeout` aborta
--    sem estragar nada — repita.
-- ============================================================================

-- ═══ BLOCO 1 — leitura, escrita e exclusão recortadas por organização ═══════
-- Substitui as três policies cegas. `DROP` antes de `CREATE` porque policy de
-- storage é global à tabela `storage.objects`: deixar a antiga viva faria as
-- duas valerem em OR, e a permissiva anularia a restritiva — foi assim que o
-- TEMP_BYPASS vazou `internal_transactions` para `anon`.
SET lock_timeout = '5s';

DROP POLICY IF EXISTS "blueprint_underlay_obj_read" ON storage.objects;
CREATE POLICY "blueprint_underlay_obj_read" ON storage.objects
    FOR SELECT TO authenticated
    USING (
      bucket_id = 'blueprint_underlays'
      AND public.is_org_member(((storage.foldername(name))[1])::uuid)
    );

DROP POLICY IF EXISTS "blueprint_underlay_obj_write" ON storage.objects;
CREATE POLICY "blueprint_underlay_obj_write" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'blueprint_underlays'
      AND public.is_org_member(((storage.foldername(name))[1])::uuid)
    );

DROP POLICY IF EXISTS "blueprint_underlay_obj_delete" ON storage.objects;
CREATE POLICY "blueprint_underlay_obj_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (
      bucket_id = 'blueprint_underlays'
      AND public.is_org_member(((storage.foldername(name))[1])::uuid)
    );

-- ═══ BLOCO 2 — a policy de UPDATE que faltava ═══════════════════════════════
-- Sem ela o `upsert: true` do upload não tem como sobrescrever, e reimportar o
-- mesmo arquivo falha. `USING` e `WITH CHECK` iguais: quem pode sobrescrever é
-- quem já podia ler, e o objeto tem de continuar na mesma organização depois.
SET lock_timeout = '5s';

DROP POLICY IF EXISTS "blueprint_underlay_obj_update" ON storage.objects;
CREATE POLICY "blueprint_underlay_obj_update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
      bucket_id = 'blueprint_underlays'
      AND public.is_org_member(((storage.foldername(name))[1])::uuid)
    )
    WITH CHECK (
      bucket_id = 'blueprint_underlays'
      AND public.is_org_member(((storage.foldername(name))[1])::uuid)
    );

-- ═══ BLOCO 3 — conferência ══════════════════════════════════════════════════
-- Rodar sozinho, por último.
-- Esperado: policies=4, cegas=0, com_update=1
--
-- `cegas` é o que importa: conta policies do bucket cujo predicado NÃO cita
-- `is_org_member`. Conferir só que a policy boa existe não bastaria — a antiga
-- poderia estar viva ao lado dela, valendo em OR.

SELECT
  (SELECT count(*) FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname LIKE 'blueprint_underlay_obj_%')                     AS policies,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname LIKE 'blueprint_underlay_obj_%'
      AND coalesce(qual, '') || coalesce(with_check, '')
          NOT LIKE '%is_org_member%')                                     AS cegas,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='blueprint_underlay_obj_update')                     AS com_update;
