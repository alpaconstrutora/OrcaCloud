-- =============================================================================
-- Condomínio — Assembleias e votações: Portal do Cliente (leitura e voto do
-- condômino) e a leitura das impedidas para o gestor.
-- Plano: docs/planos/2026-11-25-condominio-assembleias-votacoes.md
--        (R2, R3, R5, R7, "Desenho › RPCs/Telas", Task A3).
-- Prova: scripts/teste-condominio-assembleias-portal.sql
-- Depende de: aplicar_20271125860000_condominio_assembleias.sql (A1) e
--             aplicar_20271125860100_condominio_assembleias_conduzir.sql (A2).
--
-- O que nasce aqui:
--   • fn_assembleias_payload_for_client(client) — a lista do portal (revogada de todos):
--     assembleias CONVOCADA/INSTALADA/ENCERRADA dos condomínios (em operação) onde o
--     cliente tem ocupação vigente, com UMA cédula por unidade da assembleia em que ele é
--     PROPRIETARIO vigente (R2). Nunca traz voto de outra unidade, e da assembleia
--     encerrada só os itens do retrato (sem o cabeçalho, que tem nome de quem conduziu).
--   • client_portal_get_assembleias(token)            — link do portal (anon e authenticated);
--     client_portal_get_assembleias_for_client(client) — cliente logado ou membro da org
--     (mesma autorização de client_portal_get_condominio_for_client). Os dois devolvem
--     { ok: true, assembleias: [...] } ou { ok: false, motivo }, como os de condomínio.
--   • client_portal_assembleia_votar(item, unidade, opção) — SÓ a sessão: o cliente com
--     e-mail = e-mail do JWT e PROPRIETARIO vigente da unidade; sem perna "membro da org"
--     e sem token (R2). Núcleo próprio _assembleia_votar_portal (papel CONDOMINO).
--   • condominio_assembleia_impedimentos(assembleia) — [{ unitId, motivo }] das unidades
--     impedidas agora (R3), para a tela de presença do gestor (membro da org).
--   • Auxiliares do voto, comuns ao gestor e ao portal (a A2 tinha esses blocos dentro de
--     _assembleia_lancar_voto, que é recriada aqui usando-os, com o mesmo comportamento):
--     _assembleia_unidade_votante (unidade_fora, unidade_impedida), _assembleia_exige_opcao
--     (opcao_invalida) e _assembleia_gravar_voto (upsert: vale o último — R5/R7).
--
-- Erros novos: 42501 / HINT sem_direito_de_voto. Os demais são os da A2 (estado,
-- unidade_fora, unidade_impedida com DETAIL = motivo, opcao_invalida, nao_encontrada).
--
-- REGRA #7:
--   Pergunta 1 — nenhuma policy nova (o portal entra só por RPC).
--   Pergunta 2 — toda função nova: REVOKE ALL de PUBLIC e anon. Payload, núcleo e
--   auxiliares revogados também de authenticated. client_portal_get_assembleias: GRANT
--   anon, authenticated (o token é a autorização). for_client, votar e impedimentos: GRANT
--   só authenticated, com a autorização DENTRO deles.
--
-- Idempotente (CREATE OR REPLACE / REVOKE+GRANT).
-- Aplicar com `npx supabase db query --linked -f` — nunca `db push`.
-- =============================================================================

SET lock_timeout = '5s';

BEGIN;

-- ═══ BLOCO 1 — auxiliares do voto (gestor e portal) ══════════════════════════
SET lock_timeout = '5s';

-- R1/R3: a unidade participa da assembleia e não está impedida AGORA. Devolve a linha.
CREATE OR REPLACE FUNCTION public._assembleia_unidade_votante(p_assembleia uuid, p_unit uuid)
 RETURNS public.condominio_assembleia_unidades
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_u      public.condominio_assembleia_unidades;
    v_motivo text;
BEGIN
    SELECT * INTO v_u FROM public.condominio_assembleia_unidades
     WHERE assembleia_id = p_assembleia AND unit_id = p_unit;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Esta unidade não participa da assembleia.' USING ERRCODE = 'P0001', HINT = 'unidade_fora';
    END IF;
    v_motivo := public.fn_assembleia_unidade_impedida(p_unit);
    IF v_motivo IS NOT NULL THEN
        RAISE EXCEPTION 'A unidade % está impedida: %.', coalesce(v_u.unidade_rotulo, ''), v_motivo
            USING ERRCODE = 'P0001', HINT = 'unidade_impedida', DETAIL = v_motivo;
    END IF;
    RETURN v_u;
END;
$$;

