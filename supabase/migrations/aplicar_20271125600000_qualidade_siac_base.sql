-- =============================================================================
-- Qualidade (SiAC / PBQP-H) — fase 1: base de dados.
-- Plano: docs/planos/2026-11-25-qualidade-siac-pbqph.md (seção "Fase 1 — desenho").
--
-- O que nasce aqui:
--   • quality_settings               — por organização: nível alvo (B | A).
--   • quality_controlled_items       — lista controlada de serviços e materiais
--                                      (Anexo 4 + próprios), com procedimento (GED)
--                                      e treinamento (curso) ligados.
--   • quality_controlled_item_codes  — códigos da Base ligados ao item.
--   • quality_project_exclusions     — exceção por obra ("não se aplica"), com motivo.
--   • quality_registrar_treinamento_em_obra — registra um treinamento presencial em
--     obra para colaboradores próprios + pessoal de empreiteira (cadastra a ficha
--     do terceiro sem ficha, reaproveita pelo CPF), tudo numa transação.
--
-- REGRA #7:
--   Pergunta 1 — nenhuma policy tem OR: settings/items exigem a org do usuário;
--   codes exigem o item visível (que já exige a org); exclusions exigem o item
--   visível E a obra visível E as duas da mesma organização.
--   Pergunta 2 — toda função nova: REVOKE EXECUTE FROM PUBLIC, anon + GRANT a
--   authenticated. Nenhuma é SECURITY DEFINER: a RPC roda com a RLS de quem
--   chama (employees / employee_trainings / training_courses são por
--   minhas_orgs_membro()) e ainda confere a organização por dentro.
--
-- Idempotente (IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS).
-- Aplicar com `npx supabase db query --linked -f` — nunca `db push`.
-- =============================================================================

SET lock_timeout = '3s';

BEGIN;

