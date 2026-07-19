-- Vínculo Empreendimento → Obra (obra principal).
--
-- Contexto: o vínculo com obra (projects) só existia por TORRE
-- (empreendimento_towers.project_id, migration 20261228000000). Empreendimento de torre
-- única — o caso mais comum — ficava sem nenhuma obra vinculada no cadastro, e telas que
-- precisam de "a obra deste empreendimento" não tinham de onde tirar.
--
-- Esta coluna é a obra PRINCIPAL do empreendimento; não substitui o vínculo por torre
-- (que continua sendo o correto para empreendimento multi-torre, 1 obra por torre).
--
-- ⚠️ SEM FOREIGN KEY, de propósito: `REFERENCES public.projects` pega ShareRowExclusiveLock
-- em projects e deadlocka (40P01) contra o app ativo. Já mordeu 3× neste módulo
-- (broker_proposals, ponte de Locações, migration da curadoria 20270218000000). Padrão do
-- módulo: migration nova toca só a coluna nova, sem FK, e o join é resolvido no cliente —
-- empreendimentoService/EmpreendimentoForm tratam id órfão como "sem vínculo".

alter table public.empreendimentos
  add column if not exists project_id uuid;

create index if not exists idx_empreendimentos_project
  on public.empreendimentos(project_id)
  where project_id is not null;

comment on column public.empreendimentos.project_id is
  'Obra principal (projects.id) do empreendimento. Sem FK por causa de deadlock de DDL neste módulo; '
  'integridade validada na aplicação. Para multi-torre, o vínculo por torre '
  '(empreendimento_towers.project_id) continua sendo a fonte por-obra.';
