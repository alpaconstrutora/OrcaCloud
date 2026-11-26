-- ============================================================================
-- Qualidade SiAC — fase 2: motivo da verificação de eficácia em coluna própria
-- (docs/planos/2026-11-26-qualidade-siac-fase2-implementacao.md, Task 6, fix 1).
--
-- Por que existe: o "não eficaz" pede motivo, e a 1ª versão da tela gravava o
-- motivo dentro de `non_conformances.description`. Isso reescrevia o problema
-- registrado e ficava fora do histórico (o gatilho só olhava status, causa,
-- ação corretiva e eficácia, e `non_conformance_history` não tinha descrição
-- nem motivo). A descrição também era editável sem deixar rastro.
--
-- O que faz (aditivo, idempotente):
--   • non_conformances.eficacia_motivo: motivo da última verificação de eficácia
--     (o app grava no "não eficaz" e limpa no "eficaz" e ao encerrar de novo).
--   • non_conformance_history ganha description e eficacia_motivo.
--   • O gatilho de histórico passa a copiar description e eficacia_motivo e a
--     disparar também quando um dos dois muda.
--
-- Aplicar com: npx supabase db query --linked -f <este arquivo>  (nunca db push).
-- A função de 1ª versão é de aplicar_20271126100000_qualidade_fase2_estrutura.sql
-- (4.7); aqui é a mesma função com as duas colunas a mais.
--
-- ⚠️ REAPLICAR NA ORDEM (revisão final, 26/11): as quatro migrations da fase 2
--    redefinem as mesmas funções; reaplicar uma antiga depois das novas DESFAZ as
--    novas. Ordem: 100000 → 110000 → 120000 → 130000. A 100000 e a 110000 têm guarda
--    (DO) que recusa reaplicar sozinha; esta 120000 é aditiva e pode ser
--    reaplicada sozinha (nada da 130000 depende do que ela redefine). Para
--    reaplicar a sequência de propósito: um arquivo só com
--    `SET qualidade.reaplicar_fase2_na_ordem = 'on';` + as quatro, na ordem.
--
-- ============================================================================

ALTER TABLE public.non_conformances
    ADD COLUMN IF NOT EXISTS eficacia_motivo text;

COMMENT ON COLUMN public.non_conformances.eficacia_motivo IS
    'Motivo da última verificação de eficácia (obrigatório no app quando não eficaz; NULL quando eficaz ou encerrada de novo). O histórico guarda cada um.';

ALTER TABLE public.non_conformance_history
    ADD COLUMN IF NOT EXISTS eficacia_motivo text,
    ADD COLUMN IF NOT EXISTS description     text;

COMMENT ON COLUMN public.non_conformance_history.description IS
    'Descrição da NC naquele estado (a mudança de descrição também gera linha).';
COMMENT ON COLUMN public.non_conformance_history.eficacia_motivo IS
    'Motivo da verificação de eficácia naquele estado (ex.: por que não foi eficaz).';

-- 4.7 (nova versão) non_conformances → histórico: grava o estado NOVO e quem
-- mudou (AFTER UPDATE) e o último estado quando a NC é apagada (BEFORE DELETE —
-- direto ou por cascata). SECURITY DEFINER: o app não tem INSERT no histórico;
-- só copia a própria linha.
CREATE OR REPLACE FUNCTION public.non_conformances_grava_historico()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        INSERT INTO public.non_conformance_history (
            nc_id, work_order_id, status, causa, corrective_action, eficacia,
            eficacia_motivo, description, alterado_por, evento)
        VALUES (
            OLD.id, OLD.work_order_id, OLD.status, OLD.causa, OLD.corrective_action, OLD.eficacia,
            OLD.eficacia_motivo, OLD.description, auth.uid(), 'exclusao');
        RETURN OLD;  -- NULL cancelaria a exclusão
    END IF;
    INSERT INTO public.non_conformance_history (
        nc_id, work_order_id, status, causa, corrective_action, eficacia,
        eficacia_motivo, description, alterado_por, evento)
    VALUES (
        NEW.id, NEW.work_order_id, NEW.status, NEW.causa, NEW.corrective_action, NEW.eficacia,
        NEW.eficacia_motivo, NEW.description, auth.uid(), 'alteracao');
    RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.non_conformances_grava_historico() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.non_conformances_grava_historico() TO authenticated;

DROP TRIGGER IF EXISTS trg_non_conformances_grava_historico ON public.non_conformances;
CREATE TRIGGER trg_non_conformances_grava_historico
    AFTER UPDATE ON public.non_conformances
    FOR EACH ROW
    WHEN (OLD.status            IS DISTINCT FROM NEW.status
       OR OLD.causa             IS DISTINCT FROM NEW.causa
       OR OLD.corrective_action IS DISTINCT FROM NEW.corrective_action
       OR OLD.eficacia          IS DISTINCT FROM NEW.eficacia
       OR OLD.eficacia_motivo   IS DISTINCT FROM NEW.eficacia_motivo
       OR OLD.description       IS DISTINCT FROM NEW.description)
    EXECUTE FUNCTION public.non_conformances_grava_historico();
