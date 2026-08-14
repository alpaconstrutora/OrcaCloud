-- ============================================================================
-- Garantia do fornecedor — alerta antes de vencer
-- Plano: docs/planos/2026-08-13-opura-condominios-avaliacao.md (F2)
--
-- POR QUE 90 DIAS, E NÃO 30 COMO NA MANUTENÇÃO: a manutenção vencida se resolve
-- executando o serviço; a garantia vencida não se resolve de jeito nenhum. Ela
-- só tem valor ANTES de expirar, e acionar fornecedor envolve laudo, orçamento
-- e negociação — descobrir na véspera é o mesmo que descobrir depois. Passado o
-- prazo, o conserto vira custo do condomínio.
--
-- Esta é a garantia de QUEM VENDEU o equipamento, contada da instalação. Não é
-- a de `warranty_terms`, que é da construtora ao comprador e corre da entrega
-- do imóvel. Confundi-las faz o condomínio cobrar da parte errada e descobrir
-- tarde que o prazo da certa já passou.
--
-- ⚠️ APLICAR À MÃO, UM BLOCO POR VEZ.
-- ============================================================================

-- ═══ BLOCO 1 — a marca de "já avisei" ═══════════════════════════════════════
-- Mesmo raciocínio do alerta de manutenção: a marca é o PAR (data, estágio).
-- Sem isso o cron repete o aviso todo dia e o usuário aprende a ignorá-lo.
SET lock_timeout = '5s';

ALTER TABLE public.opura_assets
  ADD COLUMN IF NOT EXISTS warranty_alerted_for DATE,
  ADD COLUMN IF NOT EXISTS warranty_alerted_stage TEXT
      CHECK (warranty_alerted_stage IS NULL OR warranty_alerted_stage IN ('PROXIMO','VENCIDA'));

COMMENT ON COLUMN public.opura_assets.warranty_alerted_for IS
  'Para QUAL data de fim de garantia o alerta já foi disparado. Se a garantia '
  'for estendida (nova data), o ativo volta a ser elegível sozinho.';

-- ═══ BLOCO 2 — a função ═════════════════════════════════════════════════════
SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.fn_supplier_warranty_alerts(p_days_ahead INTEGER DEFAULT 90)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_rec     RECORD;
    v_stage   TEXT;
    v_titulo  TEXT;
    v_corpo   TEXT;
    v_label   TEXT;
    v_criados INTEGER := 0;
BEGIN
    FOR v_rec IN
        SELECT a.id, a.name, a.code, a.supplier_warranty_until,
               a.warranty_alerted_for, a.warranty_alerted_stage,
               COALESCE(s.name, 'Sem sistema') AS system_name,
               e.name                          AS empreendimento_name,
               e.organization_id               AS organization_id
        FROM public.opura_assets a
        JOIN public.empreendimentos e       ON e.id = a.empreendimento_id
        LEFT JOIN public.building_systems s  ON s.id = a.building_system_id
        WHERE a.empreendimento_id IS NOT NULL
          AND a.supplier_warranty_until IS NOT NULL
          -- Só edifício em operação cobra: alertar sobre garantia de prédio que
          -- ainda não é condomínio é ruído para quem não pode agir.
          AND e.status = 'EM_OPERACAO'
          AND a.supplier_warranty_until <= CURRENT_DATE + p_days_ahead
    LOOP
        v_stage := CASE WHEN v_rec.supplier_warranty_until < CURRENT_DATE THEN 'VENCIDA' ELSE 'PROXIMO' END;

        IF v_rec.warranty_alerted_for = v_rec.supplier_warranty_until
           AND v_rec.warranty_alerted_stage = v_stage THEN
            CONTINUE;
        END IF;

        v_label := TO_CHAR(v_rec.supplier_warranty_until, 'DD/MM/YYYY');

        IF v_stage = 'VENCIDA' THEN
            v_titulo := 'Garantia VENCIDA — ' || v_rec.empreendimento_name;
            v_corpo  := v_rec.name || ' (' || v_rec.code || ', ' || v_rec.system_name || '). '
                     || 'A garantia do fornecedor venceu em ' || v_label
                     || '. A partir daqui, o conserto é custo do condomínio.';
        ELSE
            v_titulo := 'Garantia do fornecedor vence em breve — ' || v_rec.empreendimento_name;
            v_corpo  := v_rec.name || ' (' || v_rec.code || ', ' || v_rec.system_name || '). '
                     || 'A garantia vence em ' || v_label || ' ('
                     || (v_rec.supplier_warranty_until - CURRENT_DATE) || ' dias). '
                     || 'Se há defeito conhecido, acione o fornecedor ANTES do prazo.';
        END IF;

        INSERT INTO public.notifications (recipient_email, title, message, link, type)
        SELECT DISTINCT m.email, v_titulo, v_corpo, NULL, 'garantia_fornecedor'
          FROM public.organization_members m
         WHERE m.organization_id = v_rec.organization_id
           AND m.email IS NOT NULL;

        UPDATE public.opura_assets
           SET warranty_alerted_for   = v_rec.supplier_warranty_until,
               warranty_alerted_stage = v_stage,
               updated_at             = NOW()
         WHERE id = v_rec.id;

        v_criados := v_criados + 1;
    END LOOP;

    RETURN v_criados;
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_supplier_warranty_alerts(INTEGER) FROM PUBLIC;

-- ═══ BLOCO 3 — entra no MESMO job diário da manutenção ══════════════════════
-- Um job só: dois jobs no mesmo horário competem pela janela sem motivo, e
-- quem for depurar precisa lembrar que existem dois.
SET lock_timeout = '5s';

SELECT cron.unschedule('manutencao-vencimento-alerts')
WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'manutencao-vencimento-alerts'
);

-- UMA instrução só, somando os dois retornos: duas instruções separadas por
-- `;` dependem de o pg_cron aceitar múltiplas queries no mesmo comando, e não
-- vale apostar nisso — se a segunda for ignorada, o alerta de garantia
-- simplesmente nunca dispara, sem erro nenhum para denunciar.
SELECT cron.schedule(
    'manutencao-vencimento-alerts',
    '0 9 * * *',
    $$SELECT public.fn_maintenance_due_alerts(30) + public.fn_supplier_warranty_alerts(90);$$
);

-- ═══ BLOCO 4 — conferência ══════════════════════════════════════════════════
-- Rodar sozinho.
-- Esperado: colunas=2, funcao=1, job=1, e `comando` citando as DUAS funções

SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='opura_assets'
      AND column_name IN ('warranty_alerted_for','warranty_alerted_stage'))       AS colunas,
  (SELECT count(*) FROM pg_proc WHERE proname='fn_supplier_warranty_alerts')      AS funcao,
  (SELECT count(*) FROM cron.job WHERE jobname='manutencao-vencimento-alerts')    AS job,
  (SELECT command FROM cron.job WHERE jobname='manutencao-vencimento-alerts')     AS comando;

-- ═══ BLOCO 5 — teste (seguro repetir) ═══════════════════════════════════════
--   SELECT public.fn_supplier_warranty_alerts(90);   -- 1ª: N alertas
--   SELECT public.fn_supplier_warranty_alerts(90);   -- 2ª: TEM de devolver 0
--
--   SELECT title, message FROM public.notifications
--    WHERE type = 'garantia_fornecedor' ORDER BY created_at DESC LIMIT 10;
