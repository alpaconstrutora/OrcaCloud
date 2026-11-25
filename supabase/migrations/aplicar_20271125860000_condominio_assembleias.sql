-- =============================================================================
-- Condomínio — Assembleias e votações: estrutura (tabelas, trava e RLS).
-- Plano: docs/planos/2026-11-25-condominio-assembleias-votacoes.md
--        (Regras R1–R10, "Desenho", Task A1).
-- Prova: scripts/teste-condominio-assembleias-estrutura.sql
--
-- O que nasce aqui:
--   • condominio_assembleias               — a assembleia (AGO/AGE), estados R10, retrato.
--   • condominio_assembleia_itens          — pauta (APROVACAO | ESCOLHA) e quórum (R8).
--   • condominio_assembleia_unidades       — unidades participantes, fração CONGELADA na
--                                            convocação (R1), presença e procuração (R7).
--   • condominio_assembleia_votos          — um voto por (item, unidade); vale o último (R5/R7).
--   • condominio_assembleia_votos_historico— toda inclusão/troca de voto (gatilho).
--   • condominio_assembleia_eventos        — autoria de cada transição/presença/voto lançado.
--   • trg_condominio_assembleia_trava      — trava de estado (vale para TODO papel, inclusive
--                                            postgres pelas RPCs). Recusa com SQLSTATE 23514 e
--                                            HINT 'assembleia_travada'.
--
-- A marca de transição: as RPCs (tarefas seguintes) fazem
--   PERFORM set_config('app.assembleia_transicao', 'on', true);
-- antes de mexer em condominio_assembleias. Sem a marca: status não muda, e fora de
-- RASCUNHO a assembleia não muda nada (data, local e título fazem parte do edital).
--
-- REGRA #7:
--   Pergunta 1 — nenhuma policy tem OR. assembleias: organization_id IN
--   (SELECT minhas_orgs_membro()); as demais: assembleia_id IN (assembleias dessas
--   orgs). Nenhuma policy para anon. unidades, votos, histórico e eventos têm SÓ
--   SELECT (escrita só pelas RPCs SECURITY DEFINER das tarefas seguintes).
--   Pergunta 2 — as 3 funções novas são de gatilho (núcleo `_assembleia_*`): SECURITY
--   DEFINER com search_path fixo e REVOKE ALL de PUBLIC, anon e authenticated (gatilho
--   não precisa de EXECUTE de quem dispara). TRUNCATE/REFERENCES/TRIGGER revogados de
--   authenticated; anon sem privilégio nenhum nas 6 tabelas.
--
-- Idempotente (IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS).
-- Aplicar com `npx supabase db query --linked -f` — nunca `db push`.
-- =============================================================================

SET lock_timeout = '5s';

BEGIN;

-- ═══ BLOCO 1 — tabelas ══════════════════════════════════════════════════════
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.condominio_assembleias (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Preenchida SEMPRE pelo gatilho: fn_org_do_condominio(empreendimento_id).
    organization_id         uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    empreendimento_id       uuid NOT NULL REFERENCES public.empreendimentos(id) ON DELETE CASCADE,
    tipo                    text NOT NULL CHECK (tipo IN ('AGO', 'AGE')),
    titulo                  text NOT NULL CHECK (btrim(titulo) <> ''),
    local                   text,
    link_transmissao        text,
    -- Nulas no rascunho; Convocar (RPC) exige as duas.
    primeira_convocacao_em  timestamptz,
    segunda_convocacao_em   timestamptz,
    status                  text NOT NULL DEFAULT 'RASCUNHO'
                              CHECK (status IN ('RASCUNHO', 'CONVOCADA', 'INSTALADA', 'ENCERRADA', 'CANCELADA')),
    convocada_em            timestamptz,
    aviso_id                uuid REFERENCES public.condominio_avisos(id) ON DELETE SET NULL,
    edital_entregue_em      timestamptz,
    instalada_em            timestamptz,
    instalada_convocacao    smallint CHECK (instalada_convocacao IN (1, 2)),
    quorum_instalacao       jsonb,
    presidente_nome         text,
    secretario_nome         text,
    observacao_geral        text,
    encerrada_em            timestamptz,
    retrato                 jsonb,
    ata_documento_id        uuid REFERENCES public.condominio_documentos(id) ON DELETE SET NULL,
    cancelada_em            timestamptz,
    motivo_cancelamento     text,
    created_by              uuid DEFAULT auth.uid(),
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT condominio_assembleias_segunda_depois_da_primeira
        CHECK (segunda_convocacao_em > primeira_convocacao_em)
);

