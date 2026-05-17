-- ══════════════════════════════════════════════════════════════════════════════
-- Pacote 2 — PurchaseReceipt: tabelas próprias + recebimento parcial + backfill
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Tabelas ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.purchase_receipts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID        NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status      TEXT        NOT NULL CHECK (status IN ('Recebido', 'Divergência', 'Parcial')),
  notes       TEXT,
  photo_path  TEXT,
  version     INT         NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.purchase_receipt_items (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id        UUID         NOT NULL REFERENCES public.purchase_receipts(id) ON DELETE CASCADE,
  order_item_code   TEXT         NOT NULL,
  description       TEXT         NOT NULL,
  unit              TEXT         NOT NULL DEFAULT '',
  quantity_ordered  NUMERIC(14,4) NOT NULL DEFAULT 0,
  quantity_received NUMERIC(14,4) NOT NULL DEFAULT 0,
  issue             TEXT         CHECK (issue IN ('quebrado', 'faltando')),
  notes             TEXT,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchase_receipts_order_id   ON public.purchase_receipts(order_id);
CREATE INDEX IF NOT EXISTS idx_purchase_receipt_items_receipt ON public.purchase_receipt_items(receipt_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.purchase_receipts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_receipt_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'purchase_receipts' AND policyname = 'authenticated_receipts') THEN
    CREATE POLICY "authenticated_receipts"
      ON public.purchase_receipts FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'purchase_receipt_items' AND policyname = 'authenticated_receipt_items') THEN
    CREATE POLICY "authenticated_receipt_items"
      ON public.purchase_receipt_items FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── Backfill ──────────────────────────────────────────────────────────────────
-- Cria um purchase_receipt para cada pedido com received_at preenchido.
-- Itens: quantidade total pedida como recebida, reduzida pelas divergências.

DO $$
DECLARE
  po_rec    RECORD;
  receipt   RECORD;
  item      JSONB;
  discrep   JSONB;
  code_val  TEXT;
  qty_ord   NUMERIC;
  qty_recv  NUMERIC;
  issue_val TEXT;
BEGIN
  FOR po_rec IN
    SELECT * FROM public.purchase_orders
    WHERE received_at IS NOT NULL
      AND status IN ('Recebido', 'Divergência')
  LOOP
    -- Cria o receipt
    INSERT INTO public.purchase_receipts
      (order_id, received_at, status, notes, photo_path, created_at)
    VALUES (
      po_rec.id,
      po_rec.received_at,
      po_rec.status,
      po_rec.receipt_notes,
      po_rec.receipt_photo_path,
      po_rec.received_at
    )
    RETURNING * INTO receipt;

    -- Cria os itens a partir de purchase_orders.items (JSONB)
    IF po_rec.items IS NOT NULL AND jsonb_array_length(po_rec.items) > 0 THEN
      FOR item IN SELECT value FROM jsonb_array_elements(po_rec.items) LOOP
        code_val  := item->>'code';
        qty_ord   := COALESCE((item->>'quantity')::numeric, 0);
        qty_recv  := qty_ord;
        issue_val := NULL;

        -- Ajusta pela divergência registrada (se houver)
        IF po_rec.discrepancy_report IS NOT NULL
          AND jsonb_array_length(po_rec.discrepancy_report) > 0
        THEN
          FOR discrep IN SELECT value FROM jsonb_array_elements(po_rec.discrepancy_report) LOOP
            IF (discrep->>'code') = code_val THEN
              issue_val := discrep->>'issue';
              qty_recv  := GREATEST(0, qty_ord - COALESCE((discrep->>'quantity')::numeric, 0));
            END IF;
          END LOOP;
        END IF;

        INSERT INTO public.purchase_receipt_items
          (receipt_id, order_item_code, description, unit,
           quantity_ordered, quantity_received, issue)
        VALUES (
          receipt.id,
          code_val,
          COALESCE(item->>'description', ''),
          COALESCE(item->>'unit', ''),
          qty_ord,
          qty_recv,
          issue_val
        );
      END LOOP;
    END IF;
  END LOOP;
END $$;
