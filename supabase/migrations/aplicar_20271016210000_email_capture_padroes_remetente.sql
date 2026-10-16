-- Captura de boletos por e-mail — padrões do boleto por remetente monitorado
--
-- Pedido do usuário em 16/10/2026 (literal no plano): "Ao cadastrar o e-mail do
-- remetende, criar campo para cadastrar também os dados para cadastro do boleto
-- (cards Cobrança, Quem recebe, Classificação e Observações".
-- Plano: docs/planos/2026-10-16-captura-padroes-do-remetente.md.
--
-- Aplicar com: npx supabase db query --linked -f <este arquivo>   (NUNCA db push) — rodar 2×.
-- Depende de: aplicar_20271015110000_email_capture_tabelas.sql e
--             aplicar_20271015120000_email_capture_senha_pdf.sql (grants por coluna).
--
-- O padrão SÓ preenche campo que o PDF não trouxe (utils/emailCaptureRegras.ts ›
-- aplicarPadroesDoRemetente) — a regra mora no código; aqui só os dados e as travas.
--
-- REGRA #7: nenhuma policy nova. Função de gatilho SECURITY INVOKER — mesmo assim
-- com REVOKE literal (gatilho não precisa de EXECUTE para disparar).
-- ⚠️ Grants SÓ ADITIVOS: `REVOKE ... ON TABLE` revogaria também os grants por
-- coluna que a migration da senha de PDF já concedeu.

SET lock_timeout = '3s';

ALTER TABLE public.email_capture_senders
    ADD COLUMN IF NOT EXISTS padrao_descricao          TEXT,
    ADD COLUMN IF NOT EXISTS padrao_observacoes        TEXT,
    ADD COLUMN IF NOT EXISTS padrao_project_id         UUID,
    ADD COLUMN IF NOT EXISTS padrao_cost_center_id     UUID,
    ADD COLUMN IF NOT EXISTS padrao_plano_de_contas_id UUID,
    ADD COLUMN IF NOT EXISTS padrao_category_id        UUID,
    ADD COLUMN IF NOT EXISTS padrao_dia_vencimento     SMALLINT,
    ADD COLUMN IF NOT EXISTS padrao_valor              NUMERIC(15,2),
    ADD COLUMN IF NOT EXISTS padrao_multa              NUMERIC(15,2),
    ADD COLUMN IF NOT EXISTS padrao_multa_percentual   NUMERIC(8,4),
    ADD COLUMN IF NOT EXISTS padrao_juros_dia          NUMERIC(8,4),
    ADD COLUMN IF NOT EXISTS padrao_juros_dia_tipo     TEXT;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_capture_senders_padrao_obra_fk') THEN
        ALTER TABLE public.email_capture_senders ADD CONSTRAINT email_capture_senders_padrao_obra_fk
            FOREIGN KEY (padrao_project_id) REFERENCES public.projects(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_capture_senders_padrao_cc_fk') THEN
        ALTER TABLE public.email_capture_senders ADD CONSTRAINT email_capture_senders_padrao_cc_fk
            FOREIGN KEY (padrao_cost_center_id) REFERENCES public.cost_centers_v2(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_capture_senders_padrao_plano_fk') THEN
        ALTER TABLE public.email_capture_senders ADD CONSTRAINT email_capture_senders_padrao_plano_fk
            FOREIGN KEY (padrao_plano_de_contas_id) REFERENCES public.plano_de_contas(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_capture_senders_padrao_conta_fk') THEN
        ALTER TABLE public.email_capture_senders ADD CONSTRAINT email_capture_senders_padrao_conta_fk
            FOREIGN KEY (padrao_category_id) REFERENCES public.financial_categories(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_capture_senders_padrao_dia_ck') THEN
        ALTER TABLE public.email_capture_senders ADD CONSTRAINT email_capture_senders_padrao_dia_ck
            CHECK (padrao_dia_vencimento IS NULL OR padrao_dia_vencimento BETWEEN 1 AND 31);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_capture_senders_padrao_valor_ck') THEN
        ALTER TABLE public.email_capture_senders ADD CONSTRAINT email_capture_senders_padrao_valor_ck
            CHECK (padrao_valor IS NULL OR padrao_valor > 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_capture_senders_padrao_multa_ck') THEN
        ALTER TABLE public.email_capture_senders ADD CONSTRAINT email_capture_senders_padrao_multa_ck
            CHECK ((padrao_multa IS NULL OR padrao_multa >= 0)
               AND (padrao_multa_percentual IS NULL OR padrao_multa_percentual BETWEEN 0 AND 100)
               AND (padrao_multa IS NULL OR padrao_multa_percentual IS NULL));   -- R$ OU %, não os dois
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_capture_senders_padrao_juros_ck') THEN
        ALTER TABLE public.email_capture_senders ADD CONSTRAINT email_capture_senders_padrao_juros_ck
            CHECK ((padrao_juros_dia IS NULL OR padrao_juros_dia >= 0)
               AND (padrao_juros_dia_tipo IS NULL OR padrao_juros_dia_tipo IN ('valor', 'percentual'))
               AND (padrao_juros_dia IS NULL OR padrao_juros_dia_tipo IS NOT NULL));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_capture_senders_padrao_textos_ck') THEN
        ALTER TABLE public.email_capture_senders ADD CONSTRAINT email_capture_senders_padrao_textos_ck
            CHECK ((padrao_descricao IS NULL OR char_length(padrao_descricao) <= 200)
               AND (padrao_observacoes IS NULL OR char_length(padrao_observacoes) <= 2000));
    END IF;
END $$;

-- Os ids padrão têm de ser da MESMA organização do remetente (= org da caixa).
-- A FK só garante que existem. A Edge Function grava boletos como service_role
-- (sem RLS), então a trava tem de estar no cadastro do padrão.
-- Gatilho separado do de fornecedor (fn_email_capture_sender_fornecedor_da_org),
-- que fica intacto.
CREATE OR REPLACE FUNCTION public.fn_email_capture_sender_padroes_da_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.padrao_project_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.projects p
         WHERE p.id = NEW.padrao_project_id
           AND p.organization_id = NEW.organization_id
           AND coalesce(p.settings->>'isSystemProject', 'false') <> 'true'
           AND p.name <> 'Gestão Comercial')
    THEN
        RAISE EXCEPTION 'A obra padrão não é da organização da caixa deste remetente.'
            USING ERRCODE = '23503', DETAIL = 'padrao_project_id=' || NEW.padrao_project_id;
    END IF;
    IF NEW.padrao_cost_center_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.cost_centers_v2 c
         WHERE c.id = NEW.padrao_cost_center_id AND c.organization_id = NEW.organization_id)
    THEN
        RAISE EXCEPTION 'O centro de custo padrão não é da organização da caixa deste remetente.'
            USING ERRCODE = '23503', DETAIL = 'padrao_cost_center_id=' || NEW.padrao_cost_center_id;
    END IF;
    IF NEW.padrao_plano_de_contas_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.plano_de_contas pc
         WHERE pc.id = NEW.padrao_plano_de_contas_id AND pc.organization_id = NEW.organization_id)
    THEN
        RAISE EXCEPTION 'O plano de contas padrão não é da organização da caixa deste remetente.'
            USING ERRCODE = '23503', DETAIL = 'padrao_plano_de_contas_id=' || NEW.padrao_plano_de_contas_id;
    END IF;
    IF NEW.padrao_category_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.financial_categories fc
         WHERE fc.id = NEW.padrao_category_id
           AND (fc.organization_id IS NULL OR fc.organization_id = NEW.organization_id))
    THEN
        RAISE EXCEPTION 'A conta financeira padrão não é da organização da caixa deste remetente.'
            USING ERRCODE = '23503', DETAIL = 'padrao_category_id=' || NEW.padrao_category_id;
    END IF;
    RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_email_capture_sender_padroes_da_org() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_email_capture_sender_padroes_da_org ON public.email_capture_senders;
CREATE TRIGGER trg_email_capture_sender_padroes_da_org
    BEFORE INSERT OR UPDATE ON public.email_capture_senders
    FOR EACH ROW EXECUTE FUNCTION public.fn_email_capture_sender_padroes_da_org();

-- Grants por coluna, só ADITIVOS (as colunas antigas continuam como estavam).
GRANT INSERT (padrao_descricao, padrao_observacoes, padrao_project_id, padrao_cost_center_id,
              padrao_plano_de_contas_id, padrao_category_id, padrao_dia_vencimento, padrao_valor,
              padrao_multa, padrao_multa_percentual, padrao_juros_dia, padrao_juros_dia_tipo)
    ON TABLE public.email_capture_senders TO authenticated;
GRANT UPDATE (padrao_descricao, padrao_observacoes, padrao_project_id, padrao_cost_center_id,
              padrao_plano_de_contas_id, padrao_category_id, padrao_dia_vencimento, padrao_valor,
              padrao_multa, padrao_multa_percentual, padrao_juros_dia, padrao_juros_dia_tipo)
    ON TABLE public.email_capture_senders TO authenticated;

COMMENT ON COLUMN public.email_capture_senders.padrao_dia_vencimento IS
    'Dia do vencimento quando o PDF não traz a data: o próximo dia N a partir da data do e-mail (mês sem o dia → último dia).';
COMMENT ON COLUMN public.email_capture_senders.padrao_descricao IS
    'Descrição do boleto quando vazia; "{mês}" vira MM/AAAA do vencimento.';
COMMENT ON COLUMN public.email_capture_senders.padrao_valor IS
    'Valor fixo quando o PDF não traz valor (ou traz zero). Boleto continua em revisão.';

NOTIFY pgrst, 'reload schema';

-- Verificação embutida
DO $$
BEGIN
    IF NOT has_column_privilege('authenticated', 'public.email_capture_senders', 'padrao_valor', 'UPDATE')
       OR NOT has_column_privilege('authenticated', 'public.email_capture_senders', 'padrao_valor', 'INSERT')
       OR NOT has_column_privilege('authenticated', 'public.email_capture_senders', 'nome', 'UPDATE')
       OR NOT has_column_privilege('authenticated', 'public.email_capture_senders', 'nome', 'INSERT') THEN
        RAISE EXCEPTION 'grants por coluna do remetente incompletos';
    END IF;
    IF has_column_privilege('authenticated', 'public.email_capture_senders', 'pdf_senha_atualizada_em', 'UPDATE') THEN
        RAISE EXCEPTION 'authenticated grava pdf_senha_atualizada_em direto';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_email_capture_sender_padroes_da_org') THEN
        RAISE EXCEPTION 'gatilho de organização dos padrões ausente';
    END IF;
    RAISE NOTICE 'OK: padrões do remetente com trava de organização.';
END $$;
