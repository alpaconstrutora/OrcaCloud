-- =============================================================================
-- Condomínio — Assembleias e votações: conduzir (impedimento, apuração e as
-- transições do gestor).
-- Plano: docs/planos/2026-11-25-condominio-assembleias-votacoes.md
--        (Regras R1–R10, "Desenho", Task A2).
-- Prova: scripts/teste-condominio-assembleias-conduzir.sql
-- Depende de: aplicar_20271125860000_condominio_assembleias.sql (A1).
--
-- O que nasce aqui:
--   • fn_assembleia_unidade_impedida(unit) — R3: NULL = quite; senão o motivo da cota
--     vencida mais antiga ('Cota de MM/AAAA vencida em DD/MM/AAAA').
--   • fn_assembleia_apurar(assembleia)     — R6/R8: soma por opção em numeric exato e o
--     resultado de cada item. Usada ao vivo e no encerramento (o retrato sai dela).
--   • Núcleo _assembleia_* (sem EXECUTE para a API; as portas do gestor, do portal e do
--     síndico chamam o mesmo núcleo): convocar, cancelar, registrar_presenca, instalar,
--     lancar_voto, encerrar, vincular_ata. Cada um trava a assembleia com
--     SELECT … FOR UPDATE ANTES de tocar nos filhos (a trava da A1 lê a assembleia com
--     FOR SHARE: na ordem inversa, dois Encerrar em paralelo dariam deadlock), liga a
--     marca app.assembleia_transicao só durante a própria transição (set_config local,
--     devolvida ao valor anterior no fim) e grava a autoria em _eventos.
--   • Invólucros do gestor condominio_assembleia_* (GRANT authenticated): conferem
--     fn_org_do_condominio(empreendimento) IN (SELECT minhas_orgs_membro()) — senão
--     42501 — e chamam o núcleo com auth.uid(), 'GESTOR'.
--   • Task A10 (decisão de 26/11: nenhum rateio do app tem cobrança gerada, a regra
--     automática não pega ninguém → aviso + marcar à mão):
--       – condominio_assembleia_unidades.impedimento_manual (motivo; NULL = sem marca) e
--         impedimento_manual_em. Autoria no evento IMPEDIMENTO_MANUAL ({ motivo | null }).
--       – fn_assembleia_impedimento(assembleia, unit) = coalesce(marca do gestor, regra
--         automática). TODA checagem de impedimento passa por ela (presença, voto
--         presencial, voto do portal, quórum de instalação, impedimentos, portal).
--       – fn_assembleia_cotas_conferidas(empreendimento): há título de cota em rateio não
--         cancelado. Instalar grava cotasConferidas e a origem (MANUAL | AUTOMATICA) de
--         cada impedida em quorum_instalacao (o retrato herda).
--       – núcleo _assembleia_marcar_impedida (papel GESTOR | SINDICO — a fase B chama o
--         mesmo) e os invólucros condominio_assembleia_marcar_impedida e
--         condominio_assembleia_cotas_conferidas. Marcar impede ações FUTURAS: voto já
--         dado continua valendo (R3, "momento da checagem").
--
-- Decisões da revisão da A1, aplicadas aqui (a A1 fica como está):
--   1. condominio_assembleias: o app só grava (INSERT/UPDATE) as 7 colunas do rascunho
--      — empreendimento_id, tipo, titulo, local, link_transmissao, primeira e segunda
--      convocação. status, retrato, ata, quórum, created_by… só pelo núcleo. created_by
--      = auth.uid() (DEFAULT no INSERT; o gatilho de org o mantém no UPDATE).
--   2. ESCOLHA: opções sem repetição (ignorando caixa e espaços), sem vazia, sem NULL e
--      sem 'ABSTENCAO' (a abstenção é da cédula, não do item).
--   3. Excluir o aviso da convocação ou o documento da ata (ON DELETE SET NULL) de uma
--      assembleia fora de RASCUNHO continua recusado, agora com mensagem própria.
--
-- Erros de regra: SQLSTATE P0001 e HINT com o código que a tela traduz:
--   estado, sem_datas, primeira_no_passado, sem_itens, sem_corpo, sem_unidades,
--   sem_motivo, unidade_fora, presenca_invalida, tem_voto_presencial,
--   unidade_impedida (DETAIL = motivo),
--   procuracao_invalida, convocacao_invalida, edital_nao_confirmado, sem_mesa,
--   antes_do_horario, sem_quorum_primeira, sem_presenca, opcao_invalida,
--   deliberacoes_invalidas, item_fora, documento_invalido, papel_invalido.
--   Não encontrada: P0002 / nao_encontrada. Sem permissão: 42501.
--
-- REGRA #7:
--   Pergunta 1 — nenhuma policy nova.
--   Pergunta 2 — toda função nova: REVOKE ALL de PUBLIC e anon. Núcleo, fn_assembleia_*
--   e auxiliares revogados também de authenticated (só os invólucros chamam). Os 10
--   invólucros (8 da A2 + 2 da A10): GRANT authenticated, autorização DENTRO deles. fn_assembleia_opcoes_validas
--   (função pura do CHECK) precisa de EXECUTE de quem grava o item: GRANT authenticated
--   e service_role.
--
-- Idempotente (CREATE OR REPLACE / DROP … IF EXISTS / REVOKE+GRANT).
-- Aplicar com `npx supabase db query --linked -f` — nunca `db push`.
-- =============================================================================

SET lock_timeout = '5s';

BEGIN;

-- ═══ BLOCO 1 — decisão 1: o que o app grava na assembleia ════════════════════
SET lock_timeout = '5s';

-- REVOKE do privilégio de tabela também tira os de coluna (refaz do zero).
REVOKE INSERT, UPDATE ON public.condominio_assembleias FROM authenticated;
GRANT INSERT (empreendimento_id, tipo, titulo, local, link_transmissao,
              primeira_convocacao_em, segunda_convocacao_em)
    ON public.condominio_assembleias TO authenticated;
GRANT UPDATE (empreendimento_id, tipo, titulo, local, link_transmissao,
              primeira_convocacao_em, segunda_convocacao_em)
    ON public.condominio_assembleias TO authenticated;

