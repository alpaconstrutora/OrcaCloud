-- ============================================================================
-- Portal do Síndico › G3a: fornecedores do condomínio — listar, editar, conta/PIX (26/11/2026)
--
-- Plano: docs/planos/2026-10-24-portal-sindico-gestao-completa.md (G3)
-- Pedido: "o sindico é o gerenciador / executor do condominio e ele precisa de
-- total acesso para edicao" — pelo portal (ele não é da construtora).
--
-- Antes: o portal só CADASTRAVA fornecedor (`sindico_portal_salvar_fornecedor`,
-- dentro do lançamento de conta). Agora:
--   • `sindico_portal_fornecedores` (ler): os fornecedores que a org do
--     condomínio enxerga (dela ou compartilhados com ela — a regra de
--     `fn_sindico_fornecedor_visivel`), com as contas/PIX e quantos títulos
--     em aberto cada um tem. `editavel` = cadastro DA org do condomínio; o
--     compartilhado por outra empresa só se consulta.
--   • `sindico_portal_editar_fornecedor`: dados do cadastro. Trocar o nome
--     acompanha as cópias de texto nos títulos da org do condomínio com a MESMA
--     regra do app (`utils/clientPropagacao.ts` + `supplierPropagacaoService`):
--     `party_name` muda; `entity_name` só quando era igual ao `party_name` e o
--     título não é de BOLETO (é o beneficiário lido do código, a conciliação
--     compara); conta a pagar em RASCUNHO fica como está (o UPDATE a mandaria
--     para a alçada); título em mês fechado também fica (a trava de competência
--     não vale em SECURITY DEFINER — chamada à mão).
--   • `sindico_portal_salvar_conta_fornecedor`: cria, edita, torna principal e
--     desativa conta bancária / chave PIX (`supplier_bank_accounts`).
--
-- Escrita: `fn_sindico_operar` (síndico logado ou a administradora pelo app) +
-- `fn_sindico_motivo_nao_opera` (recorte por condomínio). Autor no histórico.
-- REGRA #7: REVOKE de PUBLIC/anon em toda função; autorização DENTRO.
-- Reverter: DROP das 3 funções e o CHECK de ações volta à lista de
-- aplicar_20271025100000.
-- ============================================================================

ALTER TABLE public.sindico_financeiro_eventos DROP CONSTRAINT IF EXISTS sindico_financeiro_eventos_acao_check;
ALTER TABLE public.sindico_financeiro_eventos ADD CONSTRAINT sindico_financeiro_eventos_acao_check
    CHECK (acao IN ('LANCAR', 'EDITAR', 'CANCELAR', 'BAIXAR', 'FORNECEDOR', 'FORNECEDOR_COMPARTILHADO',
                    'RATEIO_SALVAR', 'RATEIO_FECHAR', 'RATEIO_CANCELAR', 'RATEIO_COTAS',
                    'CONTA_SALVAR', 'RECEBER', 'DESFAZER_BAIXA', 'LANCAR_RECEITA',
                    'EXTRATO_IMPORTAR', 'EXTRATO_CONCILIAR', 'EXTRATO_DESFAZER', 'EXTRATO_IGNORAR',
                    'EXTRATO_RESTAURAR', 'EXTRATO_LANCAR',
                    'FORNECEDOR_EDITAR', 'FORNECEDOR_CONTA'));

-- ── 1. Ler ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sindico_portal_fornecedores(p_token text, p_client_id uuid, p_empreendimento_id uuid)
RETURNS jsonb
-- Não STABLE: o resolver grava `last_used_at` do link (leitura só-leitura falharia).
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_r   jsonb;
    v_cli uuid;
    v_org uuid;
