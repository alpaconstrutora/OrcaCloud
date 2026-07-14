-- Migration: Fase 8.2/8.4 — SST como condicionante + Fiscal parametrizado
-- Cl.13, Anexo VI, Manual §16 / Cl.17, Manual §15 — PLANO_MODULO_CONTRATOS_GAPS.md
--
-- Não recria gestão de SST nem o motor Fiscal (ambos módulos à parte). Aqui
-- só adiciona metadados leves: marca documentos SST-críticos na Matriz
-- Documental já existente (Fase 6.4) com prazo de comunicação, e um campo de
-- classificação fiscal no contrato para o módulo Fiscal usar como referência
-- (em vez de taxa fixa cadastrada aqui — Manual §15.2).

ALTER TABLE public.contract_document_requirements
    ADD COLUMN IF NOT EXISTS is_sst_critical         BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS communication_deadline_hours SMALLINT;  -- ex.: 24h para risco grave/acidente (Anexo VI)

ALTER TABLE public.contracts
    ADD COLUMN IF NOT EXISTS fiscal_classification TEXT;  -- enquadramento indicado ao módulo Fiscal (Cl.17.2)
