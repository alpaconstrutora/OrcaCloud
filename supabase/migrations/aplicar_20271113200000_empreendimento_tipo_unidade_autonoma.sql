-- ⚠️ RENOMEADA em 14/11/2026: era aplicar_20271113100000_… — o mesmo prefixo de
-- aplicar_20271113100000_email_capture_busca_diaria.sql (#406), e a trava __tests__/migrationsPrefixo.test.ts
-- recusa prefixo repetido. JÁ APLICADA no banco (conferido em 14/11: o CHECK
-- empreendimento_types_estrutura_check já aceita 'UNIDADE_AUTONOMA'). Só o nome mudou; não precisa rodar de novo
-- (é idempotente, então rodar também não estraga).
--
-- Empreendimento do tipo Apartamento Residencial = só a unidade, sem terreno (13/11/2026).
-- Pedido: "Empreendimento cujo o tipo for apartamento residencial, subsitituir torres e unidades
-- para unidade como quando tipo é casa residencia. Porem sem o terreno. Apenas unidade."
-- Plano: docs/planos/2026-11-13-empreendimento-apartamento-unidade.md.
--
-- Quarta `estrutura` (ver aplicar_20271109900000):
--   UNIDADE_AUTONOMA  uma unidade dentro de um prédio que não é do empreendimento (apartamento,
--                     sala): a aba é "Unidade", como no IMOVEL_UNICO, mas sem a seção Terreno.
-- Por baixo, a mesma torre implícita com uma unidade dos outros tipos de unidade única.
-- Sem policy nem função (REGRA #7 não se aplica). Idempotente.

ALTER TABLE public.empreendimento_types
  DROP CONSTRAINT IF EXISTS empreendimento_types_estrutura_check;
ALTER TABLE public.empreendimento_types
  ADD CONSTRAINT empreendimento_types_estrutura_check
  CHECK (estrutura IN ('TORRES', 'LOTE', 'IMOVEL_UNICO', 'UNIDADE_AUTONOMA'));

-- Só onde ainda está no padrão: rodar de novo não desfaz uma escolha feita na tela.
-- Pelo NOME, não pelo slug (o slug se repete entre orgs e não diz nada do tipo).
UPDATE public.empreendimento_types SET estrutura = 'UNIDADE_AUTONOMA'
 WHERE estrutura = 'TORRES' AND name ILIKE 'apartamento residencial';