CREATE INDEX IF NOT EXISTS idx_condominio_assembleias_empr
    ON public.condominio_assembleias (empreendimento_id, primeira_convocacao_em DESC);
CREATE INDEX IF NOT EXISTS idx_condominio_assembleias_org
    ON public.condominio_assembleias (organization_id);
CREATE INDEX IF NOT EXISTS idx_condominio_assembleias_aviso
    ON public.condominio_assembleias (aviso_id) WHERE aviso_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_condominio_assembleias_ata
    ON public.condominio_assembleias (ata_documento_id) WHERE ata_documento_id IS NOT NULL;

COMMENT ON TABLE public.condominio_assembleias IS
    'Assembleia de condomínio (AGO/AGE). Estados: RASCUNHO → CONVOCADA → INSTALADA → ENCERRADA; '
    'CONVOCADA → CANCELADA. Fora de RASCUNHO só muda pelas RPCs (marca app.assembleia_transicao); '
    'ENCERRADA/CANCELADA não mudam (ENCERRADA aceita só ata_documento_id, com a marca). '
    'organization_id = fn_org_do_condominio(empreendimento_id), pelo gatilho.';
COMMENT ON COLUMN public.condominio_assembleias.retrato IS
    'Retrato gravado ao encerrar: presença, impedidas, votos por unidade e resultado por item. A ata sai daqui.';
COMMENT ON COLUMN public.condominio_assembleias.quorum_instalacao IS
    'Quórum calculado e gravado no instante de Instalar (R3/R6). Não é refeito depois.';

CREATE TABLE IF NOT EXISTS public.condominio_assembleia_itens (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    assembleia_id  uuid NOT NULL REFERENCES public.condominio_assembleias(id) ON DELETE CASCADE,
    ordem          integer NOT NULL,
    titulo         text NOT NULL CHECK (btrim(titulo) <> ''),
    descricao      text,
    tipo           text NOT NULL CHECK (tipo IN ('APROVACAO', 'ESCOLHA')),
    opcoes         text[],
    quorum         text NOT NULL DEFAULT 'MAIORIA_PRESENTES'
                     CHECK (quorum IN ('MAIORIA_PRESENTES', 'MAIORIA_ABSOLUTA', 'DOIS_TERCOS', 'UNANIMIDADE')),
    assunto        text,
    deliberacao    text,
    CONSTRAINT condominio_assembleia_itens_ordem_key UNIQUE (assembleia_id, ordem),
    -- Alvo da FK composta dos votos (o voto e o item são da mesma assembleia).
    CONSTRAINT condominio_assembleia_itens_id_assembleia_key UNIQUE (id, assembleia_id),
    -- ESCOLHA: ≥ 2 opções e só maioria dos presentes (R8). APROVACAO: Sim/Não/Abstenção fixos.
    CONSTRAINT condominio_assembleia_itens_tipo_opcoes CHECK (
        (tipo = 'ESCOLHA' AND opcoes IS NOT NULL AND cardinality(opcoes) >= 2 AND quorum = 'MAIORIA_PRESENTES')
     OR (tipo = 'APROVACAO' AND opcoes IS NULL))
);

COMMENT ON TABLE public.condominio_assembleia_itens IS
    'Pauta da assembleia. Muda só em RASCUNHO; em INSTALADA, só a deliberacao. Quórum e tipo: R8.';

