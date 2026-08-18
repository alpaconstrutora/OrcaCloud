-- Nomenclatura configurável por slots — configuração por organização.
--
-- Substitui as 5 máscaras hoje presas em `AppSettings` (localStorage
-- `opura_app_settings`, ver services/appSettingsService.ts) por uma tabela no
-- banco, uma linha por (organização, tipo de documento). Cada linha guarda um
-- array ORDENADO de até 8 slots — o usuário monta o número escolhendo, para
-- cada posição, "vazio", "prefixo" ou uma das 7 variáveis do sistema
-- (Empreendimento, Obra, Unidade, Cliente, Fornecedor, Organização, Centro de
-- custo). O {seq} é sempre o último token e não faz parte do array.
--
-- Pedido original do usuário (2026-08-17), formato do array:
--   { }-{ }-{prefixo}-{Empreendimento}-{Fornecedor}-{Centro de custo}-{seq}
--   → slots = ['EMPTY','EMPTY','PREFIX','EMPREENDIMENTO','FORNECEDOR','CENTRO_CUSTO']
--
-- Sem linha para um (org, doc_type) → o front usa o default do catálogo
-- (services/documentNumbering/catalog.ts), que preserva o comportamento atual
-- (PC-{empreendimento}-{obra}-{seq}, etc.) até a organização reconfigurar.
--
-- Ver docs/planos/2026-08-17-nomenclatura-slots-configuravel.md.

SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public.document_numbering_settings (
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    doc_type TEXT NOT NULL CHECK (doc_type IN (
        'PURCHASE_ORDER', 'QUOTATION', 'SUPPLY_CONTRACT',
        'SERVICE_CONTRACT', 'SERVICE_PROPOSAL', 'SERVICE_CRM_CONTRACT',
        'UNIT_SALE_CONTRACT', 'RENTAL_CONTRACT',
        'SALE_DEAL', 'RENTAL_DEAL', 'CONDO_RATEIO'
    )),

    -- Array ORDENADO de slots (até 8). Cada item é um dos tokens:
    -- 'EMPTY' | 'PREFIX' | 'EMPREENDIMENTO' | 'OBRA' | 'UNIDADE' | 'CLIENTE'
    -- | 'FORNECEDOR' | 'ORGANIZACAO' | 'CENTRO_CUSTO'.
    -- Validação de "cada token no máximo uma vez" e "PREFIX exige texto em
    -- `prefix`" fica na aplicação (é regra de produto, não de schema).
    slots JSONB NOT NULL DEFAULT '[]'::jsonb,

    prefix TEXT NOT NULL DEFAULT '',
    separator TEXT NOT NULL DEFAULT '-' CHECK (separator IN ('-', '.')),
    seq_padding SMALLINT NOT NULL DEFAULT 4 CHECK (seq_padding BETWEEN 1 AND 9),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (organization_id, doc_type)
);

COMMENT ON TABLE public.document_numbering_settings IS
    'Máscara de numeração configurável por organização e tipo de documento. Ver docs/planos/2026-08-17-nomenclatura-slots-configuravel.md.';
COMMENT ON COLUMN public.document_numbering_settings.slots IS
    'Array ordenado de tokens de slot (EMPTY/PREFIX/variável). O {seq} é implícito e sempre por último.';

ALTER TABLE public.document_numbering_settings ENABLE ROW LEVEL SECURITY;

-- Dual-check padrão do projeto (uid preferencial, e-mail como fallback) via
-- is_org_member — mesma função usada nas policies de commercial_properties/deals
-- (20260706000002_fix_is_org_member_remove_backdoor.sql).
CREATE POLICY "document_numbering_settings_select" ON public.document_numbering_settings
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id));

CREATE POLICY "document_numbering_settings_insert" ON public.document_numbering_settings
    FOR INSERT TO authenticated
    WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY "document_numbering_settings_update" ON public.document_numbering_settings
    FOR UPDATE TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY "document_numbering_settings_delete" ON public.document_numbering_settings
    FOR DELETE TO authenticated
    USING (public.is_org_member(organization_id));

-- RPC nova = REVOKE PUBLIC por padrão do projeto; aqui é tabela, mas o mesmo
-- cuidado vale para GRANT: authenticated sozinho não tira o que PUBLIC ganha.
REVOKE ALL ON public.document_numbering_settings FROM PUBLIC;
REVOKE ALL ON public.document_numbering_settings FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_numbering_settings TO authenticated;
