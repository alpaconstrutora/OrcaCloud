-- Zona aplicável do empreendimento (26/10/2026).
-- Plano: docs/planos/2026-10-26-zona-aplicavel-do-empreendimento.md
-- Nasceu como aplicar_20271026950000_…; renomeada antes do merge porque o portal do
-- colaborador (#186) passou a usar esse prefixo. Já aplicada no remoto em 26/10/2026.
--
-- Pedido: "como seleciono um item do mapa regulatorio?" → "a+b juntos". A aba Mapa
-- Regulatório do empreendimento lista as zonas da lei (o Garden Cambuhy recebeu as 175
-- de Cambuí), mas não dizia QUAL vale para o terreno. A marca mora na própria zona: a
-- Planta já recebe a lista com ela e aplica a marcada sozinha quando não há nada salvo.
--
-- No máximo UMA por empreendimento — quem garante é o índice, não a tela: marcar outra
-- zona desmarca a atual antes (empreendimentoService.marcarZonaAplicavel).
--
-- Sem função nem policy nova: a policy org_access_emp_regulatory_zones (ALL, por
-- organização) já cobre ler e gravar a coluna. Idempotente.

alter table public.empreendimento_regulatory_zones
    add column if not exists aplicavel boolean not null default false;

comment on column public.empreendimento_regulatory_zones.aplicavel is
    'Zona que vale para o terreno do empreendimento (no máximo uma). A Planta aplica esta quando a planta não tem zona salva.';

create unique index if not exists uq_emp_regulatory_zones_aplicavel
    on public.empreendimento_regulatory_zones (empreendimento_id)
    where aplicavel;
