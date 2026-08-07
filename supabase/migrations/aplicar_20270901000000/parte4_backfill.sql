-- ═════════════════════════════════════════════════════════════════════════════
-- Histórico de status da unidade — PARTE 4 de 4: backfill
-- ═════════════════════════════════════════════════════════════════════════════
-- ⚠️ Rodar DEPOIS da parte 3 terminar.
--
-- Sem esta parte, toda unidade já cadastrada nasce SEM histórico, e os KPIs de
-- vacância aparecem vazios até que alguém mude o status de cada uma — o que na
-- prática significa uma tela zerada por meses. O backfill dá a cada unidade um
-- ponto de partida: "neste instante, ela estava neste estado".
--
-- ── O que este marco NÃO é ───────────────────────────────────────────────────
-- `changed_at` recebe `updated_at` da unidade, que é a última vez que QUALQUER
-- campo dela mudou — não necessariamente o status. É uma aproximação, e o
-- `notes` grava isso na própria linha para ninguém tratar o número como
-- observação real depois. Consequência prática: nos primeiros meses os "dias em
-- vacância" das unidades antigas são um piso, não a verdade; daqui para a
-- frente a trigger dá o dado exato.
-- Por isso o serviço de vacância separa o que veio de BACKFILL do que veio de
-- evento real, em vez de misturar os dois numa média só.

SET lock_timeout = '5s';

INSERT INTO public.commercial_property_status_events (
    organization_id, property_id, from_status, to_status,
    changed_at, source, notes
)
SELECT
    p.organization_id,
    p.id,
    NULL,                -- não há estado anterior conhecido
    p.status,
    COALESCE(p.updated_at, p.created_at, now()),
    'BACKFILL',
    'Marco inicial. changed_at = updated_at do imovel (ultima alteracao de QUALQUER campo), nao a data real da mudanca de status.'
FROM public.commercial_properties p
WHERE p.organization_id IS NOT NULL
  AND p.status IS NOT NULL
ON CONFLICT DO NOTHING;   -- idempotente pelo índice único parcial da parte 1

-- ── Conferência ──────────────────────────────────────────────────────────────
-- Nenhuma unidade com organização pode ficar sem evento. Deve dar 0:
--
-- SELECT count(*)
--   FROM public.commercial_properties p
--  WHERE p.organization_id IS NOT NULL
--    AND p.status IS NOT NULL
--    AND NOT EXISTS (SELECT 1 FROM public.commercial_property_status_events e
--                     WHERE e.property_id = p.id);
--
-- E a distribuição por origem (no primeiro dia, tudo BACKFILL):
-- SELECT source, count(*) FROM public.commercial_property_status_events GROUP BY source;
