-- Vínculo DIRETO Contrato → Empreendimento (`contracts.empreendimento_id`).
--
-- Até aqui contrato só chegava ao empreendimento PELA OBRA (`contracts.project_id`
-- → `empreendimentos.project_id`), e services/empreendimentoLinksService.ts
-- documentava isso como regra ("Contratos/Fin: NÃO se ligam ao empreendimento").
-- A limitação prática: contrato SEM obra (despesa administrativa, que é caso
-- suportado — `project_id` é nullable desde 20260224000001) não tinha como ser
-- atribuído a um empreendimento.
--
-- A coluna é um vínculo INDEPENDENTE de `project_id`, não uma desnormalização
-- dele: o usuário escolhe o empreendimento na tela, com ou sem obra.
--
-- SEM FOREIGN KEY, de propósito — é o mesmo motivo das outras colunas de vínculo
-- deste módulo (`empreendimentos.project_id`, `empreendimento_towers.project_id`):
-- DDL com FK deadlocka aqui (ver 20270719000000). Consequência assumida: o id
-- pode apontar para empreendimento excluído, e a UI de vínculos trata como
-- `missing: true`.

SET lock_timeout = '3s';

ALTER TABLE public.contracts
    ADD COLUMN IF NOT EXISTS empreendimento_id UUID;

COMMENT ON COLUMN public.contracts.empreendimento_id IS
    'Empreendimento do contrato. Vínculo direto e independente de project_id (contrato sem obra também pode ter empreendimento). Sem FK por decisão do módulo — ver 20270719000000.';

CREATE INDEX IF NOT EXISTS contracts_empreendimento_idx
    ON public.contracts(empreendimento_id)
    WHERE empreendimento_id IS NOT NULL;
