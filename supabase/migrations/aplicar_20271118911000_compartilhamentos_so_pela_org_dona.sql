-- ==========================================================================
-- Compartilhamento entre organizações (fornecedor, cliente, rubrica, base personalizada e
-- colaborador): só quem é membro da organização DONA do registro compartilha, e só para uma
-- organização de que também é membro (ou gestor, onde já se exigia); e a dona de rubrica e de
-- base personalizada não muda pela mão de quem só recebeu
-- Date: 2026-11-18
-- Prova: scripts/teste-compartilhamentos-e-auditoria-folha.sql
-- Base:  policies vigentes no banco em 18/11 (lidas de pg_policies; o repositório tem drift).
--        sos_manage/cos_manage = aplicar_20270918000019 reescritas por conjunto em
--        aplicar_20271112710000; ros_manage/cdos_manage e employee_shares_insert_delete idem.
-- ==========================================================================
-- Origem: revisores da varredura Claude Security de 15/11/2026 (notas de F72 e F9). O F72 pediu
-- a trava em supplier_org_shares; as outras quatro tabelas de compartilhamento têm a MESMA
-- policy (só olha o destino) e entram juntas.
--
-- O QUE FECHA
--   Nas cinco, a policy de escrita (FOR ALL) só conferia o DESTINO (target_org_id). Quem é da
--   org A gravava, por exemplo,
--     INSERT INTO supplier_org_shares (supplier_id, target_org_id) VALUES (<fornecedor da org B>, <A>)
--   e a policy de leitura do registro (que tem o ramo "compartilhado com uma org minha") passava a
--   entregar o cadastro de B para A:
--   1. supplier_org_shares · sos_manage (membro do destino): fornecedor de outra org — CNPJ/CPF,
--      endereço, contato. É o compartilhamento que o pix_quote passa a aceitar como "fornecedor
--      disponibilizado para a org do título" (F72, _shared/pixFavorecido.ts): sem esta trava, o
--      F72 continuaria aberto por aqui.
--   2. client_org_shares · cos_manage (membro do destino): cliente de outra org — CPF/CNPJ e
--      contato.
--   3. rubric_org_shares · ros_manage (gestor do destino): rubrica de folha de outra org — e
--      rubrics_update/rubrics_delete também aceitam o ramo do compartilhamento, então o gestor de
--      A passava a EDITAR e APAGAR rubrica da folha de B. O histórico de rubrica
--      (payroll_audit_logs, migration seguinte) usa essa mesma visibilidade.
--   4. custom_database_org_shares · cdos_manage (gestor do destino): base personalizada de outra org.
--   5. employee_org_shares · employee_shares_insert_delete: aqui a policy conferia a ORIGEM (o
--      colaborador é de uma org minha) e não o destino — membro da org dona disponibilizava o
--      colaborador para QUALQUER organização, inclusive de outro cliente do SaaS: ele aparecia no
--      RH e na lista de Credor dela, e o pix_quote dela devolvia as chaves dele. É o defeito que o
--      #537 fechou em employees (o compartilhamento como porta para uma org alheia).
--   6. rubrics e custom_databases · a DONA mudava pela mão de quem só recebeu: rubrics_update e
--      custom_databases_update não têm WITH CHECK próprio e o USING aceita o ramo do
--      compartilhamento. Qualquer membro da org destino fazia UPDATE … SET organization_id = <a
--      dele> (ou NULL: a rubrica virava global para todo o SaaS) e, dono, recompartilhava para
--      onde quisesse — anulando os itens 3 e 4. Policy não enxerga o valor antigo; por isso um
--      gatilho (fn_trava_troca_de_dona): mudar a organização exige ser membro da antiga E da nova
--      (nenhuma nula), salvo superadmin ou chamada sem usuário (service_role/postgres). Ninguém
--      muda essa coluna hoje: a tela de rubricas e a de bases não editam a organização, e nenhuma
--      função do banco faz UPDATE nessas tabelas.
--
-- O QUE MUDA
--   WITH CHECK (vale para INSERT e para a linha nova de UPDATE) passa a exigir as DUAS pontas:
--   a org dona do registro é minha (fn_*_da_minha_org / employees.org_id) E o destino é meu
--   (membro; gestor em rubrica e base personalizada, como já era) — ou superadmin, onde já havia.
--   USING fica igual: quem é do destino segue vendo e podendo desfazer o que recebeu.
--   employee_shares_insert_delete passa de TO public para TO authenticated (anon não tem
--   privilégio na tabela; nada muda na prática). As outras quatro perdem o privilégio de tabela
--   de anon (não havia policy para anon).
--
-- QUEM ESCREVE NESSAS TABELAS (conferido em 18/11)
--   · Front: só laborService.setEmployeeShares (employee_org_shares, em RH › Colaboradores ›
--     Disponibilizar Colaborador — a tela só oferece as orgs do usuário; nesta entrega passa a
--     gravar só a diferença). Nenhuma escrita direta nas outras quatro, nem em Edge Function.
--   · Banco: fn_share_com_minhas_orgs (gatilho de suppliers/clients), fn_incluir_org_nos_catalogos,
--     mover_contrato_organizacao, sindico_portal_salvar_fornecedor — SECURITY DEFINER de postgres
--     (BYPASSRLS), não passam por estas policies; fn_condominio_migrar (INVOKER) só é executável
--     por postgres/service_role.
--     ⚠️ Três delas compartilham sem exigir a org dona, e ficam como estão (decisão de produto,
--     fora desta migration): fn_incluir_org_nos_catalogos (gestor de p_org) repassa para p_org o
--     que uma org sua só RECEBEU; sindico_portal_salvar_fornecedor acha o fornecedor pelo CNPJ em
--     todo o SaaS e o compartilha com a org do condomínio; mover_contrato_organizacao leva para o
--     destino os fornecedores dos títulos, inclusive os recebidos. Nenhuma grava em
--     employee_org_shares. Ou seja: depois desta migration, compartilhamento de COLABORADOR só
--     nasce pela org dona; o de fornecedor/cliente/rubrica/base, pela API, também — mas ainda
--     pode chegar por essas três funções.
--   · Dados em 18/11: 743 compartilhamentos de fornecedor, 85 de cliente, 124 de rubrica, 4 de
--     base personalizada e 15 de colaborador — TODOS entre orgs com pelo menos um membro em comum.
--     Nada existente fica de fora (e policy não revalida linha existente; vale para a próxima
--     escrita).
--
-- POR QUE FUNÇÕES PARA A ORG DONA
--   suppliers_select, clients_select, rubrics_select e custom_databases_select consultam a tabela
--   de compartilhamento; uma subconsulta nelas dentro da policy da tabela de compartilhamento faria
--   o planejador expandir as policies de volta ("infinite recursion detected in policy"). As
--   fn_*_da_minha_org são SECURITY DEFINER (leem a dona real, sem RLS) e só respondem sobre as
--   orgs de quem chama. employees não tem esse ciclo (o ramo de compartilhamento dele é uma
--   função), por isso employee_org_shares segue com a subconsulta de antes.
--
-- ORDEM: DEPOIS do merge (front publicado) e ANTES de publicar a asaas-payment desta entrega.
--   · Depois do merge: o setEmployeeShares antigo apaga TODAS as disponibilizações do colaborador
--     e reinsere a lista da tela, que inclui destinos criados por outra pessoa para orgs de que
--     quem salva não é membro (18/11: 7 compartilhamentos, 4 pessoas). Com esta policy, o
--     reinsert desses é recusado depois do DELETE — o colaborador perderia tudo. O front desta
--     entrega grava só a diferença. Bundle velho em cache ainda corre esse risco até recarregar.
--   · Antes da asaas-payment: o pix_quote novo passa a confiar em supplier_org_shares.
--
-- COMO CONFERIR
--   npx supabase db query --linked -o table "SELECT tablename, policyname, roles::text, with_check FROM pg_policies WHERE policyname IN ('sos_manage','cos_manage','ros_manage','cdos_manage','employee_shares_insert_delete')"
--   → cada WITH CHECK com a função da org dona (ou employees.org_id) E target_org_id.
--   npx supabase db query --linked -o table "SELECT tgname, tgrelid::regclass FROM pg_trigger WHERE tgname LIKE '%trava_troca_de_dona'"
--   → os dois gatilhos (rubrics, custom_databases).
--   E a prova inteira: npx supabase db query --linked -f scripts/teste-compartilhamentos-e-auditoria-folha.sql
--
-- ROLLBACK (volta às policies de 18/11)
--   DROP POLICY sos_manage ON public.supplier_org_shares;
--   CREATE POLICY sos_manage ON public.supplier_org_shares FOR ALL TO authenticated
--     USING (COALESCE((target_org_id IN (SELECT minhas_orgs_membro())), false) OR is_superadmin())
--     WITH CHECK (COALESCE((target_org_id IN (SELECT minhas_orgs_membro())), false) OR is_superadmin());
--   DROP POLICY cos_manage ON public.client_org_shares;
--   CREATE POLICY cos_manage ON public.client_org_shares FOR ALL TO authenticated
--     USING (COALESCE((target_org_id IN (SELECT minhas_orgs_membro())), false) OR is_superadmin())
--     WITH CHECK (COALESCE((target_org_id IN (SELECT minhas_orgs_membro())), false) OR is_superadmin());
--   DROP POLICY ros_manage ON public.rubric_org_shares;
--   CREATE POLICY ros_manage ON public.rubric_org_shares FOR ALL TO authenticated
--     USING (is_org_manager(target_org_id) OR is_superadmin()) WITH CHECK (is_org_manager(target_org_id) OR is_superadmin());
--   DROP POLICY cdos_manage ON public.custom_database_org_shares;
--   CREATE POLICY cdos_manage ON public.custom_database_org_shares FOR ALL TO authenticated
--     USING (is_org_manager(target_org_id) OR is_superadmin()) WITH CHECK (is_org_manager(target_org_id) OR is_superadmin());
--   DROP POLICY employee_shares_insert_delete ON public.employee_org_shares;
--   CREATE POLICY employee_shares_insert_delete ON public.employee_org_shares FOR ALL TO public
--     USING (COALESCE(((SELECT employees.org_id FROM employees WHERE employees.id = employee_org_shares.employee_id)
--            IN (SELECT minhas_orgs_membro())), false));
--   DROP FUNCTION public.fn_fornecedor_da_minha_org(uuid), public.fn_cliente_da_minha_org(uuid),
--                 public.fn_rubrica_da_minha_org(text), public.fn_base_personalizada_da_minha_org(uuid);
--   DROP TRIGGER trg_rubrics_trava_troca_de_dona ON public.rubrics;
--   DROP TRIGGER trg_custom_databases_trava_troca_de_dona ON public.custom_databases;
--   DROP FUNCTION public.fn_trava_troca_de_dona();
--   GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, MAINTAIN ON public.supplier_org_shares,
--     public.client_org_shares, public.rubric_org_shares, public.custom_database_org_shares TO anon;
-- ==========================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

