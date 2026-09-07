-- ==========================================================================
-- Portal de Crédito · Fase 2A — covenants por operação e desembolsos
-- Date: 2026-09-07
-- Altera: debt_covenants, debt_disbursements
-- Plano: docs/planos/2026-09-07-portal-credito-credit-room.md (Fase 2A)
-- ==========================================================================
-- POR QUE ESTENDER, E NÃO CRIAR TABELA NOVA
--
-- O PRD (§92) lista `covenants`, `covenant_measurements`, `disbursement_requests`
-- e `disbursements` como entidades novas. Seguir a lista criaria a SEGUNDA
-- tabela para cada coisa — e contradiria a §94 do próprio PRD ("não duplicar
-- cadastros operacionais"). O módulo Dívida já tem as duas, com o que é caro:
--
--   `debt_covenants`      — 13 tipos, DSCR/EBITDA apurados por
--                           `fn_debt_covenant_evaluate`, margem de atenção
--                           (§76) e histórico em `debt_covenant_measurements`.
--   `debt_disbursements`  — bruto, retenções, IOF, seguro, cartório, líquido,
--                           conta de pagamento e documento.
--
-- Falta a elas o que é do Credit Room: pertencer a uma OPERAÇÃO e ter estado.
--
-- ⚠️ SEM FK para `credit_rooms`: é o padrão do módulo (FK para tabela do app
--    deadlocka, 40P01 — mordeu 4× neste projeto). Integridade pela RLS.
--
-- ⚠️ APLICAR À MÃO — NUNCA `supabase db push` (ver CLAUDE.md).
-- ==========================================================================

SET lock_timeout = '5s';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema='public' AND table_name='credit_rooms') THEN
        RAISE EXCEPTION 'ABORTADO: credit_rooms nao existe (rode aplicar_20270920000001 antes).';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema='public' AND table_name='debt_disbursements') THEN
        RAISE EXCEPTION 'ABORTADO: debt_disbursements nao existe (rode aplicar_20270915000001 antes).';
    END IF;
END $$;

-- ==========================================================================
-- 1. Covenants da operação (PRD §74–76)
-- ==========================================================================
-- `credit_room_id` é OPCIONAL de propósito: covenant de contrato de dívida
-- continua existindo e funcionando como antes. O do room é o que respeita
-- `credit_rooms.eligible_flows` — a regra R8 — e por isso dá um número
-- DIFERENTE do covenant global da empresa. São dois indicadores legítimos com
-- o mesmo nome; o que os separa é justamente esta coluna.
ALTER TABLE public.debt_covenants
    ADD COLUMN IF NOT EXISTS credit_room_id uuid;

CREATE INDEX IF NOT EXISTS idx_debt_covenants_credit_room
    ON public.debt_covenants (credit_room_id) WHERE credit_room_id IS NOT NULL;

COMMENT ON COLUMN public.debt_covenants.credit_room_id IS
    'Operacao de credito dona do covenant (sem FK: padrao do modulo). Quando '
    'presente, o DSCR e apurado sobre o fluxo ELEGIVEL da operacao (R8 do PRD), '
    'nao sobre o EBITDA global da empresa — os dois numeros divergem, e essa '
    'diferenca e a razao da coluna existir.';

-- ==========================================================================
-- 2. Desembolsos com estado e medição (PRD §68–71)
-- ==========================================================================
-- Hoje a linha só nasce quando o dinheiro JÁ saiu: `disbursed_at NOT NULL` e
-- `gross_amount > 0`. O workflow do §69 começa antes disso — uma SOLICITAÇÃO
-- não tem data de liberação nem valor liberado, tem valor PEDIDO.
--
-- As duas travas são relaxadas, e a coerência passa a ser por estado: a linha
-- só pode chegar em LIBERADO com data e valor (CHECK no fim). Trocar uma
-- garantia cega por uma condicional é o ponto — não afrouxar.
--
-- Seguro fazer agora: `debt_disbursements` tem 0 linhas (medido em 07/09).
ALTER TABLE public.debt_disbursements
    ALTER COLUMN disbursed_at DROP NOT NULL;