-- R8: a cédula. APROVACAO = SIM / NAO / ABSTENCAO; ESCOLHA = as opções do item + ABSTENCAO.
CREATE OR REPLACE FUNCTION public._assembleia_exige_opcao(p_tipo text, p_opcoes text[], p_opcao text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    IF p_opcao IS NULL OR NOT (p_opcao = ANY (
           CASE WHEN p_tipo = 'APROVACAO' THEN ARRAY['SIM', 'NAO', 'ABSTENCAO']
                ELSE p_opcoes || 'ABSTENCAO'::text END)) THEN
        RAISE EXCEPTION 'Opção de voto inválida para este item.' USING ERRCODE = 'P0001', HINT = 'opcao_invalida';
    END IF;
END;
$$;

-- R5/R7: grava o voto da unidade no item — vale o último, venha de onde vier (o
-- histórico guarda todos, pelo gatilho da A1). Devolve { votoId, votadoEm, anterior }.
CREATE OR REPLACE FUNCTION public._assembleia_gravar_voto(p_assembleia uuid, p_item uuid, p_unit uuid, p_opcao text,
                                                          p_origem text, p_client uuid, p_lancado_por uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_anterior jsonb;
    v_voto     uuid;
    v_em       timestamptz;
BEGIN
    SELECT jsonb_build_object('opcao', v.opcao, 'origem', v.origem, 'votadoEm', v.votado_em,
                              'clientId', v.client_id, 'lancadoPor', v.lancado_por)
      INTO v_anterior
      FROM public.condominio_assembleia_votos v
     WHERE v.item_id = p_item AND v.unit_id = p_unit;

    INSERT INTO public.condominio_assembleia_votos
        (assembleia_id, item_id, unit_id, opcao, origem, client_id, lancado_por, votado_em)
    VALUES (p_assembleia, p_item, p_unit, p_opcao, p_origem, p_client, p_lancado_por, now())
    ON CONFLICT (item_id, unit_id) DO UPDATE
       SET opcao = EXCLUDED.opcao, origem = EXCLUDED.origem, client_id = EXCLUDED.client_id,
           lancado_por = EXCLUDED.lancado_por, votado_em = EXCLUDED.votado_em
    RETURNING id, votado_em INTO v_voto, v_em;

    RETURN jsonb_build_object('votoId', v_voto, 'votadoEm', v_em, 'anterior', v_anterior);
END;
$$;

-- ═══ BLOCO 2 — A2: voto presencial pelos auxiliares (mesmo comportamento) ════
SET lock_timeout = '5s';

-- R3/R7: voto presencial lançado pelo gestor. Vale o último (substitui o do portal).
-- Ordem das recusas igual à da A2: unidade_fora → unidade_impedida → sem_presenca → opcao_invalida.
CREATE OR REPLACE FUNCTION public._assembleia_lancar_voto(p_item uuid, p_unit uuid, p_opcao text,
                                                          p_ator uuid, p_papel text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_aid  uuid;
    v_a    public.condominio_assembleias;
    v_i    public.condominio_assembleia_itens;
    v_u    public.condominio_assembleia_unidades;
    v_g    jsonb;
BEGIN
    SELECT i.assembleia_id INTO v_aid FROM public.condominio_assembleia_itens i WHERE i.id = p_item;
    IF v_aid IS NULL THEN
        RAISE EXCEPTION 'Item da pauta não encontrado.' USING ERRCODE = 'P0002', HINT = 'nao_encontrada';
    END IF;
    v_a := public._assembleia_travar(v_aid);
    PERFORM public._assembleia_exige_condutor(p_papel);
    PERFORM public._assembleia_exige_estado(v_a.status, ARRAY['INSTALADA']);
    SELECT * INTO v_i FROM public.condominio_assembleia_itens WHERE id = p_item;

    v_u := public._assembleia_unidade_votante(v_aid, p_unit);
    IF v_u.presenca IS NULL THEN
        RAISE EXCEPTION 'Registre a presença da unidade antes de lançar o voto presencial.'
            USING ERRCODE = 'P0001', HINT = 'sem_presenca';
    END IF;
    PERFORM public._assembleia_exige_opcao(v_i.tipo, v_i.opcoes, p_opcao);

    v_g := public._assembleia_gravar_voto(v_aid, p_item, p_unit, p_opcao, 'PRESENCIAL', NULL, p_ator);

    INSERT INTO public.condominio_assembleia_eventos (assembleia_id, evento, ator, papel, unit_id, detalhe)
    VALUES (v_aid, 'VOTO_LANCADO', p_ator, p_papel, p_unit,
            jsonb_build_object('itemId', p_item, 'opcao', p_opcao, 'anterior', v_g -> 'anterior'));

    RETURN jsonb_build_object('votoId', v_g -> 'votoId', 'itemId', p_item, 'unitId', p_unit, 'opcao', p_opcao,
                              'origem', 'PRESENCIAL', 'anterior', v_g -> 'anterior');
END;
$$;

-- ═══ BLOCO 3 — núcleo do voto do condômino ═══════════════════════════════════
SET lock_timeout = '5s';

-- R2/R3/R5: voto pelo portal. Quem é o cliente já foi resolvido pela porta (só sessão).
-- Trava a assembleia ANTES de tocar nos filhos (mesma ordem do núcleo da A2).
CREATE OR REPLACE FUNCTION public._assembleia_votar_portal(p_item uuid, p_unit uuid, p_opcao text,
                                                           p_client uuid, p_usuario uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_aid      uuid;
    v_a        public.condominio_assembleias;
    v_i        public.condominio_assembleia_itens;
    v_g        jsonb;
    v_anterior jsonb;
BEGIN
    SELECT i.assembleia_id INTO v_aid FROM public.condominio_assembleia_itens i WHERE i.id = p_item;
    IF v_aid IS NULL THEN
        RAISE EXCEPTION 'Item da pauta não encontrado.' USING ERRCODE = 'P0002', HINT = 'nao_encontrada';
    END IF;
    v_a := public._assembleia_travar(v_aid);
    -- R5: o voto pelo portal abre na convocação e fecha no encerramento.
    PERFORM public._assembleia_exige_estado(v_a.status, ARRAY['CONVOCADA', 'INSTALADA']);
    SELECT * INTO v_i FROM public.condominio_assembleia_itens WHERE id = p_item;

    PERFORM public._assembleia_unidade_votante(v_aid, p_unit);
    PERFORM public._assembleia_exige_opcao(v_i.tipo, v_i.opcoes, p_opcao);

    v_g := public._assembleia_gravar_voto(v_aid, p_item, p_unit, p_opcao, 'PORTAL', p_client, NULL);
    v_anterior := v_g -> 'anterior';

    INSERT INTO public.condominio_assembleia_eventos (assembleia_id, evento, ator, papel, unit_id, detalhe)
    VALUES (v_aid, 'VOTO_PORTAL', p_client, 'CONDOMINO', p_unit,
            jsonb_build_object('itemId', p_item, 'opcao', p_opcao, 'usuario', p_usuario, 'anterior', v_anterior));

    -- Para o condômino, o voto anterior sem quem lançou (id de usuário do gestor).
    RETURN jsonb_build_object('votoId', v_g -> 'votoId', 'itemId', p_item, 'unitId', p_unit, 'opcao', p_opcao,
                              'origem', 'PORTAL', 'votadoEm', v_g -> 'votadoEm',
                              'anterior', CASE WHEN jsonb_typeof(v_anterior) = 'object'
                                               THEN v_anterior - 'clientId' - 'lancadoPor' END);
END;
$$;

-- ═══ BLOCO 4 — leitura do portal ════════════════════════════════════════════
SET lock_timeout = '5s';

-- [{ id, condominioNome, tipo, titulo, local, linkTransmissao, primeiraConvocacaoEm,
--    segundaConvocacaoEm, status, itens: [{ id, ordem, titulo, descricao, tipo, opcoes, quorum }],
--    sessaoValida, minhasUnidades: [{ unitId, rotulo, impedida, votos: { <itemId>: { opcao,
--    origem, votadoEm } } }], resultado: <itens do retrato> | null, ataDocumentoId }]
-- • Recorte = o de fn_condominio_payload_for_client: condomínios EM_OPERACAO onde o cliente
--   tem ocupação vigente (qualquer papel — o inquilino vê a assembleia, sem cédula).
-- • minhasUnidades = unidades DA ASSEMBLEIA (congeladas na convocação) em que ele é
--   PROPRIETARIO vigente agora. impedida = motivo do banco (R3) ou null; null também na
--   ENCERRADA (a votação acabou; o motivo deixaria a cédula com a razão errada).
-- • sessaoValida = há sessão e o e-mail do JWT é o do cadastro (o critério do voto).
-- • Só os votos das minhas unidades; resultado = retrato -> 'itens' (sem cabeçalho).
CREATE OR REPLACE FUNCTION public.fn_assembleias_payload_for_client(p_client_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
    WITH sessao AS (
        SELECT coalesce((SELECT auth.uid() IS NOT NULL AND c.email IS NOT NULL
                                AND lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
                           FROM public.clients c WHERE c.id = p_client_id), false) AS valida
    ),
    predios AS (
        SELECT DISTINCT t.empreendimento_id
          FROM public.unit_occupancies o
          JOIN public.empreendimento_units  u ON u.id = o.unit_id
          JOIN public.empreendimento_towers t ON t.id = u.tower_id
          JOIN public.empreendimentos       e ON e.id = t.empreendimento_id
         WHERE o.client_id = p_client_id
           AND o.ended_at IS NULL
           AND e.status = 'EM_OPERACAO'
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id',                   a.id,
        'condominioNome',       e.name,
        'tipo',                 a.tipo,
        'titulo',               a.titulo,
        'local',                a.local,
        'linkTransmissao',      a.link_transmissao,
        'primeiraConvocacaoEm', a.primeira_convocacao_em,
        'segundaConvocacaoEm',  a.segunda_convocacao_em,
        'status',               a.status,
        'itens', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                             'id', i.id, 'ordem', i.ordem, 'titulo', i.titulo, 'descricao', i.descricao,
                             'tipo', i.tipo, 'opcoes', to_jsonb(i.opcoes), 'quorum', i.quorum)
                         ORDER BY i.ordem), '[]'::jsonb)
                    FROM public.condominio_assembleia_itens i WHERE i.assembleia_id = a.id),
        'sessaoValida', (SELECT valida FROM sessao),
        'minhasUnidades', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                                      'unitId', au.unit_id,
                                      'rotulo', au.unidade_rotulo,
                                      'impedida', CASE WHEN a.status IN ('CONVOCADA', 'INSTALADA')
                                                       THEN public.fn_assembleia_unidade_impedida(au.unit_id) END,
                                      'votos', (SELECT coalesce(jsonb_object_agg(v.item_id::text, jsonb_build_object(
                                                           'opcao', v.opcao, 'origem', v.origem, 'votadoEm', v.votado_em)),
                                                       '{}'::jsonb)
                                                  FROM public.condominio_assembleia_votos v
                                                 WHERE v.assembleia_id = a.id AND v.unit_id = au.unit_id))
                                  ORDER BY au.unidade_rotulo), '[]'::jsonb)
                             FROM public.condominio_assembleia_unidades au
                            WHERE au.assembleia_id = a.id
                              AND EXISTS (SELECT 1 FROM public.unit_occupancies o
                                           WHERE o.unit_id = au.unit_id AND o.client_id = p_client_id
                                             AND o.role = 'PROPRIETARIO' AND o.ended_at IS NULL)),
        'resultado',      CASE WHEN a.status = 'ENCERRADA' THEN a.retrato -> 'itens' END,
        'ataDocumentoId', a.ata_documento_id
    ) ORDER BY a.primeira_convocacao_em DESC, a.id), '[]'::jsonb)
      FROM public.condominio_assembleias a
      JOIN public.empreendimentos e ON e.id = a.empreendimento_id
     WHERE a.empreendimento_id IN (SELECT empreendimento_id FROM predios)
       AND a.status IN ('CONVOCADA', 'INSTALADA', 'ENCERRADA');
