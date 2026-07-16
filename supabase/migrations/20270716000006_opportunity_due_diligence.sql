-- Due Diligence de aquisição por oportunidade (matriz de pendências)
-- Reusa o padrão de checklist+evidência do módulo Compliance (20261121000000_opura_compliance.sql)
-- Date: 2027-07-16

CREATE TABLE IF NOT EXISTS public.due_diligence_items (
    id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    opportunity_id      uuid NOT NULL REFERENCES public.investor_opportunities(id) ON DELETE CASCADE,
    category            text NOT NULL
                        CHECK (category IN ('imovel','proprietario','tecnica','ambiental')),
    title               text NOT NULL,
    description         text,
    status              text NOT NULL DEFAULT 'pendente'
                        CHECK (status IN ('pendente','em_analise','conforme','inconforme','nao_aplicavel')),
    criticidade         text NOT NULL DEFAULT 'media'
                        CHECK (criticidade IN ('baixa','media','alta','critica')),
    responsavel_email   text,
    due_date            date,
    impacto             text,
    mitigacao           text,
    condicao_aprovacao  text,
    completed_at        timestamptz,
    completed_by        text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.due_diligence_findings (
    id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    item_id             uuid NOT NULL REFERENCES public.due_diligence_items(id) ON DELETE CASCADE,
    document_ref        text,
    evidence_url        text,
    file_hash           text,
    notes               text,
    author_email        text NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.due_diligence_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.due_diligence_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read due diligence items" ON public.due_diligence_items
    FOR SELECT TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM organization_members WHERE email = auth.jwt()->>'email'
    ));

CREATE POLICY "Members can manage due diligence items" ON public.due_diligence_items
    FOR ALL TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM organization_members WHERE email = auth.jwt()->>'email'
    ))
    WITH CHECK (organization_id IN (
        SELECT organization_id FROM organization_members WHERE email = auth.jwt()->>'email'
    ));

CREATE POLICY "Members can read due diligence findings" ON public.due_diligence_findings
    FOR SELECT TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM organization_members WHERE email = auth.jwt()->>'email'
    ));

CREATE POLICY "Members can manage due diligence findings" ON public.due_diligence_findings
    FOR ALL TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM organization_members WHERE email = auth.jwt()->>'email'
    ))
    WITH CHECK (organization_id IN (
        SELECT organization_id FROM organization_members WHERE email = auth.jwt()->>'email'
    ));

CREATE INDEX IF NOT EXISTS idx_dd_items_org ON public.due_diligence_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_dd_items_opp ON public.due_diligence_items(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_dd_items_status ON public.due_diligence_items(status);
CREATE INDEX IF NOT EXISTS idx_dd_findings_org ON public.due_diligence_findings(organization_id);
CREATE INDEX IF NOT EXISTS idx_dd_findings_item ON public.due_diligence_findings(item_id);

-- Bucket privado (path "{organization_id}/{arquivo}"); nasce privado, sem policy pública —
-- padrão do PLANO_STORAGE_PRIVATIZACAO.md, evita repetir o retrofit feito em receipts/boletos.
INSERT INTO storage.buckets (id, name, public)
VALUES ('due-diligence-findings', 'due-diligence-findings', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "dd_findings_select_org" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'due-diligence-findings'
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id::text = (storage.foldername(name))[1]
        AND om.email = auth.jwt() ->> 'email'
    )
  );

CREATE POLICY "dd_findings_insert_org" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'due-diligence-findings'
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id::text = (storage.foldername(name))[1]
        AND om.email = auth.jwt() ->> 'email'
    )
  );

CREATE POLICY "dd_findings_delete_org" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'due-diligence-findings'
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id::text = (storage.foldername(name))[1]
        AND om.email = auth.jwt() ->> 'email'
    )
  );
