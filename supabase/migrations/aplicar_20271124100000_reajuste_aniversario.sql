-- =============================================================================
-- Reajuste de locação pelo ANIVERSÁRIO, com escolha e aviso configurável.
-- Plano: docs/planos/2026-11-24-locacoes-reajustes-separados-das-renovacoes.md (Fase 2)
--
-- Aditiva: 2 colunas em contracts, 1 tabela de histórico, 1 RPC para o padrão da
-- organização e a troca do corpo de fn_notif_contrato_reajuste (mesma assinatura,
-- o cron `daily-financial-notifications` continua chamando fn_notif_contrato_reajuste(30)).
-- Aplicar com `npx supabase db query --linked -f` — nunca `db push`.
-- =============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

-- 1) Contrato: periodicidade do reajuste e antecedência do aviso -----------------
ALTER TABLE public.contracts
    ADD COLUMN IF NOT EXISTS reajuste_periodicidade_meses smallint,
    ADD COLUMN IF NOT EXISTS reajuste_aviso_dias smallint;

COMMENT ON COLUMN public.contracts.reajuste_periodicidade_meses IS
    'De quantos em quantos meses o reajuste é aplicado (aniversário). NULL = 12 (Anual). '
    'Na locação vem da "Periodicidade do Reajuste" da negociação — billing_cycle do contrato é a cadência de COBRANÇA.';
COMMENT ON COLUMN public.contracts.reajuste_aviso_dias IS
    'Quantos dias antes do reajuste avisar. NULL = padrão da organização (organizations.settings.reajuste_aviso_dias), senão 30.';

DO $$ BEGIN
    ALTER TABLE public.contracts ADD CONSTRAINT contracts_reajuste_periodicidade_chk
        CHECK (reajuste_periodicidade_meses IS NULL OR reajuste_periodicidade_meses BETWEEN 1 AND 120);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE public.contracts ADD CONSTRAINT contracts_reajuste_aviso_chk
        CHECK (reajuste_aviso_dias IS NULL OR reajuste_aviso_dias BETWEEN 0 AND 365);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Periodicidade a partir da negociação (só onde ainda está vazia — idempotente).
UPDATE public.contracts c
   SET reajuste_periodicidade_meses = CASE d.billing_cycle
           WHEN 'Mensal' THEN 1 WHEN 'Bimestral' THEN 2 WHEN 'Trimestral' THEN 3
           WHEN 'Semestral' THEN 6 WHEN 'Anual' THEN 12 END
  FROM public.commercial_deals d
 WHERE d.id = c.deal_id
   AND c.domain = 'LOCACAO'
   AND c.reajuste_periodicidade_meses IS NULL
   AND d.billing_cycle IN ('Mensal', 'Bimestral', 'Trimestral', 'Semestral', 'Anual');

-- 2) Histórico de cada aniversário ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.contract_reajustes (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    contract_id          uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
    aniversario          date NOT NULL,
    data_base            date NOT NULL,
    indice               text,
    indice_mes_base      date,
    indice_valor_base    numeric,
    indice_mes_atual     date,
    indice_valor_atual   numeric,
    percentual_indice    numeric,
    decisao              text NOT NULL CHECK (decisao IN ('INDICE', 'PERCENTUAL', 'VALOR', 'NAO_APLICADO')),
    percentual_aplicado  numeric NOT NULL DEFAULT 0,
    valor_anterior       numeric NOT NULL,
    valor_novo           numeric NOT NULL,
    parcelas_atualizadas integer NOT NULL DEFAULT 0,
    observacao           text,
    criado_por           text DEFAULT (auth.jwt() ->> 'email'),
    created_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.contract_reajustes IS
    'Um registro por aniversário de reajuste decidido (aplicado pelo índice, por % ou valor, ou não aplicado). Somente inserção.';

CREATE INDEX IF NOT EXISTS idx_contract_reajustes_contrato
    ON public.contract_reajustes (contract_id, aniversario);

ALTER TABLE public.contract_reajustes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contract_reajustes_ler ON public.contract_reajustes;
CREATE POLICY contract_reajustes_ler ON public.contract_reajustes
    FOR SELECT TO authenticated
    USING (organization_id IN (SELECT public.minhas_orgs_membro()));

DROP POLICY IF EXISTS contract_reajustes_gravar ON public.contract_reajustes;
CREATE POLICY contract_reajustes_gravar ON public.contract_reajustes
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id IN (SELECT public.minhas_orgs_membro())
        AND EXISTS (
            SELECT 1 FROM public.contracts c
             WHERE c.id = contract_id AND c.organization_id = contract_reajustes.organization_id
        )
    );

-- Histórico é só inserção: sem UPDATE/DELETE por policy; TRUNCATE nunca.
REVOKE ALL ON public.contract_reajustes FROM anon;
REVOKE TRUNCATE, UPDATE, DELETE ON public.contract_reajustes FROM authenticated;

