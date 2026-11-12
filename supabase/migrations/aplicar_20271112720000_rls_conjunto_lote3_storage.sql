-- ════════════════════════════════════════════════════════════════════════════
-- RLS: is_org_member por linha → conjunto de orgs calculado uma vez — LOTE 3
-- storage.objects: 29 policies em 1 tabelas
-- ════════════════════════════════════════════════════════════════════════════
-- GERADO por scripts/rls-trocar-is-org-member.mjs a partir do retrato
-- docs/planos/2026-11-11-rls-is-org-member/policies-antes.json — não editar à mão;
-- regerar. Plano: docs/planos/2026-11-11-rls-is-org-member-tabelas-grandes.md
--
-- Cada is_org_member(X) vira COALESCE((X) IN (SELECT public.minhas_orgs_membro()), false):
-- mesmo booleano (inclusive X nulo), calculado uma vez por consulta. Só as cláusulas
-- que tinham a chamada mudam; nome, comando, papéis e as demais pernas ficam.
--
-- REGRA #7 — Pergunta 1: nenhuma perna nova; cada chamada é trocada no lugar.
-- Pergunta 2: nenhuma função nova. minhas_orgs_membro (aplicar_20271111940000) ganha
-- EXECUTE para anon quando o lote tem policy de papel {public}: o anon avalia essas
-- policies (mesmo motivo de is_org_member em aplicar_20271111930000); com JWT vazio
-- ela devolve conjunto vazio.
--
-- TRAVA: cada ALTER POLICY trava a tabela por milissegundos. lock_timeout de 2 s: se
-- uma tabela estiver ocupada o comando falha em vez de enfileirar o app — rodar de novo.
-- VOLTA: docs/planos/2026-11-11-rls-is-org-member/volta-lote-3.sql
--
-- Aplicar: npx supabase db query --linked -f <caminho deste arquivo>
-- NUNCA `supabase db push` (CLAUDE.md da raiz).

SET lock_timeout = '2s';

-- DELETE · {authenticated} · 1 troca(s) · 2058 linhas
ALTER POLICY "bank_statements_delete" ON "storage"."objects"
  USING (((bucket_id = 'bank-statements'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false)));

-- INSERT · {authenticated} · 1 troca(s) · 2058 linhas
ALTER POLICY "bank_statements_insert" ON "storage"."objects"
  WITH CHECK (((bucket_id = 'bank-statements'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false)));

-- SELECT · {authenticated} · 1 troca(s) · 2058 linhas
ALTER POLICY "bank_statements_read" ON "storage"."objects"
  USING (((bucket_id = 'bank-statements'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false)));

-- DELETE · {authenticated} · 1 troca(s) · 2058 linhas
ALTER POLICY "bim_file_obj_delete" ON "storage"."objects"
  USING (((bucket_id = 'bim_files'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false)));

-- SELECT · {authenticated} · 1 troca(s) · 2058 linhas
ALTER POLICY "bim_file_obj_read" ON "storage"."objects"
  USING (((bucket_id = 'bim_files'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false)));

-- UPDATE · {authenticated} · 2 troca(s) · 2058 linhas
ALTER POLICY "bim_file_obj_update" ON "storage"."objects"
  USING (((bucket_id = 'bim_files'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false)))
  WITH CHECK (((bucket_id = 'bim_files'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false)));

-- INSERT · {authenticated} · 1 troca(s) · 2058 linhas
ALTER POLICY "bim_file_obj_write" ON "storage"."objects"
  WITH CHECK (((bucket_id = 'bim_files'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false)));

-- DELETE · {authenticated} · 1 troca(s) · 2058 linhas
ALTER POLICY "blueprint_underlay_obj_delete" ON "storage"."objects"
  USING (((bucket_id = 'blueprint_underlays'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false)));

-- SELECT · {authenticated} · 1 troca(s) · 2058 linhas
ALTER POLICY "blueprint_underlay_obj_read" ON "storage"."objects"
  USING (((bucket_id = 'blueprint_underlays'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false)));

-- UPDATE · {authenticated} · 2 troca(s) · 2058 linhas
ALTER POLICY "blueprint_underlay_obj_update" ON "storage"."objects"
  USING (((bucket_id = 'blueprint_underlays'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false)))
  WITH CHECK (((bucket_id = 'blueprint_underlays'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false)));

-- INSERT · {authenticated} · 1 troca(s) · 2058 linhas
ALTER POLICY "blueprint_underlay_obj_write" ON "storage"."objects"
  WITH CHECK (((bucket_id = 'blueprint_underlays'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false)));

-- DELETE · {authenticated} · 1 troca(s) · 2058 linhas
ALTER POLICY "condominio_docs_storage_delete" ON "storage"."objects"
  USING (((bucket_id = 'condominio-documentos'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false)));

