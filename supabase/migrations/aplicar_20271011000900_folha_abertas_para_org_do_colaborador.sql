-- Folhas ABERTAS: colaborador de outra organização vai para o ciclo da org
-- DELE (11/10/2026)
--
-- Regra de produto: "a folha deve ser gerada na organizacao do colaborador e
-- nao do usuário". Até aqui `runPayroll(orgId)` incluía os colaboradores
-- COMPARTILHADOS com a org, e a folha foi gerada assim desde 11/2025, nos dois
-- sentidos — e em vários meses o mesmo colaborador ficou nas DUAS folhas.
-- Decisão do usuário: corrigir as folhas abertas agora; fechadas não mudam.
--
-- Para cada resultado de colaborador de outra org num ciclo NÃO fechado:
--   · destino (ciclo da org dele, mesmo período/tipo/subtipo) já tem ele →
--     DUPLICATA: apaga a cópia (resultado + itens); eventos vão para o destino;
--   · destino aberto, sem ele → MOVE resultado, itens e eventos;
--   · destino não existe → CRIA o ciclo na org dele e move.
--   · destino FECHADO → NÃO MEXE (seria alterar folha fechada; casos de 04 e
--     06/2026 ficam para decisão manual — ver o plano).
-- Valores preservados: move linha, não recalcula.
--
-- Trava: aborta se alguma folha de origem tiver lançamento LABOR em
-- internal_transactions (mover sem refazer o financeiro deixaria o lançamento
-- apontando para a org errada). Medido antes: só a 04/2026 da Garden tem, e
-- ela está fora (destino fechado).
--
-- Reversão: tudo o que muda fica em public.folha_org_colaborador_reversao_20261011
-- (RLS ligada, sem grant — não apagar).
--
-- Aplicar com `npx supabase db query --linked -f` — NUNCA `db push`.
-- Idempotente: na 2ª execução não há mais resultado cruzado em folha aberta
-- com destino aberto/inexistente.

BEGIN;

CREATE TABLE IF NOT EXISTS public.folha_org_colaborador_reversao_20261011 (
    id           bigserial PRIMARY KEY,
    acao         text NOT NULL,           -- DUPLICATA | MOVIDO | MOVIDO_CICLO_NOVO
    origem_run   uuid NOT NULL,
    destino_run  uuid NOT NULL,
    employee_id  uuid NOT NULL,
    results      jsonb,
    items        jsonb,
    events       jsonb,
    ciclo_criado boolean NOT NULL DEFAULT false,
    criado_em    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.folha_org_colaborador_reversao_20261011 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.folha_org_colaborador_reversao_20261011 FROM PUBLIC, anon, authenticated;

CREATE TEMP TABLE plano ON COMMIT DROP AS
SELECT DISTINCT r.id AS origem_run, pr.employee_id, e.org_id AS emp_org,
       r.start_date, r.end_date, r.type, r.subtype, r.status,
       (SELECT d.id FROM public.payroll_runs d
         WHERE d.org_id = e.org_id AND d.start_date = r.start_date AND d.type = r.type
           AND coalesce(d.subtype, '') = coalesce(r.subtype, '')
         ORDER BY d.created_at LIMIT 1) AS destino_run
  FROM public.payroll_results pr
  JOIN public.payroll_runs r ON r.id = pr.payroll_run_id
  JOIN public.employees e    ON e.id = pr.employee_id
 WHERE e.org_id <> r.org_id
   AND r.status <> 'FECHADO';

ALTER TABLE plano ADD COLUMN ciclo_criado boolean NOT NULL DEFAULT false,
                  ADD COLUMN ja_no_destino boolean;

-- destino fechado: fora
DELETE FROM plano p USING public.payroll_runs d
 WHERE d.id = p.destino_run AND d.status = 'FECHADO';

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.internal_transactions it
          JOIN plano p ON it.reference_id LIKE 'labor-' || p.origem_run::text || '-%'
         WHERE it.source_system = 'LABOR'
    ) THEN
        RAISE EXCEPTION 'Folha de origem com lançamento financeiro — abortado, nada mudou.';
    END IF;
END $$;

-- ciclos que faltam (um por org/período/tipo/subtipo)
WITH faltam AS (
    SELECT DISTINCT ON (emp_org, start_date, type, coalesce(subtype, ''))
           emp_org, start_date, end_date, type, subtype, status
      FROM plano WHERE destino_run IS NULL
     ORDER BY emp_org, start_date, type, coalesce(subtype, '')
), novos AS (
    INSERT INTO public.payroll_runs (org_id, start_date, end_date, status, type, subtype)
    SELECT emp_org, start_date, end_date, status, type, subtype FROM faltam
    RETURNING id, org_id, start_date, type, subtype
)
UPDATE plano p SET destino_run = n.id, ciclo_criado = true
  FROM novos n
 WHERE p.destino_run IS NULL AND n.org_id = p.emp_org AND n.start_date = p.start_date
   AND n.type = p.type AND coalesce(n.subtype, '') = coalesce(p.subtype, '');

UPDATE plano p SET
    ja_no_destino = EXISTS (SELECT 1 FROM public.payroll_results x
                             WHERE x.payroll_run_id = p.destino_run AND x.employee_id = p.employee_id);

INSERT INTO public.folha_org_colaborador_reversao_20261011
       (acao, origem_run, destino_run, employee_id, results, items, events, ciclo_criado)
SELECT CASE WHEN p.ja_no_destino THEN 'DUPLICATA'
            WHEN p.ciclo_criado  THEN 'MOVIDO_CICLO_NOVO'
            ELSE 'MOVIDO' END,
       p.origem_run, p.destino_run, p.employee_id,
       (SELECT jsonb_agg(to_jsonb(x)) FROM public.payroll_results x WHERE x.payroll_run_id = p.origem_run AND x.employee_id = p.employee_id),
       (SELECT jsonb_agg(to_jsonb(x)) FROM public.payroll_items   x WHERE x.payroll_run_id = p.origem_run AND x.employee_id = p.employee_id),
       (SELECT jsonb_agg(to_jsonb(x)) FROM public.payroll_events  x WHERE x.payroll_run_id = p.origem_run AND x.employee_id = p.employee_id),
       p.ciclo_criado
  FROM plano p;

-- eventos: sempre vão para o ciclo da org do colaborador
UPDATE public.payroll_events ev
   SET payroll_run_id = p.destino_run, org_id = p.emp_org
  FROM plano p
 WHERE ev.payroll_run_id = p.origem_run AND ev.employee_id = p.employee_id;

-- duplicata: apaga a cópia
DELETE FROM public.payroll_items i USING plano p
 WHERE p.ja_no_destino AND i.payroll_run_id = p.origem_run AND i.employee_id = p.employee_id;
DELETE FROM public.payroll_results x USING plano p
 WHERE p.ja_no_destino AND x.payroll_run_id = p.origem_run AND x.employee_id = p.employee_id;

-- demais: move
UPDATE public.payroll_items i SET payroll_run_id = p.destino_run
  FROM plano p
 WHERE NOT p.ja_no_destino AND i.payroll_run_id = p.origem_run AND i.employee_id = p.employee_id;
UPDATE public.payroll_results x SET payroll_run_id = p.destino_run
  FROM plano p
 WHERE NOT p.ja_no_destino AND x.payroll_run_id = p.origem_run AND x.employee_id = p.employee_id;

COMMIT;
