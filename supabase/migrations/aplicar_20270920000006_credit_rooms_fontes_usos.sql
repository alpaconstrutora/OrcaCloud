-- ═══════════════════════════════════════════════════════════════════════════
-- Credit Room · Quadro de Fontes e Usos (PRD §47)
--
-- O quadro que todo banco pede antes de aprovar: de onde vem o dinheiro
-- (equity, financiamento, recebíveis de venda, permuta) e para onde vai
-- (terreno, obra, projetos, marketing, tributos, juros). O que o banco
-- realmente checa é o FECHAMENTO — Σ fontes = Σ usos.
--
-- ── Por que JSONB e não tabela ─────────────────────────────────────────────
--
-- O quadro é um documento da operação, não um cadastro: só é lido junto do
-- room, nunca agregado entre rooms, e nasce e morre com ele. Uma tabela
-- exigiria RLS própria, políticas próprias e um join a mais em toda leitura
-- para nada — é o mesmo critério já aplicado a `guarantees` nesta tabela.
--
-- ⚠️ O total NÃO é coluna gerada. O snapshot congela os totais no momento do
-- freeze; recalcular depois faria a V1 mudar de número, e a imutabilidade da
-- versão (R2) é o que faz banco e empresa olharem para o mesmo valor.
--
-- REGRA #7 · pergunta 1 (políticas): nenhuma policy nova — as colunas entram
--            em tabela existente, cobertas pelas 17 policies de credit_rooms.
-- REGRA #7 · pergunta 2 (grants): nenhuma função nova. Nada a revogar.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.credit_rooms
    ADD COLUMN IF NOT EXISTS funding_sources jsonb NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS funding_uses    jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.credit_rooms.funding_sources IS
    'PRD §47 · Fontes: [{id, label, kind, amount}]. kind ∈ EQUITY|FINANCIAMENTO|'
    'RECEBIVEIS|PERMUTA|OUTRA. Σ deve fechar com funding_uses.';
COMMENT ON COLUMN public.credit_rooms.funding_uses IS
    'PRD §47 · Usos: [{id, label, kind, amount}]. kind ∈ TERRENO|OBRA|PROJETOS|'
    'MARKETING|TRIBUTOS|JUROS|OUTRO.';

-- Só aceita ARRAY. Sem isto, um objeto solto passaria e o `.map` da tela
-- quebraria a Visão inteira do credor por causa de um campo de formulário.
ALTER TABLE public.credit_rooms
    DROP CONSTRAINT IF EXISTS credit_rooms_funding_sources_array,
    DROP CONSTRAINT IF EXISTS credit_rooms_funding_uses_array;
ALTER TABLE public.credit_rooms
    ADD CONSTRAINT credit_rooms_funding_sources_array
        CHECK (jsonb_typeof(funding_sources) = 'array'),
    ADD CONSTRAINT credit_rooms_funding_uses_array
        CHECK (jsonb_typeof(funding_uses) = 'array');

-- ── Vocabulário de auditoria: 'UPDATE' ──────────────────────────────────────
-- Editar o quadro é mudar a proposta. Não altera versão congelada (R2), mas
-- "quem mexeu nas fontes, e quando" é pergunta que o comitê faz. Sem entrada
-- própria no CHECK, o log cairia em 'STATUS' e mentiria sobre o que ocorreu.
ALTER TABLE public.credit_room_access_log DROP CONSTRAINT IF EXISTS credit_room_access_log_action_check;
ALTER TABLE public.credit_room_access_log
    ADD CONSTRAINT credit_room_access_log_action_check CHECK (action IN (
        'LOGIN', 'VIEW', 'DOWNLOAD', 'COMMENT', 'REQUEST', 'SHARE', 'UNSHARE',
        'FREEZE', 'INVITE', 'REVOKE', 'EXPORT', 'STATUS', 'UPDATE'
    ));
