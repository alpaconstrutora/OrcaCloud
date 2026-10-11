-- ============================================================================
-- Pós-Obra & Garantia ↔ Suprimentos: vínculo do chamado com SC, pedido, contrato
-- OrçaCloud SaaS · aplicar_20271011000600
-- Plano: docs/planos/2026-10-11-pos-obra-garantia-conexao-suprimentos.md (Fases 1 e 2)
--
-- Pedido (2026-10-11): "ao abrir um chamado pode ser que a execucao gere
-- necessidade de compra de algum material ou contracao de algum servico que
-- sera feito via suprimentos (cotacao, pedido, contrato)".
--
-- Até aqui nenhuma tabela de Suprimentos tinha coluna de origem. Esta
-- migration acrescenta:
--   PARTE 1 — purchase_requests.warranty_claim_id e contracts.warranty_claim_id
--   PARTE 2 — purchase_orders.quotation_request_id (selectWinner criava o pedido
--             sem dizer de qual cotação — pedido que passava por cotação ficava
--             invisível para quem segue a cadeia a partir da SC)
--   PARTE 3 — travas de organização (a FK sozinha aceita id de outro tenant)
--   PARTE 4 — evento `ProcurementLinked` no chamado, para qualquer porta de entrada
--
-- `fn_purchase_requests_guard` NÃO é tocado: ele congela uma lista explícita
-- de colunas e o vínculo fica de fora dela de propósito.
--
-- Aplicar com:  npx supabase db query --linked -f <este arquivo>
-- NUNCA `supabase db push` (histórico de migrations furado — ver CLAUDE.md).
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ────────────────────────────────────────────────────────────────────────────
-- PARTE 1 e 2 — colunas, FKs, índices
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS warranty_claim_id UUID;
ALTER TABLE public.contracts         ADD COLUMN IF NOT EXISTS warranty_claim_id UUID;
ALTER TABLE public.purchase_orders   ADD COLUMN IF NOT EXISTS quotation_request_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_requests_warranty_claim_id_fkey') THEN
    ALTER TABLE public.purchase_requests
      ADD CONSTRAINT purchase_requests_warranty_claim_id_fkey
      FOREIGN KEY (warranty_claim_id) REFERENCES public.warranty_claims(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contracts_warranty_claim_id_fkey') THEN
    ALTER TABLE public.contracts
      ADD CONSTRAINT contracts_warranty_claim_id_fkey
      FOREIGN KEY (warranty_claim_id) REFERENCES public.warranty_claims(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_orders_quotation_request_id_fkey') THEN
    ALTER TABLE public.purchase_orders
      ADD CONSTRAINT purchase_orders_quotation_request_id_fkey
      FOREIGN KEY (quotation_request_id) REFERENCES public.quotation_requests(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_purchase_requests_warranty_claim
  ON public.purchase_requests(warranty_claim_id) WHERE warranty_claim_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contracts_warranty_claim
  ON public.contracts(warranty_claim_id) WHERE warranty_claim_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_purchase_orders_quotation_request
  ON public.purchase_orders(quotation_request_id) WHERE quotation_request_id IS NOT NULL;

COMMENT ON COLUMN public.purchase_requests.warranty_claim_id IS
  'Chamado de Pós-Obra & Garantia que originou a solicitação (aplicar_20271011000600).';
COMMENT ON COLUMN public.contracts.warranty_claim_id IS
  'Chamado de Pós-Obra & Garantia que originou o contrato (aplicar_20271011000600).';
COMMENT ON COLUMN public.purchase_orders.quotation_request_id IS
  'Cotação que gerou este pedido (quotationService.selectWinner).';

-- ────────────────────────────────────────────────────────────────────────────
-- PARTE 3 — travas de organização
-- ────────────────────────────────────────────────────────────────────────────

-- O chamado tem de ser da MESMA organização da SC/contrato. A SC herda a org
-- da obra; um chamado cuja obra é de outra org (já aconteceu — memória
-- project_warranty_project_id_cross_org) não pode gerar compra em outro tenant.
CREATE OR REPLACE FUNCTION public.fn_guard_warranty_claim_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.warranty_claim_id IS NOT NULL AND (
       TG_OP = 'INSERT'
    OR NEW.warranty_claim_id IS DISTINCT FROM OLD.warranty_claim_id
    OR NEW.organization_id   IS DISTINCT FROM OLD.organization_id
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.warranty_claims
       WHERE id = NEW.warranty_claim_id AND organization_id = NEW.organization_id
    ) THEN
      RAISE EXCEPTION 'O chamado de garantia não pertence à organização % — a obra é de outra organização.',
        CASE TG_TABLE_NAME WHEN 'contracts' THEN 'deste contrato' ELSE 'desta solicitação de compra' END
        USING ERRCODE = 'P0004';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_requests_warranty_link ON public.purchase_requests;
CREATE TRIGGER trg_purchase_requests_warranty_link
  BEFORE INSERT OR UPDATE OF warranty_claim_id, organization_id ON public.purchase_requests
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_warranty_claim_link();

DROP TRIGGER IF EXISTS trg_contracts_warranty_link ON public.contracts;
CREATE TRIGGER trg_contracts_warranty_link
  BEFORE INSERT OR UPDATE OF warranty_claim_id, organization_id ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_warranty_claim_link();

-- Pedido e cotação são da mesma organização (ambos sem org própria confiável:
-- a org vem da obra, como na policy po_select_org).
CREATE OR REPLACE FUNCTION public.fn_guard_purchase_order_quotation_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.quotation_request_id IS NOT NULL AND (
       TG_OP = 'INSERT' OR NEW.quotation_request_id IS DISTINCT FROM OLD.quotation_request_id
  ) THEN
    IF NOT EXISTS (
      SELECT 1
        FROM public.quotation_requests q
        JOIN public.projects pq ON pq.id = q.project_id
        JOIN public.projects po ON po.id = NEW.project_id
       WHERE q.id = NEW.quotation_request_id
         AND pq.organization_id = po.organization_id
    ) THEN
      RAISE EXCEPTION 'A cotação não é da mesma organização da obra deste pedido.'
        USING ERRCODE = 'P0004';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_orders_quotation_link ON public.purchase_orders;
CREATE TRIGGER trg_purchase_orders_quotation_link
  BEFORE INSERT OR UPDATE OF quotation_request_id ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_purchase_order_quotation_link();

-- ────────────────────────────────────────────────────────────────────────────
-- PARTE 4 — evento no chamado (qualquer porta de entrada)
-- ────────────────────────────────────────────────────────────────────────────

-- AFTER: só registra o que já passou pela trava. Não incrementa a versão do
-- chamado (o vínculo é do outro lado), usa a versão atual como referência.
CREATE OR REPLACE FUNCTION public.fn_log_warranty_procurement_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_version INT;
BEGIN
  IF NEW.warranty_claim_id IS NOT NULL AND (
       TG_OP = 'INSERT' OR NEW.warranty_claim_id IS DISTINCT FROM OLD.warranty_claim_id
  ) THEN
    SELECT version INTO v_version FROM public.warranty_claims WHERE id = NEW.warranty_claim_id;
    INSERT INTO public.warranty_claim_events (
      organization_id, claim_id, event_type, payload, aggregate_version
    ) VALUES (
      NEW.organization_id, NEW.warranty_claim_id, 'ProcurementLinked',
      jsonb_build_object(
        'tipo',   CASE TG_TABLE_NAME WHEN 'contracts' THEN 'contrato' ELSE 'solicitacao' END,
        'id',     NEW.id,
        'number', NEW.number,
        'title',  NEW.title,
        'actor',  jsonb_build_object('actorId', auth.uid(), 'actorType', 'user',
                                     'name', COALESCE(auth.jwt() ->> 'email', 'sistema'))
      ),
      COALESCE(v_version, 1)
    );
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_requests_warranty_log ON public.purchase_requests;
CREATE TRIGGER trg_purchase_requests_warranty_log
  AFTER INSERT OR UPDATE OF warranty_claim_id ON public.purchase_requests
  FOR EACH ROW EXECUTE FUNCTION public.fn_log_warranty_procurement_link();

DROP TRIGGER IF EXISTS trg_contracts_warranty_log ON public.contracts;
CREATE TRIGGER trg_contracts_warranty_log
  AFTER INSERT OR UPDATE OF warranty_claim_id ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.fn_log_warranty_procurement_link();

-- REGRA #7 — funções de gatilho não precisam de EXECUTE para disparar.
REVOKE ALL ON FUNCTION public.fn_guard_warranty_claim_link() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_guard_purchase_order_quotation_link() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_log_warranty_procurement_link() FROM PUBLIC, anon;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ────────────────────────────────────────────────────────────────────────────
-- Verificação (rodar DEPOIS, numa execução separada):
--   SELECT column_name, table_name FROM information_schema.columns
--    WHERE column_name IN ('warranty_claim_id','quotation_request_id');
--   SELECT tgname, tgrelid::regclass FROM pg_trigger WHERE tgname LIKE 'trg_%warranty%'
--      OR tgname = 'trg_purchase_orders_quotation_link';
-- ────────────────────────────────────────────────────────────────────────────