-- 3) Padrão da organização: dias de aviso -----------------------------------------
-- Mescla a chave em organizations.settings sem pisar nas outras (um UPDATE do
-- objeto inteiro pelo cliente apagaria chave gravada por outra tela no meio).
CREATE OR REPLACE FUNCTION public.fn_definir_aviso_reajuste_org(p_org uuid, p_dias integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    IF p_org IS NULL THEN
        RAISE EXCEPTION 'Escolha uma organização.';
    END IF;
    IF NOT (
        public.is_superadmin()
        OR EXISTS (
            SELECT 1 FROM public.organization_members m
             WHERE m.organization_id = p_org
               AND m.email = (auth.jwt() ->> 'email')
               AND m.role IN ('owner', 'admin')
        )
    ) THEN
        RAISE EXCEPTION 'Só o proprietário ou um administrador da organização altera o aviso de reajuste.'
            USING ERRCODE = '42501';
    END IF;
    IF p_dias IS NOT NULL AND (p_dias < 0 OR p_dias > 365) THEN
        RAISE EXCEPTION 'O aviso deve ficar entre 0 e 365 dias.';
    END IF;

    UPDATE public.organizations
       SET settings = CASE WHEN p_dias IS NULL
                           THEN COALESCE(settings, '{}'::jsonb) - 'reajuste_aviso_dias'
                           ELSE COALESCE(settings, '{}'::jsonb) || jsonb_build_object('reajuste_aviso_dias', p_dias) END
     WHERE id = p_org;

    RETURN p_dias;
END $$;

REVOKE ALL ON FUNCTION public.fn_definir_aviso_reajuste_org(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_definir_aviso_reajuste_org(uuid, integer) TO authenticated;

-- 4) Aviso diário: antecedência contrato → organização → p_days_ahead ------------
-- Locação: avisa do aniversário dentro da vigência, também quando já venceu (fica
-- até alguém decidir), no máximo uma vez a cada 30 dias por pessoa, e o link abre
-- Locações › Reajustes. Os demais domínios seguem como antes (janela de 90 dias
-- para trás, tela "Reajustes de Contrato").
CREATE OR REPLACE FUNCTION public.fn_notif_contrato_reajuste(p_days_ahead integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_c       RECORD;
    v_member  RECORD;
    v_created INTEGER := 0;
    v_link    TEXT;
    v_dias    INTEGER;
    v_quando  TEXT;
    v_locacao BOOLEAN;
BEGIN
    FOR v_c IN
        SELECT c.id, c.number, c.title, c.reajuste_proximo, c.reajuste_index,
               c.current_value, c.organization_id, c.domain, c.end_date,
               COALESCE(c.reajuste_aviso_dias,
                        NULLIF(o.settings ->> 'reajuste_aviso_dias', '')::int,
                        p_days_ahead) AS aviso
          FROM public.contracts c
          JOIN public.organizations o ON o.id = c.organization_id
         WHERE c.status IN ('Ativo', 'Assinado')
           AND c.reajuste_proximo IS NOT NULL
           AND c.reajuste_index IS NOT NULL
           AND c.reajuste_index <> 'Sem Reajuste'
           AND c.reajuste_proximo <= CURRENT_DATE + COALESCE(c.reajuste_aviso_dias,
                        NULLIF(o.settings ->> 'reajuste_aviso_dias', '')::int,
                        p_days_ahead)
           AND (
                 -- Locação: só aniversário dentro da vigência (depois do fim é renovação).
                 (c.domain = 'LOCACAO' AND (c.end_date IS NULL OR c.reajuste_proximo <= c.end_date))
              OR (c.domain IS DISTINCT FROM 'LOCACAO' AND c.reajuste_proximo >= CURRENT_DATE - 90)
           )
           -- Contrato já sucedido por uma renovação não precisa de reajuste:
           -- o valor novo vive no filho (mesma lógica do cron de renovação).
           AND NOT EXISTS (
               SELECT 1 FROM public.contracts f WHERE f.parent_contract_id = c.id
           )
    LOOP
        v_locacao := v_c.domain = 'LOCACAO';
        v_dias    := v_c.reajuste_proximo - CURRENT_DATE;
        v_quando  := CASE WHEN v_dias < 0 THEN 'venceu há ' || abs(v_dias) || ' dia(s)'
                          WHEN v_dias = 0 THEN 'vence hoje'
                          ELSE 'vence em ' || v_dias || ' dia(s)' END;
        v_link    := CASE WHEN v_locacao
                          THEN '/rentals?tab=reajustes&contract=' || v_c.id
                          ELSE '/contracts-reajuste?contract=' || v_c.id END;

        FOR v_member IN
            SELECT m.email
              FROM public.organization_members m
             WHERE m.organization_id = v_c.organization_id
               AND m.email IS NOT NULL
        LOOP
            IF NOT EXISTS (
                SELECT 1 FROM public.notifications n
                 WHERE n.recipient_email = v_member.email
                   AND n.link            = v_link
                   AND n.created_at      > now() - INTERVAL '30 days'
            ) THEN
                INSERT INTO public.notifications
                    (recipient_email, title, message, link, type, organization_id)
                VALUES (
                    v_member.email,
                    'Reajuste do contrato ' || v_c.number || ' ' || v_quando,
                    COALESCE(v_c.title, 'Contrato')
                        || ' — reajuste previsto para '
                        || to_char(v_c.reajuste_proximo, 'DD/MM/YYYY')
                        || COALESCE(' pelo índice ' || v_c.reajuste_index, '')
                        || COALESCE('. Valor atual: ' || public.fn_brl(v_c.current_value), '')
                        || CASE WHEN v_locacao
                                THEN '. Abra Locações › Reajustes para aplicar, ajustar ou não reajustar.'
                                ELSE '. Abra Contratos › Reajustes para aplicar.' END,
                    v_link,
                    'contrato_reajuste',
                    v_c.organization_id
                );
                v_created := v_created + 1;
            END IF;
        END LOOP;
    END LOOP;

    RETURN v_created;
END $function$;

COMMIT;
