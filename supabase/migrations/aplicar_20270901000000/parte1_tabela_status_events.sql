-- ═════════════════════════════════════════════════════════════════════════════
-- Histórico de status da unidade — PARTE 1 de 4: a tabela
-- ═════════════════════════════════════════════════════════════════════════════
-- ⚠️ RODAR CADA PARTE SEPARADAMENTE, uma por vez, esperando a anterior terminar.
--
-- Por quê: o editor SQL roda o script inteiro numa transação só. Os locks das
-- tabelas novas ficam segurados enquanto a transação AINDA espera lock numa
-- tabela quente (`commercial_properties`, `organizations`) — e qualquer processo
-- concorrente (PostgREST recarregando o cache de schema, uma query da aplicação)
-- fecha o ciclo e dá `40P01 deadlock detected`. Foi exatamente o que aconteceu
-- com Garantias F1 (20270836000000), que teve de ser quebrada em 5 partes.
--
-- `lock_timeout` faz a parte FALHAR em 5s em vez de ficar pendurada esperando.
-- Se der timeout, é só reexecutar — tudo aqui é idempotente.
--
-- Esta parte cria UMA tabela. A FK para `commercial_properties` pega
-- SHARE ROW EXCLUSIVE nela, por isso vem sozinha.
--
-- ── Por que esta tabela existe ───────────────────────────────────────────────
-- `commercial_properties.status` é um campo que SOBRESCREVE: o passado não
-- existe. Por isso "há quantos dias esta unidade está vaga" é hoje uma pergunta
-- sem resposta possível — não por falta de tela, por falta de dado. Esta tabela
-- é o log de eventos que destrava a seção inteira de tempo de vacância
-- (dias médios/mediana, vagas >30/60/90/180d, estoque envelhecido, absorção
-- líquida), além de turnover e permanência.
-- Plano: docs/planos/2026-08-06-kpis-locacao-primitivas.md (Fase 1).

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.commercial_property_status_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    property_id     UUID NOT NULL REFERENCES public.commercial_properties(id) ON DELETE CASCADE,

    -- NULL na primeira observação da unidade (criação e backfill): não havia
    -- estado anterior conhecido. A partir daí sempre preenchido pela trigger.
    from_status     TEXT,
    to_status       TEXT NOT NULL,

    -- Quando o estado passou a valer. É esta data que as contas de vacância
    -- usam — nunca `created_at`, que é quando a LINHA foi gravada. No backfill
    -- os dois divergem de propósito.
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    changed_by      UUID,

    -- Contrato que causou a mudança, quando houver. SEM FK para
    -- `commercial_deals` de propósito: a FK só serviria para integridade
    -- referencial de um campo informativo, e custaria mais um lock em tabela
    -- quente nesta migration. Referência órfã aqui não corrompe conta nenhuma.
    deal_id         UUID,

    source          TEXT NOT NULL DEFAULT 'MANUAL'
                    CHECK (source IN ('MANUAL', 'DEAL', 'BACKFILL', 'IMPORT')),
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A consulta dominante é "a linha do tempo desta unidade, do mais recente para
-- o mais antigo".
CREATE INDEX IF NOT EXISTS idx_prop_status_events_property
    ON public.commercial_property_status_events (property_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_prop_status_events_org
    ON public.commercial_property_status_events (organization_id, changed_at DESC);

-- Torna o BACKFILL (parte 4) idempotente: reexecutar não duplica a linha de
-- origem da unidade. Só vale para `source='BACKFILL'` — os eventos reais são
-- muitos por unidade e não podem ter unicidade.
CREATE UNIQUE INDEX IF NOT EXISTS uq_prop_status_events_backfill
    ON public.commercial_property_status_events (property_id)
    WHERE source = 'BACKFILL';

COMMENT ON TABLE public.commercial_property_status_events IS
    'Log de mudanças de status de imóvel/unidade. Origem dos KPIs de tempo de vacância — ver docs/planos/2026-08-06-kpis-locacao-primitivas.md (Fase 1).';

-- ── Conferência ──────────────────────────────────────────────────────────────
-- SELECT count(*) FROM public.commercial_property_status_events;   -- deve dar 0
