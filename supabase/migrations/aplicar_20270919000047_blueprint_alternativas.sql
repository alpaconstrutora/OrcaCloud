-- ============================================================================
-- Planta Inteligente — DESIGN OPTIONS / alternativas (19/09/2026, E6.1)
--
-- Roadmap `docs/planos/2026-09-18-planta-inteligente-roadmap-unificado.md`,
-- fase 6.1: "ramos do estudo (nome, origem = versão, principal)". A alternativa
-- É um ramo (`blueprint_branches` já tem nome, rascunho e histórico próprio):
-- sem tabela paralela, sem mexer no kernel — alternativa é outro snapshot.
-- Entram: `principal` (UM por estudo — índice parcial), `descricao` e
-- `origem_snapshot_id` (a versão publicada de onde a alternativa nasceu; NÃO
-- é `parent_snapshot_id`, que continua sendo a base de carga do ramo).
--
-- ⚠️ Aplicar à mão: `npx supabase db query --linked -f <este arquivo>`.
--    NUNCA `supabase db push` (histórico de migrations furado — ver CLAUDE.md).
-- ============================================================================

SET lock_timeout = '5s';

ALTER TABLE public.blueprint_branches
  ADD COLUMN IF NOT EXISTS principal          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS descricao          TEXT,
  ADD COLUMN IF NOT EXISTS origem_snapshot_id UUID REFERENCES public.blueprint_snapshots(id) ON DELETE SET NULL;

-- O ramo "principal" de cada estudo passa a ser marcado; quem não tem nenhum
-- com esse nome fica com o mais antigo.
UPDATE public.blueprint_branches b
   SET principal = true
 WHERE b.name = 'principal'
   AND NOT EXISTS (SELECT 1 FROM public.blueprint_branches x WHERE x.study_id = b.study_id AND x.principal);

UPDATE public.blueprint_branches b
   SET principal = true
 WHERE b.id = (SELECT x.id FROM public.blueprint_branches x WHERE x.study_id = b.study_id ORDER BY x.created_at LIMIT 1)
   AND NOT EXISTS (SELECT 1 FROM public.blueprint_branches x WHERE x.study_id = b.study_id AND x.principal);

CREATE UNIQUE INDEX IF NOT EXISTS blueprint_branches_um_principal_por_estudo
  ON public.blueprint_branches(study_id) WHERE principal;

COMMENT ON COLUMN public.blueprint_branches.principal IS
  'Design Options (E6.1): a alternativa principal do estudo — a que o orçamento e a obra citam. Uma por estudo.';
COMMENT ON COLUMN public.blueprint_branches.descricao IS
  'Design Options (E6.1): o que esta alternativa explora ("suíte para o norte", "garagem dupla").';
COMMENT ON COLUMN public.blueprint_branches.origem_snapshot_id IS
  'Design Options (E6.1): a versão publicada de onde a alternativa nasceu (informativo; a base de carga continua sendo parent_snapshot_id).';
