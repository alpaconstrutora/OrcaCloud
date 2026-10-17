-- ════════════════════════════════════════════════════════════════════════════
-- Extrato: tira as tags de fechamento que o parser OFX ANTIGO deixou gravadas.
-- Plano: docs/planos/2026-10-17-recibo-extrato-debora.md (item 2).
--
-- Até 05/09/2026 (commit 3723d072) o OFX era lido com `<FITID>(.*)`, que vai até o
-- fim da linha. No OFX do Sicredi cada tag fecha na própria linha, então gravou:
--   external_id      = '13247103932</FITID>'
--   description_raw  = '… (Ref: 13247103932</REFNUM>)'
--   description_normalized = '… MEMO REF 13247103932 REFNUM'
-- ("MEMO" é o resto do `</MEMO>` que a migration 000013 tirou só do description_raw).
-- 4.907 linhas em 2 organizações em 17/10/2026. O parser atual não deixa tag.
--
-- Consequências: o id do banco sujo nunca bate com o mesmo FITID lido limpo, e o
-- "MEMO" entrou em apelido aprendido pela conciliação ("DINHEIRO ATM CE0230099 MEMO").
--
-- `description_normalized` NÃO é recalculado com unaccent: em texto com codificação
-- quebrada ("DÃ©bora") o unaccent troca "©" por "(C)" e o `normalizeText` do app só
-- descarta o símbolo (medido: 27 de 4.907 sairiam diferentes). Tirar as palavras da tag
-- dá exatamente o que o app gravaria — medido em 17/10: nenhuma dessas linhas tem
-- MEMO/REFNUM/FITID como palavra de verdade na descrição.
--
-- Sem colisão no UNIQUE(bank_account_id, external_id) ao limpar (medido: 0).
-- O fingerprint gravado não muda: a importação passou a reconhecer a mesma linha também
-- por conta + data + valor + direção e pelo id do banco (utils/extratoDuplicidade.ts).
--
-- Reversão: UPDATE bank_transactions b SET external_id = r.external_id,
--   description_raw = r.description_raw, description_normalized = r.description_normalized
--   FROM extrato_tags_ofx_reversao_20271017 r WHERE r.id = b.id;
-- A tabela de reversão NÃO deve ser apagada.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.extrato_tags_ofx_reversao_20271017 AS
SELECT id, external_id, description_raw, description_normalized
  FROM public.bank_transactions
 WHERE external_id LIKE '%</%'
    OR description_raw LIKE '%</%'
    OR description_normalized ~ '\m(MEMO|REFNUM|FITID)\M';

ALTER TABLE public.extrato_tags_ofx_reversao_20271017 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.extrato_tags_ofx_reversao_20271017 FROM PUBLIC, anon, authenticated;

UPDATE public.bank_transactions b
   SET external_id = NULLIF(btrim(regexp_replace(b.external_id, '\s*</[A-Za-z0-9_.]+>\s*', '', 'g')), ''),
       description_raw = regexp_replace(b.description_raw, '\s*</[A-Za-z0-9_.]+>', '', 'g'),
       description_normalized = btrim(regexp_replace(
           regexp_replace(b.description_normalized, '\m(MEMO|REFNUM|FITID)\M', ' ', 'g'),
           '\s+', ' ', 'g'))
  FROM public.extrato_tags_ofx_reversao_20271017 r
 WHERE r.id = b.id;

DO $$
DECLARE n int;
BEGIN
    SELECT count(*) INTO n FROM public.bank_transactions
     WHERE external_id LIKE '%</%' OR description_raw LIKE '%</%'
        OR description_normalized ~ '\m(MEMO|REFNUM|FITID)\M';
    IF n <> 0 THEN
        RAISE EXCEPTION 'Sobraram % linhas com tag de OFX', n;
    END IF;
END $$;

COMMIT;
