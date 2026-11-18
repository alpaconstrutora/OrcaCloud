-- ============================================================================
-- Portal do Síndico › cadastrar fornecedor: o CPF/CNPJ só é procurado entre os
-- fornecedores que a organização do condomínio JÁ enxerga (18/11/2026)
--
-- O QUE FECHA
-- `sindico_portal_salvar_fornecedor` procurava o documento em TODOS os
-- fornecedores do SaaS ("mesmo critério de find_supplier_by_document, global").
-- Achando o cadastro de OUTRA empresa cliente, gravava
--   INSERT INTO supplier_org_shares (supplier_id, target_org_id) VALUES (<dele>, <org do condomínio>)
-- e devolvia o nome. A partir daí a org do condomínio (e o síndico, pelo
-- portal) passava a ver o cadastro alheio inteiro: nome, documento, contato,
-- endereço e as contas bancárias/chaves PIX (mascaradas) que a outra empresa
-- cadastrou. Bastava o síndico digitar um CNPJ qualquer para "puxar" o
-- fornecedor de outro cliente para dentro do condomínio — e saber, pelo nome
-- devolvido, que aquele CNPJ era fornecedor de alguém no SaaS.
-- A migration aplicar_20271118911000 (compartilhamentos só pela org dona)
-- registrou este caminho como pendência de produto.
--
-- DECISÃO DO USUÁRIO (18/11/2026)
-- Procurar só entre os fornecedores VISÍVEIS para a org do condomínio — dono =
-- essa org, ou compartilhado com ela por supplier_org_shares (a mesma regra de
-- fn_sindico_fornecedor_visivel, que fn_sindico_validar_linha e a lista do
-- portal já usam). Não achou → cadastro novo nessa org.
--
-- O QUE MUDA
--   · A busca pelo documento ganha a condição de visibilidade (inline, sem
--     chamar a função por linha). A preferência pelo cadastro da própria org
--     continua (ORDER BY).
--   · Sai o ramo que compartilhava o cadastro achado (INSERT em
--     supplier_org_shares + evento FORNECEDOR_COMPARTILHADO): o que a busca
--     acha agora já é visível, não há o que compartilhar.
--   · O resto é a definição ATUAL de produção (pg_get_functiondef em
--     18/11/2026), sem outra mudança: mesma assinatura, mesmo retorno
--     ({ok, id, nome, existente}), mesmas mensagens.
-- Dados em 18/11/2026: nenhum evento FORNECEDOR / FORNECEDOR_COMPARTILHADO em
-- sindico_financeiro_eventos — não há compartilhamento antigo para desfazer.
--
-- REGRA #7
-- Pergunta 1: não cria policy.
-- Pergunta 2: SECURITY DEFINER de sempre (o portal grava em suppliers e
-- supplier_bank_accounts sem ser membro da org); a autorização continua DENTRO
-- (fn_sindico_operar → token + mandato; fn_sindico_predios; motivo de não
-- operar). REVOKE de PUBLIC/anon e GRANT só para authenticated, como antes.
--
-- ORDEM: independente do front. Pode ir antes ou depois do merge (o front só
-- troca o texto do aviso; a resposta da RPC é a mesma).
--
-- COMO CONFERIR (leitura):
--   SELECT pg_get_functiondef('public.sindico_portal_salvar_fornecedor(text,uuid,uuid,jsonb)'::regprocedure)
--          ILIKE '%INSERT INTO public.supplier_org_shares%' AS ainda_compartilha;      -- false
--   SELECT has_function_privilege('anon',
--          'public.sindico_portal_salvar_fornecedor(text,uuid,uuid,jsonb)', 'EXECUTE'); -- false
-- No portal: cadastrar fornecedor com o CNPJ de um fornecedor de OUTRA empresa
-- (de que a org do condomínio não recebeu compartilhamento) → nasce cadastro
-- novo na org do condomínio ("Fornecedor "X" cadastrado."), e nenhuma linha
-- nova em supplier_org_shares.
--
-- Aplicar: npx supabase db query --linked -f <caminho deste arquivo>
-- NUNCA `supabase db push` (CLAUDE.md da raiz).
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '2s';