$$;

COMMENT ON FUNCTION public.fn_assembleias_payload_for_client(uuid) IS
    'Assembleias do Portal do Cliente (sem voto de outra unidade, sem cabeçalho do retrato). '
    'Uso interno: client_portal_get_assembleias e client_portal_get_assembleias_for_client.';

-- Link do portal: resolve o token como client_portal_get_condominio.
CREATE OR REPLACE FUNCTION public.client_portal_get_assembleias(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_tok public.client_portal_tokens;
BEGIN
    SELECT * INTO v_tok FROM public.client_portal_tokens
     WHERE token = p_token AND is_active AND expires_at > now();

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Link inválido ou expirado.');
    END IF;

    UPDATE public.client_portal_tokens SET last_used_at = now() WHERE id = v_tok.id;

    -- sessaoValida sai da sessão desta chamada, não do token: quem abriu o link e
    -- também está logado com o e-mail do cadastro vota (o voto passa pela sessão).
    RETURN jsonb_build_object('ok', true, 'assembleias', public.fn_assembleias_payload_for_client(v_tok.client_id));
END;
$$;

-- Cliente logado ou admin abrindo o portal: as mesmas duas autorizações de
-- client_portal_get_condominio_for_client.
CREATE OR REPLACE FUNCTION public.client_portal_get_assembleias_for_client(p_client_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
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

    -- Duas autorizações, e só elas (as de client_portal_get_condominio_for_client):
    --   (a) membro da organização dona do cliente — o admin abrindo o portal (lê, mas
    --       sessaoValida = false: o voto não aceita membro);
    --   (b) o próprio cliente logado, casando pelo e-mail do cadastro.
    IF NOT (
        public.is_org_member(v_cli.organization_id)
        OR (v_cli.email IS NOT NULL
            AND lower(v_cli.email) = lower(coalesce(auth.jwt() ->> 'email', '')))
    ) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Sem permissão para ver este cadastro.');
    END IF;

    RETURN jsonb_build_object('ok', true, 'assembleias', public.fn_assembleias_payload_for_client(p_client_id));
END;
$$;

-- ═══ BLOCO 5 — voto do condômino (só a sessão) ═══════════════════════════════
SET lock_timeout = '5s';

-- R2: sem token e sem client_id. Vota quem está logado com o e-mail de um cadastro que é
-- PROPRIETARIO vigente da unidade. Membro da org, inquilino, morador: 42501.
CREATE OR REPLACE FUNCTION public.client_portal_assembleia_votar(p_item uuid, p_unit uuid, p_opcao text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_uid    uuid := auth.uid();
    v_email  text := lower(coalesce(auth.jwt() ->> 'email', ''));
    v_client uuid;
BEGIN
    IF v_uid IS NOT NULL AND v_email <> '' THEN
        SELECT c.id INTO v_client
          FROM public.clients c
          JOIN public.unit_occupancies o ON o.client_id = c.id
         WHERE c.email IS NOT NULL AND lower(c.email) = v_email
           AND o.unit_id = p_unit AND o.role = 'PROPRIETARIO' AND o.ended_at IS NULL
         ORDER BY c.id
         LIMIT 1;
    END IF;
    IF v_client IS NULL THEN
        RAISE EXCEPTION 'Só o proprietário da unidade, entrando com o e-mail e a senha do cadastro, vota por ela.'
            USING ERRCODE = '42501', HINT = 'sem_direito_de_voto';
    END IF;

    RETURN public._assembleia_votar_portal(p_item, p_unit, p_opcao, v_client, v_uid);
END;
$$;

-- ═══ BLOCO 6 — impedidas agora, para a tela de presença do gestor ═══════════
SET lock_timeout = '5s';

-- R3: [{ unitId, motivo }] das unidades da assembleia impedidas neste instante.
-- Autorização dos invólucros da A2: membro da org de fn_org_do_condominio, senão 42501.
CREATE OR REPLACE FUNCTION public.condominio_assembleia_impedimentos(p_assembleia uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    PERFORM public._assembleia_exige_gestor(p_assembleia);
    RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('unitId', s.unit_id, 'motivo', s.motivo)
                                      ORDER BY s.unidade_rotulo, s.unit_id), '[]'::jsonb)
              FROM (SELECT u.unit_id, u.unidade_rotulo, public.fn_assembleia_unidade_impedida(u.unit_id) AS motivo
                      FROM public.condominio_assembleia_unidades u
                     WHERE u.assembleia_id = p_assembleia) s
             WHERE s.motivo IS NOT NULL);
END;
$$;

-- ═══ BLOCO 7 — privilégios ═══════════════════════════════════════════════════
SET lock_timeout = '5s';

-- Payload, núcleo e auxiliares: ninguém da API chama direto.
REVOKE ALL ON FUNCTION public.fn_assembleias_payload_for_client(uuid)                       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._assembleia_unidade_votante(uuid, uuid)                       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._assembleia_exige_opcao(text, text[], text)                   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._assembleia_gravar_voto(uuid, uuid, uuid, text, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._assembleia_lancar_voto(uuid, uuid, text, uuid, text)         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._assembleia_votar_portal(uuid, uuid, text, uuid, uuid)        FROM PUBLIC, anon, authenticated;

-- Link do portal: anon e authenticated (o token é a autorização).
REVOKE ALL ON FUNCTION public.client_portal_get_assembleias(text)                           FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_portal_get_assembleias(text)                        TO anon, authenticated;

-- Cliente logado / membro da org: só authenticated (a autorização está dentro).
REVOKE ALL ON FUNCTION public.client_portal_get_assembleias_for_client(uuid)                FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.client_portal_assembleia_votar(uuid, uuid, text)              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.condominio_assembleia_impedimentos(uuid)                      FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_portal_get_assembleias_for_client(uuid)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.client_portal_assembleia_votar(uuid, uuid, text)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.condominio_assembleia_impedimentos(uuid)                   TO authenticated;

COMMIT;
