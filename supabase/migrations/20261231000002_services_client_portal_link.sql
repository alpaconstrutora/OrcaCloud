-- migration: 20261231000002_services_client_portal_link.sql
-- Ponte Serviços → Portal do Cliente. O domínio de Serviços (services_opportunities/
-- services_contracts) é isolado e não usa `public.clients` nem `public.contracts`
-- (ver feedback_separacao_contratos). Para reusar a infraestrutura de portal já
-- existente (fn_build_planning_json/fn_portal_get_planning, que casam por
-- settings.clientId OU public.contracts), adicionamos apenas o vínculo mínimo:
--   client_id           → registro em public.clients (category='Serviços') gerado
--                          a partir do contato da oportunidade, na conversão (won).
--   planning_project_id → projeto PLANEJAMENTO criado manualmente pelo usuário
--                          (botão "Criar Planejamento"), com settings.clientId
--                          carimbado — casa na cadeia como nó raiz (depth 0).

ALTER TABLE public.services_opportunities
    ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS planning_project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_services_opportunities_client_id ON public.services_opportunities(client_id);
