-- ÒPURA Pro — recebimento do serviço (14/11/2026, passo 2 da crítica de design).
-- Plano: docs/planos/2026-11-14-opura-pro-critica.md
--
-- "Concluído" é sobre o TRABALHO; "pago" é sobre o DINHEIRO. Por isso o recebimento
-- é um eixo próprio (duas colunas), e não um 5º valor em pro_servicos.status: assim
-- nenhum filtro que hoje estreita por status (=== 'CONCLUIDO') muda de sentido.
-- O QR do Pix é estático — o app não fica sabendo do pagamento; quem marca é o
-- profissional ("Recebi"), escolhendo a forma.
--
-- Sem policy nova: pro_servicos_user_access (FOR ALL, pelo dono do orçamento) já
-- cobre as colunas novas. Idempotente: pode ser reaplicada.
-- Aplicar com: npx supabase db query --linked -f <este arquivo>   (nunca db push)

ALTER TABLE public.pro_servicos
  ADD COLUMN IF NOT EXISTS concluido_em timestamptz,
  ADD COLUMN IF NOT EXISTS pago_em timestamptz,
  ADD COLUMN IF NOT EXISTS forma_pagamento text;

-- "Aguardando pagamento há N dias" precisa saber QUANDO concluiu. Os já concluídos
-- recebem a melhor data disponível (assinatura > agendamento > criação).
UPDATE public.pro_servicos
   SET concluido_em = COALESCE(assinatura_data, data_agendamento, created_at)
 WHERE status = 'CONCLUIDO' AND concluido_em IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.pro_servicos'::regclass
      AND conname = 'pro_servicos_forma_pagamento_check'
  ) THEN
    ALTER TABLE public.pro_servicos
      ADD CONSTRAINT pro_servicos_forma_pagamento_check
      CHECK (forma_pagamento IS NULL OR forma_pagamento IN ('PIX', 'DINHEIRO', 'CARTAO', 'TRANSFERENCIA'));
  END IF;

  -- Recebido tem data E forma; não recebido não tem nenhuma das duas.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.pro_servicos'::regclass
      AND conname = 'pro_servicos_recebimento_completo_check'
  ) THEN
    ALTER TABLE public.pro_servicos
      ADD CONSTRAINT pro_servicos_recebimento_completo_check
      CHECK ((pago_em IS NULL) = (forma_pagamento IS NULL));
  END IF;
END $$;

COMMENT ON COLUMN public.pro_servicos.concluido_em IS
  'Quando o serviço passou a CONCLUIDO (gravado pelo app ao finalizar).';
COMMENT ON COLUMN public.pro_servicos.pago_em IS
  'Quando o profissional marcou "Recebi" (ÒPURA Pro). NULL = ainda não recebido. Independe de status.';
COMMENT ON COLUMN public.pro_servicos.forma_pagamento IS
  'PIX | DINHEIRO | CARTAO | TRANSFERENCIA — preenchida junto com pago_em.';
