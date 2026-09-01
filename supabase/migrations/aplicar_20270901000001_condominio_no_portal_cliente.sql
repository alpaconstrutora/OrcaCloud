-- ════════════════════════════════════════════════════════════════════════════
-- Condomínio dentro do Portal do Cliente
-- Plano: docs/planos/2026-09-01-condominio-no-portal-do-cliente.md
--
-- POR QUE: 6 dos 8 clientes de locação também são condôminos, e a Defensoria
-- Pública de MG já tinha OS DOIS links (client_portal_tokens +
-- condomino_portal_access). O pedido foi parar de obrigar a mesma pessoa a
-- entrar por dois portais.
--
-- Metade disso já existia sem ninguém notar: `unit_occupancies.client_id` é FK
-- para `clients`, os chamados do condômino já gravam em `client_requests`, e a
-- cota condominial já cai no Financeiro do portal do cliente (as duas pontas
-- usam internal_transactions CREDIT + party_id). Falta só levar UNIDADES,
-- AVISOS e DOCUMENTOS para lá.
--
-- ⚠️ DUAS RPCs DE LEITURA, DE PROPÓSITO. O Portal do Cliente tem três entradas
-- e só uma usa token. `unit_occupancies` tem RLS `is_org_member`, e ZERO dos 29
-- clientes com e-mail são membros de organização — o cliente logado receberia
-- 0 linhas SEM ERRO, e a aba diria "você não tem unidades" a um condômino de
-- verdade. Por isso o caminho autenticado também passa por SECURITY DEFINER,
-- com autorização escrita dentro da função.
--
-- Aplicar com:  npx supabase db query --linked -f <este arquivo>
-- NUNCA `supabase db push` (histórico de migrations furado).
-- ════════════════════════════════════════════════════════════════════════════

-- ═══ BLOCO 1 — leitura de aviso deixa de depender do acesso do condômino ════
--
-- `condominio_aviso_leituras` era (aviso_id, access_id), e `access_id` é FK para
-- `condomino_portal_access` — linha que o leitor vindo do portal do cliente não
-- tem e não deve ter.
--
-- A decisão original (comentário na migration 000023) era contar por ACESSO,
-- "porque a mesma pessoa pode ter duas unidades". Isso valeria se o aviso fosse
-- da unidade — mas `condominio_avisos.empreendimento_id` diz que ele é DO
-- PRÉDIO. Quem tem 3 salas via o MESMO aviso 3 vezes e podia confirmar 3
-- leituras: o número do síndico inflava sem informar nada. A chave passa a ser
-- a pessoa; `access_id` fica como procedência (de qual link veio a leitura).

ALTER TABLE public.condominio_aviso_leituras
    ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE;

ALTER TABLE public.condominio_aviso_leituras
    ALTER COLUMN access_id DROP NOT NULL;

-- Backfill: quem já leu pelo portal do condômino vira leitura da pessoa.
UPDATE public.condominio_aviso_leituras l
   SET client_id = a.client_id
  FROM public.condomino_portal_access a
 WHERE l.access_id = a.id
   AND l.client_id IS NULL;

-- Dedupe ANTES do índice único, senão a criação falha. Fica a leitura mais
-- antiga — foi quando a pessoa de fato leu.
DELETE FROM public.condominio_aviso_leituras l
 WHERE l.client_id IS NOT NULL
   AND EXISTS (
       SELECT 1 FROM public.condominio_aviso_leituras m
        WHERE m.aviso_id  = l.aviso_id
          AND m.client_id = l.client_id
          AND (m.lido_em < l.lido_em OR (m.lido_em = l.lido_em AND m.id < l.id))
   );

DROP INDEX IF EXISTS public.uidx_aviso_leitura;
CREATE UNIQUE INDEX IF NOT EXISTS uidx_aviso_leitura_cliente
    ON public.condominio_aviso_leituras(aviso_id, client_id);

COMMENT ON COLUMN public.condominio_aviso_leituras.client_id IS
    'Quem leu. É a chave: o aviso é do prédio, então ler uma vez é ter lido.';
COMMENT ON COLUMN public.condominio_aviso_leituras.access_id IS
    'Procedência (de qual link veio a leitura). NULO quando veio do Portal do Cliente.';

-- ═══ BLOCO 2 — chamado sabe de qual unidade é ═══════════════════════════════
--
-- `client_requests.unit_id` já existe (criado pela 000023) e `json_agg(r)` já o
-- devolvia junto com a linha. O que falta é o NOME da unidade — um uuid não diz
-- ao morador qual sala é — e poder gravar a unidade ao abrir o chamado.
--
-- ⚠️ O CONTRATO DE RETORNO NÃO MUDA. A leitura devolve {valid, data:[...]} e a
-- escrita devolve {success, error} — conferido na função em produção e em
-- `clientRequestsService.ts:109-127`. Trocar por {ok} deixaria a aba Manutenção
-- em branco sem erro nenhum, que é o defeito mais caro deste código.