-- ── 1. Tabelas ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.quality_settings (
    organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
    nivel_alvo      text NOT NULL DEFAULT 'B' CHECK (nivel_alvo IN ('B', 'A')),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.quality_settings IS
    'Qualidade (SiAC): configuração por organização — nível alvo da certificação (B ou A).';

CREATE TABLE IF NOT EXISTS public.quality_controlled_items (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    tipo                  text NOT NULL CHECK (tipo IN ('SERVICO', 'MATERIAL')),
    nome                  text NOT NULL CHECK (btrim(nome) <> ''),
    etapa                 text,
    origem                text NOT NULL CHECK (origem IN ('ANEXO4', 'PROPRIO', 'CLIENTE', 'FAD_DATEC')),
    anexo4_numero         integer CHECK (anexo4_numero BETWEEN 1 AND 27),
    chave_padrao          text,
    substitui_item_id     uuid REFERENCES public.quality_controlled_items(id) ON DELETE SET NULL,
    situacao              text NOT NULL DEFAULT 'ATIVO' CHECK (situacao IN ('ATIVO', 'DISPENSADO', 'ARQUIVADO')),
    justificativa         text,
    procedure_document_id uuid REFERENCES public.opura_documents(id) ON DELETE SET NULL,
    training_course_id    uuid REFERENCES public.training_courses(id) ON DELETE SET NULL,
    ordem                 integer NOT NULL DEFAULT 0,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid DEFAULT auth.uid(),
    CONSTRAINT quality_controlled_items_dispensado_justificativa
        CHECK (situacao <> 'DISPENSADO' OR btrim(coalesce(justificativa, '')) <> ''),
    -- Não parcial: NULLs não colidem, e o PostgREST precisa de constraint
    -- não parcial para `onConflict` (carregar a lista padrão duas vezes não duplica).
    CONSTRAINT quality_controlled_items_org_chave_padrao_key
        UNIQUE (organization_id, chave_padrao)
);

CREATE INDEX IF NOT EXISTS idx_quality_controlled_items_org
    ON public.quality_controlled_items (organization_id, tipo, ordem);
CREATE INDEX IF NOT EXISTS idx_quality_controlled_items_doc
    ON public.quality_controlled_items (procedure_document_id) WHERE procedure_document_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quality_controlled_items_curso
    ON public.quality_controlled_items (training_course_id) WHERE training_course_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quality_controlled_items_substitui
    ON public.quality_controlled_items (substitui_item_id) WHERE substitui_item_id IS NOT NULL;

COMMENT ON TABLE public.quality_controlled_items IS
    'Qualidade (SiAC): lista controlada de serviços e materiais da organização. '
    'DISPENSADO exige justificativa; procedimento (opura_documents), curso (training_courses) '
    'e item substituído são sempre da mesma organização (trigger quality_controlled_items_mesma_org).';
COMMENT ON COLUMN public.quality_controlled_items.chave_padrao IS
    'Chave do item quando veio de uma lista padrão (ex.: Anexo 4 nº 6, sugestão de materiais) — '
    'única por organização; NULL para item criado à mão.';

CREATE TABLE IF NOT EXISTS public.quality_controlled_item_codes (
    item_id   uuid NOT NULL REFERENCES public.quality_controlled_items(id) ON DELETE CASCADE,
    item_code text NOT NULL CHECK (btrim(item_code) <> ''),
    PRIMARY KEY (item_id, item_code)
);

CREATE INDEX IF NOT EXISTS idx_quality_controlled_item_codes_code
    ON public.quality_controlled_item_codes (item_code);

COMMENT ON TABLE public.quality_controlled_item_codes IS
    'Qualidade (SiAC): códigos da Base (composição para serviço, insumo para material) ligados ao item controlado.';

CREATE TABLE IF NOT EXISTS public.quality_project_exclusions (
    project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    item_id    uuid NOT NULL REFERENCES public.quality_controlled_items(id) ON DELETE CASCADE,
    motivo     text NOT NULL CHECK (btrim(motivo) <> ''),
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    PRIMARY KEY (project_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_quality_project_exclusions_item
    ON public.quality_project_exclusions (item_id);

COMMENT ON TABLE public.quality_project_exclusions IS
    'Qualidade (SiAC): item controlado que NÃO se aplica numa obra, com motivo. Sem linha = aplica.';

-- ── 2. Gatilhos ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.quality_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quality_settings_updated_at ON public.quality_settings;
CREATE TRIGGER trg_quality_settings_updated_at
    BEFORE UPDATE ON public.quality_settings
    FOR EACH ROW EXECUTE FUNCTION public.quality_touch_updated_at();

DROP TRIGGER IF EXISTS trg_quality_controlled_items_updated_at ON public.quality_controlled_items;
CREATE TRIGGER trg_quality_controlled_items_updated_at
    BEFORE UPDATE ON public.quality_controlled_items
    FOR EACH ROW EXECUTE FUNCTION public.quality_touch_updated_at();

-- Procedimento, curso e item substituído: sempre da MESMA organização do item.
-- SECURITY INVOKER: a busca passa pela RLS de quem grava — registro que ele não
-- enxerga também é recusado (não revela se existe em outra organização).
CREATE OR REPLACE FUNCTION public.quality_controlled_items_mesma_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Organização do item é imutável: mover o item deixaria para trás quem aponta
    -- para ele (substitui_item_id de outro item, exclusões em obras da org antiga).
    IF TG_OP = 'UPDATE' AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
        RAISE EXCEPTION 'A organização de um item controlado não pode ser trocada.'
            USING ERRCODE = '42501';
    END IF;

    IF NEW.procedure_document_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.opura_documents d
         WHERE d.id = NEW.procedure_document_id
           AND d.organization_id = NEW.organization_id
    ) THEN
        RAISE EXCEPTION 'O procedimento escolhido não é desta organização.'
            USING ERRCODE = '42501';
    END IF;

    IF NEW.training_course_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.training_courses c
         WHERE c.id = NEW.training_course_id
           AND c.org_id = NEW.organization_id
    ) THEN
        RAISE EXCEPTION 'O treinamento escolhido não é desta organização.'
            USING ERRCODE = '42501';
    END IF;

    IF NEW.substitui_item_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.quality_controlled_items i
         WHERE i.id = NEW.substitui_item_id
           AND i.organization_id = NEW.organization_id
    ) THEN
        RAISE EXCEPTION 'O item substituído não é desta organização.'
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quality_controlled_items_mesma_org ON public.quality_controlled_items;
CREATE TRIGGER trg_quality_controlled_items_mesma_org
    BEFORE INSERT OR UPDATE ON public.quality_controlled_items
    FOR EACH ROW EXECUTE FUNCTION public.quality_controlled_items_mesma_org();

