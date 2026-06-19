-- ============================================================
-- Fase 5 — Cobrança Automatizada (Régua de Dunning)
-- OrçaCloud SaaS · Migration 20261118000010
-- ============================================================

-- ── 1. Adiciona party_email em internal_transactions ─────────
-- Permite armazenar e-mail do cliente direto no título para
-- que a régua de cobrança não precise fazer lookup externo.
ALTER TABLE public.internal_transactions
    ADD COLUMN IF NOT EXISTS party_email TEXT;

-- ── 2. dunning_rules — régua de cobrança configurável ────────
CREATE TABLE IF NOT EXISTS public.dunning_rules (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name             TEXT        NOT NULL,
    days_offset      INT         NOT NULL,   -- negativo = antes do vencimento, positivo = depois
    trigger_hour     INT         NOT NULL DEFAULT 9 CHECK (trigger_hour BETWEEN 0 AND 23),
    channel          TEXT        NOT NULL DEFAULT 'email' CHECK (channel IN ('email')),
    subject_template TEXT        NOT NULL DEFAULT 'Lembrete de vencimento — {{descricao}}',
    body_template    TEXT        NOT NULL DEFAULT
        'Olá {{nome}},<br><br>Este é um lembrete sobre a parcela <strong>{{descricao}}</strong> no valor de <strong>{{valor}}</strong> com vencimento em <strong>{{vencimento}}</strong>.<br><br>Qualquer dúvida, entre em contato conosco.<br><br>Att,<br>Equipe ORÇACLOUD',
    is_active        BOOLEAN     NOT NULL DEFAULT true,
    sort_order       INT         NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dunning_rules_org
    ON public.dunning_rules (organization_id)
    WHERE is_active = true;

ALTER TABLE public.dunning_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY dunning_rules_all ON public.dunning_rules
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = dunning_rules.organization_id
        AND (
          (om.user_id IS NOT NULL AND om.user_id = auth.uid())
          OR (om.user_id IS NULL AND LOWER(om.email) = LOWER(auth.jwt() ->> 'email'))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = dunning_rules.organization_id
        AND (
          (om.user_id IS NOT NULL AND om.user_id = auth.uid())
          OR (om.user_id IS NULL AND LOWER(om.email) = LOWER(auth.jwt() ->> 'email'))
        )
    )
  );

CREATE OR REPLACE FUNCTION public.trg_dunning_rules_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_dr_updated_at ON public.dunning_rules;
CREATE TRIGGER trg_dr_updated_at
    BEFORE UPDATE ON public.dunning_rules
    FOR EACH ROW EXECUTE FUNCTION public.trg_dunning_rules_updated_at();


-- ── 3. dunning_events — log de disparos ──────────────────────
CREATE TABLE IF NOT EXISTS public.dunning_events (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    transaction_id    UUID        NOT NULL REFERENCES public.internal_transactions(id) ON DELETE CASCADE,
    rule_id           UUID        NOT NULL REFERENCES public.dunning_rules(id) ON DELETE CASCADE,
    channel           TEXT        NOT NULL DEFAULT 'email',
    recipient_email   TEXT,
    party_name        TEXT,
    amount            NUMERIC(15,2),
    due_date          DATE,
    status            TEXT        NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','failed','skipped')),
    error_message     TEXT,
    sent_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (transaction_id, rule_id)   -- um disparo por título por regra
);

CREATE INDEX IF NOT EXISTS idx_dunning_events_org
    ON public.dunning_events (organization_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_dunning_events_tx
    ON public.dunning_events (transaction_id);

ALTER TABLE public.dunning_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY dunning_events_select ON public.dunning_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = dunning_events.organization_id
        AND (
          (om.user_id IS NOT NULL AND om.user_id = auth.uid())
          OR (om.user_id IS NULL AND LOWER(om.email) = LOWER(auth.jwt() ->> 'email'))
        )
    )
  );

-- Eventos são criados apenas pela Edge Function (service_role → bypass RLS)
-- Mas admins podem deletar para limpar histórico
CREATE POLICY dunning_events_delete ON public.dunning_events
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = dunning_events.organization_id
        AND (
          (om.user_id IS NOT NULL AND om.user_id = auth.uid())
          OR (om.user_id IS NULL AND LOWER(om.email) = LOWER(auth.jwt() ->> 'email'))
        )
    )
  );

-- ────────────────────────────────────────────────────────────
-- FIM: 20261118000010_dunning.sql
-- ────────────────────────────────────────────────────────────