CREATE OR REPLACE FUNCTION public._assembleia_org_do_condominio()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    -- Ignora o que veio do cliente: a org é sempre a do condomínio (REGRA #5 no banco).
    -- No UPDATE só recalcula se o empreendimento mudou (e isso só acontece em RASCUNHO,
    -- pela trava); senão mantém a org gravada.
    IF TG_OP = 'INSERT' THEN
        NEW.organization_id := public.fn_org_do_condominio(NEW.empreendimento_id);
        -- Quem criou é a sessão (o app nem tem privilégio na coluna).
        NEW.created_by := coalesce(auth.uid(), NEW.created_by);
    ELSE
        IF NEW.empreendimento_id IS DISTINCT FROM OLD.empreendimento_id THEN
            NEW.organization_id := public.fn_org_do_condominio(NEW.empreendimento_id);
        ELSE
            NEW.organization_id := OLD.organization_id;
        END IF;
        NEW.created_by := OLD.created_by;
    END IF;
    RETURN NEW;
END;
$$;

-- ═══ BLOCO 2 — decisão 2: opções da ESCOLHA ══════════════════════════════════
SET lock_timeout = '5s';

-- Pura (IMMUTABLE): CHECK não aceita subconsulta, a função sim.
CREATE OR REPLACE FUNCTION public.fn_assembleia_opcoes_validas(p_opcoes text[])
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $$
    SELECT coalesce(
           p_opcoes IS NOT NULL
       AND cardinality(p_opcoes) >= 2
       AND array_position(p_opcoes, NULL) IS NULL
       AND NOT EXISTS (SELECT 1 FROM unnest(p_opcoes) x
                        WHERE btrim(x) = '' OR upper(btrim(x)) IN ('ABSTENCAO', 'ABSTENÇÃO'))
       AND (SELECT count(DISTINCT lower(btrim(x))) FROM unnest(p_opcoes) x) = cardinality(p_opcoes),
       false)
$$;

ALTER TABLE public.condominio_assembleia_itens
    DROP CONSTRAINT IF EXISTS condominio_assembleia_itens_tipo_opcoes;
ALTER TABLE public.condominio_assembleia_itens
    ADD CONSTRAINT condominio_assembleia_itens_tipo_opcoes CHECK (
        (tipo = 'ESCOLHA' AND quorum = 'MAIORIA_PRESENTES' AND public.fn_assembleia_opcoes_validas(opcoes))
     OR (tipo = 'APROVACAO' AND opcoes IS NULL));

-- ═══ BLOCO 3 — decisão 3: a trava, com a mensagem do SET NULL ═══════════════
SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public._assembleia_trava()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_marca  boolean := coalesce(current_setting('app.assembleia_transicao', true), '') = 'on';
    v_pai    uuid;
    v_status text;
    v_msg    text;
BEGIN
    -- ── a própria assembleia ────────────────────────────────────────────────
    IF TG_TABLE_NAME = 'condominio_assembleias' THEN
        IF TG_OP = 'INSERT' THEN
            IF NEW.status <> 'RASCUNHO' AND NOT v_marca THEN
                v_msg := 'A assembleia nasce como rascunho: convocar, instalar, encerrar e cancelar são ações próprias.';
            END IF;
        ELSIF TG_OP = 'DELETE' THEN
            IF OLD.status <> 'RASCUNHO' THEN
                v_msg := CASE OLD.status
                    WHEN 'ENCERRADA' THEN 'Esta assembleia já foi encerrada: nada mais muda, e ela não se exclui.'
                    WHEN 'CANCELADA' THEN 'Esta assembleia foi cancelada: nada mais muda, e ela não se exclui.'
                    ELSE 'Só rascunho se exclui. Assembleia convocada se cancela.' END;
            END IF;
        ELSE -- UPDATE
            IF NOT v_marca AND OLD.status <> 'RASCUNHO'
               -- Só aviso_id e/ou ata_documento_id mudaram, e para NULL: é o ON DELETE
               -- SET NULL de quem tentou excluir o aviso da convocação ou a ata.
               AND (to_jsonb(NEW) - 'aviso_id' - 'ata_documento_id' - 'updated_at')
                   = (to_jsonb(OLD) - 'aviso_id' - 'ata_documento_id' - 'updated_at')
               AND (NEW.aviso_id IS DISTINCT FROM OLD.aviso_id OR NEW.ata_documento_id IS DISTINCT FROM OLD.ata_documento_id)
               AND (NEW.aviso_id IS NULL OR NEW.aviso_id IS NOT DISTINCT FROM OLD.aviso_id)
               AND (NEW.ata_documento_id IS NULL OR NEW.ata_documento_id IS NOT DISTINCT FROM OLD.ata_documento_id) THEN
                v_msg := 'Este aviso ou documento pertence a uma assembleia convocada e não pode ser excluído.';
            ELSIF OLD.status = 'CANCELADA' THEN
                v_msg := 'Esta assembleia foi cancelada: nada mais muda.';
            ELSIF OLD.status = 'ENCERRADA' THEN
                -- Só a ata (gerar / gerar de novo), e só pela RPC.
                IF NOT v_marca
                   OR (to_jsonb(NEW) - 'ata_documento_id' - 'updated_at')
                      IS DISTINCT FROM (to_jsonb(OLD) - 'ata_documento_id' - 'updated_at') THEN
                    v_msg := 'Esta assembleia já foi encerrada: nada mais muda.';
                END IF;
            ELSIF NEW.status IS DISTINCT FROM OLD.status AND NOT v_marca THEN
                v_msg := 'O estado da assembleia só muda pelas ações Convocar, Instalar, Encerrar e Cancelar.';
            ELSIF OLD.status <> 'RASCUNHO' AND NOT v_marca THEN
                v_msg := 'Depois de convocada, a assembleia só muda pelas ações do sistema: '
                      || 'data, local e título fazem parte do edital.';
            END IF;
        END IF;

        IF v_msg IS NOT NULL THEN
            RAISE EXCEPTION '%', v_msg USING ERRCODE = '23514', HINT = 'assembleia_travada';
        END IF;
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW;
    END IF;

    -- ── itens, unidades, votos: dependem do estado da assembleia ─────────────
    IF TG_OP = 'UPDATE' AND NEW.assembleia_id IS DISTINCT FROM OLD.assembleia_id THEN
        RAISE EXCEPTION 'Item, unidade e voto não trocam de assembleia.'
            USING ERRCODE = '23514', HINT = 'assembleia_travada';
    END IF;

    IF TG_TABLE_NAME = 'condominio_assembleia_votos' AND TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Voto não se apaga: trocar o voto grava a nova escolha, e o histórico guarda todas.'
            USING ERRCODE = '23514', HINT = 'assembleia_travada';
    END IF;

    v_pai := CASE WHEN TG_OP = 'DELETE' THEN OLD.assembleia_id ELSE NEW.assembleia_id END;
    -- FOR SHARE: espera a transição em curso (a RPC trava a assembleia com FOR UPDATE)
    -- e lê o estado já confirmado — nada entra "por baixo" de um Convocar/Encerrar.
    SELECT a.status INTO v_status FROM public.condominio_assembleias a WHERE a.id = v_pai FOR SHARE;

    IF v_status IS NULL THEN
        -- DELETE em cascata da própria assembleia (que já passou pela trava dela).
        -- INSERT/UPDATE sem assembleia: a FK recusa.
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW;
    END IF;

    IF v_status = 'ENCERRADA' THEN
        v_msg := 'Esta assembleia já foi encerrada: nada mais muda.';
    ELSIF v_status = 'CANCELADA' THEN
        v_msg := 'Esta assembleia foi cancelada: nada mais muda.';
    ELSIF TG_TABLE_NAME = 'condominio_assembleia_itens' THEN
        IF v_status = 'CONVOCADA' THEN
            v_msg := 'Depois de convocada, a pauta não muda. Para mudar a pauta, cancele e convoque outra assembleia.';
        ELSIF v_status = 'INSTALADA'
              AND NOT (TG_OP = 'UPDATE' AND (to_jsonb(NEW) - 'deliberacao') = (to_jsonb(OLD) - 'deliberacao')) THEN
            v_msg := 'Com a assembleia instalada, só a deliberação de cada item pode ser escrita.';
        END IF;
    ELSE -- unidades e votos
        IF v_status NOT IN ('CONVOCADA', 'INSTALADA') THEN
            v_msg := 'Presença e votos só existem depois de convocar a assembleia.';
        END IF;
    END IF;

    IF v_msg IS NOT NULL THEN
        RAISE EXCEPTION '%', v_msg USING ERRCODE = '23514', HINT = 'assembleia_travada';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END;
$$;

-- ═══ BLOCO 4 — impedimento (R3) e apuração (R6/R8) ═══════════════════════════
SET lock_timeout = '5s';

-- Mesma regra de situacaoDaCota/tituloEstaPago (utils/situacaoDaCota.ts): cota com
-- título, rateio não cancelado, título não cancelado, não pago (CONCILIATED ou
-- RECEBIDO/PAGO = pago) e vencimento antes de HOJE EM BRASÍLIA.
CREATE OR REPLACE FUNCTION public.fn_assembleia_unidade_impedida(p_unit_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
    SELECT format('Cota de %s vencida em %s', to_char(r.competencia, 'MM/YYYY'), to_char(t.due_date, 'DD/MM/YYYY'))
      FROM public.condominio_rateio_itens it
      JOIN public.condominio_rateios r      ON r.id = it.rateio_id
      JOIN public.internal_transactions t   ON t.id = it.transaction_id
     WHERE it.unit_id = p_unit_id
       AND it.transaction_id IS NOT NULL
       AND r.status <> 'CANCELADO'
       AND t.status <> 'CANCELLED'
       AND NOT (t.status = 'CONCILIATED' OR coalesce(t.business_status, '') IN ('RECEBIDO', 'PAGO'))
       AND t.due_date < (now() AT TIME ZONE 'America/Sao_Paulo')::date
     ORDER BY t.due_date, r.competencia
     LIMIT 1
$$;

COMMENT ON FUNCTION public.fn_assembleia_unidade_impedida(uuid) IS
    'R3: NULL = unidade quite; senão o motivo da cota vencida e não paga mais antiga. Uso interno: '
    'quem confere impedimento chama fn_assembleia_impedimento (marca do gestor + esta regra).';

-- A10: a marca do gestor. Só pelo núcleo (_assembleia_marcar_impedida) — o app tem
-- apenas SELECT nesta tabela (A1), e a trava da A1 só aceita a escrita em
-- CONVOCADA/INSTALADA.
ALTER TABLE public.condominio_assembleia_unidades
    ADD COLUMN IF NOT EXISTS impedimento_manual    text,
    ADD COLUMN IF NOT EXISTS impedimento_manual_em timestamptz;
ALTER TABLE public.condominio_assembleia_unidades
    DROP CONSTRAINT IF EXISTS condominio_assembleia_unidades_impedimento_manual;
ALTER TABLE public.condominio_assembleia_unidades
    ADD CONSTRAINT condominio_assembleia_unidades_impedimento_manual CHECK (
        (impedimento_manual IS NULL AND impedimento_manual_em IS NULL)
     OR (btrim(impedimento_manual) <> '' AND impedimento_manual_em IS NOT NULL));

COMMENT ON COLUMN public.condominio_assembleia_unidades.impedimento_manual IS
    'A10: motivo do impedimento marcado à mão pelo gestor/síndico (NULL = sem marca). Vale sobre a regra '
    'automática (fn_assembleia_impedimento). Autoria: evento IMPEDIMENTO_MANUAL.';

-- A10: o impedimento da unidade NESTA assembleia — a marca do gestor, senão a regra
-- automática (R3). NULL = apta. É a única porta: nenhuma checagem chama só a automática.
CREATE OR REPLACE FUNCTION public.fn_assembleia_impedimento(p_assembleia uuid, p_unit uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
    SELECT coalesce(
        (SELECT u.impedimento_manual FROM public.condominio_assembleia_unidades u
          WHERE u.assembleia_id = p_assembleia AND u.unit_id = p_unit),
        public.fn_assembleia_unidade_impedida(p_unit))
$$;

COMMENT ON FUNCTION public.fn_assembleia_impedimento(uuid, uuid) IS
    'A10/R3: coalesce(impedimento_manual, fn_assembleia_unidade_impedida). NULL = apta. Uso interno (núcleo).';

-- A10: o condomínio tem cota COBRADA pelo app? (título em rateio não cancelado). Sem
-- isso, a regra automática não confere nada e a tela avisa o gestor.
CREATE OR REPLACE FUNCTION public.fn_assembleia_cotas_conferidas(p_empreendimento uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM public.condominio_rateio_itens it
          JOIN public.condominio_rateios r ON r.id = it.rateio_id
         WHERE r.empreendimento_id = p_empreendimento
           AND r.status <> 'CANCELADO'
           AND it.transaction_id IS NOT NULL)
$$;

COMMENT ON FUNCTION public.fn_assembleia_cotas_conferidas(uuid) IS
    'A10: true se há ao menos um título de cota (transaction_id) em rateio não cancelado do condomínio. Uso interno.';

-- { total, presentesFracao, presentesUnidades,
--   itens: [{ itemId, ordem, titulo, tipo, quorum,
--             porOpcao: { <opcao>: { fracao, unidades } }, resultado, vencedora }] }
-- Presente = presença registrada ou voto pelo portal. total = soma das frações de
-- TODAS as unidades da assembleia (inclusive impedidas e ausentes — R8).
CREATE OR REPLACE FUNCTION public.fn_assembleia_apurar(p_assembleia uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_total     numeric;
    v_unidades  integer;
    v_pres_fr   numeric;
    v_pres_n    integer;
    r           record;
    v_op        text;
    v_fr        numeric;
    v_n         integer;
    v_por       jsonb;
    v_itens     jsonb := '[]'::jsonb;
    v_sim       numeric;
    v_nao       numeric;
    v_sim_n     integer;
    v_nao_n     integer;
    v_max       numeric;
    v_empate    boolean;
    v_venc      text;
    v_res       text;
BEGIN
    SELECT coalesce(sum(u.fracao), 0), count(*) INTO v_total, v_unidades
      FROM public.condominio_assembleia_unidades u
     WHERE u.assembleia_id = p_assembleia;

    SELECT coalesce(sum(u.fracao), 0), count(*) INTO v_pres_fr, v_pres_n
      FROM public.condominio_assembleia_unidades u
     WHERE u.assembleia_id = p_assembleia
       AND (u.presenca IS NOT NULL
            OR EXISTS (SELECT 1 FROM public.condominio_assembleia_votos v
                        WHERE v.assembleia_id = p_assembleia AND v.unit_id = u.unit_id AND v.origem = 'PORTAL'));

    FOR r IN
        SELECT i.id, i.ordem, i.titulo, i.tipo, i.quorum,
               CASE WHEN i.tipo = 'APROVACAO' THEN ARRAY['SIM', 'NAO', 'ABSTENCAO']
                    ELSE i.opcoes || 'ABSTENCAO'::text END AS validas
          FROM public.condominio_assembleia_itens i
         WHERE i.assembleia_id = p_assembleia
         ORDER BY i.ordem
    LOOP
        v_por := '{}'::jsonb; v_max := NULL; v_empate := false; v_venc := NULL;
        v_sim := 0; v_nao := 0; v_sim_n := 0; v_nao_n := 0;

        FOREACH v_op IN ARRAY r.validas LOOP
            SELECT coalesce(sum(u.fracao), 0), count(*) INTO v_fr, v_n
              FROM public.condominio_assembleia_votos v
              JOIN public.condominio_assembleia_unidades u
                ON u.assembleia_id = v.assembleia_id AND u.unit_id = v.unit_id
             WHERE v.item_id = r.id AND v.opcao = v_op;
            v_por := v_por || jsonb_build_object(v_op, jsonb_build_object('fracao', v_fr, 'unidades', v_n));

            IF r.tipo = 'APROVACAO' THEN
                IF v_op = 'SIM' THEN v_sim := v_fr; v_sim_n := v_n; END IF;
                IF v_op = 'NAO' THEN v_nao := v_fr; v_nao_n := v_n; END IF;
            ELSIF v_op <> 'ABSTENCAO' THEN
                IF v_max IS NULL OR v_fr > v_max THEN
                    v_max := v_fr; v_venc := v_op; v_empate := false;
                ELSIF v_fr = v_max THEN
                    v_empate := true;
                END IF;
            END IF;
        END LOOP;

        IF r.tipo = 'ESCOLHA' THEN
            -- Opção de maior fração, única → vence; empate ou nenhum voto → sem decisão.
            IF v_max > 0 AND NOT v_empate THEN
                v_res := 'APROVADO';
            ELSE
                v_res := 'SEM_DECISAO'; v_venc := NULL;
            END IF;
        ELSE
            v_venc := NULL;
            v_res := CASE r.quorum
                WHEN 'MAIORIA_PRESENTES' THEN
                    CASE WHEN v_sim = 0 AND v_nao = 0 THEN 'SEM_DECISAO'
                         WHEN v_sim > v_nao          THEN 'APROVADO'
                         ELSE 'REJEITADO' END
                WHEN 'MAIORIA_ABSOLUTA' THEN
                    CASE WHEN 2 * v_sim > v_total  THEN 'APROVADO'
                         WHEN 2 * v_nao >= v_total THEN 'REJEITADO'
                         ELSE 'QUORUM_NAO_ATINGIDO' END
                WHEN 'DOIS_TERCOS' THEN
                    CASE WHEN 3 * v_sim >= 2 * v_total THEN 'APROVADO'
                         WHEN 3 * v_nao > v_total      THEN 'REJEITADO'
                         ELSE 'QUORUM_NAO_ATINGIDO' END
                WHEN 'UNANIMIDADE' THEN
                    CASE WHEN v_unidades > 0 AND v_sim_n = v_unidades THEN 'APROVADO'
                         WHEN v_nao_n > 0 THEN 'REJEITADO'
                         ELSE 'QUORUM_NAO_ATINGIDO' END
            END;
        END IF;

        v_itens := v_itens || jsonb_build_array(jsonb_build_object(
            'itemId', r.id, 'ordem', r.ordem, 'titulo', r.titulo, 'tipo', r.tipo, 'quorum', r.quorum,
            'porOpcao', v_por, 'resultado', v_res, 'vencedora', v_venc));
    END LOOP;

    RETURN jsonb_build_object('total', v_total, 'presentesFracao', v_pres_fr,
                              'presentesUnidades', v_pres_n, 'itens', v_itens);
END;
$$;

COMMENT ON FUNCTION public.fn_assembleia_apurar(uuid) IS
    'R6/R8: apuração ao vivo (e do retrato). Comparações em numeric exato. Uso interno; '
    'o app lê pelo invólucro condominio_assembleia_apuracao.';

-- ═══ BLOCO 5 — auxiliares do núcleo ══════════════════════════════════════════
SET lock_timeout = '5s';

-- Trava a assembleia (FOR UPDATE) — sempre o PRIMEIRO passo de uma transição.
CREATE OR REPLACE FUNCTION public._assembleia_travar(p_assembleia uuid)
 RETURNS public.condominio_assembleias
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v public.condominio_assembleias;
BEGIN
    SELECT * INTO v FROM public.condominio_assembleias WHERE id = p_assembleia FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Assembleia não encontrada.' USING ERRCODE = 'P0002', HINT = 'nao_encontrada';
    END IF;
    RETURN v;
END;
$$;

-- Quem conduz (gestor pelo app, síndico na fase B). O voto do condômino (A3) não passa aqui.
CREATE OR REPLACE FUNCTION public._assembleia_exige_condutor(p_papel text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    IF p_papel IS NULL OR p_papel NOT IN ('GESTOR', 'SINDICO') THEN
        RAISE EXCEPTION 'Papel inválido para conduzir a assembleia.' USING ERRCODE = 'P0001', HINT = 'papel_invalido';
    END IF;
END;
$$;

-- Estado errado → 'P0001' / HINT 'estado', com a frase do estado em que ela está.
CREATE OR REPLACE FUNCTION public._assembleia_exige_estado(p_status text, p_permitidos text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    IF p_status = ANY (p_permitidos) THEN
        RETURN;
    END IF;
    RAISE EXCEPTION '%', CASE p_status
            WHEN 'RASCUNHO'  THEN 'Esta assembleia ainda é rascunho: convoque antes.'
            WHEN 'CONVOCADA' THEN 'Esta assembleia já foi convocada e ainda não foi instalada.'
            WHEN 'INSTALADA' THEN 'Esta assembleia já foi instalada.'
            WHEN 'ENCERRADA' THEN 'Esta assembleia já foi encerrada.'
            WHEN 'CANCELADA' THEN 'Esta assembleia foi cancelada.'
            ELSE 'Estado da assembleia inválido para esta ação.' END
        USING ERRCODE = 'P0001', HINT = 'estado';
END;
$$;

-- ═══ BLOCO 6 — núcleo (sem EXECUTE para a API) ═══════════════════════════════
SET lock_timeout = '5s';

-- R1/R4. Ordem por causa da trava: o status vira CONVOCADA ANTES de as unidades entrarem.
CREATE OR REPLACE FUNCTION public._assembleia_convocar(p_assembleia uuid, p_corpo_aviso text, p_ator uuid, p_papel text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_a      public.condominio_assembleias;
    v_marca  text := current_setting('app.assembleia_transicao', true);
    v_agora  timestamptz := now();
    v_aviso  uuid;
    v_n      integer;
    v_fora   jsonb;
BEGIN
    v_a := public._assembleia_travar(p_assembleia);
    PERFORM public._assembleia_exige_condutor(p_papel);
    PERFORM public._assembleia_exige_estado(v_a.status, ARRAY['RASCUNHO']);

    IF v_a.primeira_convocacao_em IS NULL OR v_a.segunda_convocacao_em IS NULL THEN
        RAISE EXCEPTION 'Informe a data e a hora da 1ª e da 2ª convocação antes de convocar.'
            USING ERRCODE = 'P0001', HINT = 'sem_datas';
    END IF;
    IF v_a.primeira_convocacao_em <= v_agora THEN
        RAISE EXCEPTION 'A 1ª convocação tem de ser no futuro.'
            USING ERRCODE = 'P0001', HINT = 'primeira_no_passado';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.condominio_assembleia_itens i WHERE i.assembleia_id = p_assembleia) THEN
        RAISE EXCEPTION 'A pauta precisa de pelo menos 1 item para convocar.'
            USING ERRCODE = 'P0001', HINT = 'sem_itens';
    END IF;
    IF nullif(btrim(coalesce(p_corpo_aviso, '')), '') IS NULL THEN
        RAISE EXCEPTION 'O texto do aviso de convocação é obrigatório.'
            USING ERRCODE = 'P0001', HINT = 'sem_corpo';
    END IF;

    -- Unidades sem fração ideal ficam fora (R1).
    SELECT jsonb_agg(t.name || ' — ' || u.name ORDER BY t.sort_order, t.name, u.sort_order, u.name)
      INTO v_fora
      FROM public.empreendimento_units u
      JOIN public.empreendimento_towers t ON t.id = u.tower_id
     WHERE t.empreendimento_id = v_a.empreendimento_id
       AND (u.fracao_ideal_decimal IS NULL OR u.fracao_ideal_decimal <= 0);
    IF NOT EXISTS (SELECT 1 FROM public.empreendimento_units u
                     JOIN public.empreendimento_towers t ON t.id = u.tower_id
                    WHERE t.empreendimento_id = v_a.empreendimento_id AND u.fracao_ideal_decimal > 0) THEN
        RAISE EXCEPTION 'Nenhuma unidade deste condomínio tem fração ideal: preencha as frações antes de convocar.'
            USING ERRCODE = 'P0001', HINT = 'sem_unidades';
    END IF;

    -- Aviso no mural. valido_ate = o DIA da 2ª convocação em Brasília (19h não vira 22h
    -- nem o dia seguinte por causa do UTC).
    INSERT INTO public.condominio_avisos
        (empreendimento_id, organization_id, titulo, corpo, categoria, valido_ate, publicado_em, publicado_por)
    VALUES
        (v_a.empreendimento_id, v_a.organization_id, 'Convocação: ' || v_a.titulo, btrim(p_corpo_aviso),
         'ASSEMBLEIA', (v_a.segunda_convocacao_em AT TIME ZONE 'America/Sao_Paulo')::date, v_agora,
         CASE WHEN p_papel = 'SINDICO' THEN 'Síndico' END)
    RETURNING id INTO v_aviso;

    PERFORM set_config('app.assembleia_transicao', 'on', true);
    UPDATE public.condominio_assembleias
       SET status = 'CONVOCADA', convocada_em = v_agora, aviso_id = v_aviso
     WHERE id = p_assembleia;

    -- Lista e fração CONGELADAS agora (R1); proprietários = PROPRIETARIO vigentes (R2).
    INSERT INTO public.condominio_assembleia_unidades
        (assembleia_id, unit_id, fracao, unidade_rotulo, proprietario_nome)
    SELECT p_assembleia, u.id, u.fracao_ideal_decimal, t.name || ' — ' || u.name,
           (SELECT string_agg(DISTINCT c.name, ', ' ORDER BY c.name)
              FROM public.unit_occupancies o
              JOIN public.clients c ON c.id = o.client_id
             WHERE o.unit_id = u.id AND o.role = 'PROPRIETARIO' AND o.ended_at IS NULL)
      FROM public.empreendimento_units u
      JOIN public.empreendimento_towers t ON t.id = u.tower_id
     WHERE t.empreendimento_id = v_a.empreendimento_id
       AND u.fracao_ideal_decimal > 0;
    GET DIAGNOSTICS v_n = ROW_COUNT;

    INSERT INTO public.condominio_assembleia_eventos (assembleia_id, evento, ator, papel, detalhe)
    VALUES (p_assembleia, 'CONVOCADA', p_ator, p_papel,
            jsonb_build_object('avisoId', v_aviso, 'unidades', v_n, 'fora', coalesce(v_fora, '[]'::jsonb)));

    PERFORM set_config('app.assembleia_transicao', coalesce(v_marca, ''), true);
    RETURN jsonb_build_object('unidades', v_n, 'fora', coalesce(v_fora, '[]'::jsonb), 'avisoId', v_aviso);
END;
$$;

-- R10: só CONVOCADA se cancela; publica 'Cancelada: …' no mural.
CREATE OR REPLACE FUNCTION public._assembleia_cancelar(p_assembleia uuid, p_motivo text, p_corpo_aviso text,
                                                       p_ator uuid, p_papel text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_a      public.condominio_assembleias;
    v_marca  text := current_setting('app.assembleia_transicao', true);
    v_agora  timestamptz := now();
    v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
    v_aviso  uuid;
BEGIN
    v_a := public._assembleia_travar(p_assembleia);
    PERFORM public._assembleia_exige_condutor(p_papel);
    PERFORM public._assembleia_exige_estado(v_a.status, ARRAY['CONVOCADA']);
    IF v_motivo IS NULL THEN
        RAISE EXCEPTION 'Informe o motivo do cancelamento.' USING ERRCODE = 'P0001', HINT = 'sem_motivo';
    END IF;

    INSERT INTO public.condominio_avisos
        (empreendimento_id, organization_id, titulo, corpo, categoria, valido_ate, publicado_em, publicado_por)
    VALUES
        (v_a.empreendimento_id, v_a.organization_id, 'Cancelada: ' || v_a.titulo,
         coalesce(nullif(btrim(coalesce(p_corpo_aviso, '')), ''), 'Assembleia cancelada. Motivo: ' || v_motivo),
         'ASSEMBLEIA',
         greatest((v_agora AT TIME ZONE 'America/Sao_Paulo')::date,
                  (v_a.segunda_convocacao_em AT TIME ZONE 'America/Sao_Paulo')::date),
         v_agora, CASE WHEN p_papel = 'SINDICO' THEN 'Síndico' END)
    RETURNING id INTO v_aviso;

    PERFORM set_config('app.assembleia_transicao', 'on', true);
    UPDATE public.condominio_assembleias
       SET status = 'CANCELADA', cancelada_em = v_agora, motivo_cancelamento = v_motivo
     WHERE id = p_assembleia;

    INSERT INTO public.condominio_assembleia_eventos (assembleia_id, evento, ator, papel, detalhe)
    VALUES (p_assembleia, 'CANCELADA', p_ator, p_papel, jsonb_build_object('motivo', v_motivo, 'avisoId', v_aviso));

    PERFORM set_config('app.assembleia_transicao', coalesce(v_marca, ''), true);
    RETURN jsonb_build_object('status', 'CANCELADA', 'avisoId', v_aviso);
END;
$$;

-- R3/R7: presença na sala ou por procurador; NULL remove. Impedida não registra.
CREATE OR REPLACE FUNCTION public._assembleia_registrar_presenca(p_assembleia uuid, p_unit uuid, p_presenca text,
                                                                 p_procurador text, p_procuracao uuid,
                                                                 p_ator uuid, p_papel text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_a          public.condominio_assembleias;
    v_u          public.condominio_assembleia_unidades;
    v_motivo     text;
    v_procurador text := nullif(btrim(coalesce(p_procurador, '')), '');
BEGIN
    v_a := public._assembleia_travar(p_assembleia);
    PERFORM public._assembleia_exige_condutor(p_papel);
    PERFORM public._assembleia_exige_estado(v_a.status, ARRAY['CONVOCADA', 'INSTALADA']);

    SELECT * INTO v_u FROM public.condominio_assembleia_unidades
     WHERE assembleia_id = p_assembleia AND unit_id = p_unit;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Esta unidade não participa da assembleia.' USING ERRCODE = 'P0001', HINT = 'unidade_fora';
    END IF;

    IF p_presenca IS NULL THEN
        -- Voto presencial não se apaga (trava da A1) e conta na apuração: a unidade que
        -- votou na sala não pode sumir da presença (nem da ata) depois disso.
        IF EXISTS (SELECT 1 FROM public.condominio_assembleia_votos v
                    WHERE v.assembleia_id = p_assembleia AND v.unit_id = p_unit AND v.origem = 'PRESENCIAL') THEN
            RAISE EXCEPTION 'A unidade % já tem voto lançado na sala: a presença dela não pode ser removida.',
                    coalesce(v_u.unidade_rotulo, '')
                USING ERRCODE = 'P0001', HINT = 'tem_voto_presencial';
        END IF;
        UPDATE public.condominio_assembleia_unidades
           SET presenca = NULL, procurador_nome = NULL, procuracao_documento_id = NULL, presenca_em = NULL
         WHERE id = v_u.id;
        v_procurador := NULL;
    ELSE
        IF p_presenca NOT IN ('PRESENCIAL', 'PROCURADOR') THEN
            RAISE EXCEPTION 'Presença é na sala (PRESENCIAL) ou por procurador (PROCURADOR).'
                USING ERRCODE = 'P0001', HINT = 'presenca_invalida';
        END IF;
        v_motivo := public.fn_assembleia_impedimento(p_assembleia, p_unit);
        IF v_motivo IS NOT NULL THEN
            RAISE EXCEPTION 'A unidade % está impedida: %.', coalesce(v_u.unidade_rotulo, ''), v_motivo
                USING ERRCODE = 'P0001', HINT = 'unidade_impedida', DETAIL = v_motivo;
        END IF;
        IF p_presenca = 'PROCURADOR' THEN
            IF v_procurador IS NULL OR p_procuracao IS NULL
               OR NOT EXISTS (SELECT 1 FROM public.condominio_documentos d
                               WHERE d.id = p_procuracao AND d.empreendimento_id = v_a.empreendimento_id) THEN
                RAISE EXCEPTION 'Presença por procurador exige o nome do procurador e a procuração, anexada aos documentos deste condomínio.'
                    USING ERRCODE = 'P0001', HINT = 'procuracao_invalida';
            END IF;
        ELSE
            v_procurador := NULL;
        END IF;
        UPDATE public.condominio_assembleia_unidades
           SET presenca = p_presenca,
               procurador_nome = v_procurador,
               procuracao_documento_id = CASE WHEN p_presenca = 'PROCURADOR' THEN p_procuracao END,
               presenca_em = now()
         WHERE id = v_u.id;
    END IF;

    INSERT INTO public.condominio_assembleia_eventos (assembleia_id, evento, ator, papel, unit_id, detalhe)
    VALUES (p_assembleia, 'PRESENCA', p_ator, p_papel, p_unit,
            jsonb_build_object('presenca', p_presenca, 'procurador', v_procurador,
                               'procuracaoDocumentoId', CASE WHEN p_presenca = 'PROCURADOR' THEN p_procuracao END));

    RETURN jsonb_build_object('unitId', p_unit, 'presenca', p_presenca, 'procurador', v_procurador,
                              'procuracaoDocumentoId', CASE WHEN p_presenca = 'PROCURADOR' THEN p_procuracao END);
END;
$$;

-- R4/R6: instalar. O quórum e as impedidas ficam GRAVADOS agora e não se refazem.
CREATE OR REPLACE FUNCTION public._assembleia_instalar(p_assembleia uuid, p_convocacao smallint, p_presidente text,
                                                       p_secretario text, p_edital_entregue boolean,
                                                       p_ator uuid, p_papel text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_a          public.condominio_assembleias;
    v_marca      text := current_setting('app.assembleia_transicao', true);
    v_agora      timestamptz := now();
    v_presidente text := nullif(btrim(coalesce(p_presidente, '')), '');
    v_secretario text := nullif(btrim(coalesce(p_secretario, '')), '');
    v_total      numeric;
    v_pres_fr    numeric;
    v_pres_n     integer;
    v_impedidas  jsonb;
    v_quorum     jsonb;
BEGIN
    v_a := public._assembleia_travar(p_assembleia);
    PERFORM public._assembleia_exige_condutor(p_papel);
    PERFORM public._assembleia_exige_estado(v_a.status, ARRAY['CONVOCADA']);

    IF p_convocacao IS NULL OR p_convocacao NOT IN (1, 2) THEN
        RAISE EXCEPTION 'Escolha a convocação: 1ª ou 2ª.' USING ERRCODE = 'P0001', HINT = 'convocacao_invalida';
    END IF;
    IF p_edital_entregue IS NOT TRUE THEN
        RAISE EXCEPTION 'Confirme que o edital foi entregue a todas as unidades.'
            USING ERRCODE = 'P0001', HINT = 'edital_nao_confirmado';
    END IF;
    IF v_presidente IS NULL OR v_secretario IS NULL THEN
        RAISE EXCEPTION 'Informe o presidente e o secretário da mesa.' USING ERRCODE = 'P0001', HINT = 'sem_mesa';
    END IF;

    -- Presente = presença registrada ou voto pelo portal, e NÃO impedida neste instante
    -- (marca do gestor ou regra automática — fn_assembleia_impedimento, A10).
    WITH s AS (
        SELECT u.unit_id, u.fracao, u.unidade_rotulo,
               public.fn_assembleia_impedimento(p_assembleia, u.unit_id) AS motivo,
               CASE WHEN u.impedimento_manual IS NOT NULL THEN 'MANUAL' ELSE 'AUTOMATICA' END AS origem,
               (u.presenca IS NOT NULL
                OR EXISTS (SELECT 1 FROM public.condominio_assembleia_votos v
                            WHERE v.assembleia_id = p_assembleia AND v.unit_id = u.unit_id AND v.origem = 'PORTAL')) AS presente
          FROM public.condominio_assembleia_unidades u
         WHERE u.assembleia_id = p_assembleia
    )
    SELECT coalesce(sum(fracao), 0),
           coalesce(sum(fracao) FILTER (WHERE presente AND motivo IS NULL), 0),
           count(*) FILTER (WHERE presente AND motivo IS NULL),
           coalesce(jsonb_agg(jsonb_build_object('unitId', unit_id, 'rotulo', unidade_rotulo, 'motivo', motivo,
                                                 'origem', origem)
                              ORDER BY unidade_rotulo) FILTER (WHERE motivo IS NOT NULL), '[]'::jsonb)
      INTO v_total, v_pres_fr, v_pres_n, v_impedidas
      FROM s;

    IF p_convocacao = 1 THEN
        IF v_agora < v_a.primeira_convocacao_em THEN
            RAISE EXCEPTION 'A 1ª convocação está marcada para % (horário de Brasília).',
                    to_char(v_a.primeira_convocacao_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI')
                USING ERRCODE = 'P0001', HINT = 'antes_do_horario';
        END IF;
        IF 2 * v_pres_fr < v_total THEN
            RAISE EXCEPTION '%', format(
                    'Na 1ª convocação, os presentes têm de somar metade das frações ideais (há %s%% presentes). '
                    || 'Instale em 2ª convocação, no horário dela.',
                    replace(round(CASE WHEN v_total > 0 THEN 100 * v_pres_fr / v_total ELSE 0 END, 2)::text, '.', ','))
                USING ERRCODE = 'P0001', HINT = 'sem_quorum_primeira';
        END IF;
    ELSIF v_agora < v_a.segunda_convocacao_em THEN
        RAISE EXCEPTION 'A 2ª convocação está marcada para % (horário de Brasília).',
                to_char(v_a.segunda_convocacao_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI')
            USING ERRCODE = 'P0001', HINT = 'antes_do_horario';
    END IF;

    -- cotasConferidas (A10): false = a regra automática não tinha o que conferir (nenhuma
    -- cota cobrada pelo app) e as impedidas são as que o gestor indicou — a ata diz isso.
    v_quorum := jsonb_build_object('convocacao', p_convocacao, 'total', v_total,
                                   'presentesFracao', v_pres_fr, 'presentesUnidades', v_pres_n,
                                   'impedidas', v_impedidas, 'em', v_agora,
                                   'cotasConferidas', public.fn_assembleia_cotas_conferidas(v_a.empreendimento_id));

    -- O MESMO conjunto gravado em quorum_instalacao.impedidas (sem recalcular).
    UPDATE public.condominio_assembleia_unidades u
       SET impedida_na_instalacao = EXISTS (SELECT 1 FROM jsonb_array_elements(v_impedidas) x
                                             WHERE x ->> 'unitId' = u.unit_id::text)
     WHERE u.assembleia_id = p_assembleia;

    PERFORM set_config('app.assembleia_transicao', 'on', true);
    UPDATE public.condominio_assembleias
       SET status = 'INSTALADA', instalada_em = v_agora, instalada_convocacao = p_convocacao,
           quorum_instalacao = v_quorum, presidente_nome = v_presidente, secretario_nome = v_secretario,
           edital_entregue_em = v_agora
     WHERE id = p_assembleia;

    INSERT INTO public.condominio_assembleia_eventos (assembleia_id, evento, ator, papel, detalhe)
    VALUES (p_assembleia, 'INSTALADA', p_ator, p_papel, v_quorum || jsonb_build_object('editalEntregue', true));

    PERFORM set_config('app.assembleia_transicao', coalesce(v_marca, ''), true);
    RETURN v_quorum;
END;
$$;

-- R3/R7: voto presencial lançado pelo gestor. Vale o último (substitui o do portal).
CREATE OR REPLACE FUNCTION public._assembleia_lancar_voto(p_item uuid, p_unit uuid, p_opcao text,
                                                          p_ator uuid, p_papel text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_aid      uuid;
    v_a        public.condominio_assembleias;
    v_i        public.condominio_assembleia_itens;
    v_u        public.condominio_assembleia_unidades;
    v_motivo   text;
    v_anterior jsonb;
    v_voto     uuid;
BEGIN
    SELECT i.assembleia_id INTO v_aid FROM public.condominio_assembleia_itens i WHERE i.id = p_item;
    IF v_aid IS NULL THEN
        RAISE EXCEPTION 'Item da pauta não encontrado.' USING ERRCODE = 'P0002', HINT = 'nao_encontrada';
    END IF;
    v_a := public._assembleia_travar(v_aid);
    PERFORM public._assembleia_exige_condutor(p_papel);
    PERFORM public._assembleia_exige_estado(v_a.status, ARRAY['INSTALADA']);
    SELECT * INTO v_i FROM public.condominio_assembleia_itens WHERE id = p_item;

    SELECT * INTO v_u FROM public.condominio_assembleia_unidades
     WHERE assembleia_id = v_aid AND unit_id = p_unit;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Esta unidade não participa da assembleia.' USING ERRCODE = 'P0001', HINT = 'unidade_fora';
    END IF;
    v_motivo := public.fn_assembleia_impedimento(v_aid, p_unit);
    IF v_motivo IS NOT NULL THEN
        RAISE EXCEPTION 'A unidade % está impedida: %.', coalesce(v_u.unidade_rotulo, ''), v_motivo
            USING ERRCODE = 'P0001', HINT = 'unidade_impedida', DETAIL = v_motivo;
    END IF;
    IF v_u.presenca IS NULL THEN
        RAISE EXCEPTION 'Registre a presença da unidade antes de lançar o voto presencial.'
            USING ERRCODE = 'P0001', HINT = 'sem_presenca';
    END IF;
    IF p_opcao IS NULL OR NOT (p_opcao = ANY (
           CASE WHEN v_i.tipo = 'APROVACAO' THEN ARRAY['SIM', 'NAO', 'ABSTENCAO']
                ELSE v_i.opcoes || 'ABSTENCAO'::text END)) THEN
        RAISE EXCEPTION 'Opção de voto inválida para este item.' USING ERRCODE = 'P0001', HINT = 'opcao_invalida';
    END IF;

    SELECT jsonb_build_object('opcao', v.opcao, 'origem', v.origem, 'votadoEm', v.votado_em,
                              'clientId', v.client_id, 'lancadoPor', v.lancado_por)
      INTO v_anterior
      FROM public.condominio_assembleia_votos v
     WHERE v.item_id = p_item AND v.unit_id = p_unit;

    INSERT INTO public.condominio_assembleia_votos
        (assembleia_id, item_id, unit_id, opcao, origem, client_id, lancado_por, votado_em)
    VALUES (v_aid, p_item, p_unit, p_opcao, 'PRESENCIAL', NULL, p_ator, now())
    ON CONFLICT (item_id, unit_id) DO UPDATE
       SET opcao = EXCLUDED.opcao, origem = 'PRESENCIAL', client_id = NULL,
           lancado_por = EXCLUDED.lancado_por, votado_em = EXCLUDED.votado_em
    RETURNING id INTO v_voto;

    INSERT INTO public.condominio_assembleia_eventos (assembleia_id, evento, ator, papel, unit_id, detalhe)
    VALUES (v_aid, 'VOTO_LANCADO', p_ator, p_papel, p_unit,
            jsonb_build_object('itemId', p_item, 'opcao', p_opcao, 'anterior', v_anterior));

    RETURN jsonb_build_object('votoId', v_voto, 'itemId', p_item, 'unitId', p_unit, 'opcao', p_opcao,
                              'origem', 'PRESENCIAL', 'anterior', v_anterior);
END;
$$;

-- R9: encerrar. Deliberações gravadas com o status AINDA INSTALADA (a trava só aceita
-- deliberação nesse estado); depois o retrato; por último o status ENCERRADA.
CREATE OR REPLACE FUNCTION public._assembleia_encerrar(p_assembleia uuid, p_deliberacoes jsonb, p_observacao text,
                                                       p_ator uuid, p_papel text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_a       public.condominio_assembleias;
    v_marca   text := current_setting('app.assembleia_transicao', true);
    v_agora   timestamptz := now();
    v_obs     text := nullif(btrim(coalesce(p_observacao, '')), '');
    v_retrato jsonb;
    v_instalou jsonb;
BEGIN
    v_a := public._assembleia_travar(p_assembleia);
    PERFORM public._assembleia_exige_condutor(p_papel);
    PERFORM public._assembleia_exige_estado(v_a.status, ARRAY['INSTALADA']);

    IF p_deliberacoes IS NOT NULL AND jsonb_typeof(p_deliberacoes) <> 'null' THEN
        IF jsonb_typeof(p_deliberacoes) <> 'object'
           OR EXISTS (SELECT 1 FROM jsonb_each(p_deliberacoes) x WHERE jsonb_typeof(x.value) NOT IN ('string', 'null')) THEN
            RAISE EXCEPTION 'As deliberações vêm como { id do item: texto }.'
                USING ERRCODE = 'P0001', HINT = 'deliberacoes_invalidas';
        END IF;
        IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_deliberacoes) k
                    WHERE NOT EXISTS (SELECT 1 FROM public.condominio_assembleia_itens i
                                       WHERE i.assembleia_id = p_assembleia AND i.id::text = k)) THEN
            RAISE EXCEPTION 'Há deliberação para um item que não é desta assembleia.'
                USING ERRCODE = 'P0001', HINT = 'item_fora';
        END IF;
        UPDATE public.condominio_assembleia_itens i
           SET deliberacao = nullif(btrim(coalesce(p_deliberacoes ->> i.id::text, '')), '')
         WHERE i.assembleia_id = p_assembleia
           AND p_deliberacoes ? i.id::text;
    END IF;

    SELECT jsonb_build_object(
               'id', ev.ator, 'papel', ev.papel, 'em', ev.em,
               'nome', CASE ev.papel
                           WHEN 'SINDICO' THEN (SELECT c.name FROM public.clients c WHERE c.id = ev.ator)
                           ELSE (SELECT p.name FROM public.profiles p WHERE p.id = ev.ator) END)
      INTO v_instalou
      FROM public.condominio_assembleia_eventos ev
     WHERE ev.assembleia_id = p_assembleia AND ev.evento = 'INSTALADA'
     ORDER BY ev.em DESC
     LIMIT 1;

    v_retrato := public.fn_assembleia_apurar(p_assembleia) || jsonb_build_object(
        'cabecalho', jsonb_build_object(
            'assembleiaId', v_a.id,
            'empreendimentoId', v_a.empreendimento_id,
            -- O MESMO nome do edital (razão social, senão o nome — AssembleiaDetalheView):
            -- congelado aqui, a ata sai com ele mesmo que o cadastro mude depois.
            'condominio', (SELECT coalesce(nullif(btrim(e.condominio_razao_social), ''), e.name)
                             FROM public.empreendimentos e WHERE e.id = v_a.empreendimento_id),
            'condominioCnpj', (SELECT e.condominio_cnpj FROM public.empreendimentos e WHERE e.id = v_a.empreendimento_id),
            'tipo', v_a.tipo,
            'titulo', v_a.titulo,
            'local', v_a.local,
            'linkTransmissao', v_a.link_transmissao,
            'primeiraConvocacaoEm', v_a.primeira_convocacao_em,
            'segundaConvocacaoEm', v_a.segunda_convocacao_em,
            'convocadaEm', v_a.convocada_em,
            'editalEntregueEm', v_a.edital_entregue_em,
            'instaladaEm', v_a.instalada_em,
            'convocacao', v_a.instalada_convocacao,
            'presidente', v_a.presidente_nome,
            'secretario', v_a.secretario_nome,
            -- Autoria da instalação e da confirmação do edital (as duas acontecem em
            -- Instalar): o evento INSTALADA, com o nome de quem agiu — gestor em
            -- profiles, síndico (fase B) em clients.
            'instaladaPor', v_instalou,
            'editalConfirmadoPor', CASE WHEN v_instalou IS NULL THEN NULL
                                        ELSE v_instalou || jsonb_build_object('em', v_a.edital_entregue_em) END,
            'quorumInstalacao', v_a.quorum_instalacao,
            'observacaoGeral', v_obs,
            'encerradaEm', v_agora,
            'encerradaPor', p_ator,
            'encerradaPorPapel', p_papel),
        'deliberacoes', (SELECT coalesce(jsonb_object_agg(i.id::text, i.deliberacao)
                                           FILTER (WHERE i.deliberacao IS NOT NULL), '{}'::jsonb)
                           FROM public.condominio_assembleia_itens i WHERE i.assembleia_id = p_assembleia),
        'unidades', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                                'unitId', u.unit_id, 'rotulo', u.unidade_rotulo, 'proprietario', u.proprietario_nome,
                                'fracao', u.fracao, 'presenca', u.presenca, 'procurador', u.procurador_nome,
                                'procuracaoDocumentoId', u.procuracao_documento_id, 'presencaEm', u.presenca_em,
                                'votouPeloPortal', EXISTS (SELECT 1 FROM public.condominio_assembleia_votos v
                                                            WHERE v.assembleia_id = p_assembleia AND v.unit_id = u.unit_id
                                                              AND v.origem = 'PORTAL'),
                                'impedidaNaInstalacao', u.impedida_na_instalacao)
                            ORDER BY u.unidade_rotulo), '[]'::jsonb)
                       FROM public.condominio_assembleia_unidades u WHERE u.assembleia_id = p_assembleia),
        'votos', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                             'itemId', v.item_id, 'unitId', v.unit_id, 'opcao', v.opcao, 'origem', v.origem,
                             'votadoEm', v.votado_em, 'clientId', v.client_id, 'lancadoPor', v.lancado_por)
                         ORDER BY i.ordem, u.unidade_rotulo), '[]'::jsonb)
                    FROM public.condominio_assembleia_votos v
                    JOIN public.condominio_assembleia_itens i ON i.id = v.item_id
                    JOIN public.condominio_assembleia_unidades u
                      ON u.assembleia_id = v.assembleia_id AND u.unit_id = v.unit_id
                   WHERE v.assembleia_id = p_assembleia),
        'impedidasNaInstalacao', coalesce(v_a.quorum_instalacao -> 'impedidas', '[]'::jsonb));

    PERFORM set_config('app.assembleia_transicao', 'on', true);
    UPDATE public.condominio_assembleias
       SET status = 'ENCERRADA', encerrada_em = v_agora, observacao_geral = v_obs, retrato = v_retrato
     WHERE id = p_assembleia;

    INSERT INTO public.condominio_assembleia_eventos (assembleia_id, evento, ator, papel, detalhe)
    VALUES (p_assembleia, 'ENCERRADA', p_ator, p_papel,
            jsonb_build_object('resultados', (SELECT coalesce(jsonb_object_agg(x ->> 'itemId', x ->> 'resultado'), '{}'::jsonb)
                                                FROM jsonb_array_elements(v_retrato -> 'itens') x)));

    PERFORM set_config('app.assembleia_transicao', coalesce(v_marca, ''), true);
    RETURN v_retrato;
END;
$$;

-- R9: a ata em PDF (gravada em Documentos pelo navegador) se liga à assembleia encerrada.
CREATE OR REPLACE FUNCTION public._assembleia_vincular_ata(p_assembleia uuid, p_documento uuid, p_ator uuid, p_papel text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_a     public.condominio_assembleias;
    v_marca text := current_setting('app.assembleia_transicao', true);
BEGIN
    v_a := public._assembleia_travar(p_assembleia);
    PERFORM public._assembleia_exige_condutor(p_papel);
    PERFORM public._assembleia_exige_estado(v_a.status, ARRAY['ENCERRADA']);
    IF p_documento IS NULL
       OR NOT EXISTS (SELECT 1 FROM public.condominio_documentos d
                       WHERE d.id = p_documento AND d.empreendimento_id = v_a.empreendimento_id AND d.categoria = 'ATA') THEN
        RAISE EXCEPTION 'A ata tem de ser um documento da categoria Ata deste condomínio.'
            USING ERRCODE = 'P0001', HINT = 'documento_invalido';
    END IF;

    PERFORM set_config('app.assembleia_transicao', 'on', true);
    UPDATE public.condominio_assembleias SET ata_documento_id = p_documento WHERE id = p_assembleia;

    INSERT INTO public.condominio_assembleia_eventos (assembleia_id, evento, ator, papel, detalhe)
    VALUES (p_assembleia, 'ATA_VINCULADA', p_ator, p_papel,
            jsonb_build_object('documentoId', p_documento, 'anterior', v_a.ata_documento_id));

    PERFORM set_config('app.assembleia_transicao', coalesce(v_marca, ''), true);
    RETURN jsonb_build_object('ataDocumentoId', p_documento);
END;
$$;

-- A10/R3: o gestor (ou o síndico, fase B) marca a unidade como impedida, com motivo;
-- p_motivo NULL desmarca. Só CONVOCADA/INSTALADA (a trava da A1 também só aceita a
-- escrita nesses estados). Marcar impede ações FUTURAS (presença, voto): voto já dado
-- continua valendo, e o quórum gravado na instalação não muda (R3, "momento da checagem").
CREATE OR REPLACE FUNCTION public._assembleia_marcar_impedida(p_assembleia uuid, p_unit uuid, p_motivo text,
                                                              p_ator uuid, p_papel text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_a      public.condominio_assembleias;
    v_u      public.condominio_assembleia_unidades;
    v_motivo text := nullif(btrim(p_motivo), '');
    v_em     timestamptz;
BEGIN
    v_a := public._assembleia_travar(p_assembleia);
    PERFORM public._assembleia_exige_condutor(p_papel);
    PERFORM public._assembleia_exige_estado(v_a.status, ARRAY['CONVOCADA', 'INSTALADA']);

    SELECT * INTO v_u FROM public.condominio_assembleia_unidades
     WHERE assembleia_id = p_assembleia AND unit_id = p_unit;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Esta unidade não participa da assembleia.' USING ERRCODE = 'P0001', HINT = 'unidade_fora';
    END IF;
    -- NULL desmarca; texto em branco não é motivo.
    IF p_motivo IS NOT NULL AND v_motivo IS NULL THEN
        RAISE EXCEPTION 'Informe o motivo do impedimento.' USING ERRCODE = 'P0001', HINT = 'sem_motivo';
    END IF;

    v_em := CASE WHEN v_motivo IS NOT NULL THEN now() END;
    UPDATE public.condominio_assembleia_unidades
       SET impedimento_manual = v_motivo, impedimento_manual_em = v_em
     WHERE id = v_u.id;

    INSERT INTO public.condominio_assembleia_eventos (assembleia_id, evento, ator, papel, unit_id, detalhe)
    VALUES (p_assembleia, 'IMPEDIMENTO_MANUAL', p_ator, p_papel, p_unit,
            jsonb_build_object('motivo', v_motivo, 'anterior', v_u.impedimento_manual));

    RETURN jsonb_build_object('unitId', p_unit, 'motivo', v_motivo, 'em', v_em);
END;
$$;

-- ═══ BLOCO 7 — invólucros do gestor (GRANT authenticated) ════════════════════
SET lock_timeout = '5s';

-- Membro da org que OPERA o condomínio (fn_org_do_condominio); senão 42501 — inclusive
-- quando a assembleia não existe (não diz se existe).
CREATE OR REPLACE FUNCTION public._assembleia_exige_gestor(p_assembleia uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    IF p_assembleia IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.condominio_assembleias a
         WHERE a.id = p_assembleia
           AND public.fn_org_do_condominio(a.empreendimento_id) IN (SELECT public.minhas_orgs_membro())) THEN
        RAISE EXCEPTION 'Sem permissão para conduzir assembleias deste condomínio.' USING ERRCODE = '42501';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.condominio_assembleia_convocar(p_assembleia uuid, p_corpo_aviso text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    PERFORM public._assembleia_exige_gestor(p_assembleia);
    RETURN public._assembleia_convocar(p_assembleia, p_corpo_aviso, auth.uid(), 'GESTOR');
END;
$$;

CREATE OR REPLACE FUNCTION public.condominio_assembleia_cancelar(p_assembleia uuid, p_motivo text, p_corpo_aviso text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    PERFORM public._assembleia_exige_gestor(p_assembleia);
    RETURN public._assembleia_cancelar(p_assembleia, p_motivo, p_corpo_aviso, auth.uid(), 'GESTOR');
END;
$$;

CREATE OR REPLACE FUNCTION public.condominio_assembleia_registrar_presenca(p_assembleia uuid, p_unit uuid, p_presenca text,
                                                                          p_procurador text, p_procuracao uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    PERFORM public._assembleia_exige_gestor(p_assembleia);
    RETURN public._assembleia_registrar_presenca(p_assembleia, p_unit, p_presenca, p_procurador, p_procuracao,
                                                 auth.uid(), 'GESTOR');
END;
$$;

CREATE OR REPLACE FUNCTION public.condominio_assembleia_instalar(p_assembleia uuid, p_convocacao smallint, p_presidente text,
                                                                p_secretario text, p_edital_entregue boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    PERFORM public._assembleia_exige_gestor(p_assembleia);
    RETURN public._assembleia_instalar(p_assembleia, p_convocacao, p_presidente, p_secretario, p_edital_entregue,
                                       auth.uid(), 'GESTOR');
END;
$$;

CREATE OR REPLACE FUNCTION public.condominio_assembleia_lancar_voto(p_item uuid, p_unit uuid, p_opcao text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    PERFORM public._assembleia_exige_gestor(
        (SELECT i.assembleia_id FROM public.condominio_assembleia_itens i WHERE i.id = p_item));
    RETURN public._assembleia_lancar_voto(p_item, p_unit, p_opcao, auth.uid(), 'GESTOR');
END;
$$;

CREATE OR REPLACE FUNCTION public.condominio_assembleia_encerrar(p_assembleia uuid, p_deliberacoes jsonb, p_observacao text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    PERFORM public._assembleia_exige_gestor(p_assembleia);
    RETURN public._assembleia_encerrar(p_assembleia, p_deliberacoes, p_observacao, auth.uid(), 'GESTOR');
END;
$$;

CREATE OR REPLACE FUNCTION public.condominio_assembleia_vincular_ata(p_assembleia uuid, p_documento uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    PERFORM public._assembleia_exige_gestor(p_assembleia);
    RETURN public._assembleia_vincular_ata(p_assembleia, p_documento, auth.uid(), 'GESTOR');
END;
$$;

CREATE OR REPLACE FUNCTION public.condominio_assembleia_apuracao(p_assembleia uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    PERFORM public._assembleia_exige_gestor(p_assembleia);
    RETURN public.fn_assembleia_apurar(p_assembleia);
END;
$$;

-- A10: marcar (motivo) / desmarcar (NULL) a unidade impedida.
CREATE OR REPLACE FUNCTION public.condominio_assembleia_marcar_impedida(p_assembleia uuid, p_unit uuid, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    PERFORM public._assembleia_exige_gestor(p_assembleia);
    RETURN public._assembleia_marcar_impedida(p_assembleia, p_unit, p_motivo, auth.uid(), 'GESTOR');
END;
$$;

-- A10: o condomínio desta assembleia tem cota cobrada pelo app? Vale em qualquer estado
-- (a tela avisa já no Convocar).
CREATE OR REPLACE FUNCTION public.condominio_assembleia_cotas_conferidas(p_assembleia uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    PERFORM public._assembleia_exige_gestor(p_assembleia);
    RETURN public.fn_assembleia_cotas_conferidas(
        (SELECT a.empreendimento_id FROM public.condominio_assembleias a WHERE a.id = p_assembleia));
END;
$$;

-- ═══ BLOCO 8 — privilégios ═══════════════════════════════════════════════════
SET lock_timeout = '5s';

-- Funções de gatilho da A1 recriadas aqui: continuam fora da API.
REVOKE ALL ON FUNCTION public._assembleia_org_do_condominio() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._assembleia_trava()             FROM PUBLIC, anon, authenticated;

-- Função pura do CHECK: quem grava o item precisa de EXECUTE.
REVOKE ALL ON FUNCTION public.fn_assembleia_opcoes_validas(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_assembleia_opcoes_validas(text[]) TO authenticated, service_role;

-- Núcleo, apuração, impedimento e auxiliares: ninguém da API chama direto.
REVOKE ALL ON FUNCTION public.fn_assembleia_unidade_impedida(uuid)                         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_assembleia_apurar(uuid)                                   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._assembleia_travar(uuid)                                     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._assembleia_exige_condutor(text)                           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._assembleia_exige_estado(text, text[])                       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._assembleia_exige_gestor(uuid)                               FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._assembleia_convocar(uuid, text, uuid, text)                 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._assembleia_cancelar(uuid, text, text, uuid, text)           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._assembleia_registrar_presenca(uuid, uuid, text, text, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._assembleia_instalar(uuid, smallint, text, text, boolean, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._assembleia_lancar_voto(uuid, uuid, text, uuid, text)        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._assembleia_encerrar(uuid, jsonb, text, uuid, text)          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._assembleia_vincular_ata(uuid, uuid, uuid, text)             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._assembleia_marcar_impedida(uuid, uuid, text, uuid, text)    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_assembleia_impedimento(uuid, uuid)                        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_assembleia_cotas_conferidas(uuid)                         FROM PUBLIC, anon, authenticated;

-- Invólucros do gestor: só authenticated (a autorização está dentro).
REVOKE ALL ON FUNCTION public.condominio_assembleia_convocar(uuid, text)                   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.condominio_assembleia_cancelar(uuid, text, text)             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.condominio_assembleia_registrar_presenca(uuid, uuid, text, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.condominio_assembleia_instalar(uuid, smallint, text, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.condominio_assembleia_lancar_voto(uuid, uuid, text)          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.condominio_assembleia_encerrar(uuid, jsonb, text)            FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.condominio_assembleia_vincular_ata(uuid, uuid)               FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.condominio_assembleia_apuracao(uuid)                         FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.condominio_assembleia_convocar(uuid, text)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.condominio_assembleia_cancelar(uuid, text, text)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.condominio_assembleia_registrar_presenca(uuid, uuid, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.condominio_assembleia_instalar(uuid, smallint, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.condominio_assembleia_lancar_voto(uuid, uuid, text)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.condominio_assembleia_encerrar(uuid, jsonb, text)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.condominio_assembleia_vincular_ata(uuid, uuid)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.condominio_assembleia_apuracao(uuid)                      TO authenticated;
REVOKE ALL ON FUNCTION public.condominio_assembleia_marcar_impedida(uuid, uuid, text)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.condominio_assembleia_cotas_conferidas(uuid)                 FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.condominio_assembleia_marcar_impedida(uuid, uuid, text)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.condominio_assembleia_cotas_conferidas(uuid)              TO authenticated;

COMMIT;
