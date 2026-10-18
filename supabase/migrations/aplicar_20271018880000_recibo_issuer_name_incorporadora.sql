-- ════════════════════════════════════════════════════════════════════════════
-- Recibos: "Alpa Construtora e Incoporadora" → "Incorporadora" no snapshot.
-- Plano: docs/planos/2026-10-18-recibo-ux-revisao.md (item 4). Escrita no banco
-- autorizada pelo usuário em 18/10/2026.
--
-- `financial_receipts.issuer_name` é CONGELADO na emissão. Os 8 recibos da Alpa
-- (926cf626…) foram emitidos quando o nome da organização ainda tinha o erro; hoje
-- organizations.name e companies (razao_social/nome_fantasia) estão corretos
-- (conferido em 18/10/2026: 0 linhas com "Incoporadora"). O erro saía no cabeçalho
-- e na declaração do papel.
--
-- Só dado, sem função nem policy (REGRA #7 não se aplica). A tabela de reversão
-- nasce fechada: RLS ligada e sem acesso para anon/authenticated.
--
-- Reversão (NÃO apagar a tabela):
--   UPDATE public.financial_receipts r SET issuer_name = v.issuer_name_antes
--     FROM public.recibo_issuer_name_reversao_20271018 v WHERE v.id = r.id;
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE public.recibo_issuer_name_reversao_20271018 AS
SELECT id, issuer_name AS issuer_name_antes
  FROM public.financial_receipts
 WHERE issuer_name = 'Alpa Construtora e Incoporadora';

ALTER TABLE public.recibo_issuer_name_reversao_20271018 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recibo_issuer_name_reversao_20271018 FROM PUBLIC, anon, authenticated;

UPDATE public.financial_receipts r
   SET issuer_name = 'Alpa Construtora e Incorporadora'
  FROM public.recibo_issuer_name_reversao_20271018 v
 WHERE v.id = r.id;

DO $$
DECLARE n_rev int; n_resto int;
BEGIN
    SELECT count(*) INTO n_rev FROM public.recibo_issuer_name_reversao_20271018;
    SELECT count(*) INTO n_resto FROM public.financial_receipts WHERE issuer_name ILIKE '%incoporadora%';
    IF n_resto <> 0 THEN
        RAISE EXCEPTION 'ainda há % recibo(s) com "Incoporadora"', n_resto;
    END IF;
    RAISE NOTICE 'recibos corrigidos: %', n_rev;
END $$;

COMMIT;
