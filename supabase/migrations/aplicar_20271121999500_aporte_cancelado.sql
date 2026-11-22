-- Fase C6 de docs/planos/2026-11-21-portal-do-investidor-consolidacao.md
--
-- A tela do portal (PortalOverview, PortalFinance) já tinha o rótulo "Cancelado" para lançamento estornado,
-- mas o banco só aceitava pendente/liquidado/atrasado. Agora aceita `cancelado`; nenhuma soma o conta (as
-- contas leem só 'liquidado' e, para o em aberto, 'pendente'/'atrasado' — utils/investidorCarteira).
--
-- REGRA #7: sem policy, sem função.
-- Reversão: voltar a CHECK sem 'cancelado' (falha se houver linha cancelada — trocar antes para 'pendente').

ALTER TABLE public.investor_contributions DROP CONSTRAINT IF EXISTS investor_contributions_status_check;
ALTER TABLE public.investor_contributions ADD CONSTRAINT investor_contributions_status_check
    CHECK (status = ANY (ARRAY['pendente'::text, 'liquidado'::text, 'atrasado'::text, 'cancelado'::text]));
