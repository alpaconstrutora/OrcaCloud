-- Proveniência da leitura de matrícula por IA nos itens de Due Diligence.
-- A IA PRÉ-PREENCHE os itens (nunca marca "conforme"); os campos abaixo guardam
-- de onde veio a sugestão para o jurídico validar. Ver princípio: IA é apoio, RT decide.
-- Date: 2027-07-17

ALTER TABLE public.due_diligence_items
    ADD COLUMN IF NOT EXISTS ai_extracted        boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS ai_confidence       numeric,          -- 0..1, confiança da extração
    ADD COLUMN IF NOT EXISTS ai_source_excerpt   text,             -- trecho literal da matrícula que originou o item
    ADD COLUMN IF NOT EXISTS ai_extracted_at     timestamptz;

CREATE INDEX IF NOT EXISTS idx_dd_items_ai_extracted ON public.due_diligence_items(ai_extracted) WHERE ai_extracted;
