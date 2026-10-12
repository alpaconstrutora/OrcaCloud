-- ============================================================================
-- Estudos de Viabilidade (Imovib) — estudo "Garden Cambuhy" passa para a SPE
-- Plano: docs/planos/2026-10-12-imovib-viabilidade-correcoes.md, item 4.2 (D1)
--
-- Situação (2026-10-12): o empreendimento "011 - Garden Cambuhy" é da org
-- "Construção do Edifício Garden Cambuhy SPE" (a2c4b292…) e aponta para o
-- estudo "Garden Cambuhy" (d20c71b0…), que era da org "Alpa Construtora e
-- Incorporadora" (926cf626…). Era o ÚNICO vínculo entre organizações.
--
-- Decisões do usuário (2026-10-12):
--   D1 — "Mover o estudo para a SPE."
--   Efeito apontado antes: a RLS do Imovib libera o estudo só aos membros da
--   org dona; 3 contas só da Alpa perderiam o acesso (desenvolvedor@,
--   bruna.pereira@, iago.marques@). Resposta: "Mover e incluir as 3 na SPE"
--   — mesmo papel e mesmas permissões que têm na Alpa.
--
-- Só imovib_studies tem organization_id: blocos, tipologias, rubricas do CAPEX
-- e espelho seguem o estudo pela RLS. Nenhuma oportunidade de investidor aponta
-- para este estudo (conferido).
--
-- REGRA #7: não cria policy nem função.
-- Aplicar com: npx supabase db query --linked -f <este arquivo>   (nunca db push)
-- ============================================================================

BEGIN;

-- 1) As 3 contas entram na SPE com o papel e as permissões que têm na Alpa.
--    ON CONFLICT: quem já for membro da SPE fica como está.
INSERT INTO public.organization_members (organization_id, user_id, email, role, permissions, name, custom_role_id, cargo)
SELECT 'a2c4b292-48a1-42db-9e8a-a8defbec48a0', m.user_id, m.email, m.role, m.permissions, m.name, m.custom_role_id, m.cargo
FROM public.organization_members m
WHERE m.organization_id = '926cf626-ba49-4ee4-9f35-472822fb90e6'
  AND m.email IN ('desenvolvedor@alpaconstrutora.com.br',
                  'bruna.pereira@alpaconstrutora.com.br',
                  'iago.marques@alpaconstrutora.com.br')
ON CONFLICT (organization_id, email) DO NOTHING;

-- 2) O estudo muda de org — trava pela org registrada: se alguém já o moveu,
--    não sobrescreve.
UPDATE public.imovib_studies
SET organization_id = 'a2c4b292-48a1-42db-9e8a-a8defbec48a0', updated_at = now()
WHERE id = 'd20c71b0-99e3-4874-b25e-e63908f09661'
  AND organization_id = '926cf626-ba49-4ee4-9f35-472822fb90e6';

COMMIT;

-- Conferência (deve dar 0 — nenhum empreendimento ligado a estudo de outra org):
-- SELECT count(*) FROM public.empreendimentos e JOIN public.imovib_studies s ON s.id = e.imovib_study_id
--  WHERE e.organization_id IS DISTINCT FROM s.organization_id;

-- ── Volta (só se precisar desfazer) ─────────────────────────────────────────
-- BEGIN;
-- UPDATE public.imovib_studies SET organization_id = '926cf626-ba49-4ee4-9f35-472822fb90e6', updated_at = now()
--  WHERE id = 'd20c71b0-99e3-4874-b25e-e63908f09661' AND organization_id = 'a2c4b292-48a1-42db-9e8a-a8defbec48a0';
-- DELETE FROM public.organization_members
--  WHERE organization_id = 'a2c4b292-48a1-42db-9e8a-a8defbec48a0'
--    AND email IN ('desenvolvedor@alpaconstrutora.com.br','bruna.pereira@alpaconstrutora.com.br','iago.marques@alpaconstrutora.com.br');
-- COMMIT;
-- (Antes de 2026-10-12 nenhuma das 3 era membro da SPE — o DELETE só remove o que este arquivo criou.)
