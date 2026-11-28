-- aplicar_20271127300100_recebimento_quem_recebeu.sql
--
-- Recebimento mobile, Fase 2 (docs/planos/2026-11-27-recebimento-mobile.md).
-- Prova: scripts/teste-recebimento-nucleo.sql.
--
-- 1. Quem conferiu e por onde: `purchase_receipts.received_by` (conta) e
--    `origem` ('APP' = app logado, computador ou celular; 'LINK' = link do
--    celular sem login). O histórico mostra "Conferido por Fulano · pelo link".
--    Gatilho BEFORE INSERT: com sessão (auth.uid()), o autor é SEMPRE o da
--    sessão e a origem 'APP' — o cliente não escolhe (a RLS ainda deixa o
--    comprador inserir direto). Sem sessão (service role da Edge), valem os
--    valores que o núcleo `_recebimento_registrar_core` passa.
-- 2. `purchase_receipt_items.order_item_index`: o índice do item no pedido.
--    Com o recebimento parcial (o resto vem depois), o saldo de cada item soma
--    as conferências anteriores — dois itens com o mesmo código ficariam
--    ambíguos sem o índice. Linhas antigas ficam NULL (casam pelo código).
--
-- Só acrescenta (colunas com default/NULL); nada existente muda de valor.
-- ⚠️ Aplicar à mão, da pasta de uma frente LIGADA ao projeto.

ALTER TABLE public.purchase_receipts
    ADD COLUMN IF NOT EXISTS received_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'APP';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_receipts_origem_check'
                      AND conrelid = 'public.purchase_receipts'::regclass) THEN
        ALTER TABLE public.purchase_receipts
            ADD CONSTRAINT purchase_receipts_origem_check CHECK (origem IN ('APP', 'LINK'));
    END IF;
END $$;

ALTER TABLE public.purchase_receipt_items
    ADD COLUMN IF NOT EXISTS order_item_index INTEGER;

CREATE OR REPLACE FUNCTION public.fn_purchase_receipts_autoria()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF auth.uid() IS NOT NULL THEN
        NEW.received_by := auth.uid();
        NEW.origem := 'APP';
    END IF;
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_purchase_receipts_autoria() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_purchase_receipts_autoria ON public.purchase_receipts;
CREATE TRIGGER trg_purchase_receipts_autoria
    BEFORE INSERT ON public.purchase_receipts
    FOR EACH ROW EXECUTE FUNCTION public.fn_purchase_receipts_autoria();