-- ── 3. RLS ─────────────────────────────────────────────────────────────────

ALTER TABLE public.quality_settings              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quality_controlled_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quality_controlled_item_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quality_project_exclusions    ENABLE ROW LEVEL SECURITY;

-- quality_settings — org do usuário (sem OR).
DROP POLICY IF EXISTS quality_settings_select ON public.quality_settings;
CREATE POLICY quality_settings_select ON public.quality_settings
    FOR SELECT TO authenticated
    USING (organization_id IN (SELECT public.minhas_orgs_membro()));

DROP POLICY IF EXISTS quality_settings_insert ON public.quality_settings;
CREATE POLICY quality_settings_insert ON public.quality_settings
    FOR INSERT TO authenticated
    WITH CHECK (organization_id IN (SELECT public.minhas_orgs_membro()));

DROP POLICY IF EXISTS quality_settings_update ON public.quality_settings;
CREATE POLICY quality_settings_update ON public.quality_settings
    FOR UPDATE TO authenticated
    USING (organization_id IN (SELECT public.minhas_orgs_membro()))
    WITH CHECK (organization_id IN (SELECT public.minhas_orgs_membro()));

DROP POLICY IF EXISTS quality_settings_delete ON public.quality_settings;
CREATE POLICY quality_settings_delete ON public.quality_settings
    FOR DELETE TO authenticated
    USING (organization_id IN (SELECT public.minhas_orgs_membro()));

-- quality_controlled_items — org do usuário (sem OR).
DROP POLICY IF EXISTS quality_controlled_items_select ON public.quality_controlled_items;
CREATE POLICY quality_controlled_items_select ON public.quality_controlled_items
    FOR SELECT TO authenticated
    USING (organization_id IN (SELECT public.minhas_orgs_membro()));

DROP POLICY IF EXISTS quality_controlled_items_insert ON public.quality_controlled_items;
CREATE POLICY quality_controlled_items_insert ON public.quality_controlled_items
    FOR INSERT TO authenticated
    WITH CHECK (organization_id IN (SELECT public.minhas_orgs_membro()));

DROP POLICY IF EXISTS quality_controlled_items_update ON public.quality_controlled_items;
CREATE POLICY quality_controlled_items_update ON public.quality_controlled_items
    FOR UPDATE TO authenticated
    USING (organization_id IN (SELECT public.minhas_orgs_membro()))
    WITH CHECK (organization_id IN (SELECT public.minhas_orgs_membro()));

DROP POLICY IF EXISTS quality_controlled_items_delete ON public.quality_controlled_items;
CREATE POLICY quality_controlled_items_delete ON public.quality_controlled_items
    FOR DELETE TO authenticated
    USING (organization_id IN (SELECT public.minhas_orgs_membro()));

-- quality_controlled_item_codes — o item tem de ser visível (a RLS do item já
-- exige a org do usuário).
DROP POLICY IF EXISTS quality_controlled_item_codes_select ON public.quality_controlled_item_codes;
CREATE POLICY quality_controlled_item_codes_select ON public.quality_controlled_item_codes
    FOR SELECT TO authenticated
    USING (item_id IN (SELECT id FROM public.quality_controlled_items));

