-- ============================================================================
-- Bucket `broker-materials` (materiais de divulgação do corretor): escrita só
-- pela organização dona do caminho; sai a escrita e a listagem anônimas
-- (18/11/2026)
--
-- O QUE FECHA — 7 policies em storage.objects (20260310000000), todas só com
-- `bucket_id = 'broker-materials'`:
--   "Anon Insert materials"  INSERT {anon,authenticated}  → qualquer um, SEM
--                            login (só a chave anon do bundle), sobe arquivo de
--                            até 100 MB, de qualquer tipo, em qualquer pasta —
--                            hospedagem gratuita de malware/phishing num
--                            domínio do projeto, e arquivo plantado na pasta de
--                            outra empresa;
--   "Anon Update materials"  UPDATE {anon,authenticated}  → sobrescreve o
--   "Anon Delete materials"  DELETE {anon,authenticated}    material de
--                            qualquer org (troca o book/tabela de preços que o
--                            corretor baixa) ou apaga;
--   "Auth Insert/Update/Delete materials" {authenticated} → o mesmo, para
--                            qualquer conta;
--   "Public Access for materials" SELECT {public} → anon LISTA o bucket
--                            inteiro (POST /storage/v1/object/list/…).
-- A migration 20270208000003 manteve as policies anon porque "o Portal do
-- Corretor roda anon via token e escreve via brokerMaterialService". Não é mais
-- assim (conferido em 18/11/2026): com token, BrokerMaterials lê pela RPC
-- fn_broker_portal_get_materials e NÃO oferece criar/editar/excluir
-- (`podeGerir = !portalToken && !compacto`). Quem sobe arquivo é só o gestor,
-- logado no app (MaterialModal → brokerMaterialService.uploadMaterialFile),
-- no caminho `<organizationId>/<epoch>_<aleatório>.<ext>`.
--
-- O QUE MUDA
-- As 7 saem. Entram 4 policies TO authenticated em que o objeto só é listado,
-- gravado, sobrescrito ou apagado por MEMBRO da organização da primeira pasta
-- do caminho (minhas_orgs_membro()) — ou superadmin. É a MESMA regra da tabela
-- broker_portal_materials (broker_materials_manage/_select). A comparação é
-- por texto (`m::text`): pasta que não é uuid (ex.: as 8 antigas em `demo/`)
-- simplesmente não casa, sem erro de cast.
--
-- O QUE NÃO MUDA (de propósito)
-- O bucket CONTINUA public = true. Download pela URL pública
-- (/storage/v1/object/public/broker-materials/…) não passa por RLS: os 3
-- materiais de broker_portal_materials (file_url = URL pública deste bucket,
-- conferido em 18/11/2026) seguem abrindo no Portal do Corretor por link,
-- sem login. Quem tem a URL baixa — é material de divulgação, feito para
-- circular. Os 12 objetos que já existem não mudam de lugar.
--
-- REGRA #7
-- Pergunta 1: nenhuma perna libera sozinha — toda policy exige o bucket E a
-- org da pasta entre as minhas (ou superadmin, como na tabela).
-- Pergunta 2: não cria função.
--
-- ORDEM: independente do front (o upload do gestor já grava em `<org>/…`).
-- Pode ir a qualquer momento.
--
-- COMO CONFERIR (leitura):
--   SELECT policyname, cmd, roles FROM pg_policies
--    WHERE schemaname = 'storage' AND tablename = 'objects'
--      AND (qual ILIKE '%broker-materials%' OR with_check ILIKE '%broker-materials%');
--   → só as 4 broker_materials_*_org, todas {authenticated}.
-- De fora, com a chave anon e sem login:
--   POST /storage/v1/object/broker-materials/x/teste.txt   → 400/403 (antes: 200)
--   POST /storage/v1/object/list/broker-materials {"prefix":""} → []  (antes: as pastas)
--   GET  <file_url de um material>                          → 200, igual a antes
-- No app: Comercial › Corretores › Materiais › Novo material com arquivo →
-- sobe e aparece; o Portal do Corretor (link) lista e abre os materiais.
--
-- Pré-condição embutida: se o remoto tiver policy do bucket diferente do que
-- as migrations dizem, a transação aborta sem mudar nada — conferir à mão.
--
-- Aplicar: npx supabase db query --linked -f <caminho deste arquivo>
-- NUNCA `supabase db push` (CLAUDE.md da raiz).
--
-- VOLTA (se precisar):
--   DROP POLICY IF EXISTS "broker_materials_select_org" ON storage.objects;
--   DROP POLICY IF EXISTS "broker_materials_insert_org" ON storage.objects;
--   DROP POLICY IF EXISTS "broker_materials_update_org" ON storage.objects;
--   DROP POLICY IF EXISTS "broker_materials_delete_org" ON storage.objects;
--   e recriar as 7 de 20260310000000_create_broker_materials_bucket.sql.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '2s';

-- ── 0. Pré-condição: o remoto é o que as migrations dizem ────────────────────
DO $pre$
DECLARE
    r record;
    v_esperado CONSTANT text := '(bucket_id=''broker-materials''::text)';
