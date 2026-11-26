-- =============================================================================
-- Condomínio — Assembleias e votações, fase B: a porta do SÍNDICO.
-- Plano: docs/planos/2026-11-25-condominio-assembleias-votacoes.md
--        (R1–R10, "Fase B — síndico conduz pelo Portal do Síndico", Task B1).
-- Prova: scripts/teste-condominio-assembleias-sindico.sql
-- Depende de (já aplicadas em produção, 26/11): aplicar_20271125860000 (A1),
--             aplicar_20271125860100 (A2 + A10) e aplicar_20271125860200 (A3).
--             Esta migration NÃO recria nada delas.
--
-- O que nasce aqui — tudo `sindico_portal_assembleia_<acao>(p_token text,
-- p_client_id uuid, …)`, com os mesmos parâmetros do invólucro do gestor:
--   • Autorização (auxiliares, fora da API):
--       _assembleia_sindico_acesso(token, client, empreendimento) — fn_sindico_resolver
--         em modo 'sessao' (síndico LOGADO, e-mail do JWT = clients.email, mandato
--         vigente em algum condomínio) e o empreendimento entre fn_sindico_predios
--         (mandato vigente NAQUELE condomínio). Devolve { ok, clientId } ou
--         { ok: false, motivo, hint }.
--       _assembleia_exige_sindico_do_predio / _assembleia_exige_sindico (pela
--         assembleia): a mesma conferência, levantando 42501 com o HINT.
--   • Núcleo da A2/A3 reaproveitado, sem duplicar regra: convocar, cancelar,
--     registrar_presenca, instalar, lancar_voto, encerrar, vincular_ata e
--     marcar_impedida chamam _assembleia_* com (client_id do síndico, 'SINDICO').
--     apuracao e cotas_conferidas chamam fn_assembleia_apurar /
--     fn_assembleia_cotas_conferidas.
--   • Rascunho e pauta (o síndico não é membro da org: a RLS do gestor não serve):
--     salvar_rascunho (INSERT/UPDATE só das 7 colunas que o app grava — A2, decisão 1),
--     salvar_itens (reescreve a pauta: DELETE + INSERT, numa transação só) e
--     excluir_rascunho. A trava da A1 recusa tudo isso fora de RASCUNHO, igual ao gestor.
--   • Leituras que a tela da assembleia (A7) faz por fora de `ops`: listar, carregar
--     (linhas cruas, as mesmas colunas da tabela, para os mesmos conversores do TS),
--     unidades_fora (sem fração ideal — R1), leituras (confirmações do aviso da
--     convocação — R4, só informação) e impedimentos (R3/A10).
--   • sindico_portal_assembleia_autorizar_documento(token, client, empreendimento) —
--     { ok, org } para a Edge Function sindico-portal-documentos (envio da ata e da
--     procuração), que a chama com a credencial de QUEM CHAMOU.
--
-- Quem é o ATOR do síndico: o client_id dele (devolvido pelo resolvedor), não o
-- auth.uid(). É o que o núcleo da A2 já espera: o retrato do encerramento busca o
-- nome de quem instalou em `clients` quando o papel é SINDICO (e em `profiles` quando
-- é GESTOR) — com o auth.uid() a ata sairia "pelo síndico" sem o nome. O resolvedor
-- em modo 'sessao' já garante que a sessão é do dono daquele cadastro.
--
-- Erros da porta: 42501 com HINT
--   sindico_sem_sessao      — entrou só pelo link (ou com a sessão de outra pessoa);
--   sindico_sem_acesso      — link inválido/expirado, mandato fora de vigência, sem login;
--   sindico_fora_do_mandato — o condomínio (ou a assembleia) não é de um prédio do
--                             mandato vigente dele. Não diz se a assembleia existe.
-- Erro novo de forma: P0001 / itens_invalidos (a pauta não veio como lista).
-- Os demais são os do núcleo (A2/A3), inalterados.
--
-- REGRA #7:
--   Pergunta 1 — nenhuma policy nova.
--   Pergunta 2 — toda função nova: REVOKE ALL de PUBLIC e anon. Auxiliares revogados
--   também de authenticated. As 19 portas do síndico: GRANT só authenticated (o modo
--   'sessao' exige login — o link sozinho, com a chave anon, nem chega a executar), e a
--   autorização está DENTRO de cada uma.
--
-- Idempotente (CREATE OR REPLACE / REVOKE+GRANT). Reaplicável por cima das três da fase A.
-- Aplicar com `npx supabase db query --linked -f` — nunca `db push`.
-- =============================================================================

