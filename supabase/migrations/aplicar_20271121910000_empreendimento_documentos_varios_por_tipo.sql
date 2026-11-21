-- =============================================================================
-- aplicar_20271121910000_empreendimento_documentos_varios_por_tipo.sql
--
-- Incorporação › Empreendimentos › aba Documentos (pedido de 21/11/2026).
-- Plano: docs/planos/2026-11-21-empreendimento-documentos-lista-incorporacao.md
--
-- 1. Mais de um documento do MESMO tipo (ex.: duas escrituras): sai o índice
--    único parcial (empreendimento_id, tipo). "Carregar lista padrão" continua
--    idempotente pela regra do front (faltantesDaLista: só entra tipo ausente).
-- 2. CHECK do tipo ganha os 11 tipos da lista "Incorporação" (Lei 4.591/64,
--    art. 32).
--
-- Aplicar com: npx supabase db query --linked -f <este arquivo>  (NUNCA db push)
-- Idempotente. Não cria função nem policy (REGRA #7 não se aplica).
--
-- Rollback: recriar uq_emp_doc_legal_tipo (falha se já houver duplicados —
-- decidir antes quais apagar) e restaurar o CHECK de aplicar_20271112995000.
-- =============================================================================

DROP INDEX IF EXISTS public.uq_emp_doc_legal_tipo;

ALTER TABLE public.empreendimento_documentos_legais
  DROP CONSTRAINT IF EXISTS chk_emp_doc_legal_tipo;

ALTER TABLE public.empreendimento_documentos_legais
  ADD CONSTRAINT chk_emp_doc_legal_tipo CHECK (tipo IN (
    -- lista geral (aplicar_20271112995000)
    'ESCRITURA', 'MATRICULA', 'CERTIDOES_IMOVEL', 'CND_PROPRIETARIO',
    'APROVACAO_PROJETO', 'ALVARA_CONSTRUCAO', 'ALVARA_DEMOLICAO',
    'LICENCA_AMBIENTAL', 'ART_RRT', 'REGISTRO_INCORPORACAO', 'CNO', 'AVCB',
    'HABITE_SE', 'CND_INSS_OBRA', 'AVERBACAO', 'INSTITUICAO_CONDOMINIO',
    'CONVENCAO', 'INDIVIDUALIZACAO', 'OUTRO',
    -- lista Incorporação (21/11/2026)
    'MEMORIAL_INCORPORACAO', 'CND_TRIBUTOS', 'CERTIDOES_JUSTICA',
    'CERTIDOES_PROTESTO', 'HISTORICO_TITULOS', 'QUADROS_NBR_12721',
    'ATESTADO_IDONEIDADE', 'CONTRATO_PADRAO', 'DECLARACAO_PARCELA_PRECO',
    'CERTIDAO_MANDATO', 'DECLARACAO_CARENCIA'
  ));