CREATE TABLE IF NOT EXISTS public.condominio_assembleia_unidades (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    assembleia_id            uuid NOT NULL REFERENCES public.condominio_assembleias(id) ON DELETE CASCADE,
    -- Sem FK para empreendimento_units de propósito: a linha é um retrato congelado na
    -- convocação (R1) e não pode travar nem sumir com mudança no cadastro.
    unit_id                  uuid NOT NULL,
    fracao                   numeric NOT NULL CHECK (fracao > 0),
    unidade_rotulo           text,
    proprietario_nome        text,
    presenca                 text CHECK (presenca IN ('PRESENCIAL', 'PROCURADOR')),
    procurador_nome          text,
    procuracao_documento_id  uuid REFERENCES public.condominio_documentos(id),
    presenca_em              timestamptz,
    impedida_na_instalacao   boolean,
    CONSTRAINT condominio_assembleia_unidades_unidade_key UNIQUE (assembleia_id, unit_id),
    CONSTRAINT condominio_assembleia_unidades_procurador CHECK (
        presenca IS DISTINCT FROM 'PROCURADOR'
     OR (nullif(btrim(procurador_nome), '') IS NOT NULL AND procuracao_documento_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_condominio_assembleia_unidades_procuracao
    ON public.condominio_assembleia_unidades (procuracao_documento_id) WHERE procuracao_documento_id IS NOT NULL;

COMMENT ON TABLE public.condominio_assembleia_unidades IS
    'Unidades participantes, com a fração ideal congelada na convocação (R1). Presença e '
    'procuração (R7). Escrita só pelas RPCs, e só em CONVOCADA/INSTALADA.';

CREATE TABLE IF NOT EXISTS public.condominio_assembleia_votos (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    assembleia_id  uuid NOT NULL REFERENCES public.condominio_assembleias(id) ON DELETE CASCADE,
    item_id        uuid NOT NULL,
    unit_id        uuid NOT NULL,
    opcao          text NOT NULL CHECK (btrim(opcao) <> ''),
    origem         text NOT NULL CHECK (origem IN ('PORTAL', 'PRESENCIAL')),
    client_id      uuid,
    lancado_por    uuid,
    votado_em      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT condominio_assembleia_votos_item_unidade_key UNIQUE (item_id, unit_id),
    -- O item é da mesma assembleia do voto (e o voto sai com o item).
    CONSTRAINT condominio_assembleia_votos_item_fk FOREIGN KEY (item_id, assembleia_id)
        REFERENCES public.condominio_assembleia_itens (id, assembleia_id) ON DELETE CASCADE,
    -- Só vota unidade participante da assembleia (R1).
    CONSTRAINT condominio_assembleia_votos_unidade_fk FOREIGN KEY (assembleia_id, unit_id)
        REFERENCES public.condominio_assembleia_unidades (assembleia_id, unit_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_condominio_assembleia_votos_assembleia
    ON public.condominio_assembleia_votos (assembleia_id, unit_id);

COMMENT ON TABLE public.condominio_assembleia_votos IS
    'Voto da unidade por item; vale o último (R5/R7). Escrita só pelas RPCs, em CONVOCADA/INSTALADA. '
    'DELETE sempre recusado: trocar o voto é UPDATE, e o histórico guarda todas as versões.';

CREATE TABLE IF NOT EXISTS public.condominio_assembleia_votos_historico (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- Sem FK para votos: o histórico é o registro, não depende da linha viva.
    voto_id        uuid NOT NULL,
    assembleia_id  uuid NOT NULL REFERENCES public.condominio_assembleias(id) ON DELETE CASCADE,
    item_id        uuid NOT NULL,
    unit_id        uuid NOT NULL,
    opcao          text NOT NULL,
    origem         text NOT NULL,
    client_id      uuid,
    lancado_por    uuid,
    votado_em      timestamptz NOT NULL,
    operacao       text NOT NULL CHECK (operacao IN ('INSERT', 'UPDATE')),
    registrado_em  timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_condominio_assembleia_votos_historico_assembleia
    ON public.condominio_assembleia_votos_historico (assembleia_id, item_id, unit_id, id);
CREATE INDEX IF NOT EXISTS idx_condominio_assembleia_votos_historico_voto
    ON public.condominio_assembleia_votos_historico (voto_id, id);

COMMENT ON TABLE public.condominio_assembleia_votos_historico IS
    'Cópia de cada inclusão/troca de voto (gatilho AFTER INSERT OR UPDATE em condominio_assembleia_votos). '
    'Ordem = id.';

CREATE TABLE IF NOT EXISTS public.condominio_assembleia_eventos (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    assembleia_id  uuid NOT NULL REFERENCES public.condominio_assembleias(id) ON DELETE CASCADE,
    evento         text NOT NULL CHECK (btrim(evento) <> ''),
    ator           uuid,
    papel          text NOT NULL CHECK (papel IN ('GESTOR', 'SINDICO', 'CONDOMINO')),
    unit_id        uuid,
    detalhe        jsonb NOT NULL DEFAULT '{}'::jsonb,
    em             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_condominio_assembleia_eventos_assembleia
    ON public.condominio_assembleia_eventos (assembleia_id, em);

COMMENT ON TABLE public.condominio_assembleia_eventos IS
    'Autoria de cada transição, presença e voto lançado (quem, papel, quando, detalhe). Escrita só pelas RPCs.';

-- ═══ BLOCO 2 — organização da assembleia = a que opera o condomínio ═════════
SET lock_timeout = '5s';

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
    IF TG_OP = 'INSERT' OR NEW.empreendimento_id IS DISTINCT FROM OLD.empreendimento_id THEN
        NEW.organization_id := public.fn_org_do_condominio(NEW.empreendimento_id);
    ELSE
        NEW.organization_id := OLD.organization_id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_condominio_assembleia_org ON public.condominio_assembleias;
CREATE TRIGGER trg_condominio_assembleia_org
    BEFORE INSERT OR UPDATE ON public.condominio_assembleias
    FOR EACH ROW EXECUTE FUNCTION public._assembleia_org_do_condominio();

-- Dispara depois da trava (ordem alfabética do nome), e a trava ignora updated_at.
DROP TRIGGER IF EXISTS trg_condominio_assembleias_updated_at ON public.condominio_assembleias;
CREATE TRIGGER trg_condominio_assembleias_updated_at
    BEFORE UPDATE ON public.condominio_assembleias
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ═══ BLOCO 3 — a trava ══════════════════════════════════════════════════════
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
            IF OLD.status = 'CANCELADA' THEN
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

DROP TRIGGER IF EXISTS trg_condominio_assembleia_trava ON public.condominio_assembleias;
CREATE TRIGGER trg_condominio_assembleia_trava
    BEFORE INSERT OR UPDATE OR DELETE ON public.condominio_assembleias
    FOR EACH ROW EXECUTE FUNCTION public._assembleia_trava();

DROP TRIGGER IF EXISTS trg_condominio_assembleia_trava ON public.condominio_assembleia_itens;
CREATE TRIGGER trg_condominio_assembleia_trava
    BEFORE INSERT OR UPDATE OR DELETE ON public.condominio_assembleia_itens
    FOR EACH ROW EXECUTE FUNCTION public._assembleia_trava();

DROP TRIGGER IF EXISTS trg_condominio_assembleia_trava ON public.condominio_assembleia_unidades;
CREATE TRIGGER trg_condominio_assembleia_trava
    BEFORE INSERT OR UPDATE OR DELETE ON public.condominio_assembleia_unidades
    FOR EACH ROW EXECUTE FUNCTION public._assembleia_trava();

DROP TRIGGER IF EXISTS trg_condominio_assembleia_trava ON public.condominio_assembleia_votos;
CREATE TRIGGER trg_condominio_assembleia_trava
    BEFORE INSERT OR UPDATE OR DELETE ON public.condominio_assembleia_votos
    FOR EACH ROW EXECUTE FUNCTION public._assembleia_trava();

-- ═══ BLOCO 4 — histórico de votos ═══════════════════════════════════════════
SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public._assembleia_votos_historico()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    INSERT INTO public.condominio_assembleia_votos_historico
        (voto_id, assembleia_id, item_id, unit_id, opcao, origem, client_id, lancado_por, votado_em, operacao)
    VALUES
        (NEW.id, NEW.assembleia_id, NEW.item_id, NEW.unit_id, NEW.opcao, NEW.origem,
         NEW.client_id, NEW.lancado_por, NEW.votado_em, TG_OP);
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_condominio_assembleia_votos_historico ON public.condominio_assembleia_votos;
CREATE TRIGGER trg_condominio_assembleia_votos_historico
    AFTER INSERT OR UPDATE ON public.condominio_assembleia_votos
    FOR EACH ROW EXECUTE FUNCTION public._assembleia_votos_historico();

-- ═══ BLOCO 5 — RLS ══════════════════════════════════════════════════════════
SET lock_timeout = '5s';

ALTER TABLE public.condominio_assembleias                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.condominio_assembleia_itens           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.condominio_assembleia_unidades        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.condominio_assembleia_votos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.condominio_assembleia_votos_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.condominio_assembleia_eventos         ENABLE ROW LEVEL SECURITY;

-- assembleias — org do usuário (sem OR). No INSERT, a org já veio do gatilho.
DROP POLICY IF EXISTS condominio_assembleias_select ON public.condominio_assembleias;
CREATE POLICY condominio_assembleias_select ON public.condominio_assembleias
    FOR SELECT TO authenticated
    USING (organization_id IN (SELECT public.minhas_orgs_membro()));

DROP POLICY IF EXISTS condominio_assembleias_insert ON public.condominio_assembleias;
CREATE POLICY condominio_assembleias_insert ON public.condominio_assembleias
    FOR INSERT TO authenticated
    WITH CHECK (organization_id IN (SELECT public.minhas_orgs_membro()));

DROP POLICY IF EXISTS condominio_assembleias_update ON public.condominio_assembleias;
CREATE POLICY condominio_assembleias_update ON public.condominio_assembleias
    FOR UPDATE TO authenticated
    USING (organization_id IN (SELECT public.minhas_orgs_membro()))
    WITH CHECK (organization_id IN (SELECT public.minhas_orgs_membro()));

DROP POLICY IF EXISTS condominio_assembleias_delete ON public.condominio_assembleias;
CREATE POLICY condominio_assembleias_delete ON public.condominio_assembleias
    FOR DELETE TO authenticated
    USING (organization_id IN (SELECT public.minhas_orgs_membro()));

-- itens — a assembleia é de uma org do usuário (sem OR).
DROP POLICY IF EXISTS condominio_assembleia_itens_select ON public.condominio_assembleia_itens;
CREATE POLICY condominio_assembleia_itens_select ON public.condominio_assembleia_itens
    FOR SELECT TO authenticated
    USING (assembleia_id IN (SELECT a.id FROM public.condominio_assembleias a
                              WHERE a.organization_id IN (SELECT public.minhas_orgs_membro())));

DROP POLICY IF EXISTS condominio_assembleia_itens_insert ON public.condominio_assembleia_itens;
CREATE POLICY condominio_assembleia_itens_insert ON public.condominio_assembleia_itens
    FOR INSERT TO authenticated
    WITH CHECK (assembleia_id IN (SELECT a.id FROM public.condominio_assembleias a
                                   WHERE a.organization_id IN (SELECT public.minhas_orgs_membro())));

DROP POLICY IF EXISTS condominio_assembleia_itens_update ON public.condominio_assembleia_itens;
CREATE POLICY condominio_assembleia_itens_update ON public.condominio_assembleia_itens
    FOR UPDATE TO authenticated
    USING (assembleia_id IN (SELECT a.id FROM public.condominio_assembleias a
                              WHERE a.organization_id IN (SELECT public.minhas_orgs_membro())))
    WITH CHECK (assembleia_id IN (SELECT a.id FROM public.condominio_assembleias a
                                   WHERE a.organization_id IN (SELECT public.minhas_orgs_membro())));

DROP POLICY IF EXISTS condominio_assembleia_itens_delete ON public.condominio_assembleia_itens;
CREATE POLICY condominio_assembleia_itens_delete ON public.condominio_assembleia_itens
    FOR DELETE TO authenticated
    USING (assembleia_id IN (SELECT a.id FROM public.condominio_assembleias a
                              WHERE a.organization_id IN (SELECT public.minhas_orgs_membro())));

-- unidades, votos, histórico, eventos — SÓ leitura pelo app (escrita só pelas RPCs).
DROP POLICY IF EXISTS condominio_assembleia_unidades_select ON public.condominio_assembleia_unidades;
CREATE POLICY condominio_assembleia_unidades_select ON public.condominio_assembleia_unidades
    FOR SELECT TO authenticated
    USING (assembleia_id IN (SELECT a.id FROM public.condominio_assembleias a
                              WHERE a.organization_id IN (SELECT public.minhas_orgs_membro())));

DROP POLICY IF EXISTS condominio_assembleia_votos_select ON public.condominio_assembleia_votos;
CREATE POLICY condominio_assembleia_votos_select ON public.condominio_assembleia_votos
    FOR SELECT TO authenticated
    USING (assembleia_id IN (SELECT a.id FROM public.condominio_assembleias a
                              WHERE a.organization_id IN (SELECT public.minhas_orgs_membro())));

DROP POLICY IF EXISTS condominio_assembleia_votos_historico_select ON public.condominio_assembleia_votos_historico;
CREATE POLICY condominio_assembleia_votos_historico_select ON public.condominio_assembleia_votos_historico
    FOR SELECT TO authenticated
    USING (assembleia_id IN (SELECT a.id FROM public.condominio_assembleias a
                              WHERE a.organization_id IN (SELECT public.minhas_orgs_membro())));

DROP POLICY IF EXISTS condominio_assembleia_eventos_select ON public.condominio_assembleia_eventos;
CREATE POLICY condominio_assembleia_eventos_select ON public.condominio_assembleia_eventos
    FOR SELECT TO authenticated
    USING (assembleia_id IN (SELECT a.id FROM public.condominio_assembleias a
                              WHERE a.organization_id IN (SELECT public.minhas_orgs_membro())));

-- ═══ BLOCO 6 — privilégios ══════════════════════════════════════════════════
-- Os default privileges do Supabase dão TUDO a anon/authenticated (inclusive TRUNCATE,
-- que ignora a RLS). Zera e concede só o que a API usa. anon: nada (o portal entra
-- só por RPC). service_role fica como está.
SET lock_timeout = '5s';

REVOKE ALL ON public.condominio_assembleias, public.condominio_assembleia_itens,
              public.condominio_assembleia_unidades, public.condominio_assembleia_votos,
              public.condominio_assembleia_votos_historico, public.condominio_assembleia_eventos
    FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
    ON public.condominio_assembleias, public.condominio_assembleia_itens
    TO authenticated;
GRANT SELECT
    ON public.condominio_assembleia_unidades, public.condominio_assembleia_votos,
       public.condominio_assembleia_votos_historico, public.condominio_assembleia_eventos
    TO authenticated;

-- Funções de gatilho (núcleo): ninguém da API chama direto.
REVOKE ALL ON FUNCTION public._assembleia_org_do_condominio() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._assembleia_trava()             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._assembleia_votos_historico()   FROM PUBLIC, anon, authenticated;

COMMIT;
