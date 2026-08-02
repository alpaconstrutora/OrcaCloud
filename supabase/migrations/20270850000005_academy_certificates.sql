-- ============================================================
-- Academia ÒPURA — Etapa 1, passo 6
-- Certificados: numeração atômica, emissão e validação pública.
-- ============================================================

SET lock_timeout = '3s';

-- ── 1. CERTIFICADOS ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.academy_certificates (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        UUID NOT NULL,
    enrollment_id UUID NOT NULL REFERENCES public.academy_enrollments(id) ON DELETE CASCADE,
    employee_id   UUID NOT NULL,     -- sem FK: tabela quente
    course_id     UUID NOT NULL,
    version_id    UUID NOT NULL,
    numero        TEXT NOT NULL,     -- CERT-2026-00042
    -- O que vai no QR. UUID aleatório em vez do id da linha: não é
    -- adivinhável nem enumerável a partir de outro certificado.
    codigo_validacao UUID NOT NULL DEFAULT gen_random_uuid(),
    emitido_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    carga_horaria NUMERIC(6,1),
    nota_final    NUMERIC(5,2),
    data_conclusao DATE NOT NULL,
    data_validade  DATE,
    storage_path   TEXT,             -- PDF no bucket privado; PATH, nunca URL
    revogado_em     TIMESTAMPTZ,
    revogado_motivo TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (org_id, numero),
    UNIQUE (codigo_validacao),
    UNIQUE (enrollment_id)
);

CREATE INDEX IF NOT EXISTS idx_academy_certificates_employee
    ON public.academy_certificates(employee_id);
CREATE INDEX IF NOT EXISTS idx_academy_certificates_org
    ON public.academy_certificates(org_id, emitido_em DESC);

DROP TRIGGER IF EXISTS trg_academy_certificates_updated_at ON public.academy_certificates;
CREATE TRIGGER trg_academy_certificates_updated_at
    BEFORE UPDATE ON public.academy_certificates
    FOR EACH ROW EXECUTE FUNCTION public.update_labor_updated_at();

-- Sem DELETE: revogar é UPDATE de revogado_em. Certificado emitido é evidência.
ALTER TABLE public.academy_certificates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "academy_certificates_select" ON public.academy_certificates;
CREATE POLICY "academy_certificates_select" ON public.academy_certificates
    FOR SELECT TO authenticated USING (public.is_org_member(org_id));

DROP POLICY IF EXISTS "academy_certificates_insert" ON public.academy_certificates;
CREATE POLICY "academy_certificates_insert" ON public.academy_certificates
    FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id));

DROP POLICY IF EXISTS "academy_certificates_update" ON public.academy_certificates;
CREATE POLICY "academy_certificates_update" ON public.academy_certificates
    FOR UPDATE TO authenticated
    USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));

REVOKE ALL ON TABLE public.academy_certificates FROM PUBLIC;
REVOKE ALL ON TABLE public.academy_certificates FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.academy_certificates TO authenticated;

-- ── 2. CONTADOR — RLS ligada e ZERO policy ──────────────────────────────
-- Mesmo padrão de quotation_number_counters (20270838000000): a tabela só é
-- acessível de dentro da SECURITY DEFINER, que roda como owner e ignora RLS.

CREATE TABLE IF NOT EXISTS public.academy_certificate_counters (
    org_id     UUID    NOT NULL,
    ano        INTEGER NOT NULL,
    last_seq   INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (org_id, ano)
);

ALTER TABLE public.academy_certificate_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.academy_certificate_counters FROM PUBLIC;
REVOKE ALL ON TABLE public.academy_certificate_counters FROM anon;
REVOKE ALL ON TABLE public.academy_certificate_counters FROM authenticated;

-- Sequência atômica. Sem NENHUM grant: só as funções de emissão a chamam,
-- então ninguém consegue queimar número à toa.
CREATE OR REPLACE FUNCTION public.fn_next_academy_certificate_seq(p_org_id UUID, p_ano INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_next INTEGER;
BEGIN
    INSERT INTO public.academy_certificate_counters (org_id, ano, last_seq, updated_at)
    VALUES (p_org_id, p_ano, 1, NOW())
    ON CONFLICT (org_id, ano) DO UPDATE
        SET last_seq   = public.academy_certificate_counters.last_seq + 1,
            updated_at = NOW()
    RETURNING last_seq INTO v_next;

    RETURN v_next;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_next_academy_certificate_seq(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_next_academy_certificate_seq(UUID, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.fn_next_academy_certificate_seq(UUID, INTEGER) FROM authenticated;

-- ── 3. VALIDAÇÃO PÚBLICA ────────────────────────────────────────────────
-- Grant a anon é DE PROPÓSITO: é o QR do certificado. O recorte vem do
-- codigo_validacao (UUID aleatório).
-- NUNCA devolve CPF, employee_id, nota ou id interno.

CREATE OR REPLACE FUNCTION public.academy_validate_certificate(p_codigo UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    c      RECORD;
    v_nome TEXT;
    v_curso TEXT;
    v_nr    TEXT;
    v_versao INTEGER;
    v_org_nome TEXT;
    v_status TEXT;
BEGIN
    SELECT * INTO c FROM public.academy_certificates WHERE codigo_validacao = p_codigo;
    IF c.id IS NULL THEN
        RETURN jsonb_build_object('valid', FALSE);
    END IF;

    SELECT e.name  INTO v_nome   FROM public.employees e        WHERE e.id = c.employee_id;
    SELECT t.nome, t.nr_referencia INTO v_curso, v_nr
      FROM public.training_courses t WHERE t.id = c.course_id;
    SELECT v.versao INTO v_versao FROM public.academy_course_versions v WHERE v.id = c.version_id;
    SELECT o.name  INTO v_org_nome FROM public.organizations o   WHERE o.id = c.org_id;

    v_status := CASE
        WHEN c.revogado_em IS NOT NULL THEN 'REVOGADO'
        WHEN c.data_validade IS NOT NULL AND c.data_validade < CURRENT_DATE THEN 'VENCIDO'
        ELSE 'VALIDO'
    END;

    RETURN jsonb_build_object(
        'valid',          TRUE,
        'numero',         c.numero,
        'colaborador',    v_nome,
        'treinamento',    v_curso,
        'nr_referencia',  v_nr,
        'versao',         v_versao,
        'carga_horaria',  c.carga_horaria,
        'data_conclusao', c.data_conclusao,
        'data_validade',  c.data_validade,
        'emitido_em',     c.emitido_em,
        'organizacao',    v_org_nome,
        'status',         v_status
    );
END;
$$;

REVOKE ALL ON FUNCTION public.academy_validate_certificate(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.academy_validate_certificate(UUID) TO anon, authenticated;

COMMENT ON FUNCTION public.academy_validate_certificate(UUID) IS
    'Rota pública do QR. anon é intencional — o recorte vem do codigo_validacao. Nunca projeta CPF, employee_id ou nota.';
