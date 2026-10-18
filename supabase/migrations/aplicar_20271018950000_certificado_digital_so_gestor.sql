-- ============================================================================
-- Certificado digital (.pfx): leitura só para owner/admin da organização
-- Plano: docs/planos/2026-10-18-nfe-captura-automatica-sefaz.md, item 1.1
-- ============================================================================
--
-- O bucket `company-certificates` guarda o certificado A1 de cada empresa, e o
-- A1 é a chave privada que assina e consulta notas em nome dela. A policy de
-- leitura original (`cert_select_org_member`, migration 20260702000001)
-- liberava o arquivo para QUALQUER membro da organização, enquanto a escrita e
-- a exclusão já exigiam owner/admin. Isso violava a pergunta 1 da REGRA #7:
-- "membro da org" sozinho bastava para baixar a chave privada.
--
-- Hoje o bucket está vazio (0 arquivos em 18/10/2026), então ninguém perde
-- acesso a nada que já usava. A captura automática de NF-e vai ler o arquivo
-- com a chave de serviço, sem passar por esta policy.
--
-- A policy de UPDATE é nova: `companyService.uploadCertificado` grava com
-- `upsert: true`, e trocar o certificado vencido por um novo precisa dela.
-- ============================================================================

DROP POLICY IF EXISTS "cert_select_org_member" ON storage.objects;
DROP POLICY IF EXISTS "cert_select_gestor"     ON storage.objects;
DROP POLICY IF EXISTS "cert_update_gestor"     ON storage.objects;

CREATE POLICY "cert_select_gestor"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'company-certificates'
    AND EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id::text = (storage.foldername(name))[1]
        AND public.is_org_manager(c.org_id)
    )
  );

CREATE POLICY "cert_update_gestor"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'company-certificates'
    AND EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id::text = (storage.foldername(name))[1]
        AND public.is_org_manager(c.org_id)
    )
  )
  WITH CHECK (
    bucket_id = 'company-certificates'
    AND EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id::text = (storage.foldername(name))[1]
        AND public.is_org_manager(c.org_id)
    )
  );