DROP POLICY IF EXISTS quality_controlled_item_codes_insert ON public.quality_controlled_item_codes;
CREATE POLICY quality_controlled_item_codes_insert ON public.quality_controlled_item_codes
    FOR INSERT TO authenticated
    WITH CHECK (item_id IN (SELECT id FROM public.quality_controlled_items));

DROP POLICY IF EXISTS quality_controlled_item_codes_update ON public.quality_controlled_item_codes;
CREATE POLICY quality_controlled_item_codes_update ON public.quality_controlled_item_codes
    FOR UPDATE TO authenticated
    USING (item_id IN (SELECT id FROM public.quality_controlled_items))
    WITH CHECK (item_id IN (SELECT id FROM public.quality_controlled_items));

DROP POLICY IF EXISTS quality_controlled_item_codes_delete ON public.quality_controlled_item_codes;
CREATE POLICY quality_controlled_item_codes_delete ON public.quality_controlled_item_codes
    FOR DELETE TO authenticated
    USING (item_id IN (SELECT id FROM public.quality_controlled_items));

-- quality_project_exclusions — item visível E obra visível E as duas da mesma
-- organização (as duas subconsultas passam pela RLS de items e de projects).
DROP POLICY IF EXISTS quality_project_exclusions_select ON public.quality_project_exclusions;
CREATE POLICY quality_project_exclusions_select ON public.quality_project_exclusions
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.quality_controlled_items i
          JOIN public.projects p ON p.id = quality_project_exclusions.project_id
         WHERE i.id = quality_project_exclusions.item_id
           AND p.organization_id = i.organization_id));

DROP POLICY IF EXISTS quality_project_exclusions_insert ON public.quality_project_exclusions;
CREATE POLICY quality_project_exclusions_insert ON public.quality_project_exclusions
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.quality_controlled_items i
          JOIN public.projects p ON p.id = quality_project_exclusions.project_id
         WHERE i.id = quality_project_exclusions.item_id
           AND p.organization_id = i.organization_id));

DROP POLICY IF EXISTS quality_project_exclusions_update ON public.quality_project_exclusions;
CREATE POLICY quality_project_exclusions_update ON public.quality_project_exclusions
    FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.quality_controlled_items i
          JOIN public.projects p ON p.id = quality_project_exclusions.project_id
         WHERE i.id = quality_project_exclusions.item_id
           AND p.organization_id = i.organization_id))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.quality_controlled_items i
          JOIN public.projects p ON p.id = quality_project_exclusions.project_id
         WHERE i.id = quality_project_exclusions.item_id
           AND p.organization_id = i.organization_id));

DROP POLICY IF EXISTS quality_project_exclusions_delete ON public.quality_project_exclusions;
CREATE POLICY quality_project_exclusions_delete ON public.quality_project_exclusions
    FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.quality_controlled_items i
          JOIN public.projects p ON p.id = quality_project_exclusions.project_id
         WHERE i.id = quality_project_exclusions.item_id
           AND p.organization_id = i.organization_id));

-- Privilégios de tabela: os default privileges do Supabase dão TUDO a
-- authenticated/anon; TRUNCATE ignora a RLS. anon não usa nada daqui.
REVOKE ALL ON public.quality_settings, public.quality_controlled_items,
              public.quality_controlled_item_codes, public.quality_project_exclusions
    FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER
    ON public.quality_settings, public.quality_controlled_items,
       public.quality_controlled_item_codes, public.quality_project_exclusions
    FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
    ON public.quality_settings, public.quality_controlled_items,
       public.quality_controlled_item_codes, public.quality_project_exclusions
    TO authenticated;

