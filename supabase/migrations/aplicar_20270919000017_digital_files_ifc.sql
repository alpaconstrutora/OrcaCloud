-- ============================================================================
-- Objeto Digital, primeira tabela: os ARQUIVOS de modelo (IFC, e o que vier)
-- Plano: docs/planos/2026-09-05-ifc-persistir-e-importar.md
--
-- O visualizador (`BimViewerModule`) abre o IFC do disco e esquece ao fechar a
-- aba. O usuário pediu duas coisas: que a EQUIPE abra o mesmo modelo sem ter o
-- arquivo em mãos, e que dê para "comparar a revisão de fevereiro com a próxima
-- que o calculista mandar".
--
-- ─── POR QUE `digital_files`, E NÃO `bim_models` ────────────────────────────
--
-- O PRD do BIM LAB decidiu a entidade OBJETO DIGITAL (`digital_files` →
-- `digital_objects` → `digital_object_links` polimórfico) exatamente para poder
-- pendurar DWG, PDF, foto 360° e nuvem de pontos no orçamento e no planejamento
-- sem refatorar. Uma `bim_models` acoplada a IFC fecharia essa porta no primeiro
-- dia. Só a PRIMEIRA tabela nasce aqui: `digital_objects` é o elemento, é da
-- etapa do 4D/5D, e não se decide bem antes de existir uso.
--
-- ─── REVISÃO É LINHA NOVA, NUNCA `UPDATE` ───────────────────────────────────
--
-- `modelo_grupo` + `revisao`: subir "nova revisão de X" copia o grupo e
-- incrementa. Sobrescrever o arquivo destruiria a única pergunta que o usuário
-- fez de forma explícita. É o princípio de `blueprint_snapshots`, e pela mesma
-- razão — o que foi publicado continua sendo o que foi publicado.
--
-- ⚠️ SEM FK PARA auth.users (ver aplicar_20270905000004).
--
-- ⚠️ APLICAR À MÃO:
--    npx supabase db query --linked -f supabase/migrations/aplicar_20270919000017_digital_files_ifc.sql
--    NUNCA `supabase db push`.
-- ============================================================================

-- ═══ BLOCO 1 — tabela ═══════════════════════════════════════════════════════
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.digital_files (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

    -- A obra a que o modelo pertence. NULO é legítimo: um modelo pode chegar
    -- antes de a obra existir no sistema, e barrar o upload por isso mandaria
    -- o usuário criar uma obra falsa só para guardar um arquivo.
    project_id      UUID REFERENCES public.projects(id) ON DELETE SET NULL,

    -- Como a equipe chama ("Estrutural — Torre A"), e o nome do arquivo como
    -- veio. Os dois, porque o primeiro se edita e o segundo é procedência.
    nome            TEXT NOT NULL,
    nome_arquivo    TEXT NOT NULL,

    -- Texto livre, e não enum: disciplina varia por escritório ("estrutural",
    -- "hidrossanitário", "PPCI"), e uma disciplina nova não pode exigir
    -- migration. Mesma razão de `blueprint_wall_types.camadas[].funcao`.
    disciplina      TEXT NOT NULL DEFAULT '',

    -- ── Revisões ──────────────────────────────────────────────────────────
    -- Linhas do mesmo `modelo_grupo` são revisões do mesmo modelo.
    modelo_grupo    UUID NOT NULL DEFAULT gen_random_uuid(),
    revisao         INTEGER NOT NULL DEFAULT 1 CHECK (revisao > 0),

    -- ── O arquivo ─────────────────────────────────────────────────────────
    storage_path    TEXT NOT NULL,
    file_sha256     TEXT NOT NULL,
    bytes           BIGINT NOT NULL CHECK (bytes > 0),

    -- ── O resumo, medido na abertura ──────────────────────────────────────
    -- Guardado para a LISTA não precisar baixar 1,2 MB de WASM e reabrir cada
    -- arquivo só para mostrar "449 elementos".
    schema_ifc      TEXT NOT NULL DEFAULT '',
    elementos       INTEGER NOT NULL DEFAULT 0,
    triangulos      INTEGER NOT NULL DEFAULT 0,

    -- `auth.uid()` cru, SEM FK: ver o cabeçalho.
    uploaded_by     UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT digital_file_nome_nao_vazio CHECK (length(trim(nome)) > 0),
    -- Duas revisões com o mesmo número no mesmo grupo seriam indistinguíveis
    -- na lista e na comparação.
    CONSTRAINT digital_file_revisao_unica UNIQUE (modelo_grupo, revisao)
);

-- ═══ BLOCO 2 — índices e comentários ════════════════════════════════════════
SET lock_timeout = '5s';

