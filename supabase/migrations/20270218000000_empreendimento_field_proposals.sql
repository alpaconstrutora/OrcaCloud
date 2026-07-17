-- migration: 20270218000000_empreendimento_field_proposals.sql
--
-- Inbox de Curadoria — o Empreendimento como centro da verdade na ENTRADA de dados.
--
-- Até aqui, sincronizar da Viabilidade/Planta para o Empreendimento sobrescrevia campo
-- divergente direto. Agora um conflito (valor diferente dos dois lados) não é mais escrito no
-- destino: vira uma PROPOSTA pendente que o usuário aprova ou rejeita, campo a campo. Criação
-- de torre/unidade e preenchimento de campo vazio continuam aplicando direto (não geram
-- proposta) — só o conflito exige decisão humana.
--
-- Decisões de desenho:
--  · proposal_hash é a IDENTIDADE (empreendimento+origem+entidade+campo+valor proposto),
--    computada NO CLIENTE (services/sync/hash.ts) e nunca recalculada no servidor — some o
--    risco de canonicalização TS≡SQL. Ela existe só para o unique index abaixo.
--  · A obsolescência ("o destino mudou desde que revisei") é detectada comparando o
--    current_value gravado com o valor atual do destino, no apply — não por um 2º hash.
--  · Rejeitar NÃO apaga: carimba decided_* e mantém os valores, preservando o histórico
--    (mesmo espírito do dismiss do dead letter fiscal, 20270129000000).

CREATE TABLE IF NOT EXISTS public.empreendimento_field_proposals (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID NOT NULL,                                   -- denormalizado p/ RLS barata
    empreendimento_id UUID NOT NULL REFERENCES public.empreendimentos(id) ON DELETE CASCADE,
    origin            TEXT NOT NULL CHECK (origin IN ('imovib', 'planta_ai')),
    entity            TEXT NOT NULL CHECK (entity IN ('empreendimento', 'tower', 'unit', 'common_area')),
    entity_id         UUID NOT NULL,                                   -- destino sempre existe (create aplica direto)
    field             TEXT NOT NULL,
    field_group       TEXT NOT NULL CHECK (field_group IN ('identidade', 'estrutura', 'area', 'comercial')),
    label             TEXT NOT NULL,                                   -- rótulo PT-BR (vem do registry)
    current_value     JSONB,                                          -- "de" — snapshot do destino na detecção
    proposed_value    JSONB,                                          -- "para"
    applied_value     JSONB,                                          -- o que foi de fato gravado (auditoria)
    source_ref        JSONB,                                          -- {imovib_instance_id|planta_ai_unit_id, ...}
    proposal_hash     TEXT NOT NULL,                                  -- identidade (computada no cliente)
    status            TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'applied', 'rejected', 'superseded')),
    detected_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    decided_at        TIMESTAMPTZ,
    decided_by        UUID,
    decision_reason   TEXT
);

-- Identidade: mesma origem propondo o mesmo valor para o mesmo campo = a MESMA proposta.
-- O detector usa INSERT ... ON CONFLICT DO NOTHING, então:
--   · origem inalterada → mesmo proposal_hash → nada nasce; um 'rejected' continua rejeitado.
--   · origem mudou → proposal_hash novo → nova linha 'pending'.
-- É daqui que sai, de graça, a regra "rejeitado não reaparece, mas volta se a origem mudar".
CREATE UNIQUE INDEX IF NOT EXISTS uq_emp_proposal_identity
    ON public.empreendimento_field_proposals
    (empreendimento_id, origin, entity, entity_id, field, proposal_hash);

CREATE INDEX IF NOT EXISTS idx_emp_proposals_queue
    ON public.empreendimento_field_proposals (empreendimento_id, origin, detected_at DESC)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_emp_proposals_decided
    ON public.empreendimento_field_proposals (empreendimento_id, decided_at DESC)
    WHERE decided_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_emp_proposals_target
    ON public.empreendimento_field_proposals (entity, entity_id)
    WHERE status = 'pending';

-- RLS org-scoped, reusando o helper dual-check (uid OU email) do módulo. NÃO usar o padrão
-- qual=true das tabelas legadas.
ALTER TABLE public.empreendimento_field_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_access_emp_field_proposals" ON public.empreendimento_field_proposals;
CREATE POLICY "org_access_emp_field_proposals" ON public.empreendimento_field_proposals
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT public.empr_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT public.empr_user_org_ids()));

-- Fila ativa = só o que aguarda decisão, com o nome da torre/unidade para a UI não precisar
-- de N joins. Espelha a view dead_letter_queue (20270129000000).
CREATE OR REPLACE VIEW public.empreendimento_proposal_queue AS
SELECT
    p.*,
    t.name AS tower_name,
    u.name AS unit_name
FROM public.empreendimento_field_proposals p
LEFT JOIN public.empreendimento_towers t
    ON p.entity = 'tower' AND t.id = p.entity_id
LEFT JOIN public.empreendimento_units u
    ON p.entity = 'unit' AND u.id = p.entity_id
WHERE p.status = 'pending';