-- ── 4. RPC: registrar treinamento em obra ───────────────────────────────────
-- p_novos_terceiros: [{ "nome": text (obrigatório), "cpf": text?, "empreiteira": text? }]
-- CPF informado tem de ter 11 dígitos e é gravado como 000.000.000-00 (formato do
-- app). Terceiro com CPF já cadastrado na org (comparando só os dígitos) reaproveita a
-- ficha; senão ganha ficha própria (EMPREITEIRO, academy_externo, sem e-mail e
-- sem acesso a portal). Um registro em employee_trainings por pessoa distinta.
-- Devolve quantos registros gravou.
CREATE OR REPLACE FUNCTION public.quality_registrar_treinamento_em_obra(
    p_org              uuid,
    p_course_id        uuid,
    p_data             date,
    p_instrutor        text,
    p_local            text,
    p_employee_ids     uuid[],
    p_novos_terceiros  jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_carga       numeric;
    v_pessoas     uuid[] := ARRAY[]::uuid[];
    v_terceiros   jsonb  := coalesce(p_novos_terceiros, '[]'::jsonb);
    v_t           jsonb;
    v_nome        text;
    v_cpf         text;
    v_cpf_digitos text;
    v_empreiteira text;
    v_emp         uuid;
    v_n           integer := 0;
BEGIN
    IF p_org IS NULL OR p_org NOT IN (SELECT public.minhas_orgs_membro()) THEN
        RAISE EXCEPTION 'Você não é membro desta organização.' USING ERRCODE = '42501';
    END IF;

    IF p_data IS NULL THEN
        RAISE EXCEPTION 'Informe a data do treinamento.' USING ERRCODE = '22023';
    END IF;

    SELECT c.carga_horaria INTO v_carga
      FROM public.training_courses c
     WHERE c.id = p_course_id AND c.org_id = p_org;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'O treinamento escolhido não é desta organização.' USING ERRCODE = '42501';
    END IF;

    -- Colaboradores já cadastrados: todos da org (nada de ficha disponibilizada
    -- por outra organização — employees GRAVAR é da org dona).
    IF p_employee_ids IS NOT NULL AND cardinality(p_employee_ids) > 0 THEN
        IF EXISTS (
            SELECT 1 FROM unnest(p_employee_ids) AS x(id)
             WHERE x.id IS NULL
                OR NOT EXISTS (SELECT 1 FROM public.employees e
                                WHERE e.id = x.id AND e.org_id = p_org)
        ) THEN
            RAISE EXCEPTION 'Há colaborador que não pertence a esta organização.' USING ERRCODE = '42501';
        END IF;
        v_pessoas := p_employee_ids;
    END IF;

    IF jsonb_typeof(v_terceiros) = 'null' THEN
        v_terceiros := '[]'::jsonb;
    END IF;
    IF jsonb_typeof(v_terceiros) <> 'array' THEN
        RAISE EXCEPTION 'Pessoal de empreiteira: formato inválido (esperada uma lista).' USING ERRCODE = '22023';
    END IF;

    FOR v_t IN SELECT value FROM jsonb_array_elements(v_terceiros) LOOP
        IF jsonb_typeof(v_t) <> 'object' THEN
            RAISE EXCEPTION 'Pessoal de empreiteira: formato inválido.' USING ERRCODE = '22023';
        END IF;
        IF jsonb_typeof(v_t -> 'nome') IS DISTINCT FROM 'string'
           OR btrim(v_t ->> 'nome') = '' THEN
            RAISE EXCEPTION 'Pessoal de empreiteira: o nome é obrigatório.' USING ERRCODE = '22023';
        END IF;
        IF (v_t ? 'cpf' AND jsonb_typeof(v_t -> 'cpf') NOT IN ('string', 'null'))
           OR (v_t ? 'empreiteira' AND jsonb_typeof(v_t -> 'empreiteira') NOT IN ('string', 'null')) THEN
            RAISE EXCEPTION 'Pessoal de empreiteira: CPF e empreiteira são texto.' USING ERRCODE = '22023';
        END IF;

        v_nome        := btrim(v_t ->> 'nome');
        v_cpf         := nullif(btrim(coalesce(v_t ->> 'cpf', '')), '');
        v_cpf_digitos := regexp_replace(coalesce(v_cpf, ''), '\D', '', 'g');
        v_empreiteira := nullif(btrim(coalesce(v_t ->> 'empreiteira', '')), '');
        v_emp         := NULL;

        -- CPF: ausente é permitido; informado tem de ter 11 dígitos e é gravado no
        -- formato do app (000.000.000-00) — o índice único (org_id, cpf) compara o
        -- texto cru, e o RH grava com máscara.
        IF v_cpf IS NULL THEN
            v_cpf_digitos := NULL;
        ELSIF length(v_cpf_digitos) <> 11 THEN
            RAISE EXCEPTION 'CPF inválido para %: informe os 11 dígitos.', v_nome USING ERRCODE = '22023';
        ELSE
            v_cpf := substr(v_cpf_digitos, 1, 3) || '.' || substr(v_cpf_digitos, 4, 3) || '.'
                  || substr(v_cpf_digitos, 7, 3) || '-' || substr(v_cpf_digitos, 10, 2);
        END IF;

        IF v_cpf_digitos IS NOT NULL THEN
            SELECT e.id INTO v_emp
              FROM public.employees e
             WHERE e.org_id = p_org
               AND e.cpf IS NOT NULL
               AND regexp_replace(e.cpf, '\D', '', 'g') = v_cpf_digitos
             ORDER BY e.created_at NULLS LAST
             LIMIT 1;
        END IF;

        IF v_emp IS NULL THEN
            INSERT INTO public.employees (
                org_id, name, cpf, role, contract_type, status,
                hire_date, base_salary, academy_externo, notes)
            VALUES (
                p_org, v_nome, v_cpf, 'Terceirizado', 'EMPREITEIRO', 'ATIVO',
                CURRENT_DATE, 0, TRUE,
                'Pessoal de empreiteira cadastrado pelo registro de treinamento em obra'
                    || CASE WHEN v_empreiteira IS NOT NULL THEN ' — ' || v_empreiteira ELSE '' END)
            RETURNING id INTO v_emp;
        END IF;

        v_pessoas := v_pessoas || v_emp;
    END LOOP;

    IF cardinality(v_pessoas) = 0 THEN
        RAISE EXCEPTION 'Informe ao menos uma pessoa treinada.' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.employee_trainings (
        org_id, employee_id, course_id, data_realizacao, instrutor, local,
        carga_horaria, aprovado, status, origem)
    SELECT DISTINCT
        p_org, x.id, p_course_id, p_data,
        nullif(btrim(coalesce(p_instrutor, '')), ''),
        nullif(btrim(coalesce(p_local, '')), ''),
        v_carga, TRUE, 'ATIVO', 'MANUAL'
      FROM unnest(v_pessoas) AS x(id);
    GET DIAGNOSTICS v_n = ROW_COUNT;

    RETURN v_n;
END;
$$;

COMMENT ON FUNCTION public.quality_registrar_treinamento_em_obra(uuid, uuid, date, text, text, uuid[], jsonb) IS
    'Qualidade (SiAC): registra um treinamento em obra (employee_trainings) para colaboradores da org e '
    'pessoal de empreiteira (cadastra a ficha EMPREITEIRO/academy_externo se o CPF ainda não existe na org). '
    'SECURITY INVOKER — roda com a RLS de quem chama. Devolve quantos registros gravou.';

-- ── 5. Quem executa ─────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.quality_touch_updated_at() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.quality_touch_updated_at() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.quality_controlled_items_mesma_org() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.quality_controlled_items_mesma_org() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.quality_registrar_treinamento_em_obra(uuid, uuid, date, text, text, uuid[], jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.quality_registrar_treinamento_em_obra(uuid, uuid, date, text, text, uuid[], jsonb) TO authenticated;

COMMIT;
