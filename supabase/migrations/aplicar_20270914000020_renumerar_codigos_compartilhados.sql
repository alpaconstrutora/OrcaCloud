-- ==========================================================================
-- Fase 2b — devolver `code` aos fornecedores compartilhados
-- ==========================================================================
-- Plano: docs/planos/2026-08-28-organization-id-dono-explicito-e-compartilhamento.md
--
-- CONTEXTO
-- A Fase 2 (`aplicar_20270914000019`) deu dono (Alpa) aos 119 fornecedores
-- compartilhados. Como todos vinham do mesmo espaço de numeração (o do
-- `organization_id` nulo), 83 dos 119 colidiram com códigos que a Alpa já usava
-- e tiveram `code` zerado pelo índice único `(organization_id, code)`.
--
-- Zerar era o certo para não travar a migration, mas deixar 83 cadastros sem
-- código é uma lacuna visível na tela — a migration `20270132000000` dizia que
-- "o dono renumera pela UI depois", o que com 83 linhas não é razoável.
--
-- Esta migration renumera usando a MESMA regra da função que o app chama
-- (`get_next_supplier_code`): maior código numérico da organização + 1, com
-- LPAD(3). Faz numa passada só, com `row_number()`, em vez de 83 chamadas.
--
-- Escopo: `is_shared AND code IS NULL` na Alpa — exatamente as linhas afetadas.
-- Ordena por nome para a numeração sair estável e previsível.
--
-- ⚠️ APLICAR À MÃO — NUNCA `supabase db push`.
-- ==========================================================================

SET lock_timeout = '5s';

WITH base AS (
  SELECT COALESCE(MAX(CAST(code AS INTEGER)), 0) AS maior
    FROM public.suppliers
   WHERE organization_id = '926cf626-ba49-4ee4-9f35-472822fb90e6'
     AND code IS NOT NULL
     AND code ~ '^\d+$'
), alvo AS (
  SELECT id, row_number() OVER (ORDER BY name, id) AS n
    FROM public.suppliers
   WHERE organization_id = '926cf626-ba49-4ee4-9f35-472822fb90e6'
     AND is_shared
     AND code IS NULL
)
UPDATE public.suppliers s
   SET code = LPAD(((SELECT maior FROM base) + a.n)::text, 3, '0')
  FROM alvo a
 WHERE s.id = a.id;

-- ==========================================================================
-- CONFERÊNCIA
-- ==========================================================================

-- 1. Nenhum fornecedor da Alpa sem código. Esperado: 0
-- SELECT count(*) FROM public.suppliers
--  WHERE organization_id = '926cf626-ba49-4ee4-9f35-472822fb90e6' AND code IS NULL;

-- 2. Nenhum código duplicado na organização. Esperado: 0 linhas
-- SELECT code, count(*) FROM public.suppliers
--  WHERE organization_id = '926cf626-ba49-4ee4-9f35-472822fb90e6' AND code IS NOT NULL
--  GROUP BY code HAVING count(*) > 1;

-- ==========================================================================
-- FIM: aplicar_20270914000020_renumerar_codigos_compartilhados.sql
-- ==========================================================================
