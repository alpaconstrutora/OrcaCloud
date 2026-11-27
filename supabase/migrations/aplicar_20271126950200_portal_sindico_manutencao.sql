-- ============================================================================
-- Portal do Síndico › G4: manutenção e equipamentos (26/11/2026)
--
-- Plano: docs/planos/2026-10-24-portal-sindico-gestao-completa.md (G4)
-- Pronto quando: síndico abre e conclui OS, cadastra equipamento com marca/modelo.
--
-- O app grava direto nas tabelas (ManutencaoTab/AtivosTab, RLS de membro) e a
-- regra mora no banco: concluir a OS faz `trg_maintenance_order_completed`
-- recalcular o próximo vencimento do item do plano; o código patrimonial do
-- equipamento nasce em `fn_opura_assets_codigo`; o texto de marca/modelo é
-- espelhado do catálogo por `fn_catalogo_espelho`. O síndico não é membro, então
-- aqui são RPCs que gravam nas MESMAS tabelas — os gatilhos continuam valendo.
--
--   • `sindico_portal_manutencao` (ler): sistemas, plano vigente + itens, OS e
--     equipamentos do condomínio, com ids (a leitura de `sindico_portal_dados`
--     é a vitrine do morador, sem id nem cadastro).
--   • OS: abrir/editar (enquanto aberta), concluir (data de execução ≤ hoje,
--     custo, achados) e cancelar com motivo — o portal NÃO apaga OS: concluída
--     é o registro técnico do prédio e a âncora do vencimento do plano.
--   • Plano: incluir/editar item (cria o plano VIGENTE se não houver) e tirar do
--     plano (`is_active = false`; o histórico fica).
--   • Equipamento: cadastrar/editar com marca e modelo pelo NOME — acha ou cria
--     no catálogo da org (`brandModelService.resolverMarcaModelo`: chave =
--     `name_key`, nome normalizado como `utils/catalogoNome.normalizarNome`);
--     remover só sem OS que aponte para ele.
--
-- Escrita: `fn_sindico_operar` + `fn_sindico_motivo_nao_opera` (recorte por
-- condomínio). Autor no histórico do síndico. Grava na `fn_org_do_condominio`.
-- REGRA #7: REVOKE de PUBLIC/anon em toda função; autorização DENTRO.
-- Reverter: DROP das funções novas; o CHECK de ações volta à lista de …950100.
-- ============================================================================

ALTER TABLE public.sindico_financeiro_eventos
    ADD COLUMN IF NOT EXISTS referencia_id uuid;
COMMENT ON COLUMN public.sindico_financeiro_eventos.referencia_id IS
    'Registro não financeiro tocado pelo portal (OS, item do plano, equipamento…) — a ação diz qual tabela.';
ALTER TABLE public.sindico_financeiro_eventos DROP CONSTRAINT IF EXISTS sindico_financeiro_eventos_acao_check;
ALTER TABLE public.sindico_financeiro_eventos ADD CONSTRAINT sindico_financeiro_eventos_acao_check
    CHECK (acao IN ('LANCAR', 'EDITAR', 'CANCELAR', 'BAIXAR', 'FORNECEDOR', 'FORNECEDOR_COMPARTILHADO',
                    'RATEIO_SALVAR', 'RATEIO_FECHAR', 'RATEIO_CANCELAR', 'RATEIO_COTAS',
                    'CONTA_SALVAR', 'RECEBER', 'DESFAZER_BAIXA', 'LANCAR_RECEITA',
                    'EXTRATO_IMPORTAR', 'EXTRATO_CONCILIAR', 'EXTRATO_DESFAZER', 'EXTRATO_IGNORAR',
                    'EXTRATO_RESTAURAR', 'EXTRATO_LANCAR',
                    'FORNECEDOR_EDITAR', 'FORNECEDOR_CONTA', 'CONTRATO_SALVAR', 'CONTRATO_ENCERRAR',
                    'OS_SALVAR', 'OS_CONCLUIR', 'OS_CANCELAR', 'PLANO_ITEM_SALVAR', 'PLANO_ITEM_REMOVER',
                    'ATIVO_SALVAR', 'ATIVO_REMOVER'));

