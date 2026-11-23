-- =============================================================================
-- aplicar_20271123100000_opura_document_transcricoes.sql
--
-- Transcrição do texto de documentos (Empreendimento › Documentos, 23/11/2026).
-- Plano: docs/planos/2026-11-23-transcricao-de-documentos-do-empreendimento.md
--
-- O texto é da VERSÃO do arquivo: nova versão = transcrição nova. Tabela
-- própria (e não coluna em opura_document_versions) porque o GED lê
-- `active_version(*)` em muitas listas — dezenas de KB de texto por documento
-- pesariam em todas elas.
--
-- `linhas` = [{"t": "texto da linha", "c": 87}] — `c` é a confiança do OCR
-- (0–100) enquanto a linha não foi revisada; null = veio do texto do PDF ou foi
-- revisada. "Duvidosa" é derivada na leitura (c < limiar do front), então mudar
-- o limiar não exige transcrever de novo.
--
-- Aplicar com: npx supabase db query --linked -f <este arquivo>  (NUNCA db push)
-- Idempotente. Não cria função.
--
-- REGRA #7 — Pergunta 1: nenhuma perna de OR; leitura pelo padrão por CONJUNTO
-- (#382). Na escrita, além da org, a versão tem de ser visível para quem grava
-- (AND, não OR): ninguém pendura transcrição numa versão de outra organização.
--
-- Rollback: DROP TABLE public.opura_document_transcricoes;
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.opura_document_transcricoes (
  version_id       UUID PRIMARY KEY REFERENCES public.opura_document_versions(id) ON DELETE CASCADE,
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  origem           TEXT NOT NULL
    CONSTRAINT chk_opura_transcricao_origem CHECK (origem IN ('TEXTO_DO_PDF', 'OCR')),
  paginas          INT NOT NULL
    CONSTRAINT chk_opura_transcricao_paginas CHECK (paginas >= 0),
  linhas           JSONB NOT NULL
    CONSTRAINT chk_opura_transcricao_linhas CHECK (jsonb_typeof(linhas) = 'array'),
  atualizado_por   TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.opura_document_transcricoes IS
  'Texto transcrito de uma versão de documento do GED (texto do PDF ou OCR no navegador). linhas = [{t, c}], c = confiança do OCR enquanto não revisada.';

CREATE INDEX IF NOT EXISTS idx_opura_transcricoes_org
  ON public.opura_document_transcricoes(organization_id);

ALTER TABLE public.opura_document_transcricoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS opura_transcricoes_select ON public.opura_document_transcricoes;
CREATE POLICY opura_transcricoes_select ON public.opura_document_transcricoes FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.minhas_orgs_membro()));

DROP POLICY IF EXISTS opura_transcricoes_insert ON public.opura_document_transcricoes;
CREATE POLICY opura_transcricoes_insert ON public.opura_document_transcricoes FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (SELECT public.minhas_orgs_membro())
    AND version_id IN (SELECT v.id FROM public.opura_document_versions v)
  );

DROP POLICY IF EXISTS opura_transcricoes_update ON public.opura_document_transcricoes;
CREATE POLICY opura_transcricoes_update ON public.opura_document_transcricoes FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT public.minhas_orgs_membro()))
  WITH CHECK (
    organization_id IN (SELECT public.minhas_orgs_membro())
    AND version_id IN (SELECT v.id FROM public.opura_document_versions v)
  );

DROP POLICY IF EXISTS opura_transcricoes_delete ON public.opura_document_transcricoes;
CREATE POLICY opura_transcricoes_delete ON public.opura_document_transcricoes FOR DELETE TO authenticated
  USING (organization_id IN (SELECT public.minhas_orgs_membro()));

DROP TRIGGER IF EXISTS trg_opura_transcricoes_updated_at ON public.opura_document_transcricoes;
CREATE TRIGGER trg_opura_transcricoes_updated_at
  BEFORE UPDATE ON public.opura_document_transcricoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

REVOKE ALL ON public.opura_document_transcricoes FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.opura_document_transcricoes FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.opura_document_transcricoes TO authenticated;