-- INSERT · {authenticated} · 1 troca(s) · 2058 linhas
ALTER POLICY "condominio_docs_storage_insert" ON "storage"."objects"
  WITH CHECK (((bucket_id = 'condominio-documentos'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false)));

-- SELECT · {authenticated} · 1 troca(s) · 2058 linhas
ALTER POLICY "condominio_docs_storage_read" ON "storage"."objects"
  USING (((bucket_id = 'condominio-documentos'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false)));

-- UPDATE · {authenticated} · 2 troca(s) · 2058 linhas
ALTER POLICY "condominio_docs_storage_update" ON "storage"."objects"
  USING (((bucket_id = 'condominio-documentos'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false)))
  WITH CHECK (((bucket_id = 'condominio-documentos'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false)));

-- DELETE · {authenticated} · 1 troca(s) · 2058 linhas
ALTER POLICY "diario_midia_storage_delete" ON "storage"."objects"
  USING (((bucket_id = 'diario-midia'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false)));

-- INSERT · {authenticated} · 1 troca(s) · 2058 linhas
ALTER POLICY "diario_midia_storage_insert" ON "storage"."objects"
  WITH CHECK (((bucket_id = 'diario-midia'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false)));

-- SELECT · {authenticated} · 1 troca(s) · 2058 linhas
ALTER POLICY "diario_midia_storage_read" ON "storage"."objects"
  USING (((bucket_id = 'diario-midia'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false)));

-- UPDATE · {authenticated} · 2 troca(s) · 2058 linhas
ALTER POLICY "diario_midia_storage_update" ON "storage"."objects"
  USING (((bucket_id = 'diario-midia'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false)))
  WITH CHECK (((bucket_id = 'diario-midia'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false)));

-- DELETE · {authenticated} · 1 troca(s) · 2058 linhas
ALTER POLICY "financeiro_anexos_delete" ON "storage"."objects"
  USING (((bucket_id = 'financeiro-anexos'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false)));

-- INSERT · {authenticated} · 1 troca(s) · 2058 linhas
ALTER POLICY "financeiro_anexos_insert" ON "storage"."objects"
  WITH CHECK (((bucket_id = 'financeiro-anexos'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false)));

-- SELECT · {authenticated} · 1 troca(s) · 2058 linhas
ALTER POLICY "financeiro_anexos_select" ON "storage"."objects"
  USING (((bucket_id = 'financeiro-anexos'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false)));

-- UPDATE · {authenticated} · 2 troca(s) · 2058 linhas
ALTER POLICY "financeiro_anexos_update" ON "storage"."objects"
  USING (((bucket_id = 'financeiro-anexos'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false)))
  WITH CHECK (((bucket_id = 'financeiro-anexos'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false)));

-- INSERT · {authenticated} · 1 troca(s) · 2058 linhas
ALTER POLICY "financial_receipts_storage_insert" ON "storage"."objects"
  WITH CHECK (((bucket_id = 'financial-receipts'::text) AND
CASE
    WHEN ((storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'::text) THEN COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false)
    ELSE false
END));

-- SELECT · {authenticated} · 1 troca(s) · 2058 linhas
ALTER POLICY "financial_receipts_storage_select" ON "storage"."objects"
  USING (((bucket_id = 'financial-receipts'::text) AND
CASE
    WHEN ((storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'::text) THEN COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false)
    ELSE false
END));

-- DELETE · {authenticated} · 1 troca(s) · 2058 linhas
ALTER POLICY "services_visits_org_delete" ON "storage"."objects"
  USING (((bucket_id = 'services-visits'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false)));

-- SELECT · {authenticated} · 1 troca(s) · 2058 linhas
ALTER POLICY "services_visits_org_read" ON "storage"."objects"
  USING (((bucket_id = 'services-visits'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false)));

-- INSERT · {authenticated} · 1 troca(s) · 2058 linhas
ALTER POLICY "services_visits_org_write" ON "storage"."objects"
  WITH CHECK (((bucket_id = 'services-visits'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false)));

-- SELECT · {authenticated} · 1 troca(s) · 2058 linhas
ALTER POLICY "storage_docs_select_partner_uploads" ON "storage"."objects"
  USING (((bucket_id = 'opura-docs'::text) AND ((storage.foldername(name))[1] = 'partner-uploads'::text) AND (((storage.foldername(name))[2] IN ( SELECT (partner_users.partner_workspace_id)::text AS partner_workspace_id
   FROM partner_users
  WHERE ((partner_users.email = (auth.jwt() ->> 'email'::text)) AND (partner_users.is_active = true)))) OR ((storage.foldername(name))[2] IN ( SELECT (pw.id)::text AS id
   FROM partner_workspaces pw
  WHERE COALESCE((pw.organization_id) IN (SELECT public.minhas_orgs_membro()), false))))));