-- ── 0. Auxiliares ────────────────────────────────────────────────────────────
-- Autorização comum da escrita: { ok, client_id, nome, org } ou { ok:false, motivo }.
CREATE OR REPLACE FUNCTION public.fn_sindico_escrita_no_predio(p_token text, p_client_id uuid, p_emp uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_r      jsonb := public.fn_sindico_operar(p_token, p_client_id);
    v_motivo text;
BEGIN
    IF NOT (v_r ->> 'ok')::boolean THEN RETURN v_r; END IF;
    IF p_emp IS NULL OR p_emp NOT IN (SELECT public.fn_sindico_predios((v_r ->> 'client_id')::uuid)) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Condomínio fora do seu mandato.');
    END IF;
    v_motivo := public.fn_sindico_motivo_nao_opera(p_emp);
    IF v_motivo IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', v_motivo); END IF;
    RETURN v_r || jsonb_build_object('org', public.fn_org_do_condominio(p_emp));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_sindico_escrita_no_predio(text, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Marca/modelo pelo nome no catálogo da org (acha pela `name_key` ou cria).
CREATE OR REPLACE FUNCTION public.fn_sindico_marca_modelo(p_org uuid, p_marca text, p_modelo text)
RETURNS TABLE (marca_id uuid, modelo_id uuid)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_marca  text := nullif(left(btrim(regexp_replace(coalesce(p_marca, ''), '\s+', ' ', 'g')), 100), '');
    v_modelo text := nullif(left(btrim(regexp_replace(coalesce(p_modelo, ''), '\s+', ' ', 'g')), 100), '');
    v_b      uuid;
    v_m      uuid;
BEGIN
    v_marca  := btrim(v_marca);
    v_modelo := btrim(v_modelo);
    IF v_marca IS NULL THEN RETURN QUERY SELECT NULL::uuid, NULL::uuid; RETURN; END IF;
    INSERT INTO public.product_brands (organization_id, name, created_by)
    VALUES (p_org, v_marca, auth.uid())
    ON CONFLICT (organization_id, name_key) DO NOTHING;
    SELECT b.id INTO v_b FROM public.product_brands b WHERE b.organization_id = p_org AND b.name_key = lower(v_marca);
    IF v_modelo IS NOT NULL THEN
        INSERT INTO public.product_models (organization_id, brand_id, name, item_type, created_by)
        VALUES (p_org, v_b, v_modelo, 'equipamento', auth.uid())
        ON CONFLICT (brand_id, name_key) DO NOTHING;
        SELECT m.id INTO v_m FROM public.product_models m WHERE m.brand_id = v_b AND m.name_key = lower(v_modelo);
    END IF;
    RETURN QUERY SELECT v_b, v_m;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_sindico_marca_modelo(uuid, text, text) FROM PUBLIC, anon, authenticated;

-- ── 1. Ler ───────────────────────────────────────────────────────────────────
-- Não STABLE: o resolvedor grava `last_used_at` do link.
CREATE OR REPLACE FUNCTION public.sindico_portal_manutencao(p_token text, p_client_id uuid, p_empreendimento_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_r     jsonb;
    v_cli   uuid;
    v_org   uuid;
    v_plano public.maintenance_plans;
BEGIN
    v_r := public.fn_sindico_resolver(p_token, p_client_id, 'ler');
    IF NOT (v_r ->> 'ok')::boolean THEN RETURN v_r; END IF;
    v_cli := (v_r ->> 'client_id')::uuid;
    IF p_empreendimento_id IS NULL OR p_empreendimento_id NOT IN (SELECT public.fn_sindico_predios(v_cli)) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Condomínio fora do seu mandato.');
    END IF;
    v_org := public.fn_org_do_condominio(p_empreendimento_id);
    SELECT * INTO v_plano FROM public.maintenance_plans
     WHERE empreendimento_id = p_empreendimento_id AND status = 'VIGENTE'
     ORDER BY valid_from DESC NULLS LAST, created_at DESC LIMIT 1;

    RETURN jsonb_build_object('ok', true,
        'sistemas', coalesce((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'nome', s.name) ORDER BY s.sort_order NULLS LAST, s.name)
                                FROM public.building_systems s WHERE s.organization_id = v_org AND coalesce(s.is_active, true)), '[]'::jsonb),
        'plano', CASE WHEN v_plano.id IS NULL THEN NULL
                      ELSE jsonb_build_object('id', v_plano.id, 'nome', v_plano.name, 'desde', v_plano.valid_from) END,
        'itens', coalesce((SELECT jsonb_agg(jsonb_build_object(
                    'id', i.id, 'descricao', i.description, 'sistemaId', i.building_system_id, 'sistema', s.name,
                    'periodicidadeValor', i.periodicity_value, 'periodicidadeUnidade', i.periodicity_unit,
                    'responsavel', i.responsible_type, 'proximo', i.next_due_date, 'ultimaExecucao', i.last_executed_at
                 ) ORDER BY i.next_due_date NULLS LAST, i.description)
                   FROM public.maintenance_plan_items i
                   LEFT JOIN public.building_systems s ON s.id = i.building_system_id
                  WHERE i.plan_id = v_plano.id AND coalesce(i.is_active, true)), '[]'::jsonb),
        'ordens', coalesce((SELECT jsonb_agg(jsonb_build_object(
                    'id', o.id, 'codigo', o.code, 'tipo', o.type, 'prioridade', o.priority, 'status', o.status,
                    'descricao', o.description, 'sistemaId', o.building_system_id, 'sistema', s.name,
                    'itemId', o.plan_item_id, 'ativoId', o.asset_id, 'ativo', a.name,
                    'previsto', o.scheduled_date, 'executado', o.executed_date, 'custo', o.cost,
                    'fornecedorId', o.supplier_id, 'fornecedor', f.name, 'achados', o.findings
                 ) ORDER BY (o.status IN ('CONCLUIDA', 'CANCELADA')), o.scheduled_date DESC NULLS FIRST, o.created_at DESC)
                   FROM public.maintenance_orders o
                   LEFT JOIN public.building_systems s ON s.id = o.building_system_id
                   LEFT JOIN public.opura_assets a ON a.id = o.asset_id
                   LEFT JOIN public.suppliers f ON f.id = o.supplier_id
                  WHERE o.empreendimento_id = p_empreendimento_id), '[]'::jsonb),
        'ativos', coalesce((SELECT jsonb_agg(jsonb_build_object(
                    'id', a.id, 'codigo', a.code, 'nome', a.name, 'sistemaId', a.building_system_id, 'sistema', s.name,
                    'marca', a.brand, 'modelo', a.model, 'serie', a.serial_number, 'local', a.location,
                    'compra', a.purchase_date, 'garantiaAte', a.supplier_warranty_until, 'obs', a.notes,
                    'ordens', (SELECT count(*) FROM public.maintenance_orders o WHERE o.asset_id = a.id)
                 ) ORDER BY a.name)
                   FROM public.opura_assets a
                   LEFT JOIN public.building_systems s ON s.id = a.building_system_id
                  WHERE a.empreendimento_id = p_empreendimento_id AND a.category = 'sistema_predial'), '[]'::jsonb),
        'marcas', coalesce((SELECT jsonb_agg(b.name ORDER BY b.name) FROM public.product_brands b
                             WHERE b.organization_id = v_org AND coalesce(b.is_active, true)), '[]'::jsonb),
        'podeOperar', public.fn_sindico_motivo_nao_opera(p_empreendimento_id) IS NULL,
        'motivoNaoOpera', public.fn_sindico_motivo_nao_opera(p_empreendimento_id));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_manutencao(text, uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_manutencao(text, uuid, uuid) TO anon, authenticated;

-- ── 2. Ordem de serviço: abrir / editar ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sindico_portal_os_salvar(
    p_token text, p_client_id uuid, p_empreendimento_id uuid, p_os_id uuid, p_dados jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_a     jsonb := public.fn_sindico_escrita_no_predio(p_token, p_client_id, p_empreendimento_id);
    v_org   uuid;
    v_antes public.maintenance_orders;
    v_id    uuid;
    v_desc  text := nullif(btrim(coalesce(p_dados ->> 'descricao', '')), '');
    v_tipo  text := coalesce(nullif(p_dados ->> 'tipo', ''), 'CORRETIVA');
    v_prio  text := coalesce(nullif(p_dados ->> 'prioridade', ''), 'NORMAL');
    v_sis   uuid := nullif(p_dados ->> 'sistemaId', '')::uuid;
    v_item  uuid := nullif(p_dados ->> 'itemId', '')::uuid;
    v_ativo uuid := nullif(p_dados ->> 'ativoId', '')::uuid;
    v_forn  uuid := nullif(p_dados ->> 'fornecedorId', '')::uuid;
    v_prev  date := nullif(p_dados ->> 'previsto', '')::date;
BEGIN
    IF NOT (v_a ->> 'ok')::boolean THEN RETURN v_a; END IF;
    v_org := (v_a ->> 'org')::uuid;
    IF v_desc IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'Descreva o serviço.'); END IF;
    IF v_tipo NOT IN ('PREVENTIVA', 'CORRETIVA', 'INSPECAO') THEN RETURN jsonb_build_object('ok', false, 'motivo', 'Tipo inválido.'); END IF;
    IF v_prio NOT IN ('BAIXA', 'NORMAL', 'ALTA', 'EMERGENCIA') THEN RETURN jsonb_build_object('ok', false, 'motivo', 'Prioridade inválida.'); END IF;
    IF v_sis IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.building_systems WHERE id = v_sis AND organization_id = v_org) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Sistema não cadastrado neste condomínio.');
    END IF;
    IF v_item IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.maintenance_plan_items i JOIN public.maintenance_plans p ON p.id = i.plan_id
         WHERE i.id = v_item AND p.empreendimento_id = p_empreendimento_id) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Item do plano não é deste condomínio.');
    END IF;
    IF v_ativo IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.opura_assets WHERE id = v_ativo AND empreendimento_id = p_empreendimento_id) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Equipamento não é deste condomínio.');
    END IF;
    IF v_forn IS NOT NULL AND NOT public.fn_sindico_fornecedor_visivel(v_forn, v_org) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Fornecedor não cadastrado neste condomínio.');
    END IF;

    IF p_os_id IS NULL THEN
        INSERT INTO public.maintenance_orders (
            empreendimento_id, organization_id, plan_item_id, building_system_id, asset_id, type, priority,
            status, description, scheduled_date, supplier_id
        ) VALUES (
            p_empreendimento_id, v_org, v_item, v_sis, v_ativo, v_tipo, v_prio,
            CASE WHEN v_prev IS NULL THEN 'ABERTA' ELSE 'AGENDADA' END, v_desc, v_prev, v_forn
        ) RETURNING id INTO v_id;
    ELSE
        SELECT * INTO v_antes FROM public.maintenance_orders
         WHERE id = p_os_id AND empreendimento_id = p_empreendimento_id FOR UPDATE;
        IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'Ordem de serviço não encontrada neste condomínio.'); END IF;
        IF v_antes.status IN ('CONCLUIDA', 'CANCELADA') THEN
            RETURN jsonb_build_object('ok', false, 'motivo', 'Ordem concluída ou cancelada não se edita — é o registro do que aconteceu.');
        END IF;
        UPDATE public.maintenance_orders
           SET plan_item_id = v_item, building_system_id = v_sis, asset_id = v_ativo, type = v_tipo, priority = v_prio,
               description = v_desc, scheduled_date = v_prev, supplier_id = v_forn,
               status = CASE WHEN status = 'EM_EXECUCAO' THEN status WHEN v_prev IS NULL THEN 'ABERTA' ELSE 'AGENDADA' END
         WHERE id = p_os_id
        RETURNING id INTO v_id;
    END IF;

    INSERT INTO public.sindico_financeiro_eventos (organization_id, empreendimento_id, client_id, nome, acao, referencia_id, supplier_id, antes, depois)
    SELECT v_org, p_empreendimento_id, (v_a ->> 'client_id')::uuid, v_a ->> 'nome', 'OS_SALVAR', o.id, o.supplier_id,
           CASE WHEN v_antes.id IS NULL THEN NULL ELSE to_jsonb(v_antes) END, to_jsonb(o)
      FROM public.maintenance_orders o WHERE o.id = v_id;
    RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_os_salvar(text, uuid, uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_os_salvar(text, uuid, uuid, uuid, jsonb) TO authenticated;

-- ── 3. Concluir / cancelar ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sindico_portal_os_concluir(
    p_token text, p_client_id uuid, p_empreendimento_id uuid, p_os_id uuid, p_data date, p_custo numeric, p_achados text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_a     jsonb := public.fn_sindico_escrita_no_predio(p_token, p_client_id, p_empreendimento_id);
    v_antes public.maintenance_orders;
    v_hoje  date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
    IF NOT (v_a ->> 'ok')::boolean THEN RETURN v_a; END IF;
    SELECT * INTO v_antes FROM public.maintenance_orders WHERE id = p_os_id AND empreendimento_id = p_empreendimento_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'Ordem de serviço não encontrada neste condomínio.'); END IF;
    IF v_antes.status IN ('CONCLUIDA', 'CANCELADA') THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Esta ordem já está concluída ou cancelada.');
    END IF;
    IF p_data IS NULL OR p_data > v_hoje THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Informe a data da execução (não pode ser futura).');
    END IF;
    IF p_custo IS NOT NULL AND p_custo < 0 THEN RETURN jsonb_build_object('ok', false, 'motivo', 'Custo inválido.'); END IF;

    -- `trg_maintenance_order_completed` recalcula o próximo vencimento do item do plano.
    UPDATE public.maintenance_orders
       SET status = 'CONCLUIDA', executed_date = p_data, cost = coalesce(p_custo, cost),
           findings = coalesce(nullif(btrim(coalesce(p_achados, '')), ''), findings)
     WHERE id = p_os_id;

    INSERT INTO public.sindico_financeiro_eventos (organization_id, empreendimento_id, client_id, nome, acao, referencia_id, antes, depois)
    VALUES ((v_a ->> 'org')::uuid, p_empreendimento_id, (v_a ->> 'client_id')::uuid, v_a ->> 'nome', 'OS_CONCLUIR', p_os_id,
            jsonb_build_object('status', v_antes.status),
            jsonb_build_object('executado', p_data, 'custo', p_custo, 'achados', p_achados));
    RETURN jsonb_build_object('ok', true,
        'proximoDoPlano', (SELECT i.next_due_date FROM public.maintenance_plan_items i WHERE i.id = v_antes.plan_item_id));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_os_concluir(text, uuid, uuid, uuid, date, numeric, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_os_concluir(text, uuid, uuid, uuid, date, numeric, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.sindico_portal_os_cancelar(
    p_token text, p_client_id uuid, p_empreendimento_id uuid, p_os_id uuid, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_a     jsonb := public.fn_sindico_escrita_no_predio(p_token, p_client_id, p_empreendimento_id);
    v_antes public.maintenance_orders;
    v_obs   text := nullif(btrim(coalesce(p_motivo, '')), '');
BEGIN
    IF NOT (v_a ->> 'ok')::boolean THEN RETURN v_a; END IF;
    SELECT * INTO v_antes FROM public.maintenance_orders WHERE id = p_os_id AND empreendimento_id = p_empreendimento_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'Ordem de serviço não encontrada neste condomínio.'); END IF;
    IF v_antes.status IN ('CONCLUIDA', 'CANCELADA') THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Esta ordem já está concluída ou cancelada.');
    END IF;
    IF v_obs IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'Diga o motivo do cancelamento.'); END IF;

    UPDATE public.maintenance_orders
       SET status = 'CANCELADA',
           findings = btrim(coalesce(findings || E'\n', '') || 'Cancelada: ' || v_obs)
     WHERE id = p_os_id;

    INSERT INTO public.sindico_financeiro_eventos (organization_id, empreendimento_id, client_id, nome, acao, referencia_id, antes, depois)
    VALUES ((v_a ->> 'org')::uuid, p_empreendimento_id, (v_a ->> 'client_id')::uuid, v_a ->> 'nome', 'OS_CANCELAR', p_os_id,
            jsonb_build_object('status', v_antes.status), jsonb_build_object('motivo', v_obs));
    RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_os_cancelar(text, uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_os_cancelar(text, uuid, uuid, uuid, text) TO authenticated;

-- ── 4. Item do plano ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sindico_portal_plano_item_salvar(
    p_token text, p_client_id uuid, p_empreendimento_id uuid, p_item_id uuid, p_dados jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_a      jsonb := public.fn_sindico_escrita_no_predio(p_token, p_client_id, p_empreendimento_id);
    v_org    uuid;
    v_plano  uuid;
    v_antes  public.maintenance_plan_items;
    v_id     uuid;
    v_desc   text := nullif(btrim(coalesce(p_dados ->> 'descricao', '')), '');
    v_sis    uuid := nullif(p_dados ->> 'sistemaId', '')::uuid;
    v_valor  integer;
    v_un     text := coalesce(nullif(p_dados ->> 'periodicidadeUnidade', ''), 'MES');
    v_resp   text := nullif(p_dados ->> 'responsavel', '');
    v_prox   date;
BEGIN
    IF NOT (v_a ->> 'ok')::boolean THEN RETURN v_a; END IF;
    v_org := (v_a ->> 'org')::uuid;
    BEGIN
        v_valor := (p_dados ->> 'periodicidadeValor')::integer;
        v_prox  := nullif(p_dados ->> 'proximo', '')::date;
    EXCEPTION WHEN others THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Periodicidade ou data inválida.');
    END;
    IF v_desc IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'Descreva o serviço.'); END IF;
    IF v_valor IS NULL OR v_valor < 1 THEN RETURN jsonb_build_object('ok', false, 'motivo', 'Informe a cada quanto tempo o serviço se repete.'); END IF;
    IF v_un NOT IN ('DIA', 'SEMANA', 'MES', 'ANO') THEN RETURN jsonb_build_object('ok', false, 'motivo', 'Periodicidade inválida.'); END IF;
    IF v_resp IS NOT NULL AND v_resp NOT IN ('EQUIPE_LOCAL', 'EMPRESA_ESPECIALIZADA', 'FABRICANTE', 'ORGAO_PUBLICO') THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Responsável inválido.');
    END IF;
    IF v_sis IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.building_systems WHERE id = v_sis AND organization_id = v_org) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Sistema não cadastrado neste condomínio.');
    END IF;

    IF p_item_id IS NULL THEN
        SELECT id INTO v_plano FROM public.maintenance_plans
         WHERE empreendimento_id = p_empreendimento_id AND status = 'VIGENTE'
         ORDER BY valid_from DESC NULLS LAST, created_at DESC LIMIT 1;
        IF v_plano IS NULL THEN
            INSERT INTO public.maintenance_plans (empreendimento_id, organization_id, name, status, valid_from)
            VALUES (p_empreendimento_id, v_org,
                    'Plano de Manutenção — ' || (SELECT name FROM public.empreendimentos WHERE id = p_empreendimento_id),
                    'VIGENTE', (now() AT TIME ZONE 'America/Sao_Paulo')::date)
            RETURNING id INTO v_plano;
        END IF;
        INSERT INTO public.maintenance_plan_items (
            plan_id, organization_id, building_system_id, description, periodicity_value, periodicity_unit,
            responsible_type, is_active, next_due_date
        ) VALUES (v_plano, v_org, v_sis, v_desc, v_valor, v_un, v_resp, true, v_prox)
        RETURNING id INTO v_id;
    ELSE
        SELECT i.* INTO v_antes FROM public.maintenance_plan_items i JOIN public.maintenance_plans p ON p.id = i.plan_id
         WHERE i.id = p_item_id AND p.empreendimento_id = p_empreendimento_id FOR UPDATE OF i;
        IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'Item do plano não encontrado neste condomínio.'); END IF;
        UPDATE public.maintenance_plan_items
           SET building_system_id = v_sis, description = v_desc, periodicity_value = v_valor, periodicity_unit = v_un,
               responsible_type = v_resp, next_due_date = v_prox
         WHERE id = p_item_id
        RETURNING id INTO v_id;
    END IF;

    INSERT INTO public.sindico_financeiro_eventos (organization_id, empreendimento_id, client_id, nome, acao, referencia_id, antes, depois)
    SELECT v_org, p_empreendimento_id, (v_a ->> 'client_id')::uuid, v_a ->> 'nome', 'PLANO_ITEM_SALVAR', i.id,
           CASE WHEN v_antes.id IS NULL THEN NULL ELSE to_jsonb(v_antes) END, to_jsonb(i)
      FROM public.maintenance_plan_items i WHERE i.id = v_id;
    RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_plano_item_salvar(text, uuid, uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_plano_item_salvar(text, uuid, uuid, uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.sindico_portal_plano_item_remover(
    p_token text, p_client_id uuid, p_empreendimento_id uuid, p_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_a jsonb := public.fn_sindico_escrita_no_predio(p_token, p_client_id, p_empreendimento_id);
    v_n integer;
BEGIN
    IF NOT (v_a ->> 'ok')::boolean THEN RETURN v_a; END IF;
    UPDATE public.maintenance_plan_items i SET is_active = false
      FROM public.maintenance_plans p
     WHERE i.id = p_item_id AND p.id = i.plan_id AND p.empreendimento_id = p_empreendimento_id AND coalesce(i.is_active, true);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN RETURN jsonb_build_object('ok', false, 'motivo', 'Item do plano não encontrado neste condomínio.'); END IF;
    INSERT INTO public.sindico_financeiro_eventos (organization_id, empreendimento_id, client_id, nome, acao, referencia_id)
    VALUES ((v_a ->> 'org')::uuid, p_empreendimento_id, (v_a ->> 'client_id')::uuid, v_a ->> 'nome', 'PLANO_ITEM_REMOVER', p_item_id);
    RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_plano_item_remover(text, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_plano_item_remover(text, uuid, uuid, uuid) TO authenticated;

-- ── 5. Equipamento ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sindico_portal_ativo_salvar(
    p_token text, p_client_id uuid, p_empreendimento_id uuid, p_ativo_id uuid, p_dados jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_a     jsonb := public.fn_sindico_escrita_no_predio(p_token, p_client_id, p_empreendimento_id);
    v_org   uuid;
    v_antes public.opura_assets;
    v_id    uuid;
    v_nome  text := nullif(btrim(coalesce(p_dados ->> 'nome', '')), '');
    v_sis   uuid := nullif(p_dados ->> 'sistemaId', '')::uuid;
    v_mm    record;
    v_compra date;
    v_gar    date;
BEGIN
    IF NOT (v_a ->> 'ok')::boolean THEN RETURN v_a; END IF;
    v_org := (v_a ->> 'org')::uuid;
    IF v_nome IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'Informe o nome do equipamento.'); END IF;
    BEGIN
        v_compra := nullif(p_dados ->> 'compra', '')::date;
        v_gar    := nullif(p_dados ->> 'garantiaAte', '')::date;
    EXCEPTION WHEN others THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Data inválida.');
    END;
    IF v_sis IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.building_systems WHERE id = v_sis AND organization_id = v_org) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Sistema não cadastrado neste condomínio.');
    END IF;
    IF nullif(btrim(coalesce(p_dados ->> 'modelo', '')), '') IS NOT NULL AND nullif(btrim(coalesce(p_dados ->> 'marca', '')), '') IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Informe a marca do modelo.');
    END IF;
    SELECT * INTO v_mm FROM public.fn_sindico_marca_modelo(v_org, p_dados ->> 'marca', p_dados ->> 'modelo');

    IF p_ativo_id IS NULL THEN
        INSERT INTO public.opura_assets (
            organization_id, empreendimento_id, name, category, status, building_system_id,
            brand_id, model_id, serial_number, location, purchase_date, supplier_warranty_until, notes
        ) VALUES (
            v_org, p_empreendimento_id, v_nome, 'sistema_predial', 'em_uso', v_sis,
            v_mm.marca_id, v_mm.modelo_id,
            nullif(btrim(coalesce(p_dados ->> 'serie', '')), ''), nullif(btrim(coalesce(p_dados ->> 'local', '')), ''),
            v_compra, v_gar, nullif(btrim(coalesce(p_dados ->> 'obs', '')), '')
        ) RETURNING id INTO v_id;
    ELSE
        SELECT * INTO v_antes FROM public.opura_assets
         WHERE id = p_ativo_id AND empreendimento_id = p_empreendimento_id AND category = 'sistema_predial' FOR UPDATE;
        IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'Equipamento não encontrado neste condomínio.'); END IF;
        UPDATE public.opura_assets
           SET name = v_nome, building_system_id = v_sis, brand_id = v_mm.marca_id, model_id = v_mm.modelo_id,
               -- Sem marca, o texto some junto (o espelho só preenche a partir do id).
               brand = CASE WHEN v_mm.marca_id IS NULL THEN NULL ELSE brand END,
               model = CASE WHEN v_mm.modelo_id IS NULL THEN NULL ELSE model END,
               serial_number = nullif(btrim(coalesce(p_dados ->> 'serie', '')), ''),
               location = nullif(btrim(coalesce(p_dados ->> 'local', '')), ''),
               purchase_date = v_compra, supplier_warranty_until = v_gar,
               notes = nullif(btrim(coalesce(p_dados ->> 'obs', '')), '')
         WHERE id = p_ativo_id
        RETURNING id INTO v_id;
    END IF;

    INSERT INTO public.sindico_financeiro_eventos (organization_id, empreendimento_id, client_id, nome, acao, referencia_id, antes, depois)
    SELECT v_org, p_empreendimento_id, (v_a ->> 'client_id')::uuid, v_a ->> 'nome', 'ATIVO_SALVAR', a.id,
           CASE WHEN v_antes.id IS NULL THEN NULL ELSE to_jsonb(v_antes) END, to_jsonb(a)
      FROM public.opura_assets a WHERE a.id = v_id;
    RETURN jsonb_build_object('ok', true, 'id', v_id, 'codigo', (SELECT code FROM public.opura_assets WHERE id = v_id));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_ativo_salvar(text, uuid, uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_ativo_salvar(text, uuid, uuid, uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.sindico_portal_ativo_remover(
    p_token text, p_client_id uuid, p_empreendimento_id uuid, p_ativo_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_a     jsonb := public.fn_sindico_escrita_no_predio(p_token, p_client_id, p_empreendimento_id);
    v_antes public.opura_assets;
BEGIN
    IF NOT (v_a ->> 'ok')::boolean THEN RETURN v_a; END IF;
    SELECT * INTO v_antes FROM public.opura_assets
     WHERE id = p_ativo_id AND empreendimento_id = p_empreendimento_id AND category = 'sistema_predial' FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'Equipamento não encontrado neste condomínio.'); END IF;
    IF EXISTS (SELECT 1 FROM public.maintenance_orders WHERE asset_id = p_ativo_id) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Este equipamento tem ordens de serviço no histórico — não dá para remover.');
    END IF;
    DELETE FROM public.opura_assets WHERE id = p_ativo_id;
    INSERT INTO public.sindico_financeiro_eventos (organization_id, empreendimento_id, client_id, nome, acao, referencia_id, antes)
    VALUES ((v_a ->> 'org')::uuid, p_empreendimento_id, (v_a ->> 'client_id')::uuid, v_a ->> 'nome', 'ATIVO_REMOVER', p_ativo_id, to_jsonb(v_antes));
    RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_ativo_remover(text, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_ativo_remover(text, uuid, uuid, uuid) TO authenticated;
