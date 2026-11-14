-- =============================================================================
-- aplicar_20271112995000_empreendimento_documentos.sql
--
-- Incorporação › Empreendimentos › aba Documentos (pedido de 12/11/2026).
-- Plano: docs/planos/2026-11-12-empreendimento-aba-documentos.md
--
-- 1. opura_documents.empreendimento_id — o ARQUIVO mora só no GED. A aba do
--    empreendimento é uma vista dele; o GED filtra por esta coluna.
-- 2. empreendimento_documentos_legais — checklist de documentos legais
--    (escritura, matrícula, alvarás, habite-se, RI…). Cada item existe mesmo
--    sem arquivo (situação Pendente) e aponta para o GED por document_id,
--    no mesmo molde de opura_cno_documents (20270716000005).
--
-- Aplicar com: npx supabase db query --linked -f <este arquivo>  (NUNCA db push)
-- Idempotente: IF NOT EXISTS / DROP ... IF EXISTS em tudo.
--
-- REGRA #7: não cria função. Policy única, sem perna OR, sem anon, no padrão
-- por CONJUNTO (#382): organization_id IN (SELECT minhas_orgs_membro()).
-- =============================================================================

-- ─── 1. Ligação no GED ───────────────────────────────────────────────────────
ALTER TABLE public.opura_documents
  ADD COLUMN IF NOT EXISTS empreendimento_id UUID
    REFERENCES public.empreendimentos(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.opura_documents.empreendimento_id IS
  'Empreendimento a que o documento pertence (aba Documentos do empreendimento). SET NULL: o documento continua no GED se o empreendimento for apagado.';

CREATE INDEX IF NOT EXISTS idx_opura_documents_empreendimento
  ON public.opura_documents(empreendimento_id)
  WHERE empreendimento_id IS NOT NULL;

-- ─── 2. Checklist de documentos legais ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.empreendimento_documentos_legais (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  empreendimento_id         UUID NOT NULL REFERENCES public.empreendimentos(id) ON DELETE CASCADE,
  tipo                      TEXT NOT NULL
    CONSTRAINT chk_emp_doc_legal_tipo CHECK (tipo IN (
      'ESCRITURA', 'MATRICULA', 'CERTIDOES_IMOVEL', 'CND_PROPRIETARIO',
      'APROVACAO_PROJETO', 'ALVARA_CONSTRUCAO', 'ALVARA_DEMOLICAO',
      'LICENCA_AMBIENTAL', 'ART_RRT', 'REGISTRO_INCORPORACAO', 'CNO', 'AVCB',
      'HABITE_SE', 'CND_INSS_OBRA', 'AVERBACAO', 'INSTITUICAO_CONDOMINIO',
      'CONVENCAO', 'INDIVIDUALIZACAO', 'OUTRO'
    )),
  titulo                    TEXT NOT NULL,
  numero                    TEXT,
  orgao_emissor             TEXT,
  protocolo                 TEXT,
  data_protocolo            DATE,
  data_emissao              DATE,
  data_validade             DATE,          -- NULL = não vence
  alerta_dias_antecedencia  INT NOT NULL DEFAULT 30,
  -- "Vencido" NÃO é gravado: é derivado de data_validade na leitura.
  situacao                  TEXT NOT NULL DEFAULT 'PENDENTE'
    CONSTRAINT chk_emp_doc_legal_situacao CHECK (situacao IN ('PENDENTE', 'EM_ANDAMENTO', 'EMITIDO', 'DISPENSADO')),
  obrigatorio               BOOLEAN NOT NULL DEFAULT TRUE,
  responsavel               TEXT,
  observacoes               TEXT,
  -- Ponte para o GED. SEM REFERENCES de propósito (mesmo precedente de
  -- opura_cno_documents.document_id): o GED também lista documentos virtuais.
  document_id               UUID,
  storage_path              TEXT,          -- denormalizado no vínculo (download sem novo fetch)
  sort_order                INT NOT NULL DEFAULT 0,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Um item por tipo da lista padrão (OUTRO pode repetir) — "Carregar lista
-- padrão" pode rodar duas vezes sem duplicar.
CREATE UNIQUE INDEX IF NOT EXISTS uq_emp_doc_legal_tipo
  ON public.empreendimento_documentos_legais(empreendimento_id, tipo)
  WHERE tipo <> 'OUTRO';

CREATE INDEX IF NOT EXISTS idx_emp_doc_legal_empreendimento
  ON public.empreendimento_documentos_legais(empreendimento_id);

CREATE INDEX IF NOT EXISTS idx_emp_doc_legal_org
  ON public.empreendimento_documentos_legais(organization_id);

ALTER TABLE public.empreendimento_documentos_legais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "emp_doc_legal_org_access" ON public.empreendimento_documentos_legais;
CREATE POLICY "emp_doc_legal_org_access" ON public.empreendimento_documentos_legais
  FOR ALL TO authenticated
  USING (organization_id IN (SELECT public.minhas_orgs_membro()))
  WITH CHECK (organization_id IN (SELECT public.minhas_orgs_membro()));

DROP TRIGGER IF EXISTS trg_emp_doc_legal_updated_at ON public.empreendimento_documentos_legais;
CREATE TRIGGER trg_emp_doc_legal_updated_at
  BEFORE UPDATE ON public.empreendimento_documentos_legais
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
