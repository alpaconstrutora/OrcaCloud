-- aplicar_20271010004200_opura_market_c381_so_sob_comando.sql
--
-- ÒPURA Market — a fonte da API da Conexão 381 NUNCA tem coleta diária.
-- Plano docs/planos/2026-10-10-opura-market-fontes.md, decisão do usuário de
-- 10/10/2026 (revisão da F2): "não ligar coleta diária. apenas com botão de
-- coleta única." Os termos de uso do site (item 8) proíbem extração
-- automatizada sem autorização.
--
-- Trava no BANCO, não só na tela: um membro da organização pode gravar em
-- opura_market_feeds pela API REST (a RLS deixa), e o cron lê `ativo`. Com o
-- CHECK, `ativo = true` numa fonte api_conexao381 é recusado pelo Postgres.
-- A Edge Function também pula esse tipo no modo 'agendado' (defesa em dobro).
--
-- Idempotente. Antes de aplicar (10/10/2026): opura_market_feeds sem nenhuma linha.

UPDATE public.opura_market_feeds SET ativo = false WHERE tipo = 'api_conexao381' AND ativo;

ALTER TABLE public.opura_market_feeds DROP CONSTRAINT IF EXISTS opura_market_feeds_c381_so_sob_comando;
ALTER TABLE public.opura_market_feeds
  ADD CONSTRAINT opura_market_feeds_c381_so_sob_comando
  CHECK (tipo <> 'api_conexao381' OR NOT ativo);

COMMENT ON CONSTRAINT opura_market_feeds_c381_so_sob_comando ON public.opura_market_feeds IS
  'A API da Conexão 381 só é lida sob comando ("Importar agora"); nunca pelo cron diário. Decisão de 10/10/2026.';