SET lock_timeout = '5s';

BEGIN;

-- ═══ BLOCO 1 — autorização do síndico ═══════════════════════════════════════
SET lock_timeout = '5s';

-- { ok: true, clientId } | { ok: false, motivo, hint }. Volátil: o resolvedor marca o
-- último uso do link.
CREATE OR REPLACE FUNCTION public._assembleia_sindico_acesso(p_token text, p_client_id uuid, p_empreendimento uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_r   jsonb;
    v_cli uuid;
BEGIN
    v_r := public.fn_sindico_resolver(p_token, p_client_id, 'sessao');
    IF NOT coalesce((v_r ->> 'ok')::boolean, false) THEN
        -- O que faltou? Se a leitura passaria, faltou só o login do próprio síndico —
        -- a frase do resolvedor fala de rateio; esta fala da assembleia.
        v_r := public.fn_sindico_resolver(p_token, p_client_id, 'ler');
        IF coalesce((v_r ->> 'ok')::boolean, false) THEN
            RETURN jsonb_build_object('ok', false, 'hint', 'sindico_sem_sessao',
                'motivo', 'Para conduzir a assembleia, entre no Portal do Síndico com seu e-mail e senha.');
        END IF;
        RETURN jsonb_build_object('ok', false, 'hint', 'sindico_sem_acesso',
            'motivo', coalesce(v_r ->> 'motivo', 'Acesso de síndico não reconhecido.'));
    END IF;

    v_cli := (v_r ->> 'client_id')::uuid;
    IF p_empreendimento IS NULL OR p_empreendimento NOT IN (SELECT public.fn_sindico_predios(v_cli)) THEN
        RETURN jsonb_build_object('ok', false, 'hint', 'sindico_fora_do_mandato',
            'motivo', 'Este condomínio não está no seu mandato de síndico.');
    END IF;
    RETURN jsonb_build_object('ok', true, 'clientId', v_cli);
END;
$$;

-- Devolve o client_id do síndico; senão 42501 com o motivo e o HINT.
CREATE OR REPLACE FUNCTION public._assembleia_exige_sindico_do_predio(p_token text, p_client_id uuid, p_empreendimento uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v jsonb := public._assembleia_sindico_acesso(p_token, p_client_id, p_empreendimento);
BEGIN
    IF NOT (v ->> 'ok')::boolean THEN
        RAISE EXCEPTION '%', v ->> 'motivo' USING ERRCODE = '42501', HINT = v ->> 'hint';
    END IF;
    RETURN (v ->> 'clientId')::uuid;
END;
$$;

-- Pela assembleia. Assembleia inexistente cai em sindico_fora_do_mandato (não diz se
-- existe), como o 42501 do gestor.
CREATE OR REPLACE FUNCTION public._assembleia_exige_sindico(p_token text, p_client_id uuid, p_assembleia uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    RETURN public._assembleia_exige_sindico_do_predio(p_token, p_client_id,
        (SELECT a.empreendimento_id FROM public.condominio_assembleias a WHERE a.id = p_assembleia));
END;
$$;

-- ═══ BLOCO 2 — leituras ═════════════════════════════════════════════════════
SET lock_timeout = '5s';

-- Assembleias do condomínio, na ordem da lista do gestor (rascunho sem data no topo,
-- depois a mais recente). Linhas cruas: as colunas da tabela, como o gestor as lê.
CREATE OR REPLACE FUNCTION public.sindico_portal_assembleia_listar(p_token text, p_client_id uuid, p_empreendimento uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    PERFORM public._assembleia_exige_sindico_do_predio(p_token, p_client_id, p_empreendimento);
    RETURN (SELECT coalesce(jsonb_agg(to_jsonb(a)
                                      ORDER BY a.primeira_convocacao_em DESC NULLS FIRST, a.created_at DESC),
                            '[]'::jsonb)
              FROM public.condominio_assembleias a
             WHERE a.empreendimento_id = p_empreendimento);
END;
$$;

-- { assembleia, itens, unidades, votos } — o AssembleiaCarregada do TS, em linhas cruas.
CREATE OR REPLACE FUNCTION public.sindico_portal_assembleia_carregar(p_token text, p_client_id uuid, p_assembleia uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    PERFORM public._assembleia_exige_sindico(p_token, p_client_id, p_assembleia);
    RETURN jsonb_build_object(
        'assembleia', (SELECT to_jsonb(a) FROM public.condominio_assembleias a WHERE a.id = p_assembleia),
        'itens', (SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.ordem), '[]'::jsonb)
                    FROM public.condominio_assembleia_itens i WHERE i.assembleia_id = p_assembleia),
        'unidades', (SELECT coalesce(jsonb_agg(to_jsonb(u) ORDER BY u.unidade_rotulo, u.unit_id), '[]'::jsonb)
                       FROM public.condominio_assembleia_unidades u WHERE u.assembleia_id = p_assembleia),
        'votos', (SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.item_id, v.unit_id), '[]'::jsonb)
                    FROM public.condominio_assembleia_votos v WHERE v.assembleia_id = p_assembleia));
END;
$$;

-- R1: unidades do condomínio sem fração ideal ("fora da assembleia"), com o MESMO rótulo
-- e a mesma ordem que o Convocar grava em eventos.detalhe.fora.
CREATE OR REPLACE FUNCTION public.sindico_portal_assembleia_unidades_fora(p_token text, p_client_id uuid, p_assembleia uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    PERFORM public._assembleia_exige_sindico(p_token, p_client_id, p_assembleia);
    RETURN (SELECT coalesce(jsonb_agg(t.name || ' — ' || u.name ORDER BY t.sort_order, t.name, u.sort_order, u.name),
                            '[]'::jsonb)
              FROM public.condominio_assembleias a
              JOIN public.empreendimento_towers t ON t.empreendimento_id = a.empreendimento_id
              JOIN public.empreendimento_units u  ON u.tower_id = t.id
             WHERE a.id = p_assembleia
               AND (u.fracao_ideal_decimal IS NULL OR u.fracao_ideal_decimal <= 0));
END;
$$;

-- R4: quantas confirmações de leitura o aviso da convocação tem (0 antes de convocar).
-- Só informação: a leitura nunca trava nada.
CREATE OR REPLACE FUNCTION public.sindico_portal_assembleia_leituras(p_token text, p_client_id uuid, p_assembleia uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    PERFORM public._assembleia_exige_sindico(p_token, p_client_id, p_assembleia);
    RETURN (SELECT count(*)::integer
              FROM public.condominio_assembleias a
              JOIN public.condominio_aviso_leituras l ON l.aviso_id = a.aviso_id
             WHERE a.id = p_assembleia);
END;
$$;

-- R3/A10: [{ unitId, motivo, origem }] das unidades impedidas AGORA — a mesma leitura de
-- condominio_assembleia_impedimentos (gestor), pela regra única fn_assembleia_impedimento.
CREATE OR REPLACE FUNCTION public.sindico_portal_assembleia_impedimentos(p_token text, p_client_id uuid, p_assembleia uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    PERFORM public._assembleia_exige_sindico(p_token, p_client_id, p_assembleia);
    RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('unitId', s.unit_id, 'motivo', s.motivo, 'origem', s.origem)
                                      ORDER BY s.unidade_rotulo, s.unit_id), '[]'::jsonb)
              FROM (SELECT u.unit_id, u.unidade_rotulo,
                           public.fn_assembleia_impedimento(p_assembleia, u.unit_id) AS motivo,
                           CASE WHEN u.impedimento_manual IS NOT NULL THEN 'MANUAL' ELSE 'AUTOMATICA' END AS origem
                      FROM public.condominio_assembleia_unidades u
                     WHERE u.assembleia_id = p_assembleia) s
             WHERE s.motivo IS NOT NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.sindico_portal_assembleia_apuracao(p_token text, p_client_id uuid, p_assembleia uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    PERFORM public._assembleia_exige_sindico(p_token, p_client_id, p_assembleia);
    RETURN public.fn_assembleia_apurar(p_assembleia);
END;
$$;

-- A10: o condomínio tem cota cobrada pelo app? Vale em qualquer estado.
CREATE OR REPLACE FUNCTION public.sindico_portal_assembleia_cotas_conferidas(p_token text, p_client_id uuid, p_assembleia uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    PERFORM public._assembleia_exige_sindico(p_token, p_client_id, p_assembleia);
    RETURN public.fn_assembleia_cotas_conferidas(
        (SELECT a.empreendimento_id FROM public.condominio_assembleias a WHERE a.id = p_assembleia));
END;
$$;

-- ═══ BLOCO 3 — rascunho e pauta (o que o gestor faz pela tabela) ═════════════
SET lock_timeout = '5s';

-- Cria (p_assembleia NULL) ou atualiza o RASCUNHO — só as 7 colunas que o app grava
-- (A2, decisão 1). org e created_by vêm do gatilho (_assembleia_org_do_condominio);
-- fora de RASCUNHO a trava da A1 recusa, como para o gestor.
CREATE OR REPLACE FUNCTION public.sindico_portal_assembleia_salvar_rascunho(
    p_token text, p_client_id uuid, p_assembleia uuid, p_empreendimento uuid, p_tipo text, p_titulo text,
    p_local text, p_link_transmissao text, p_primeira_convocacao_em timestamptz, p_segunda_convocacao_em timestamptz)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_a public.condominio_assembleias;
BEGIN
    IF p_assembleia IS NOT NULL THEN
        -- A assembleia é de um prédio dele, e o condomínio de destino também.
        PERFORM public._assembleia_exige_sindico(p_token, p_client_id, p_assembleia);
    END IF;
    PERFORM public._assembleia_exige_sindico_do_predio(p_token, p_client_id, p_empreendimento);

    IF p_assembleia IS NULL THEN
        INSERT INTO public.condominio_assembleias
            (empreendimento_id, tipo, titulo, local, link_transmissao, primeira_convocacao_em, segunda_convocacao_em)
        VALUES (p_empreendimento, p_tipo, btrim(coalesce(p_titulo, '')),
                nullif(btrim(coalesce(p_local, '')), ''), nullif(btrim(coalesce(p_link_transmissao, '')), ''),
                p_primeira_convocacao_em, p_segunda_convocacao_em)
        RETURNING * INTO v_a;
    ELSE
        UPDATE public.condominio_assembleias
           SET empreendimento_id = p_empreendimento, tipo = p_tipo, titulo = btrim(coalesce(p_titulo, '')),
               local = nullif(btrim(coalesce(p_local, '')), ''),
               link_transmissao = nullif(btrim(coalesce(p_link_transmissao, '')), ''),
               primeira_convocacao_em = p_primeira_convocacao_em, segunda_convocacao_em = p_segunda_convocacao_em
         WHERE id = p_assembleia
        RETURNING * INTO v_a;
    END IF;
    RETURN to_jsonb(v_a);
END;
$$;

-- Reescreve a pauta na ordem da lista (ordem 1..n): DELETE + INSERT, como o gestor
-- (UNIQUE(assembleia_id, ordem) não é adiável), mas numa transação só — se um item for
-- recusado, a pauta anterior fica como estava. Item com `id` mantém o id.
-- p_itens: [{ id?, titulo, descricao?, tipo, opcoes?, quorum?, assunto? }].
CREATE OR REPLACE FUNCTION public.sindico_portal_assembleia_salvar_itens(p_token text, p_client_id uuid,
                                                                        p_assembleia uuid, p_itens jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    PERFORM public._assembleia_exige_sindico(p_token, p_client_id, p_assembleia);
    IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array'
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_itens) x WHERE jsonb_typeof(x) <> 'object') THEN
        RAISE EXCEPTION 'A pauta vem como uma lista de itens.' USING ERRCODE = 'P0001', HINT = 'itens_invalidos';
    END IF;
    -- Mesma ordem do núcleo: a assembleia primeiro (FOR UPDATE), os filhos depois —
    -- e um Convocar em paralelo não pega a pauta pela metade.
    PERFORM public._assembleia_travar(p_assembleia);

    -- Fora de RASCUNHO a trava da A1 recusa (assembleia_travada), como para o gestor.
    DELETE FROM public.condominio_assembleia_itens WHERE assembleia_id = p_assembleia;

    INSERT INTO public.condominio_assembleia_itens
        (id, assembleia_id, ordem, titulo, descricao, tipo, opcoes, quorum, assunto)
    SELECT coalesce((x ->> 'id')::uuid, gen_random_uuid()), p_assembleia, n::integer,
           btrim(coalesce(x ->> 'titulo', '')),
           nullif(btrim(coalesce(x ->> 'descricao', '')), ''),
           x ->> 'tipo',
           CASE WHEN x ->> 'tipo' = 'ESCOLHA' THEN
               CASE WHEN jsonb_typeof(x -> 'opcoes') = 'array' THEN
                   (SELECT coalesce(array_agg(btrim(o) ORDER BY k), '{}'::text[])
                      FROM jsonb_array_elements_text(x -> 'opcoes') WITH ORDINALITY y(o, k))
               END
           END,
           coalesce(x ->> 'quorum', 'MAIORIA_PRESENTES'),
           nullif(btrim(coalesce(x ->> 'assunto', '')), '')
      FROM jsonb_array_elements(p_itens) WITH ORDINALITY z(x, n);

    RETURN (SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.ordem), '[]'::jsonb)
              FROM public.condominio_assembleia_itens i WHERE i.assembleia_id = p_assembleia);
END;
$$;

-- Só rascunho se exclui (a trava recusa os outros estados).
CREATE OR REPLACE FUNCTION public.sindico_portal_assembleia_excluir_rascunho(p_token text, p_client_id uuid, p_assembleia uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    PERFORM public._assembleia_exige_sindico(p_token, p_client_id, p_assembleia);
    PERFORM public._assembleia_travar(p_assembleia);
    DELETE FROM public.condominio_assembleias WHERE id = p_assembleia;
    RETURN jsonb_build_object('id', p_assembleia);
END;
$$;

-- ═══ BLOCO 4 — condução: o MESMO núcleo do gestor, com papel SINDICO ══════════
SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.sindico_portal_assembleia_convocar(p_token text, p_client_id uuid,
                                                                    p_assembleia uuid, p_corpo_aviso text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    RETURN public._assembleia_convocar(p_assembleia, p_corpo_aviso,
        public._assembleia_exige_sindico(p_token, p_client_id, p_assembleia), 'SINDICO');
END;
$$;

CREATE OR REPLACE FUNCTION public.sindico_portal_assembleia_cancelar(p_token text, p_client_id uuid, p_assembleia uuid,
                                                                    p_motivo text, p_corpo_aviso text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    RETURN public._assembleia_cancelar(p_assembleia, p_motivo, p_corpo_aviso,
        public._assembleia_exige_sindico(p_token, p_client_id, p_assembleia), 'SINDICO');
END;
$$;

CREATE OR REPLACE FUNCTION public.sindico_portal_assembleia_registrar_presenca(p_token text, p_client_id uuid,
                                                                              p_assembleia uuid, p_unit uuid,
                                                                              p_presenca text, p_procurador text,
                                                                              p_procuracao uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    RETURN public._assembleia_registrar_presenca(p_assembleia, p_unit, p_presenca, p_procurador, p_procuracao,
        public._assembleia_exige_sindico(p_token, p_client_id, p_assembleia), 'SINDICO');
END;
$$;

CREATE OR REPLACE FUNCTION public.sindico_portal_assembleia_instalar(p_token text, p_client_id uuid, p_assembleia uuid,
                                                                    p_convocacao smallint, p_presidente text,
                                                                    p_secretario text, p_edital_entregue boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    RETURN public._assembleia_instalar(p_assembleia, p_convocacao, p_presidente, p_secretario, p_edital_entregue,
        public._assembleia_exige_sindico(p_token, p_client_id, p_assembleia), 'SINDICO');
END;
$$;

CREATE OR REPLACE FUNCTION public.sindico_portal_assembleia_lancar_voto(p_token text, p_client_id uuid,
                                                                       p_item uuid, p_unit uuid, p_opcao text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    RETURN public._assembleia_lancar_voto(p_item, p_unit, p_opcao,
        public._assembleia_exige_sindico(p_token, p_client_id,
            (SELECT i.assembleia_id FROM public.condominio_assembleia_itens i WHERE i.id = p_item)),
        'SINDICO');
END;
$$;

CREATE OR REPLACE FUNCTION public.sindico_portal_assembleia_encerrar(p_token text, p_client_id uuid, p_assembleia uuid,
                                                                    p_deliberacoes jsonb, p_observacao text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    RETURN public._assembleia_encerrar(p_assembleia, p_deliberacoes, p_observacao,
        public._assembleia_exige_sindico(p_token, p_client_id, p_assembleia), 'SINDICO');
END;
$$;

CREATE OR REPLACE FUNCTION public.sindico_portal_assembleia_vincular_ata(p_token text, p_client_id uuid,
                                                                        p_assembleia uuid, p_documento uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    RETURN public._assembleia_vincular_ata(p_assembleia, p_documento,
        public._assembleia_exige_sindico(p_token, p_client_id, p_assembleia), 'SINDICO');
END;
$$;

-- A10: marcar (motivo) / desmarcar (NULL) a unidade impedida.
CREATE OR REPLACE FUNCTION public.sindico_portal_assembleia_marcar_impedida(p_token text, p_client_id uuid,
                                                                           p_assembleia uuid, p_unit uuid, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    RETURN public._assembleia_marcar_impedida(p_assembleia, p_unit, p_motivo,
        public._assembleia_exige_sindico(p_token, p_client_id, p_assembleia), 'SINDICO');
END;
$$;

-- ═══ BLOCO 5 — envio de documento (Edge Function sindico-portal-documentos) ══
SET lock_timeout = '5s';

-- { ok: true, org } | { ok: false, motivo }. A function chama com a credencial de QUEM
-- CHAMOU (REGRA #7, pergunta 3) e só depois grava com a service_role, na org do
-- condomínio (fn_org_do_condominio — REGRA #5 no banco).
CREATE OR REPLACE FUNCTION public.sindico_portal_assembleia_autorizar_documento(p_token text, p_client_id uuid,
                                                                               p_empreendimento uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v jsonb := public._assembleia_sindico_acesso(p_token, p_client_id, p_empreendimento);
BEGIN
    IF NOT (v ->> 'ok')::boolean THEN
        RETURN jsonb_build_object('ok', false, 'motivo', v ->> 'motivo', 'hint', v ->> 'hint');
    END IF;
    RETURN jsonb_build_object('ok', true, 'org', public.fn_org_do_condominio(p_empreendimento),
                              'clientId', v ->> 'clientId');
END;
$$;

-- ═══ BLOCO 6 — privilégios ═══════════════════════════════════════════════════
SET lock_timeout = '5s';

-- Auxiliares: ninguém da API chama direto.
REVOKE ALL ON FUNCTION public._assembleia_sindico_acesso(text, uuid, uuid)           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._assembleia_exige_sindico_do_predio(text, uuid, uuid)  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._assembleia_exige_sindico(text, uuid, uuid)            FROM PUBLIC, anon, authenticated;

-- Portas do síndico: só authenticated (a autorização está dentro).
REVOKE ALL ON FUNCTION public.sindico_portal_assembleia_listar(text, uuid, uuid)                 FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sindico_portal_assembleia_carregar(text, uuid, uuid)               FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sindico_portal_assembleia_unidades_fora(text, uuid, uuid)          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sindico_portal_assembleia_leituras(text, uuid, uuid)               FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sindico_portal_assembleia_impedimentos(text, uuid, uuid)           FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sindico_portal_assembleia_apuracao(text, uuid, uuid)               FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sindico_portal_assembleia_cotas_conferidas(text, uuid, uuid)       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sindico_portal_assembleia_salvar_rascunho(text, uuid, uuid, uuid, text, text, text, text, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sindico_portal_assembleia_salvar_itens(text, uuid, uuid, jsonb)    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sindico_portal_assembleia_excluir_rascunho(text, uuid, uuid)       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sindico_portal_assembleia_convocar(text, uuid, uuid, text)         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sindico_portal_assembleia_cancelar(text, uuid, uuid, text, text)   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sindico_portal_assembleia_registrar_presenca(text, uuid, uuid, uuid, text, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sindico_portal_assembleia_instalar(text, uuid, uuid, smallint, text, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sindico_portal_assembleia_lancar_voto(text, uuid, uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sindico_portal_assembleia_encerrar(text, uuid, uuid, jsonb, text)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sindico_portal_assembleia_vincular_ata(text, uuid, uuid, uuid)     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sindico_portal_assembleia_marcar_impedida(text, uuid, uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sindico_portal_assembleia_autorizar_documento(text, uuid, uuid)    FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.sindico_portal_assembleia_listar(text, uuid, uuid)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.sindico_portal_assembleia_carregar(text, uuid, uuid)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.sindico_portal_assembleia_unidades_fora(text, uuid, uuid)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.sindico_portal_assembleia_leituras(text, uuid, uuid)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.sindico_portal_assembleia_impedimentos(text, uuid, uuid)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.sindico_portal_assembleia_apuracao(text, uuid, uuid)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.sindico_portal_assembleia_cotas_conferidas(text, uuid, uuid)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.sindico_portal_assembleia_salvar_rascunho(text, uuid, uuid, uuid, text, text, text, text, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sindico_portal_assembleia_salvar_itens(text, uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sindico_portal_assembleia_excluir_rascunho(text, uuid, uuid)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.sindico_portal_assembleia_convocar(text, uuid, uuid, text)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.sindico_portal_assembleia_cancelar(text, uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sindico_portal_assembleia_registrar_presenca(text, uuid, uuid, uuid, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sindico_portal_assembleia_instalar(text, uuid, uuid, smallint, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sindico_portal_assembleia_lancar_voto(text, uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sindico_portal_assembleia_encerrar(text, uuid, uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sindico_portal_assembleia_vincular_ata(text, uuid, uuid, uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.sindico_portal_assembleia_marcar_impedida(text, uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sindico_portal_assembleia_autorizar_documento(text, uuid, uuid) TO authenticated;

COMMIT;
