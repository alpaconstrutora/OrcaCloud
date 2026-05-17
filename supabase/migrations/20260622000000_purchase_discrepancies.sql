-- ══════════════════════════════════════════════════════════════════════════════
-- Pacote 3 — PurchaseDiscrepancy: tabela com workflow de resolução
-- Substitui o JSONB discrepancy_report por registros rastreáveis.
-- Status workflow: Pendente → Resolvida | Aceita | Devolvida
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.purchase_discrepancies (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         UUID         NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  receipt_id       UUID         REFERENCES public.purchase_receipts(id) ON DELETE SET NULL,
  order_item_code  TEXT         NOT NULL,
  description      TEXT         NOT NULL,
  unit             TEXT         NOT NULL DEFAULT '',
  issue            TEXT         NOT NULL CHECK (issue IN ('quebrado', 'faltando')),
  quantity         NUMERIC(14,4) NOT NULL DEFAULT 0,
  notes            TEXT,
  status           TEXT         NOT NULL DEFAULT 'Pendente'
                                CHECK (status IN ('Pendente', 'Resolvida', 'Aceita', 'Devolvida')),
  resolution_notes TEXT,
  resolved_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchase_discrepancies_order_id   ON public.purchase_discrepancies(order_id);
CREATE INDEX IF NOT EXISTS idx_purchase_discrepancies_receipt_id ON public.purchase_discrepancies(receipt_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.purchase_discrepancies ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'purchase_discrepancies' AND policyname = 'authenticated_discrepancies') THEN
    CREATE POLICY "authenticated_discrepancies"
      ON public.purchase_discrepancies FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── Backfill ──────────────────────────────────────────────────────────────────
-- Popula a partir do JSONB discrepancy_report em purchase_orders,
-- vinculando ao purchase_receipt mais recente quando disponível.

DO $$
DECLARE
  po_rec    RECORD;
  discrep   JSONB;
  receipt   RECORD;
BEGIN
  FOR po_rec IN
    SELECT * FROM public.purchase_orders
    WHERE discrepancy_report IS NOT NULL
      AND jsonb_array_length(discrepancy_report) > 0
      AND status = 'Divergência'
  LOOP
    -- Busca o receipt mais recente para este pedido
    SELECT id INTO receipt
    FROM public.purchase_receipts
    WHERE order_id = po_rec.id
    ORDER BY created_at DESC
    LIMIT 1;

    FOR discrep IN SELECT value FROM jsonb_array_elements(po_rec.discrepancy_report) LOOP
      INSERT INTO public.purchase_discrepancies
        (order_id, receipt_id, order_item_code, description, unit, issue, quantity, notes, status)
      VALUES (
        po_rec.id,
        receipt.id,
        COALESCE(discrep->>'code', ''),
        COALESCE(discrep->>'description', ''),
        COALESCE(discrep->>'unit', ''),
        COALESCE(discrep->>'issue', 'faltando'),
        COALESCE((discrep->>'quantity')::numeric, 0),
        discrep->>'notes',
        'Pendente'
      );
    END LOOP;
  END LOOP;
END $$;