ALTER TABLE public.debt_disbursements
    DROP CONSTRAINT IF EXISTS debt_disbursements_gross_amount_check;
ALTER TABLE public.debt_disbursements
    ADD CONSTRAINT debt_disbursements_gross_amount_check CHECK (gross_amount >= 0);

ALTER TABLE public.debt_disbursements
    ADD COLUMN IF NOT EXISTS credit_room_id    uuid,
    ADD COLUMN IF NOT EXISTS seq               integer,
    ADD COLUMN IF NOT EXISTS status            text NOT NULL DEFAULT 'SOLICITADO',
    ADD COLUMN IF NOT EXISTS requested_amount  numeric(15,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS approved_amount   numeric(15,2),
    ADD COLUMN IF NOT EXISTS purpose           text,
    -- §70: a liberação se justifica por uma MEDIÇÃO. Referência em texto
    -- porque medição vive em três lugares diferentes no sistema (cronograma,
    -- diário, planilha) e escolher um agora amarraria o desembolso ao que
    -- vier a mudar. O vínculo forte entra quando a medição tiver dono único.
    ADD COLUMN IF NOT EXISTS measurement_ref   text,
    -- §71: o que a ENGENHARIA DO BANCO registra. É a única escrita do credor
    -- nesta tabela, e por isso fica separada de `notes` (do tomador).
    ADD COLUMN IF NOT EXISTS physical_pct      numeric(5,2),
    ADD COLUMN IF NOT EXISTS analysis_notes    text,
    ADD COLUMN IF NOT EXISTS decided_at        timestamptz,
    ADD COLUMN IF NOT EXISTS decided_by        text;

-- Os 8 estados do §69, na ordem do fluxo.
ALTER TABLE public.debt_disbursements
    DROP CONSTRAINT IF EXISTS debt_disbursements_status_chk;
ALTER TABLE public.debt_disbursements
    ADD CONSTRAINT debt_disbursements_status_chk CHECK (status IN (
        'SOLICITADO', 'DOCUMENTOS', 'EM_ANALISE', 'MEDICAO',
        'PENDENCIAS', 'APROVADO', 'LIBERADO', 'CONCILIADO', 'RECUSADO'
    ));

ALTER TABLE public.debt_disbursements
    DROP CONSTRAINT IF EXISTS debt_disbursements_liberado_coerente;
ALTER TABLE public.debt_disbursements
    ADD CONSTRAINT debt_disbursements_liberado_coerente CHECK (
        status NOT IN ('LIBERADO', 'CONCILIADO')
        OR (disbursed_at IS NOT NULL AND gross_amount > 0)
    );

ALTER TABLE public.debt_disbursements
    DROP CONSTRAINT IF EXISTS debt_disbursements_pct_fisico;
ALTER TABLE public.debt_disbursements
    ADD CONSTRAINT debt_disbursements_pct_fisico CHECK (
        physical_pct IS NULL OR (physical_pct >= 0 AND physical_pct <= 100)
    );

CREATE INDEX IF NOT EXISTS idx_debt_disbursements_credit_room
    ON public.debt_disbursements (credit_room_id) WHERE credit_room_id IS NOT NULL;

COMMENT ON COLUMN public.debt_disbursements.status IS
    'Fluxo do PRD §69: SOLICITADO → DOCUMENTOS → EM_ANALISE → MEDICAO → '
    'PENDENCIAS → APROVADO → LIBERADO → CONCILIADO (ou RECUSADO). Enquanto nao '
    'chega em LIBERADO a linha nao precisa de data nem de valor bruto.';
COMMENT ON COLUMN public.debt_disbursements.physical_pct IS
    'Medicao TECNICA do §71 — o percentual que a engenharia do BANCO aferiu. '
    'Nao confundir com o avanco fisico da obra no ÒPURA: sao medidos por '
    'partes diferentes e divergir e informacao, nao erro.';

-- Numeração por contrato (§68 pede "número" da liberação).
CREATE OR REPLACE FUNCTION public.fn_debt_disbursement_numerar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.seq IS NULL THEN
        SELECT COALESCE(MAX(seq), 0) + 1 INTO NEW.seq
          FROM public.debt_disbursements
         WHERE debt_contract_id = NEW.debt_contract_id;
    END IF;
    RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.fn_debt_disbursement_numerar() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_debt_disbursements_numerar ON public.debt_disbursements;
CREATE TRIGGER trg_debt_disbursements_numerar
    BEFORE INSERT ON public.debt_disbursements
    FOR EACH ROW EXECUTE FUNCTION public.fn_debt_disbursement_numerar();

-- ==========================================================================
-- 3. O credor lê (e mede) o que é da operação dele
-- ==========================================================================
-- As policies existentes de `debt_*` são `is_org_member(organization_id)` — o
-- credor não é membro de organização nenhuma, então hoje ele não veria nada.
-- Estas policies ADICIONAIS liberam SÓ as linhas com `credit_room_id` de um
-- room em que ele é participante ativo. `is_credit_room_member` já checa
-- revogação e expiração (aplicar_20270920000001).
--
-- REGRA #7, Pergunta 1: nenhuma das expressões abaixo é verdadeira sozinha —
-- todas dependem de `credit_room_id NOT NULL` **e** do vínculo.

DROP POLICY IF EXISTS debt_covenants_credor_select ON public.debt_covenants;
CREATE POLICY debt_covenants_credor_select ON public.debt_covenants
    FOR SELECT TO authenticated
    USING (credit_room_id IS NOT NULL AND public.is_credit_room_member(credit_room_id));

DROP POLICY IF EXISTS debt_covenant_measurements_credor_select ON public.debt_covenant_measurements;
CREATE POLICY debt_covenant_measurements_credor_select ON public.debt_covenant_measurements
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.debt_covenants c
         WHERE c.id = debt_covenant_measurements.covenant_id
           AND c.credit_room_id IS NOT NULL
           AND public.is_credit_room_member(c.credit_room_id)
    ));