CREATE INDEX IF NOT EXISTS idx_digital_file_org
    ON public.digital_files(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_digital_file_grupo
    ON public.digital_files(modelo_grupo, revisao DESC);
CREATE INDEX IF NOT EXISTS idx_digital_file_projeto
    ON public.digital_files(project_id) WHERE project_id IS NOT NULL;

COMMENT ON TABLE public.digital_files IS
  'Arquivos de modelo (IFC hoje; DWG, PDF e nuvem de pontos depois) por '
  'organização. Primeira tabela do Objeto Digital do BIM LAB. Revisão é LINHA '
  'NOVA no mesmo modelo_grupo — nunca UPDATE do arquivo.';

COMMENT ON COLUMN public.digital_files.modelo_grupo IS
  'Agrupa revisões do MESMO modelo. Subir "nova revisão de X" copia este valor '
  'e incrementa `revisao`.';

-- ═══ BLOCO 3 — RLS da TABELA ════════════════════════════════════════════════
SET lock_timeout = '5s';

ALTER TABLE public.digital_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "digital_file_org_read" ON public.digital_files;
CREATE POLICY "digital_file_org_read" ON public.digital_files
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "digital_file_org_insert" ON public.digital_files;
CREATE POLICY "digital_file_org_insert" ON public.digital_files
    FOR INSERT TO authenticated
    WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "digital_file_org_update" ON public.digital_files;
CREATE POLICY "digital_file_org_update" ON public.digital_files
    FOR UPDATE TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "digital_file_org_delete" ON public.digital_files;
CREATE POLICY "digital_file_org_delete" ON public.digital_files
    FOR DELETE TO authenticated
    USING (public.is_org_member(organization_id));

REVOKE ALL ON public.digital_files FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.digital_files TO authenticated;

-- ═══ BLOCO 4 — o BUCKET, recortado por organização ══════════════════════════
--
-- ⚠️ A RLS DA TABELA NÃO RECORTA O OBJETO. São duas RLS diferentes, e o arquivo
-- mora no objeto. O `blueprint_underlays` nasceu com as três policies cegas
-- (`USING (bucket_id = ...)` e mais nada) e sem UPDATE: qualquer usuário
-- autenticado do SaaS podia ler a planta de QUALQUER cliente. Corrigido só em
-- 09/08/2026, pela `aplicar_20270905000015`.
--
-- O padrão da casa é `is_org_member` sobre o PRIMEIRO SEGMENTO do caminho, e
-- por isso `storage_path` começa sempre pelo `organization_id`.
--
-- As QUATRO operações, e não três: sem UPDATE, reenviar o mesmo arquivo (o
-- caminho vem do sha256, então cai no mesmo objeto) falha com `upsert`.
SET lock_timeout = '5s';

INSERT INTO storage.buckets (id, name, public)
VALUES ('bim_files', 'bim_files', FALSE)
ON CONFLICT (id) DO UPDATE SET public = FALSE;

DROP POLICY IF EXISTS "bim_file_obj_read" ON storage.objects;
CREATE POLICY "bim_file_obj_read" ON storage.objects
    FOR SELECT TO authenticated
    USING (
      bucket_id = 'bim_files'
      AND public.is_org_member(((storage.foldername(name))[1])::uuid)
    );

DROP POLICY IF EXISTS "bim_file_obj_write" ON storage.objects;
CREATE POLICY "bim_file_obj_write" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'bim_files'
      AND public.is_org_member(((storage.foldername(name))[1])::uuid)
    );

DROP POLICY IF EXISTS "bim_file_obj_update" ON storage.objects;
CREATE POLICY "bim_file_obj_update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
      bucket_id = 'bim_files'
      AND public.is_org_member(((storage.foldername(name))[1])::uuid)
    )
    WITH CHECK (
      bucket_id = 'bim_files'
      AND public.is_org_member(((storage.foldername(name))[1])::uuid)
    );

DROP POLICY IF EXISTS "bim_file_obj_delete" ON storage.objects;
CREATE POLICY "bim_file_obj_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (
      bucket_id = 'bim_files'
      AND public.is_org_member(((storage.foldername(name))[1])::uuid)
    );

-- ═══ BLOCO 5 — conferência ══════════════════════════════════════════════════
-- Rodar sozinho, por último.
-- Esperado: tabela=1, tabela_rls=1, tabela_policies=4, anon_grants=0,
--           fk_auth_users=0, bucket=1, bucket_privado=1, obj_policies=4,
--           obj_policies_CEGAS=0
--
-- ⚠️ Conta as policies CEGAS em vez de checar se a boa existe: uma policy
-- permissiva viva ao lado da restritiva vale em OR e anula a proteção.

SELECT
  (SELECT count(*) FROM pg_tables
    WHERE schemaname='public' AND tablename='digital_files')                     AS tabela,
  (SELECT count(*) FROM pg_tables
    WHERE schemaname='public' AND tablename='digital_files' AND rowsecurity)     AS tabela_rls,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname='public' AND tablename='digital_files')                     AS tabela_policies,
  (SELECT count(*) FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name='digital_files'
      AND grantee='anon')                                                        AS anon_grants,
  (SELECT count(*) FROM pg_constraint c
     JOIN pg_class t  ON t.oid = c.conrelid
     JOIN pg_class rt ON rt.oid = c.confrelid
     JOIN pg_namespace rn ON rn.oid = rt.relnamespace
    WHERE t.relname='digital_files'
      AND rt.relname='users' AND rn.nspname='auth')                              AS fk_auth_users,
  (SELECT count(*) FROM storage.buckets WHERE id='bim_files')                    AS bucket,
  (SELECT count(*) FROM storage.buckets
    WHERE id='bim_files' AND public = FALSE)                                     AS bucket_privado,
  -- ⚠️ `COALESCE` nos DOIS lados. Policy de INSERT não tem `USING`, então
  -- `qual` é NULL — e `NULL || with_check` é NULL, que não casa com LIKE
  -- nenhum. A primeira versão desta conferência contou 3 de 4 por isso, e o
  -- número errado era o TRANQUILIZADOR: dizia que faltava uma policy quando as
  -- quatro estavam lá. Subcontar aqui é tão ruim quanto superestimar.
  (SELECT count(*) FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND COALESCE(qual,'') || COALESCE(with_check,'') LIKE '%bim_files%')       AS obj_policies,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND COALESCE(qual,'') || COALESCE(with_check,'') LIKE '%bim_files%'
      AND COALESCE(qual,'') || COALESCE(with_check,'') NOT LIKE '%is_org_member%')
                                                                                 AS obj_policies_cegas;