BEGIN
    -- As 7 antigas, se ainda existirem, só podem conferir este bucket.
    FOR r IN
        SELECT policyname, qual, with_check
          FROM pg_policies
         WHERE schemaname = 'storage' AND tablename = 'objects'
           AND policyname IN ('Anon Insert materials', 'Anon Update materials', 'Anon Delete materials',
                              'Auth Insert materials', 'Auth Update materials', 'Auth Delete materials',
                              'Public Access for materials')
    LOOP
        IF COALESCE(regexp_replace(r.qual,       '\s', '', 'g'), v_esperado) <> v_esperado
        OR COALESCE(regexp_replace(r.with_check, '\s', '', 'g'), v_esperado) <> v_esperado THEN
            RAISE EXCEPTION 'storage.objects: policy "%" não é só do bucket broker-materials (qual=%, with_check=%) — conferir à mão',
                r.policyname, r.qual, r.with_check;
        END IF;
    END LOOP;

    -- Nenhuma OUTRA policy pode cobrir o bucket — senão trocar as 7 não fecha nada.
    FOR r IN
        SELECT policyname
          FROM pg_policies
         WHERE schemaname = 'storage' AND tablename = 'objects'
           AND (COALESCE(qual, '') ILIKE '%broker-materials%' OR COALESCE(with_check, '') ILIKE '%broker-materials%')
           AND policyname NOT IN ('Anon Insert materials', 'Anon Update materials', 'Anon Delete materials',
                                  'Auth Insert materials', 'Auth Update materials', 'Auth Delete materials',
                                  'Public Access for materials',
                                  'broker_materials_select_org', 'broker_materials_insert_org',
                                  'broker_materials_update_org', 'broker_materials_delete_org')
    LOOP
        RAISE EXCEPTION 'storage.objects: policy "%" também cobre o bucket broker-materials — conferir à mão', r.policyname;
    END LOOP;
END
$pre$;

-- ── 1. Sai o acesso só-por-bucket (anon e qualquer conta) ────────────────────
DROP POLICY IF EXISTS "Anon Insert materials"       ON storage.objects;
DROP POLICY IF EXISTS "Anon Update materials"       ON storage.objects;
DROP POLICY IF EXISTS "Anon Delete materials"       ON storage.objects;
DROP POLICY IF EXISTS "Auth Insert materials"       ON storage.objects;
DROP POLICY IF EXISTS "Auth Update materials"       ON storage.objects;
DROP POLICY IF EXISTS "Auth Delete materials"       ON storage.objects;
DROP POLICY IF EXISTS "Public Access for materials" ON storage.objects;

-- ── 2. Entra o acesso pela organização da primeira pasta ─────────────────────
-- SELECT: listar e a metade de leitura de upsert/remove (o app não lista nem
-- assina; o portal abre pela URL pública, que não passa por aqui).
DROP POLICY IF EXISTS "broker_materials_select_org" ON storage.objects;
CREATE POLICY "broker_materials_select_org" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'broker-materials'
        AND ((storage.foldername(objects.name))[1] IN (SELECT m::text FROM public.minhas_orgs_membro() AS m)
             OR public.is_superadmin())
    );

DROP POLICY IF EXISTS "broker_materials_insert_org" ON storage.objects;
CREATE POLICY "broker_materials_insert_org" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'broker-materials'
        AND ((storage.foldername(objects.name))[1] IN (SELECT m::text FROM public.minhas_orgs_membro() AS m)
             OR public.is_superadmin())
    );

DROP POLICY IF EXISTS "broker_materials_update_org" ON storage.objects;
CREATE POLICY "broker_materials_update_org" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id = 'broker-materials'
        AND ((storage.foldername(objects.name))[1] IN (SELECT m::text FROM public.minhas_orgs_membro() AS m)
             OR public.is_superadmin())
    )
    WITH CHECK (
        bucket_id = 'broker-materials'
        AND ((storage.foldername(objects.name))[1] IN (SELECT m::text FROM public.minhas_orgs_membro() AS m)
             OR public.is_superadmin())
    );

DROP POLICY IF EXISTS "broker_materials_delete_org" ON storage.objects;
CREATE POLICY "broker_materials_delete_org" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'broker-materials'
        AND ((storage.foldername(objects.name))[1] IN (SELECT m::text FROM public.minhas_orgs_membro() AS m)
             OR public.is_superadmin())
    );

-- ── 3. Verificação embutida ──────────────────────────────────────────────────
DO $pos$
DECLARE
    v_n int;
BEGIN
    -- Só as 4 novas cobrem o bucket, e todas só para authenticated.
    SELECT count(*) INTO v_n
      FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND (COALESCE(qual, '') ILIKE '%broker-materials%' OR COALESCE(with_check, '') ILIKE '%broker-materials%')
       AND (policyname NOT IN ('broker_materials_select_org', 'broker_materials_insert_org',
                               'broker_materials_update_org', 'broker_materials_delete_org')
            OR roles <> '{authenticated}'::name[]);
    IF v_n > 0 THEN
        RAISE EXCEPTION 'broker-materials: % policy(ies) fora do conjunto esperado ou com papel diferente de authenticated', v_n;
    END IF;

    SELECT count(*) INTO v_n
      FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname IN ('broker_materials_select_org', 'broker_materials_insert_org',
                          'broker_materials_update_org', 'broker_materials_delete_org');
    IF v_n <> 4 THEN
        RAISE EXCEPTION 'broker-materials: esperadas 4 policies novas, há %', v_n;
    END IF;

    RAISE NOTICE 'broker-materials OK: escrita/listagem anônimas fechadas; escrita, sobrescrita e exclusão só pela organização da pasta.';
    RAISE NOTICE 'O bucket segue PÚBLICO de propósito: a URL do material continua abrindo no Portal do Corretor sem login.';
END
$pos$;

COMMIT;
