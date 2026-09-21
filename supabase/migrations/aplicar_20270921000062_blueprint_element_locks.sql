-- ============================================================================
-- Planta Inteligente — TRAVAS EXPLÍCITAS por ramo (21/09/2026, backlog P2 "lock fino")
--
-- Roadmap `docs/planos/2026-09-18-planta-inteligente-roadmap-unificado.md`:
-- E10.1 entregou a trava POR SELEÇÃO (efêmera: some com a presença). O
-- corte original pedia "lock fino": travar de propósito um conjunto de
-- elementos, um pavimento ou uma disciplina, e a trava FICAR — mesmo com a
-- pessoa fora do ramo — até ela soltar, alguém forçar ou o prazo vencer.
--
-- ─── DESENHO ────────────────────────────────────────────────────────────────
--
-- Uma linha por trava: ramo, escopo (ELEMENTOS por uid / PAVIMENTO por uid do
-- nível / DISCIPLINA), alvos, quem segura (id, e-mail, nome), nota, validade
-- (8 h por padrão — trava esquecida não prende o ramo para sempre).
-- RLS por `is_org_member`: membro lê; só o próprio usuário cria trava em seu
-- nome; qualquer membro pode apagar (é o "forçar liberação" — a tela pede
-- confirmação e avisa o dono pelo canal; o banco não é a única barreira, mas
-- não pode ser a que impede o time de trabalhar quando alguém saiu de férias).
--
-- ⚠️ Aplicar à mão: `npx supabase db query --linked -f <este arquivo>`.
--    NUNCA `supabase db push` (histórico de migrations furado — ver CLAUDE.md).
-- ============================================================================

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.blueprint_element_locks (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id         UUID NOT NULL REFERENCES public.blueprint_branches(id) ON DELETE CASCADE,
    organization_id   UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    escopo            TEXT NOT NULL CHECK (escopo IN ('ELEMENTOS', 'PAVIMENTO', 'DISCIPLINA')),
    alvos             TEXT[] NOT NULL CHECK (cardinality(alvos) BETWEEN 1 AND 2000),
    holder_user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    holder_email      TEXT NOT NULL,
    holder_nome       TEXT NOT NULL DEFAULT '',
    nota              TEXT NOT NULL DEFAULT '' CHECK (length(nota) <= 200),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at        TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '8 hours'
);

COMMENT ON TABLE public.blueprint_element_locks IS
  'Travas explícitas da Planta Inteligente por ramo: elementos (uids), pavimento (uid do nível) ou disciplina; quem segura, nota e validade. Complementa a trava por seleção (efêmera, Realtime).';

CREATE INDEX IF NOT EXISTS blueprint_element_locks_ramo_idx ON public.blueprint_element_locks(branch_id, expires_at);

ALTER TABLE public.blueprint_element_locks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "blueprint_element_locks_select" ON public.blueprint_element_locks;
CREATE POLICY "blueprint_element_locks_select"
    ON public.blueprint_element_locks FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id));
DROP POLICY IF EXISTS "blueprint_element_locks_insert" ON public.blueprint_element_locks;
CREATE POLICY "blueprint_element_locks_insert"
    ON public.blueprint_element_locks FOR INSERT TO authenticated
    WITH CHECK (public.is_org_member(organization_id) AND holder_user_id = auth.uid());
DROP POLICY IF EXISTS "blueprint_element_locks_delete" ON public.blueprint_element_locks;
CREATE POLICY "blueprint_element_locks_delete"
    ON public.blueprint_element_locks FOR DELETE TO authenticated
    USING (public.is_org_member(organization_id));
REVOKE ALL ON public.blueprint_element_locks FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.blueprint_element_locks TO authenticated;