CREATE OR REPLACE FUNCTION public.fn_portal_get_requests(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_tok public.client_portal_tokens;
BEGIN
    SELECT * INTO v_tok FROM public.client_portal_tokens
     WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN json_build_object('valid', FALSE); END IF;

    RETURN json_build_object(
        'valid', TRUE,
        'data', (
            -- `r.*` preserva todas as colunas que o portal já lia; as três
            -- últimas são o acréscimo.
            SELECT json_agg(x ORDER BY x.created_at DESC)
              FROM (
                SELECT r.*,
                       u.name AS unit_name,
                       t.name AS tower_name,
                       e.name AS condominio_name
                  FROM public.client_requests r
                  LEFT JOIN public.empreendimento_units  u ON u.id = r.unit_id
                  LEFT JOIN public.empreendimento_towers t ON t.id = u.tower_id
                  LEFT JOIN public.empreendimentos       e ON e.id = t.empreendimento_id
                 WHERE r.client_id = v_tok.client_id
              ) x
        )
    );
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_portal_get_requests(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_portal_get_requests(TEXT) TO anon, authenticated;

-- ⚠️ DROP obrigatório antes: no Postgres, número de argumentos diferente é
-- FUNÇÃO diferente. Um `CREATE OR REPLACE` com 6 parâmetros criaria uma
-- SOBRECARGA ao lado da de 5, e a chamada atual — cinco argumentos nomeados,
-- `clientRequestsService.ts:117` — passaria a casar com as duas: erro 42725
-- (ambíguo) toda vez que alguém tentasse abrir um chamado.
DROP FUNCTION IF EXISTS public.fn_portal_create_request(TEXT, TEXT, TEXT, TEXT, TEXT);

-- `p_unit_id` entra por ÚLTIMO e com DEFAULT NULL: assim a chamada atual, que
-- passa cinco argumentos nomeados, segue resolvendo para esta mesma função.
CREATE OR REPLACE FUNCTION public.fn_portal_create_request(
    p_token       TEXT,
    p_title       TEXT,
    p_description TEXT,
    p_category    TEXT,
    p_priority    TEXT,
    p_unit_id     UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_tok public.client_portal_tokens;
    v_id  UUID;
BEGIN
    SELECT * INTO v_tok FROM public.client_portal_tokens
     WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN
        RETURN json_build_object('success', FALSE, 'error', 'Token inválido');
    END IF;

    -- Só aceita unidade em que ESTE cliente tem ocupação vigente. Sem isto o
    -- portal viraria porta para abrir chamado na sala de outra pessoa.
    IF p_unit_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.unit_occupancies o
         WHERE o.unit_id = p_unit_id
           AND o.client_id = v_tok.client_id
           AND o.ended_at IS NULL
    ) THEN
        RETURN json_build_object('success', FALSE,
                                 'error', 'Unidade não vinculada a este cadastro.');
    END IF;

    INSERT INTO public.client_requests
        (organization_id, client_id, unit_id, title, description, category, priority)
    VALUES
        (v_tok.org_id, v_tok.client_id, p_unit_id, p_title, p_description,
         p_category, p_priority)
    RETURNING id INTO v_id;

    RETURN json_build_object('success', TRUE, 'id', v_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_portal_create_request(TEXT, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_portal_create_request(TEXT, TEXT, TEXT, TEXT, TEXT, UUID) TO anon, authenticated;

-- ═══ BLOCO 3 — o payload do condomínio, por client_id ═══════════════════════
--
-- Uma função interna monta o JSON; as duas RPCs públicas só decidem QUEM pode
-- pedir. Duplicar o payload em duas funções é como elas divergem depois.

CREATE OR REPLACE FUNCTION public.fn_condominio_payload_for_client(p_client_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
    WITH minhas AS (
        -- Uma linha por UNIDADE (não por ocupação): a mesma pessoa costuma ser
        -- inquilina E responsável financeira da mesma sala, e o portal não deve
        -- mostrar a sala duas vezes. Os papéis viram lista.
        SELECT u.id AS unit_id, u.name AS unit_name, u.floor, u.private_area,
               u.typology, u.fracao_ideal_decimal, u.fracao_ideal_origem,
               t.name AS tower_name,
               e.id AS empreendimento_id, e.code AS condominio_code,
               e.name AS condominio_name, e.condominio_cnpj,
               ARRAY_AGG(DISTINCT o.role ORDER BY o.role) AS papeis
          FROM public.unit_occupancies o
          JOIN public.empreendimento_units  u ON u.id = o.unit_id
          JOIN public.empreendimento_towers t ON t.id = u.tower_id
          JOIN public.empreendimentos       e ON e.id = t.empreendimento_id
         WHERE o.client_id = p_client_id
           AND o.ended_at IS NULL
           AND e.status = 'EM_OPERACAO'
         GROUP BY u.id, u.name, u.floor, u.private_area, u.typology,
                  u.fracao_ideal_decimal, u.fracao_ideal_origem, t.name,
                  e.id, e.code, e.name, e.condominio_cnpj
    )
    SELECT jsonb_build_object(
        'ok', true,
        'unidades', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'unitId',        m.unit_id,
                'unidade',       m.unit_name,
                'torre',         m.tower_name,
                'pavimento',     m.floor,
                'tipologia',     m.typology,
                'areaPrivativa', m.private_area,
                'fracaoIdeal',   m.fracao_ideal_decimal,
                'fracaoOrigem',  m.fracao_ideal_origem,
                'papeis',        to_jsonb(m.papeis),
                'condominioId',   m.empreendimento_id,
                'condominioCode', m.condominio_code,
                'condominioNome', m.condominio_name,
                'condominioCnpj', m.condominio_cnpj,
                -- Quem MAIS consta na unidade. Só papel e nome: o portal não é
                -- lugar de expor documento nem contato de terceiro.
                'ocupacoes', COALESCE((
                    SELECT jsonb_agg(jsonb_build_object('papel', o2.role, 'nome', c2.name)
                                     ORDER BY o2.role, c2.name)
                      FROM public.unit_occupancies o2
                      JOIN public.clients c2 ON c2.id = o2.client_id
                     WHERE o2.unit_id = m.unit_id AND o2.ended_at IS NULL), '[]'::jsonb)
            ) ORDER BY m.condominio_name, m.tower_name, m.unit_name)
            FROM minhas m), '[]'::jsonb),
        'avisos', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', av.id, 'titulo', av.titulo, 'corpo', av.corpo,
                'categoria', av.categoria, 'publicadoEm', av.publicado_em,
                'condominioNome', e2.name,
                'lido', EXISTS (SELECT 1 FROM public.condominio_aviso_leituras l
                                 WHERE l.aviso_id = av.id AND l.client_id = p_client_id))
                ORDER BY av.publicado_em DESC)
              FROM public.condominio_avisos av
              JOIN public.empreendimentos e2 ON e2.id = av.empreendimento_id
             WHERE av.empreendimento_id IN (SELECT DISTINCT empreendimento_id FROM minhas)
               AND (av.valido_ate IS NULL OR av.valido_ate >= CURRENT_DATE)), '[]'::jsonb),
        'documentos', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', d.id, 'titulo', d.titulo, 'categoria', d.categoria,
                'url', d.url, 'descricao', d.descricao,
                'condominioNome', e3.name)
                ORDER BY d.categoria, d.titulo)
              FROM public.condominio_documentos d
              JOIN public.empreendimentos e3 ON e3.id = d.empreendimento_id
             WHERE d.empreendimento_id IN (SELECT DISTINCT empreendimento_id FROM minhas)
               AND d.visivel_portal), '[]'::jsonb)
    );