-- ── helpers: a org DONA do registro é de quem chama? ─────────────────────────
-- (a dona, não a que só recebeu o compartilhamento). Usadas só nos WITH CHECK abaixo;
-- authenticated precisa de EXECUTE porque a policy roda com o papel de quem grava.

CREATE OR REPLACE FUNCTION public.fn_fornecedor_da_minha_org(p_supplier_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.suppliers s
         WHERE s.id = p_supplier_id
           AND s.organization_id IN (SELECT public.minhas_orgs_membro())
    );
$$;

CREATE OR REPLACE FUNCTION public.fn_cliente_da_minha_org(p_client_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.clients c
         WHERE c.id = p_client_id
           AND c.organization_id IN (SELECT public.minhas_orgs_membro())
    );
$$;

CREATE OR REPLACE FUNCTION public.fn_rubrica_da_minha_org(p_rubric_code TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.rubrics r
         WHERE r.code = p_rubric_code
           AND r.organization_id IN (SELECT public.minhas_orgs_membro())
    );
$$;

CREATE OR REPLACE FUNCTION public.fn_base_personalizada_da_minha_org(p_database_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.custom_databases d
         WHERE d.id = p_database_id
           AND d.organization_id IN (SELECT public.minhas_orgs_membro())
    );
$$;

