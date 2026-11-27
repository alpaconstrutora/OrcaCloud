-- ============================================================================
-- Portal do Síndico › G7: ficha do condomínio (26/11/2026)
--
-- Plano: docs/planos/2026-10-24-portal-sindico-gestao-completa.md (G7)
-- Pronto quando: multa/juros alterados pelo síndico entram na próxima cobrança.
--
-- No app a Ficha grava por `condominio_salvar_ficha` (membro da org). O síndico não é
-- membro: `sindico_portal_ficha_salvar` grava SÓ os dados do condomínio — razão social,
-- CNPJ, data de instalação, multa e juros. Síndico, mandato e a exigência de aprovação do
-- rateio ficam com a administradora (o síndico não estende o próprio mandato nem desliga a
-- aprovação dele). A cobrança lê multa e juros do empreendimento
-- (`condominioCobrancaService`, `cobranca_multa_percent` / `cobranca_juros_mes_percent`):
-- o que o síndico salvar vale na próxima cobrança gerada.
--
-- Limites: multa por atraso até 2% (Código Civil, art. 1.336, § 1º); juros de 0 a 10% ao
-- mês (o CC dá 1% a.m. quando a convenção não diz; acima de 10% é quase certo erro de
-- digitação — a convenção pode prever outro valor, e a administradora grava pelo app).
--
-- Escrita: `fn_sindico_escrita_no_predio` (síndico logado ou a administradora pelo app).
-- REGRA #7: REVOKE de PUBLIC/anon; autorização DENTRO.
-- Reverter: DROP das 2 funções; o CHECK de ações volta à lista de …950400.
-- ============================================================================

ALTER TABLE public.sindico_financeiro_eventos DROP CONSTRAINT IF EXISTS sindico_financeiro_eventos_acao_check;
ALTER TABLE public.sindico_financeiro_eventos ADD CONSTRAINT sindico_financeiro_eventos_acao_check
    CHECK (acao IN ('LANCAR', 'EDITAR', 'CANCELAR', 'BAIXAR', 'FORNECEDOR', 'FORNECEDOR_COMPARTILHADO',
                    'RATEIO_SALVAR', 'RATEIO_FECHAR', 'RATEIO_CANCELAR', 'RATEIO_COTAS',
                    'CONTA_SALVAR', 'RECEBER', 'DESFAZER_BAIXA', 'LANCAR_RECEITA',
                    'EXTRATO_IMPORTAR', 'EXTRATO_CONCILIAR', 'EXTRATO_DESFAZER', 'EXTRATO_IGNORAR',
                    'EXTRATO_RESTAURAR', 'EXTRATO_LANCAR',
                    'FORNECEDOR_EDITAR', 'FORNECEDOR_CONTA', 'CONTRATO_SALVAR', 'CONTRATO_ENCERRAR',
                    'OS_SALVAR', 'OS_CONCLUIR', 'OS_CANCELAR', 'PLANO_ITEM_SALVAR', 'PLANO_ITEM_REMOVER',
                    'ATIVO_SALVAR', 'ATIVO_REMOVER',
                    'DOCUMENTO_ENVIAR', 'DOCUMENTO_VISIBILIDADE', 'DOCUMENTO_REMOVER',
                    'MORADOR_SALVAR', 'MORADOR_ENCERRAR', 'MORADOR_CONTATO', 'MORADOR_CONVITE',
                    'FICHA_SALVAR'));

