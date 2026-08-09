-- ============================================================================
-- Contas a Pagar — Credor mostrando cabeçalho de ficha de compensação em vez
-- do nome do beneficiário
--
-- CAUSA (utils/boletoParser.ts, extractFromPdfFile): a extração de texto do
-- PDF (pdf.js) não preserva a ordem visual do layout. Em várias fichas de
-- compensação, o texto que fica "colado" logo depois do rótulo
-- "Beneficiário"/"Cedente" não é o nome — é o cabeçalho da tabela de valores
-- ("Vencimento Valor do Documento (-) Desconto / Abatimento (-) Outras
-- deduções..."). A regex antiga aceitava esse texto como se fosse o nome, e
-- ele foi gravado em boletos.beneficiario_nome e propagado para
-- internal_transactions.entity_name/party_name (ver boletoService.ts
-- uploadBoleto/associar).
--
-- O parser já foi corrigido (BENEFICIARIO_STOPWORDS em boletoParser.ts) para
-- rejeitar esse padrão em importações NOVAS. Este script limpa o que já foi
-- gravado errado: zera os campos em vez de adivinhar o nome certo — o usuário
-- reabre o boleto e preenche à mão, mesmo tratamento que uma linha sem
-- beneficiário identificado já recebe hoje ("—" na tela).
--
-- ⚠️ APLICAR À MÃO PELO SQL EDITOR — NUNCA `supabase db push` (ver CLAUDE.md).
-- Rode o BLOCO 1 (preview) primeiro para conferir o volume antes de aplicar
-- os UPDATEs dos blocos 2 e 3.
-- ============================================================================

-- ═══ BLOCO 1 — preview (rode antes, sem alterar nada) ═══════════════════════
SELECT 'boletos' AS tabela, count(*) AS afetados
FROM public.boletos
WHERE beneficiario_nome ~* '^(vencimento|valor|data|nosso n[uú]mero|ag[eê]ncia|c[oó]digo|carteira|esp[eé]cie|aceite|processamento|documento|sacado|pagador|local de pagamento|instru[cç][oõ]es|\(-\)|\(\+\)|\(=\))'
UNION ALL
SELECT 'internal_transactions', count(*)
FROM public.internal_transactions
WHERE source_system = 'BOLETO'
  AND (
    entity_name ~* '^(vencimento|valor|data|nosso n[uú]mero|ag[eê]ncia|c[oó]digo|carteira|esp[eé]cie|aceite|processamento|documento|sacado|pagador|local de pagamento|instru[cç][oõ]es|\(-\)|\(\+\)|\(=\))'
    OR party_name ~* '^(vencimento|valor|data|nosso n[uú]mero|ag[eê]ncia|c[oó]digo|carteira|esp[eé]cie|aceite|processamento|documento|sacado|pagador|local de pagamento|instru[cç][oõ]es|\(-\)|\(\+\)|\(=\))'
  );

-- ═══ BLOCO 2 — boletos.beneficiario_nome ════════════════════════════════════
SET lock_timeout = '5s';

UPDATE public.boletos
   SET beneficiario_nome = NULL
 WHERE beneficiario_nome ~* '^(vencimento|valor|data|nosso n[uú]mero|ag[eê]ncia|c[oó]digo|carteira|esp[eé]cie|aceite|processamento|documento|sacado|pagador|local de pagamento|instru[cç][oõ]es|\(-\)|\(\+\)|\(=\))';

-- ═══ BLOCO 3 — internal_transactions espelhadas (source_system='BOLETO') ═══
-- description só é limpo quando é EXATAMENTE o mesmo texto corrompido — não
-- mexe em descrição que o usuário já tenha editado à mão depois.
SET lock_timeout = '5s';

UPDATE public.internal_transactions
   SET entity_name = NULL,
       party_name  = NULL,
       description = CASE
           WHEN description ~* '^(vencimento|valor|data|nosso n[uú]mero|ag[eê]ncia|c[oó]digo|carteira|esp[eé]cie|aceite|processamento|documento|sacado|pagador|local de pagamento|instru[cç][oõ]es|\(-\)|\(\+\)|\(=\))'
           THEN 'Boleto'
           ELSE description
       END
 WHERE source_system = 'BOLETO'
   AND (
     entity_name ~* '^(vencimento|valor|data|nosso n[uú]mero|ag[eê]ncia|c[oó]digo|carteira|esp[eé]cie|aceite|processamento|documento|sacado|pagador|local de pagamento|instru[cç][oõ]es|\(-\)|\(\+\)|\(=\))'
     OR party_name ~* '^(vencimento|valor|data|nosso n[uú]mero|ag[eê]ncia|c[oó]digo|carteira|esp[eé]cie|aceite|processamento|documento|sacado|pagador|local de pagamento|instru[cç][oõ]es|\(-\)|\(\+\)|\(=\))'
   );

-- ==========================================================================
-- FIM: aplicar_20270905000006_boletos_beneficiario_nome_corrompido.sql
-- ==========================================================================