$fn$;

-- ⚠️ `REVOKE ... FROM PUBLIC` NÃO BASTA no Supabase: o projeto concede EXECUTE
-- a `anon`/`authenticated` por default privileges, e esse grant é DIRETO ao
-- papel — sobrevive ao revoke de PUBLIC. Sem o revoke nominal abaixo, uma RPC
-- "só para autenticado" fica aberta ao link público, e nada na tela denuncia.
-- (Foi o ensaio desta própria migration que mostrou isso: a conferência
--  acusou anon com EXECUTE numa função concedida só a authenticated.)
REVOKE ALL ON FUNCTION public.fn_condominio_payload_for_client(UUID) FROM PUBLIC, anon, authenticated;
-- Ninguém chama esta direto: quem autoriza são as duas RPCs abaixo. Ela roda
-- como SECURITY DEFINER de dentro delas, sem precisar de grant nenhum.

-- ═══ BLOCO 4 — entrada por LINK PÚBLICO (anon) ══════════════════════════════

CREATE OR REPLACE FUNCTION public.client_portal_get_condominio(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_tok public.client_portal_tokens;
BEGIN
    SELECT * INTO v_tok FROM public.client_portal_tokens
     WHERE token = p_token AND is_active AND expires_at > NOW();

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Link inválido ou expirado.');
    END IF;

    UPDATE public.client_portal_tokens SET last_used_at = NOW() WHERE id = v_tok.id;

    RETURN public.fn_condominio_payload_for_client(v_tok.client_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.client_portal_get_condominio(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_portal_get_condominio(TEXT) TO anon, authenticated;

-- ═══ BLOCO 5 — entrada AUTENTICADA (cliente logado, e admin por dentro) ═════
--
-- Este é o bloco que impede o defeito silencioso. NÃO existe caminho por RLS
-- aqui: o cliente logado não é membro da organização, então a RLS de
-- `unit_occupancies` devolveria zero linhas sem erro nenhum.

CREATE OR REPLACE FUNCTION public.client_portal_get_condominio_for_client(p_client_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_cli public.clients;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Não autenticado.');
    END IF;

    SELECT * INTO v_cli FROM public.clients WHERE id = p_client_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Cliente não encontrado.');
    END IF;

    -- Duas autorizações, e só elas:
    --   (a) membro da organização dona do cliente — o admin abrindo o portal;
    --   (b) o próprio cliente logado, casando pelo e-mail do cadastro (é o
    --       mesmo critério que `useAuthSync` usa para dizer que este usuário
    --       É este cliente).
    IF NOT (
        public.is_org_member(v_cli.organization_id)
        OR (v_cli.email IS NOT NULL
            AND LOWER(v_cli.email) = LOWER(COALESCE(auth.jwt() ->> 'email', '')))
    ) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Sem permissão para ver este cadastro.');
    END IF;

    RETURN public.fn_condominio_payload_for_client(p_client_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.client_portal_get_condominio_for_client(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_portal_get_condominio_for_client(UUID) TO authenticated;

-- ═══ BLOCO 6 — marcar aviso como lido, pelo token do cliente ════════════════

CREATE OR REPLACE FUNCTION public.client_portal_marcar_aviso_lido(
    p_token TEXT, p_aviso_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_tok public.client_portal_tokens;
BEGIN
    SELECT * INTO v_tok FROM public.client_portal_tokens
     WHERE token = p_token AND is_active AND expires_at > NOW();
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Link inválido ou expirado.');
    END IF;

    -- O aviso tem de ser de um condomínio onde este cliente ocupa alguma
    -- unidade. A RPC equivalente do portal do condômino NÃO valida isso
    -- (000023:362) — não vale copiar o buraco para uma função nova.
    IF NOT EXISTS (
        SELECT 1
          FROM public.condominio_avisos av
          JOIN public.empreendimento_towers t ON t.empreendimento_id = av.empreendimento_id
          JOIN public.empreendimento_units  u ON u.tower_id = t.id
          JOIN public.unit_occupancies      o ON o.unit_id = u.id
         WHERE av.id = p_aviso_id
           AND o.client_id = v_tok.client_id
           AND o.ended_at IS NULL
    ) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Aviso não pertence a um condomínio deste cadastro.');
    END IF;

    INSERT INTO public.condominio_aviso_leituras (aviso_id, client_id)
    VALUES (p_aviso_id, v_tok.client_id)
    ON CONFLICT (aviso_id, client_id) DO NOTHING;

    RETURN jsonb_build_object('ok', true);
END;
$fn$;

REVOKE ALL ON FUNCTION public.client_portal_marcar_aviso_lido(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_portal_marcar_aviso_lido(TEXT, UUID) TO anon, authenticated;

-- ═══ BLOCO 7 — conferência ══════════════════════════════════════════════════
-- Cole o resultado. Qualquer número fora do esperado = migration não aplicada
-- inteira.

SELECT
    (SELECT COUNT(*) FROM information_schema.columns
      WHERE table_schema='public' AND table_name='condominio_aviso_leituras'
        AND column_name='client_id')                                    AS col_client_id,      -- 1
    (SELECT COUNT(*) FROM pg_indexes
      WHERE schemaname='public' AND indexname='uidx_aviso_leitura_cliente') AS uidx_por_cliente, -- 1
    (SELECT COUNT(*) FROM pg_indexes
      WHERE schemaname='public' AND indexname='uidx_aviso_leitura')     AS uidx_antigo,        -- 0
    (SELECT COUNT(*) FROM information_schema.columns
      WHERE table_schema='public' AND table_name='condominio_aviso_leituras'
        AND column_name='access_id' AND is_nullable='YES')              AS access_id_opcional, -- 1
    (SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname IN (
        'fn_condominio_payload_for_client','client_portal_get_condominio',
        'client_portal_get_condominio_for_client','client_portal_marcar_aviso_lido')) AS rpcs_novas, -- 4
    (SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='fn_portal_create_request'
        AND pg_get_function_identity_arguments(p.oid) LIKE '%uuid%')    AS create_request_com_unidade, -- 1
    (SELECT has_function_privilege('anon',
        'public.client_portal_get_condominio(text)', 'EXECUTE'))::TEXT  AS anon_le_condominio,  -- true
    (SELECT has_function_privilege('anon',
        'public.client_portal_get_condominio_for_client(uuid)', 'EXECUTE'))::TEXT AS anon_NAO_pode_por_id; -- false
