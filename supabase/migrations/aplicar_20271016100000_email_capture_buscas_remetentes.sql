-- Captura de boletos por e-mail — busca por período filtrada por remetente(s)
--
-- Pedido do usuário em 16/10/2026: "é possivel disparar alem do item 1 tambem
-- definir um remetente especifico ou um conjunto de rementes escolhidos pelo
-- usuario" → "sim". Plano: docs/planos/2026-10-15-captura-boletos-por-email.md.
--
-- Aplicar com: npx supabase db query --linked -f <este arquivo>   (NUNCA db push)
--
-- `remetentes`: NULL/vazio = todos (regra da caixa). Cada item é um e-mail
-- exato (`cobranca@fornecedor.com.br`) ou um domínio (`fornecedor.com.br`,
-- casa também subdomínios). Normalizado pela Edge Function, que é a única que
-- grava esta tabela; até 20 itens.
--
-- REGRA #7: só coluna nova; RLS/grants da tabela não mudam (membro só lê).

SET lock_timeout = '3s';

ALTER TABLE public.email_capture_buscas
    ADD COLUMN IF NOT EXISTS remetentes TEXT[];

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_capture_buscas_remetentes_ck') THEN
        ALTER TABLE public.email_capture_buscas
            ADD CONSTRAINT email_capture_buscas_remetentes_ck
            CHECK (remetentes IS NULL OR cardinality(remetentes) <= 20);
    END IF;
END $$;

COMMENT ON COLUMN public.email_capture_buscas.remetentes IS
    'Filtro de remetentes da busca (e-mails exatos ou domínios, normalizados). NULL = todos, conforme o modo da caixa.';