REVOKE ALL ON FUNCTION public.fn_fornecedor_da_minha_org(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_cliente_da_minha_org(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_rubrica_da_minha_org(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_base_personalizada_da_minha_org(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_fornecedor_da_minha_org(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_cliente_da_minha_org(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_rubrica_da_minha_org(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_base_personalizada_da_minha_org(UUID) TO authenticated, service_role;

-- ── 1. supplier_org_shares ───────────────────────────────────────────────────
DROP POLICY IF EXISTS sos_manage ON public.supplier_org_shares;
CREATE POLICY sos_manage ON public.supplier_org_shares
    FOR ALL TO authenticated
    USING (
        COALESCE(target_org_id IN (SELECT public.minhas_orgs_membro()), false)
        OR public.is_superadmin()
    )
    WITH CHECK (
        (COALESCE(target_org_id IN (SELECT public.minhas_orgs_membro()), false)
         AND public.fn_fornecedor_da_minha_org(supplier_id))
        OR public.is_superadmin()
    );

-- ── 2. client_org_shares ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS cos_manage ON public.client_org_shares;
CREATE POLICY cos_manage ON public.client_org_shares
    FOR ALL TO authenticated
    USING (
        COALESCE(target_org_id IN (SELECT public.minhas_orgs_membro()), false)
        OR public.is_superadmin()
    )
    WITH CHECK (
        (COALESCE(target_org_id IN (SELECT public.minhas_orgs_membro()), false)
         AND public.fn_cliente_da_minha_org(client_id))
        OR public.is_superadmin()
    );

-- ── 3. rubric_org_shares (gestor do destino, como já era) ────────────────────
DROP POLICY IF EXISTS ros_manage ON public.rubric_org_shares;
CREATE POLICY ros_manage ON public.rubric_org_shares
    FOR ALL TO authenticated
    USING (public.is_org_manager(target_org_id) OR public.is_superadmin())
    WITH CHECK (
        (public.is_org_manager(target_org_id) AND public.fn_rubrica_da_minha_org(rubric_code))
        OR public.is_superadmin()
    );

-- ── 4. custom_database_org_shares (gestor do destino, como já era) ──────────
DROP POLICY IF EXISTS cdos_manage ON public.custom_database_org_shares;
CREATE POLICY cdos_manage ON public.custom_database_org_shares
    FOR ALL TO authenticated
    USING (public.is_org_manager(target_org_id) OR public.is_superadmin())
    WITH CHECK (
        (public.is_org_manager(target_org_id) AND public.fn_base_personalizada_da_minha_org(database_id))
        OR public.is_superadmin()
    );

-- anon não tem policy em nenhuma das quatro (a RLS já recusava tudo); tira também o privilégio
-- de tabela. Ninguém lê estas tabelas como anon: portais usam RPC, Edge Function usa service_role.
REVOKE ALL ON TABLE public.supplier_org_shares FROM anon;
REVOKE ALL ON TABLE public.client_org_shares FROM anon;
REVOKE ALL ON TABLE public.rubric_org_shares FROM anon;
REVOKE ALL ON TABLE public.custom_database_org_shares FROM anon;

-- ── 5. employee_org_shares: o destino também tem de ser org de quem compartilha ──
DROP POLICY IF EXISTS employee_shares_insert_delete ON public.employee_org_shares;
CREATE POLICY employee_shares_insert_delete ON public.employee_org_shares
    FOR ALL TO authenticated
    USING (
        COALESCE((SELECT e.org_id FROM public.employees e WHERE e.id = employee_org_shares.employee_id)
                 IN (SELECT public.minhas_orgs_membro()), false)
    )
    WITH CHECK (
        COALESCE((SELECT e.org_id FROM public.employees e WHERE e.id = employee_org_shares.employee_id)
                 IN (SELECT public.minhas_orgs_membro()), false)
        AND COALESCE(target_org_id IN (SELECT public.minhas_orgs_membro()), false)
    );

-- ── 6. a DONA de rubrica e de base personalizada não muda pela mão de quem só recebeu ──
CREATE OR REPLACE FUNCTION public.fn_trava_troca_de_dona()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id THEN
        RETURN NEW;
    END IF;
    -- Sem usuário na requisição = chamada interna (service_role, postgres).
    IF auth.uid() IS NULL OR public.is_superadmin() THEN
        RETURN NEW;
    END IF;
    IF OLD.organization_id IS NULL OR NEW.organization_id IS NULL
       OR NOT (OLD.organization_id IN (SELECT public.minhas_orgs_membro()))
       OR NOT (NEW.organization_id IN (SELECT public.minhas_orgs_membro())) THEN
        RAISE EXCEPTION USING ERRCODE = '42501',
            MESSAGE = format('sem acesso: só quem é membro da organização dona e da nova muda a organização de %s', TG_TABLE_NAME);
    END IF;
    RETURN NEW;
END;
$$;

-- Função de gatilho não é chamável como RPC; o REVOKE fica pela regra (REGRA #7).
REVOKE ALL ON FUNCTION public.fn_trava_troca_de_dona() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_rubrics_trava_troca_de_dona ON public.rubrics;
CREATE TRIGGER trg_rubrics_trava_troca_de_dona
    BEFORE UPDATE OF organization_id ON public.rubrics
    FOR EACH ROW EXECUTE FUNCTION public.fn_trava_troca_de_dona();

DROP TRIGGER IF EXISTS trg_custom_databases_trava_troca_de_dona ON public.custom_databases;
CREATE TRIGGER trg_custom_databases_trava_troca_de_dona
    BEFORE UPDATE OF organization_id ON public.custom_databases
    FOR EACH ROW EXECUTE FUNCTION public.fn_trava_troca_de_dona();

COMMIT;