BEGIN
    v_r := public.fn_sindico_resolver(p_token, p_client_id, 'ler');
    IF NOT (v_r ->> 'ok')::boolean THEN RETURN v_r; END IF;
    v_cli := (v_r ->> 'client_id')::uuid;
    IF p_empreendimento_id IS NULL OR p_empreendimento_id NOT IN (SELECT public.fn_sindico_predios(v_cli)) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Condomínio fora do seu mandato.');
    END IF;
    IF public.fn_sindico_motivo_nao_opera(p_empreendimento_id) IS NOT NULL THEN
        RETURN jsonb_build_object('ok', true, 'fornecedores', '[]'::jsonb);
    END IF;
    v_org := public.fn_org_do_condominio(p_empreendimento_id);

    RETURN jsonb_build_object('ok', true, 'fornecedores', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
            'id', s.id, 'codigo', s.code, 'nome', s.name, 'apelido', s.nickname, 'documento', s.document,
            'tipo', s.type, 'email', s.email, 'telefone', s.phone, 'contato', s.contact_name, 'categoria', s.category,
            'editavel', s.organization_id = v_org,
            'lancadoPeloSindico', s.lancado_por_sindico_client_id IS NOT NULL,
            'titulosEmAberto', (SELECT count(*) FROM public.internal_transactions t
                                 WHERE t.organization_id = v_org AND t.supplier_id = s.id
                                   AND t.status NOT IN ('CANCELLED', 'CONCILIATED')
                                   AND coalesce(t.business_status, '') NOT IN ('PAGO', 'RECEBIDO', 'CANCELADO')),
            'contas', coalesce((
                SELECT jsonb_agg(jsonb_build_object(
                    'id', b.id, 'banco', b.bank_name, 'codigoBanco', b.bank_code, 'agencia', b.agency,
                    'conta', b.account, 'tipoConta', b.account_type, 'titular', b.beneficiary_name,
                    'documentoTitular', b.beneficiary_document, 'pix', b.pix_key, 'tipoPix', b.pix_key_type,
                    'principal', coalesce(b.is_primary, false), 'ativa', coalesce(b.status, 'ativo') = 'ativo'
                ) ORDER BY coalesce(b.status, 'ativo') = 'ativo' DESC, b.is_primary DESC NULLS LAST, b.created_at)
                  FROM public.supplier_bank_accounts b WHERE b.supplier_id = s.id), '[]'::jsonb)
        ) ORDER BY s.name)
          FROM public.suppliers s
         WHERE s.organization_id = v_org
            OR EXISTS (SELECT 1 FROM public.supplier_org_shares sh
                        WHERE sh.supplier_id = s.id AND sh.target_org_id = v_org)), '[]'::jsonb));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_fornecedores(text, uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_fornecedores(text, uuid, uuid) TO anon, authenticated;

-- Fornecedor que a escrita pode alterar: cadastro DA org do condomínio. NULL = pode.
CREATE OR REPLACE FUNCTION public.fn_sindico_motivo_nao_edita_fornecedor(p_supplier_id uuid, p_org uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT CASE
        WHEN s.id IS NULL THEN 'Fornecedor não encontrado.'
        WHEN s.organization_id IS DISTINCT FROM p_org THEN
            CASE WHEN public.fn_sindico_fornecedor_visivel(s.id, p_org)
                 THEN 'Este fornecedor é de outra organização, disponibilizado para o condomínio: só quem o cadastrou altera.'
                 ELSE 'Fornecedor não encontrado.' END
        ELSE NULL
    END
    FROM (SELECT 1) x LEFT JOIN public.suppliers s ON s.id = p_supplier_id;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_sindico_motivo_nao_edita_fornecedor(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ── 2. Editar o cadastro ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sindico_portal_editar_fornecedor(
    p_token text, p_client_id uuid, p_empreendimento_id uuid, p_supplier_id uuid, p_dados jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_r       jsonb;
    v_cli     uuid;
    v_nome    text;
    v_org     uuid;
    v_motivo  text;
    v_antes   public.suppliers;
    v_name    text := nullif(btrim(coalesce(p_dados ->> 'name', '')), '');
    v_docraw  text := nullif(btrim(coalesce(p_dados ->> 'document', '')), '');
    v_doc     text := nullif(regexp_replace(coalesce(p_dados ->> 'document', ''), '\D', '', 'g'), '');
    v_email   text := nullif(lower(btrim(coalesce(p_dados ->> 'email', ''))), '');
    v_tipo    text;
    v_titulos integer := 0;
    v_mantidos integer := 0;
    v_t       record;
BEGIN
    v_r := public.fn_sindico_operar(p_token, p_client_id);
    IF NOT (v_r ->> 'ok')::boolean THEN RETURN v_r; END IF;
    v_cli  := (v_r ->> 'client_id')::uuid;
    v_nome := v_r ->> 'nome';

    IF p_empreendimento_id IS NULL OR p_empreendimento_id NOT IN (SELECT public.fn_sindico_predios(v_cli)) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Condomínio fora do seu mandato.');
    END IF;
    v_motivo := public.fn_sindico_motivo_nao_opera(p_empreendimento_id);
    IF v_motivo IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', v_motivo); END IF;
    v_org := public.fn_org_do_condominio(p_empreendimento_id);
    v_motivo := public.fn_sindico_motivo_nao_edita_fornecedor(p_supplier_id, v_org);
    IF v_motivo IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', v_motivo); END IF;

    IF v_name IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'Informe o nome do fornecedor.'); END IF;
    IF v_doc IS NOT NULL AND length(v_doc) NOT IN (11, 14) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'CPF tem 11 dígitos e CNPJ tem 14.');
    END IF;
    -- O mesmo CPF/CNPJ em OUTRO cadastro que a org enxerga duplicaria o credor.
    IF v_doc IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.suppliers s
         WHERE s.id <> p_supplier_id
           AND regexp_replace(coalesce(s.document, ''), '\D', '', 'g') = v_doc
           AND (s.organization_id = v_org
                OR EXISTS (SELECT 1 FROM public.supplier_org_shares sh WHERE sh.supplier_id = s.id AND sh.target_org_id = v_org))) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Já existe outro fornecedor com este CPF/CNPJ no condomínio.');
    END IF;
    -- `suppliers_email_key` é UNIQUE global.
    IF v_email IS NOT NULL AND EXISTS (SELECT 1 FROM public.suppliers WHERE lower(email) = v_email AND id <> p_supplier_id) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Este e-mail já está em outro cadastro de fornecedor.');
    END IF;

    SELECT * INTO v_antes FROM public.suppliers WHERE id = p_supplier_id FOR UPDATE;
    v_tipo := CASE WHEN length(v_doc) = 11 THEN 'PF' WHEN length(v_doc) = 14 THEN 'PJ'
                   WHEN p_dados ->> 'type' IN ('PF', 'PJ') THEN p_dados ->> 'type' ELSE coalesce(v_antes.type, 'PJ') END;

    UPDATE public.suppliers
       SET name = v_name, document = v_docraw, type = v_tipo, email = v_email,
           phone = nullif(btrim(coalesce(p_dados ->> 'phone', '')), ''),
           contact_name = nullif(btrim(coalesce(p_dados ->> 'contact_name', '')), ''),
           category = nullif(btrim(coalesce(p_dados ->> 'category', '')), '')
     WHERE id = p_supplier_id;

    -- Cópias do nome nos títulos da org do condomínio (regra do app; ver cabeçalho).
    IF v_name IS DISTINCT FROM btrim(coalesce(v_antes.name, '')) THEN
        FOR v_t IN
            SELECT t.id, t.party_name, t.entity_name, t.source_system, t.direction, t.status, t.approval_status, t.transaction_date
              FROM public.internal_transactions t
             WHERE t.organization_id = v_org AND (t.supplier_id = p_supplier_id OR t.party_id = p_supplier_id)
        LOOP
            CONTINUE WHEN btrim(coalesce(v_t.party_name, '')) = v_name
                     AND NOT (v_t.source_system IS DISTINCT FROM 'BOLETO' AND v_t.entity_name IS NOT NULL
                              AND btrim(v_t.entity_name) <> v_name AND btrim(v_t.entity_name) = btrim(coalesce(v_t.party_name, '')));
            IF (v_t.direction = 'DEBIT' AND coalesce(v_t.status, 'PENDING') = 'PENDING'
                AND coalesce(v_t.approval_status, 'RASCUNHO') = 'RASCUNHO')
               OR public.fn_period_is_closed(v_org, v_t.transaction_date) THEN
                v_mantidos := v_mantidos + 1;
                CONTINUE;
            END IF;
            UPDATE public.internal_transactions
               SET party_name = v_name,
                   entity_name = CASE WHEN v_t.source_system IS DISTINCT FROM 'BOLETO' AND v_t.entity_name IS NOT NULL
                                       AND btrim(v_t.entity_name) = btrim(coalesce(v_t.party_name, ''))
                                      THEN v_name ELSE entity_name END,
                   updated_at = now()
             WHERE id = v_t.id;
            v_titulos := v_titulos + 1;
        END LOOP;
    END IF;

    INSERT INTO public.sindico_financeiro_eventos (organization_id, empreendimento_id, client_id, nome, acao, supplier_id, antes, depois)
    SELECT v_org, p_empreendimento_id, v_cli, v_nome, 'FORNECEDOR_EDITAR', s.id,
           to_jsonb(v_antes) - 'created_at',
           (to_jsonb(s) - 'created_at') || jsonb_build_object('titulosAtualizados', v_titulos, 'titulosMantidos', v_mantidos)
      FROM public.suppliers s WHERE s.id = p_supplier_id;

    RETURN jsonb_build_object('ok', true, 'titulosAtualizados', v_titulos, 'titulosMantidos', v_mantidos);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_editar_fornecedor(text, uuid, uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_editar_fornecedor(text, uuid, uuid, uuid, jsonb) TO authenticated;

-- ── 3. Conta bancária / PIX ─────────────────────────────────────────────────
-- p_conta_id NULL = nova. p_dados.ativa = false desativa (nunca apaga: o
-- pagamento já feito aponta para ela). principal = true tira a marca das outras.
CREATE OR REPLACE FUNCTION public.sindico_portal_salvar_conta_fornecedor(
    p_token text, p_client_id uuid, p_empreendimento_id uuid, p_supplier_id uuid, p_conta_id uuid, p_dados jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_r      jsonb;
    v_cli    uuid;
    v_nome   text;
    v_org    uuid;
    v_motivo text;
    v_sup    public.suppliers;
    v_antes  public.supplier_bank_accounts;
    v_id     uuid;
    v_pix    text := nullif(btrim(coalesce(p_dados ->> 'pix_key', '')), '');
    v_pix_t  text := nullif(p_dados ->> 'pix_key_type', '');
    v_conta  text := nullif(btrim(coalesce(p_dados ->> 'account', '')), '');
    v_tipo_c text := CASE WHEN p_dados ->> 'account_type' IN ('corrente', 'poupanca', 'pagamento') THEN p_dados ->> 'account_type' ELSE 'corrente' END;
    v_ativa  boolean := coalesce((p_dados ->> 'ativa')::boolean, true);
    v_princ  boolean := coalesce((p_dados ->> 'principal')::boolean, false);
    v_titdoc text := nullif(regexp_replace(coalesce(p_dados ->> 'beneficiary_document', ''), '\D', '', 'g'), '');
BEGIN
    v_r := public.fn_sindico_operar(p_token, p_client_id);
    IF NOT (v_r ->> 'ok')::boolean THEN RETURN v_r; END IF;
    v_cli  := (v_r ->> 'client_id')::uuid;
    v_nome := v_r ->> 'nome';

    IF p_empreendimento_id IS NULL OR p_empreendimento_id NOT IN (SELECT public.fn_sindico_predios(v_cli)) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Condomínio fora do seu mandato.');
    END IF;
    v_motivo := public.fn_sindico_motivo_nao_opera(p_empreendimento_id);
    IF v_motivo IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', v_motivo); END IF;
    v_org := public.fn_org_do_condominio(p_empreendimento_id);
    v_motivo := public.fn_sindico_motivo_nao_edita_fornecedor(p_supplier_id, v_org);
    IF v_motivo IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', v_motivo); END IF;
    SELECT * INTO v_sup FROM public.suppliers WHERE id = p_supplier_id;

    IF p_conta_id IS NOT NULL THEN
        SELECT * INTO v_antes FROM public.supplier_bank_accounts WHERE id = p_conta_id AND supplier_id = p_supplier_id FOR UPDATE;
        IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'Conta não encontrada neste fornecedor.'); END IF;
    END IF;
    IF v_ativa AND v_pix IS NULL AND v_conta IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Informe a chave PIX ou a conta bancária.');
    END IF;
    IF v_pix IS NOT NULL AND (v_pix_t IS NULL OR v_pix_t NOT IN ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria')) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Escolha o tipo da chave PIX.');
    END IF;
    IF v_conta IS NOT NULL AND nullif(btrim(coalesce(p_dados ->> 'agency', '')), '') IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Informe a agência da conta.');
    END IF;
    IF v_titdoc IS NOT NULL AND length(v_titdoc) NOT IN (11, 14) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'CPF do titular tem 11 dígitos e CNPJ tem 14.');
    END IF;
    IF NOT v_ativa THEN v_princ := false; END IF;

    IF v_princ THEN
        UPDATE public.supplier_bank_accounts SET is_primary = false, updated_at = now(), updated_by = auth.uid()
         WHERE supplier_id = p_supplier_id AND id IS DISTINCT FROM p_conta_id AND is_primary;
    END IF;

    IF p_conta_id IS NULL THEN
        INSERT INTO public.supplier_bank_accounts (
            supplier_id, organization_id, bank_code, bank_name, agency, account, account_type,
            beneficiary_name, beneficiary_document, pix_key, pix_key_type, is_pix_primary, is_primary, status, created_by
        ) VALUES (
            p_supplier_id, v_org,
            nullif(btrim(coalesce(p_dados ->> 'bank_code', '')), ''), nullif(btrim(coalesce(p_dados ->> 'bank_name', '')), ''),
            nullif(btrim(coalesce(p_dados ->> 'agency', '')), ''), v_conta, v_tipo_c,
            coalesce(nullif(btrim(coalesce(p_dados ->> 'beneficiary_name', '')), ''), v_sup.name),
            coalesce(v_titdoc, nullif(regexp_replace(coalesce(v_sup.document, ''), '\D', '', 'g'), '')),
            v_pix, CASE WHEN v_pix IS NULL THEN NULL ELSE v_pix_t END, v_pix IS NOT NULL,
            -- A primeira conta do fornecedor já nasce principal.
            v_princ OR NOT EXISTS (SELECT 1 FROM public.supplier_bank_accounts WHERE supplier_id = p_supplier_id AND coalesce(status, 'ativo') = 'ativo'),
            'ativo', auth.uid()
        ) RETURNING id INTO v_id;
    ELSE
        UPDATE public.supplier_bank_accounts
           SET bank_code = nullif(btrim(coalesce(p_dados ->> 'bank_code', '')), ''),
               bank_name = nullif(btrim(coalesce(p_dados ->> 'bank_name', '')), ''),
               agency = nullif(btrim(coalesce(p_dados ->> 'agency', '')), ''),
               account = v_conta, account_type = v_tipo_c,
               beneficiary_name = coalesce(nullif(btrim(coalesce(p_dados ->> 'beneficiary_name', '')), ''), beneficiary_name, v_sup.name),
               beneficiary_document = coalesce(v_titdoc, beneficiary_document),
               pix_key = v_pix, pix_key_type = CASE WHEN v_pix IS NULL THEN NULL ELSE v_pix_t END,
               is_pix_primary = v_pix IS NOT NULL,
               is_primary = v_princ OR (v_ativa AND is_primary),
               status = CASE WHEN v_ativa THEN 'ativo' ELSE 'inativo' END,
               updated_at = now(), updated_by = auth.uid()
         WHERE id = p_conta_id
        RETURNING id INTO v_id;
    END IF;

    INSERT INTO public.sindico_financeiro_eventos (organization_id, empreendimento_id, client_id, nome, acao, supplier_id, antes, depois)
    SELECT v_org, p_empreendimento_id, v_cli, v_nome, 'FORNECEDOR_CONTA', p_supplier_id,
           CASE WHEN v_antes.id IS NULL THEN NULL ELSE to_jsonb(v_antes) - 'created_at' - 'updated_at' END,
           to_jsonb(b) - 'created_at' - 'updated_at'
      FROM public.supplier_bank_accounts b WHERE b.id = v_id;

    RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sindico_portal_salvar_conta_fornecedor(text, uuid, uuid, uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_salvar_conta_fornecedor(text, uuid, uuid, uuid, uuid, jsonb) TO authenticated;
