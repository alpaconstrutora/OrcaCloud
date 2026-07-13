-- Migration: Fase 5.4 — Identificação da obra no contrato (CNO/gestor/fiscal)
-- Contrato Matriz CP-02 — PLANO_MODULO_CONTRATOS_GAPS.md

ALTER TABLE public.contracts
    ADD COLUMN IF NOT EXISTS cno                 TEXT,   -- CNO / matrícula da obra (Receita Federal)
    ADD COLUMN IF NOT EXISTS obra_registration    TEXT,   -- matrícula/registro alternativo
    ADD COLUMN IF NOT EXISTS manager_name         TEXT,   -- gestor da obra (CP-02)
    ADD COLUMN IF NOT EXISTS inspector_name       TEXT;   -- fiscal do contrato (CP-02)