DROP POLICY IF EXISTS debt_disbursements_credor_select ON public.debt_disbursements;
CREATE POLICY debt_disbursements_credor_select ON public.debt_disbursements
    FOR SELECT TO authenticated
    USING (credit_room_id IS NOT NULL AND public.is_credit_room_member(credit_room_id));

-- A ÚNICA escrita do credor: a medição técnica do §71. Ele não muda valor,
-- não muda data, não muda status — o UPDATE é liberado, e o que ele pode de
-- fato alterar é limitado pelas colunas que a tela envia. Um credor curioso
-- que montasse a requisição à mão ainda ficaria preso ao room dele.
DROP POLICY IF EXISTS debt_disbursements_credor_medicao ON public.debt_disbursements;
CREATE POLICY debt_disbursements_credor_medicao ON public.debt_disbursements
    FOR UPDATE TO authenticated
    USING (credit_room_id IS NOT NULL AND public.is_credit_room_member(credit_room_id))
    WITH CHECK (credit_room_id IS NOT NULL AND public.is_credit_room_member(credit_room_id));

-- ==========================================================================
-- 4. Conferência
-- ==========================================================================
-- a. Colunas novas:
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name='debt_disbursements' AND column_name IN
--        ('credit_room_id','seq','status','requested_amount','physical_pct');
--    -> 5 linhas
--
-- b. `disbursed_at` aceita NULL, mas LIBERADO exige data e valor:
-- BEGIN;
--   INSERT INTO debt_disbursements (organization_id, debt_contract_id, gross_amount, status)
--   VALUES ('<org>','<contrato>',0,'SOLICITADO');            -- passa
--   UPDATE debt_disbursements SET status='LIBERADO' WHERE ...;-- 23514
-- ROLLBACK;
--
-- c. As policies do credor não liberam linha sem room:
-- SELECT policyname, qual FROM pg_policies
--  WHERE tablename IN ('debt_covenants','debt_disbursements') AND policyname LIKE '%credor%';
--    -> toda `qual` começa por `credit_room_id IS NOT NULL AND`
--
-- d. Sonda externa (scripts/check-rls-postura.sh) segue limpa.
-- ==========================================================================
-- FIM: aplicar_20270920000005_credit_room_fase2a.sql
-- ==========================================================================
