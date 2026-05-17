-- ══════════════════════════════════════════════════════════════════════════════
-- Pacote 4 — NotificationLog: auditoria centralizada de email/webhook/whatsapp
-- por pedido de compra.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.notification_log (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   UUID         REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  channel    TEXT         NOT NULL CHECK (channel IN ('email', 'webhook', 'whatsapp')),
  recipient  TEXT,
  subject    TEXT,
  body       TEXT,
  status     TEXT         NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'pending')),
  error      TEXT,
  metadata   JSONB,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_log_order_id ON public.notification_log(order_id);

ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notification_log' AND policyname = 'authenticated_notification_log') THEN
    CREATE POLICY "authenticated_notification_log"
      ON public.notification_log FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;