CREATE OR REPLACE FUNCTION public.sindico_portal_salvar_fornecedor(p_token text, p_client_id uuid, p_empreendimento_id uuid, p_dados jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
    v_r      jsonb;
    v_cli    uuid;
    v_nome   text;
    v_org    uuid;
    v_motivo text;
    v_name   text := nullif(btrim(coalesce(p_dados ->> 'name', '')), '');
    v_doc    text := nullif(regexp_replace(coalesce(p_dados ->> 'document', ''), '\D', '', 'g'), '');
    v_email  text := nullif(lower(btrim(coalesce(p_dados ->> 'email', ''))), '');
    v_tipo   text;
    v_exist  public.suppliers;
    v_id     uuid;
    v_pix    text := nullif(btrim(coalesce(p_dados ->> 'pix_key', '')), '');
    v_pix_t  text := nullif(p_dados ->> 'pix_key_type', '');
    v_conta  text := nullif(btrim(coalesce(p_dados ->> 'account', '')), '');
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

    IF v_name IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'Informe o nome do fornecedor.'); END IF;
    IF v_doc IS NOT NULL AND length(v_doc) NOT IN (11, 14) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'CPF tem 11 dígitos e CNPJ tem 14.');
    END IF;
    v_tipo := CASE WHEN length(v_doc) = 11 THEN 'PF' WHEN length(v_doc) = 14 THEN 'PJ'
                   WHEN p_dados ->> 'type' IN ('PF', 'PJ') THEN p_dados ->> 'type' ELSE 'PJ' END;
    IF v_pix_t IS NOT NULL AND v_pix_t NOT IN ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria') THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Tipo de chave PIX inválido.');
    END IF;

    -- Mesmo documento (só dígitos), mas SÓ entre os fornecedores que a org do
    -- condomínio já enxerga: dela, ou compartilhados com ela — a regra de
    -- fn_sindico_fornecedor_visivel, escrita aqui por extenso para não chamar a
    -- função por linha. Cadastro de outra empresa do SaaS com o mesmo CPF/CNPJ
    -- não é achado nem compartilhado: o síndico ganha cadastro novo na org dele
    -- (decisão do usuário, 18/11/2026).
    IF v_doc IS NOT NULL THEN
        SELECT * INTO v_exist FROM public.suppliers s
         WHERE regexp_replace(coalesce(s.document, ''), '\D', '', 'g') = v_doc
           AND (s.organization_id = v_org
                OR EXISTS (SELECT 1 FROM public.supplier_org_shares sh
                            WHERE sh.supplier_id = s.id AND sh.target_org_id = v_org))
         ORDER BY (s.organization_id = v_org) DESC, s.created_at
         LIMIT 1;
        IF FOUND THEN
            RETURN jsonb_build_object('ok', true, 'id', v_exist.id, 'nome', v_exist.name, 'existente', true);
        END IF;
    END IF;

    -- `suppliers_email_key` é UNIQUE global: e-mail já usado → grava sem e-mail
    -- (mesma saída de `supplierService.addSupplier`).
    IF v_email IS NOT NULL AND EXISTS (SELECT 1 FROM public.suppliers WHERE lower(email) = v_email) THEN
        v_email := NULL;
    END IF;

    INSERT INTO public.suppliers (
        name, document, type, email, phone, contact_name, category,
        organization_id, code, is_shared, lancado_por_sindico_client_id
    ) VALUES (
        v_name, nullif(btrim(coalesce(p_dados ->> 'document', '')), ''), v_tipo, v_email,
        nullif(btrim(coalesce(p_dados ->> 'phone', '')), ''),
        nullif(btrim(coalesce(p_dados ->> 'contact_name', '')), ''),
        nullif(btrim(coalesce(p_dados ->> 'category', '')), ''),
        v_org, public.get_next_supplier_code(v_org), false, v_cli
    ) RETURNING id INTO v_id;

    IF v_pix IS NOT NULL OR v_conta IS NOT NULL THEN
        INSERT INTO public.supplier_bank_accounts (
            supplier_id, organization_id, bank_code, bank_name, agency, account, account_type,
            beneficiary_name, beneficiary_document, pix_key, pix_key_type, is_pix_primary, is_primary, status, created_by
        ) VALUES (
            v_id, v_org,
            nullif(btrim(coalesce(p_dados ->> 'bank_code', '')), ''), nullif(btrim(coalesce(p_dados ->> 'bank_name', '')), ''),
            nullif(btrim(coalesce(p_dados ->> 'agency', '')), ''), v_conta,
            -- NOT NULL na tabela, mesmo com só a chave PIX.
            CASE WHEN p_dados ->> 'account_type' IN ('corrente', 'poupanca', 'pagamento') THEN p_dados ->> 'account_type' ELSE 'corrente' END,
            v_name, v_doc, v_pix, v_pix_t, v_pix IS NOT NULL, true, 'ativo', auth.uid()
        );
    END IF;

    INSERT INTO public.sindico_financeiro_eventos (organization_id, empreendimento_id, client_id, nome, acao, supplier_id, depois)
    SELECT v_org, p_empreendimento_id, v_cli, v_nome, 'FORNECEDOR', s.id, to_jsonb(s)
      FROM public.suppliers s WHERE s.id = v_id;

    RETURN jsonb_build_object('ok', true, 'id', v_id, 'nome', v_name, 'existente', false);
END;
$function$;

REVOKE ALL     ON FUNCTION public.sindico_portal_salvar_fornecedor(text, uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sindico_portal_salvar_fornecedor(text, uuid, uuid, jsonb) TO authenticated;

-- ── Verificação embutida ─────────────────────────────────────────────────────
DO $pos$
DECLARE
    v_def text := pg_get_functiondef('public.sindico_portal_salvar_fornecedor(text,uuid,uuid,jsonb)'::regprocedure);
BEGIN
    IF v_def ILIKE '%INSERT INTO public.supplier_org_shares%' THEN
        RAISE EXCEPTION 'sindico_portal_salvar_fornecedor ainda compartilha fornecedor achado pelo documento';
    END IF;
    IF v_def NOT ILIKE '%sh.target_org_id = v_org%' THEN
        RAISE EXCEPTION 'sindico_portal_salvar_fornecedor sem a condição de visibilidade na busca pelo documento';
    END IF;
    IF has_function_privilege('anon', 'public.sindico_portal_salvar_fornecedor(text,uuid,uuid,jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'sindico_portal_salvar_fornecedor executável por anon';
    END IF;
    RAISE NOTICE 'sindico_portal_salvar_fornecedor OK: CPF/CNPJ só é achado entre os fornecedores visíveis para a org do condomínio; senão, cadastro novo nela.';
END
$pos$;

COMMIT;