-- ── 1. Ler ───────────────────────────────────────────────────────────────────
-- Não STABLE: o resolvedor grava `last_used_at` do link.
CREATE OR REPLACE FUNCTION public.sindico_portal_ficha(p_token text, p_client_id uuid, p_empreendimento_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_r   jsonb;
    v_cli uuid;
    v_e   public.empreendimentos;
BEGIN
    v_r := public.fn_sindico_resolver(p_token, p_client_id, 'ler');
    IF NOT (v_r ->> 'ok')::boolean THEN RETURN v_r; END IF;
    v_cli := (v_r ->> 'client_id')::uuid;
    IF p_empreendimento_id IS NULL OR p_empreendimento_id NOT IN (SELECT public.fn_sindico_predios(v_cli)) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Condomínio fora do seu mandato.');
    END IF;
    SELECT * INTO v_e FROM public.empreendimentos WHERE id = p_empreendimento_id;
    RETURN jsonb_build_object('ok', true,
        'motivoNaoOpera', public.fn_sindico_motivo_nao_opera(p_empreendimento_id),
        'ficha', jsonb_build_object(
            'razaoSocial', v_e.condominio_razao_social, 'cnpj', v_e.condominio_cnpj, 'instaladoEm', v_e.condominio_instalado_em,
            'multaPercent', v_e.cobranca_multa_percent, 'jurosMesPercent', v_e.cobranca_juros_mes_percent,
            'mandatoInicio', v_e.sindico_mandato_inicio, 'mandatoFim', v_e.sindico_mandato_fim,
            'exigeAprovacao', coalesce(v_e.rateio_exige_aprovacao_sindico, false)));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_ficha(text, uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_ficha(text, uuid, uuid) TO anon, authenticated;

-- ── 2. Salvar (só os dados do condomínio) ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.sindico_portal_ficha_salvar(p_token text, p_client_id uuid, p_empreendimento_id uuid, p_campos jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_a     jsonb := public.fn_sindico_escrita_no_predio(p_token, p_client_id, p_empreendimento_id);
    v_antes public.empreendimentos;
    v_cnpj  text;
    v_multa numeric;
    v_juros numeric;
    v_inst  date;
BEGIN
    IF NOT (v_a ->> 'ok')::boolean THEN RETURN v_a; END IF;
    IF jsonb_typeof(p_campos) IS DISTINCT FROM 'object' THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Dados da ficha inválidos.');
    END IF;
    IF p_campos ?| ARRAY['sindico_client_id', 'sindico_mandato_inicio', 'sindico_mandato_fim', 'rateio_exige_aprovacao_sindico'] THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Síndico, mandato e a exigência de aprovação são definidos pela administradora.');
    END IF;
    BEGIN
        v_multa := (p_campos ->> 'cobranca_multa_percent')::numeric;
        v_juros := (p_campos ->> 'cobranca_juros_mes_percent')::numeric;
        v_inst  := nullif(p_campos ->> 'condominio_instalado_em', '')::date;
    EXCEPTION WHEN others THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Multa, juros ou data inválidos.');
    END;
    IF p_campos ? 'cobranca_multa_percent' AND (v_multa IS NULL OR v_multa < 0 OR v_multa > 2) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'A multa por atraso vai de 0 a 2% (Código Civil, art. 1.336, § 1º).');
    END IF;
    IF p_campos ? 'cobranca_juros_mes_percent' AND (v_juros IS NULL OR v_juros < 0 OR v_juros > 10) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Os juros vão de 0 a 10% ao mês.');
    END IF;
    v_cnpj := nullif(regexp_replace(coalesce(p_campos ->> 'condominio_cnpj', ''), '\D', '', 'g'), '');
    IF p_campos ? 'condominio_cnpj' AND v_cnpj IS NOT NULL AND length(v_cnpj) <> 14 THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'O CNPJ tem 14 dígitos.');
    END IF;
    IF v_inst IS NOT NULL AND v_inst > (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'A data de instalação não pode ser futura.');
    END IF;

    SELECT * INTO v_antes FROM public.empreendimentos WHERE id = p_empreendimento_id FOR UPDATE;
    UPDATE public.empreendimentos SET
        condominio_razao_social = CASE WHEN p_campos ? 'condominio_razao_social' THEN nullif(btrim(p_campos ->> 'condominio_razao_social'), '') ELSE condominio_razao_social END,
        condominio_cnpj         = CASE WHEN p_campos ? 'condominio_cnpj' THEN nullif(btrim(p_campos ->> 'condominio_cnpj'), '') ELSE condominio_cnpj END,
        condominio_instalado_em = CASE WHEN p_campos ? 'condominio_instalado_em' THEN v_inst ELSE condominio_instalado_em END,
        cobranca_multa_percent  = CASE WHEN p_campos ? 'cobranca_multa_percent' THEN v_multa ELSE cobranca_multa_percent END,
        cobranca_juros_mes_percent = CASE WHEN p_campos ? 'cobranca_juros_mes_percent' THEN v_juros ELSE cobranca_juros_mes_percent END,
        updated_at = now()
     WHERE id = p_empreendimento_id;

    INSERT INTO public.sindico_financeiro_eventos (organization_id, empreendimento_id, client_id, nome, acao, antes, depois)
    VALUES ((v_a ->> 'org')::uuid, p_empreendimento_id, (v_a ->> 'client_id')::uuid, v_a ->> 'nome', 'FICHA_SALVAR',
            jsonb_build_object('razaoSocial', v_antes.condominio_razao_social, 'cnpj', v_antes.condominio_cnpj,
                               'instaladoEm', v_antes.condominio_instalado_em, 'multa', v_antes.cobranca_multa_percent,
                               'juros', v_antes.cobranca_juros_mes_percent),
            p_campos);
    RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_ficha_salvar(text, uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_ficha_salvar(text, uuid, uuid, jsonb) TO authenticated;
