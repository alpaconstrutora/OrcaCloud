-- SÓ LEITURA (desfeito no fim): (antiga) IS DISTINCT FROM (nova) linha a linha, lote 3, 34 expressões × cada usuário.
DO $c$
DECLARE r text := ''; u record; k bigint; total bigint := 0; testes int := 0; detalhes text := '';
BEGIN
  PERFORM set_config('statement_timeout', '1800s', true);
  CREATE TEMP TABLE _quem ON COMMIT DROP AS
    SELECT DISTINCT lower(m.email) AS email, COALESCE(m.user_id, au.id) AS uid
      FROM public.organization_members m LEFT JOIN auth.users au ON lower(au.email) = lower(m.email)
    UNION
    SELECT DISTINCT lower(b.email), au.id FROM public.broker_profiles b LEFT JOIN auth.users au ON lower(au.email) = lower(b.email)
    UNION SELECT NULL, NULL;
  FOR u IN SELECT * FROM _quem LOOP
    PERFORM set_config('request.jwt.claims', CASE WHEN u.email IS NULL THEN '' ELSE json_build_object('sub', u.uid, 'email', u.email, 'role', 'authenticated')::text END, true);
    PERFORM set_config('request.jwt.claim.sub', '', true);
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "storage"."objects" WHERE ((((bucket_id = 'bank-statements'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)))) IS DISTINCT FROM ((((bucket_id = 'bank-statements'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s objects.bank_statements_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s objects.bank_statements_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "storage"."objects" WHERE ((((bucket_id = 'bank-statements'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)))) IS DISTINCT FROM ((((bucket_id = 'bank-statements'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s objects.bank_statements_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s objects.bank_statements_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "storage"."objects" WHERE ((((bucket_id = 'bank-statements'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)))) IS DISTINCT FROM ((((bucket_id = 'bank-statements'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s objects.bank_statements_read USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s objects.bank_statements_read USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "storage"."objects" WHERE ((((bucket_id = 'bim_files'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)))) IS DISTINCT FROM ((((bucket_id = 'bim_files'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s objects.bim_file_obj_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s objects.bim_file_obj_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "storage"."objects" WHERE ((((bucket_id = 'bim_files'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)))) IS DISTINCT FROM ((((bucket_id = 'bim_files'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s objects.bim_file_obj_read USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s objects.bim_file_obj_read USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "storage"."objects" WHERE ((((bucket_id = 'bim_files'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)))) IS DISTINCT FROM ((((bucket_id = 'bim_files'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s objects.bim_file_obj_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s objects.bim_file_obj_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "storage"."objects" WHERE ((((bucket_id = 'bim_files'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)))) IS DISTINCT FROM ((((bucket_id = 'bim_files'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s objects.bim_file_obj_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s objects.bim_file_obj_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "storage"."objects" WHERE ((((bucket_id = 'bim_files'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)))) IS DISTINCT FROM ((((bucket_id = 'bim_files'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s objects.bim_file_obj_write CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s objects.bim_file_obj_write CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "storage"."objects" WHERE ((((bucket_id = 'blueprint_underlays'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)))) IS DISTINCT FROM ((((bucket_id = 'blueprint_underlays'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s objects.blueprint_underlay_obj_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s objects.blueprint_underlay_obj_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "storage"."objects" WHERE ((((bucket_id = 'blueprint_underlays'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)))) IS DISTINCT FROM ((((bucket_id = 'blueprint_underlays'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s objects.blueprint_underlay_obj_read USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s objects.blueprint_underlay_obj_read USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "storage"."objects" WHERE ((((bucket_id = 'blueprint_underlays'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)))) IS DISTINCT FROM ((((bucket_id = 'blueprint_underlays'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s objects.blueprint_underlay_obj_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s objects.blueprint_underlay_obj_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "storage"."objects" WHERE ((((bucket_id = 'blueprint_underlays'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)))) IS DISTINCT FROM ((((bucket_id = 'blueprint_underlays'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s objects.blueprint_underlay_obj_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s objects.blueprint_underlay_obj_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "storage"."objects" WHERE ((((bucket_id = 'blueprint_underlays'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)))) IS DISTINCT FROM ((((bucket_id = 'blueprint_underlays'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s objects.blueprint_underlay_obj_write CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s objects.blueprint_underlay_obj_write CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "storage"."objects" WHERE ((((bucket_id = 'condominio-documentos'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)))) IS DISTINCT FROM ((((bucket_id = 'condominio-documentos'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s objects.condominio_docs_storage_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s objects.condominio_docs_storage_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "storage"."objects" WHERE ((((bucket_id = 'condominio-documentos'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)))) IS DISTINCT FROM ((((bucket_id = 'condominio-documentos'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s objects.condominio_docs_storage_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s objects.condominio_docs_storage_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "storage"."objects" WHERE ((((bucket_id = 'condominio-documentos'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)))) IS DISTINCT FROM ((((bucket_id = 'condominio-documentos'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s objects.condominio_docs_storage_read USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s objects.condominio_docs_storage_read USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "storage"."objects" WHERE ((((bucket_id = 'condominio-documentos'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)))) IS DISTINCT FROM ((((bucket_id = 'condominio-documentos'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s objects.condominio_docs_storage_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s objects.condominio_docs_storage_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "storage"."objects" WHERE ((((bucket_id = 'condominio-documentos'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)))) IS DISTINCT FROM ((((bucket_id = 'condominio-documentos'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s objects.condominio_docs_storage_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s objects.condominio_docs_storage_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "storage"."objects" WHERE ((((bucket_id = 'diario-midia'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)))) IS DISTINCT FROM ((((bucket_id = 'diario-midia'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s objects.diario_midia_storage_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s objects.diario_midia_storage_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "storage"."objects" WHERE ((((bucket_id = 'diario-midia'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)))) IS DISTINCT FROM ((((bucket_id = 'diario-midia'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s objects.diario_midia_storage_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s objects.diario_midia_storage_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "storage"."objects" WHERE ((((bucket_id = 'diario-midia'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)))) IS DISTINCT FROM ((((bucket_id = 'diario-midia'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s objects.diario_midia_storage_read USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s objects.diario_midia_storage_read USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "storage"."objects" WHERE ((((bucket_id = 'diario-midia'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)))) IS DISTINCT FROM ((((bucket_id = 'diario-midia'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s objects.diario_midia_storage_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s objects.diario_midia_storage_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "storage"."objects" WHERE ((((bucket_id = 'diario-midia'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)))) IS DISTINCT FROM ((((bucket_id = 'diario-midia'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s objects.diario_midia_storage_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s objects.diario_midia_storage_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "storage"."objects" WHERE ((((bucket_id = 'financeiro-anexos'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)))) IS DISTINCT FROM ((((bucket_id = 'financeiro-anexos'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s objects.financeiro_anexos_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s objects.financeiro_anexos_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "storage"."objects" WHERE ((((bucket_id = 'financeiro-anexos'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)))) IS DISTINCT FROM ((((bucket_id = 'financeiro-anexos'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s objects.financeiro_anexos_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s objects.financeiro_anexos_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "storage"."objects" WHERE ((((bucket_id = 'financeiro-anexos'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)))) IS DISTINCT FROM ((((bucket_id = 'financeiro-anexos'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s objects.financeiro_anexos_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s objects.financeiro_anexos_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "storage"."objects" WHERE ((((bucket_id = 'financeiro-anexos'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)))) IS DISTINCT FROM ((((bucket_id = 'financeiro-anexos'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s objects.financeiro_anexos_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s objects.financeiro_anexos_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "storage"."objects" WHERE ((((bucket_id = 'financeiro-anexos'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)))) IS DISTINCT FROM ((((bucket_id = 'financeiro-anexos'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s objects.financeiro_anexos_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s objects.financeiro_anexos_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "storage"."objects" WHERE ((((bucket_id = 'financial-receipts'::text) AND
CASE
    WHEN ((storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'::text) THEN is_org_member(((storage.foldername(name))[1])::uuid)
    ELSE false
END))) IS DISTINCT FROM ((((bucket_id = 'financial-receipts'::text) AND
CASE
    WHEN ((storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'::text) THEN COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false)
    ELSE false
END)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s objects.financial_receipts_storage_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s objects.financial_receipts_storage_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "storage"."objects" WHERE ((((bucket_id = 'financial-receipts'::text) AND
CASE
    WHEN ((storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'::text) THEN is_org_member(((storage.foldername(name))[1])::uuid)
    ELSE false
END))) IS DISTINCT FROM ((((bucket_id = 'financial-receipts'::text) AND
CASE
    WHEN ((storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'::text) THEN COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false)
    ELSE false
END)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s objects.financial_receipts_storage_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s objects.financial_receipts_storage_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "storage"."objects" WHERE ((((bucket_id = 'services-visits'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)))) IS DISTINCT FROM ((((bucket_id = 'services-visits'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s objects.services_visits_org_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s objects.services_visits_org_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "storage"."objects" WHERE ((((bucket_id = 'services-visits'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)))) IS DISTINCT FROM ((((bucket_id = 'services-visits'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s objects.services_visits_org_read USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s objects.services_visits_org_read USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "storage"."objects" WHERE ((((bucket_id = 'services-visits'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)))) IS DISTINCT FROM ((((bucket_id = 'services-visits'::text) AND COALESCE((((storage.foldername(name))[1])::uuid) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s objects.services_visits_org_write CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s objects.services_visits_org_write CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "storage"."objects" WHERE ((((bucket_id = 'opura-docs'::text) AND ((storage.foldername(name))[1] = 'partner-uploads'::text) AND (((storage.foldername(name))[2] IN ( SELECT (partner_users.partner_workspace_id)::text AS partner_workspace_id
   FROM partner_users
  WHERE ((partner_users.email = (auth.jwt() ->> 'email'::text)) AND (partner_users.is_active = true)))) OR ((storage.foldername(name))[2] IN ( SELECT (pw.id)::text AS id
   FROM partner_workspaces pw
  WHERE is_org_member(pw.organization_id))))))) IS DISTINCT FROM ((((bucket_id = 'opura-docs'::text) AND ((storage.foldername(name))[1] = 'partner-uploads'::text) AND (((storage.foldername(name))[2] IN ( SELECT (partner_users.partner_workspace_id)::text AS partner_workspace_id
   FROM partner_users
  WHERE ((partner_users.email = (auth.jwt() ->> 'email'::text)) AND (partner_users.is_active = true)))) OR ((storage.foldername(name))[2] IN ( SELECT (pw.id)::text AS id
   FROM partner_workspaces pw
  WHERE COALESCE((pw.organization_id) IN (SELECT public.minhas_orgs_membro()), false)))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s objects.storage_docs_select_partner_uploads USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s objects.storage_docs_select_partner_uploads USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
  END LOOP;
  RAISE EXCEPTION 'RESULTADOS: lote 3: % comparações (expressão × usuário), % linhas com resultado diferente%', testes, total,
    CASE WHEN detalhes = '' THEN '' ELSE E'
' || left(detalhes, 3000) END;
END
$c$;
