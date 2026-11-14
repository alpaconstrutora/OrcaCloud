-- ============================================================================
-- Suprimentos › Pedidos de Compra — Pedido Fast (14/11/2026)
-- Plano: docs/planos/2026-11-14-pedido-fast.md (Parte 1, item 2)
-- Prova: scripts/teste-pedido-fast.sql
--
-- Por quê: compra de balcão urgente. O comprador já retirou o material na loja,
-- tira a foto da nota/recibo, escolhe a obra — e a Edge Function `pedido-fast`
-- cria o pedido (itens lidos da foto pela IA). Quem grava é a Edge com a
-- service_role, para o app logado e (Parte 2) para o link do celular — por isso
-- as funções abaixo recebem o usuário explícito (`*_de(p_user, …)`), como os
-- gêmeos do link do celular (aplicar_20271111950000).
--
-- 1. purchase_orders ganha:
--    · origem      — 'FAST' no Pedido Fast; NULL = pedido feito pelo formulário.
--    · criado_por  — quem criou (no Fast: quem COMPROU). DEFAULT auth.uid(), então
--                    todo pedido novo do app passa a registrar o autor também.
--    · leitura_ia  — o JSON que a IA leu da foto (conferência do gestor).
--    O gatilho trg_purchase_orders_autoria impede forjar o autor pela API: no
--    INSERT com sessão (auth.uid() presente) criado_por = auth.uid(); no UPDATE
--    os três campos ficam como estavam. Sem sessão (service_role) vale o que a
--    Edge mandou — ela já conferiu o usuário.
--
-- 2. fn_pode_criar_pedido_de(p_user, p_org) — quem pode fazer pedido na org.
--    Espelha a visibilidade do módulo Compras de utils/modulosPermitidos.ts
--    (checkModule('compras', 'canViewOrders', 'compras')): permissão gravada no
--    membro → matriz do cargo (organizations.settings.module_visibility, com a
--    dimensão 'platform') → padrão ligado. Owner/admin sempre (superadmins são
--    owner em toda org desde aplicar_20271024950000).
--    ⚠️ `canEditOrders` existe em UserPermissions mas NADA o aplica hoje (o
--    "Novo pedido" exige só ser membro + ver Compras). O Fast não fica mais
--    restrito que o formulário. Ligar canEditOrders é decisão à parte.
--
-- 3. fn_pode_criar_pedido_em_alguma_de(p_user) — a leitura da foto (ação `ler`)
--    acontece ANTES de escolher a obra; basta poder pedir em alguma org.
--
-- 4. fn_next_document_seq_de(p_user, …) — gêmeo de fn_next_document_seq
--    (cópia do ARQUIVO 20270912000002, idêntica ao banco em 14/11/2026) com o
--    usuário explícito: a original confere auth.uid(), que não existe na Edge.
--
-- Todas DEFINER e só para service_role (REGRA #7, pergunta 2).
--
-- ⚠️ Aplicar com db query -f — nunca db push:
--      npx supabase db query --linked -f <este arquivo>
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_purchase_orders_autoria ON public.purchase_orders;
--   DROP FUNCTION IF EXISTS public.fn_purchase_orders_autoria();
--   DROP FUNCTION IF EXISTS public.fn_pode_criar_pedido_de(uuid, uuid);
--   DROP FUNCTION IF EXISTS public.fn_pode_criar_pedido_em_alguma_de(uuid);
--   DROP FUNCTION IF EXISTS public.fn_next_document_seq_de(uuid, uuid, text, text);
--   ALTER TABLE public.purchase_orders DROP COLUMN IF EXISTS leitura_ia,
--     DROP COLUMN IF EXISTS criado_por, DROP COLUMN IF EXISTS origem;
-- ============================================================================

-- ── 1. Colunas ────────────────────────────────────────────────────────────────
ALTER TABLE public.purchase_orders
    ADD COLUMN IF NOT EXISTS origem TEXT NULL,
    ADD COLUMN IF NOT EXISTS criado_por UUID NULL DEFAULT auth.uid()
        REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS leitura_ia JSONB NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_orders_origem_check') THEN
        ALTER TABLE public.purchase_orders
            ADD CONSTRAINT purchase_orders_origem_check CHECK (origem IS NULL OR origem IN ('FAST'));
    END IF;
END $$;

COMMENT ON COLUMN public.purchase_orders.origem IS
    'FAST = Pedido Fast (foto da nota + obra). NULL = formulário. docs/planos/2026-11-14-pedido-fast.md';
COMMENT ON COLUMN public.purchase_orders.criado_por IS
    'Quem criou o pedido (no Pedido Fast, quem comprou). Imutável depois do INSERT (trg_purchase_orders_autoria).';
COMMENT ON COLUMN public.purchase_orders.leitura_ia IS
    'Pedido Fast: o JSON lido da foto pela IA (fornecedor, itens com confidence, total). Imutável.';

-- "Meus Pedidos Fast" no celular.
CREATE INDEX IF NOT EXISTS idx_purchase_orders_fast_criado_por
    ON public.purchase_orders (criado_por, created_at DESC)
    WHERE origem = 'FAST';

CREATE OR REPLACE FUNCTION public.fn_purchase_orders_autoria()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF auth.uid() IS NOT NULL THEN
            NEW.criado_por := auth.uid();
        END IF;
    ELSE
        NEW.criado_por := OLD.criado_por;
        NEW.origem     := OLD.origem;
        NEW.leitura_ia := OLD.leitura_ia;
    END IF;
    RETURN NEW;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_purchase_orders_autoria() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_purchase_orders_autoria ON public.purchase_orders;
CREATE TRIGGER trg_purchase_orders_autoria
    BEFORE INSERT OR UPDATE ON public.purchase_orders
    FOR EACH ROW EXECUTE FUNCTION public.fn_purchase_orders_autoria();

-- ── 2. Quem pode fazer pedido na org ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_pode_criar_pedido_de(p_user UUID, p_org UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_email   TEXT;
    v_role    TEXT;
    v_perms   JSONB;
    v_cargo   TEXT;
    v_matriz  JSONB;
    v_config  JSONB;
BEGIN
    IF p_user IS NULL OR p_org IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT lower(u.email) INTO v_email FROM auth.users u WHERE u.id = p_user;

    -- Mesmo casamento de is_org_member_de: user_id quando preenchido, e-mail nas
    -- linhas legadas sem user_id.
    SELECT om.role, om.permissions, coalesce(om.custom_role_id::text, om.role)
      INTO v_role, v_perms, v_cargo
      FROM public.organization_members om
     WHERE om.organization_id = p_org
       AND (
             (om.user_id IS NOT NULL AND om.user_id = p_user)
          OR (om.user_id IS NULL AND lower(om.email) = v_email)
       )
     LIMIT 1;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    IF v_role IN ('owner', 'admin') THEN
        RETURN TRUE;
    END IF;

    -- 1) Permissão gravada no membro (Usuários › Permissões › Suprimentos › Pedidos).
    IF v_perms ? 'canViewOrders' THEN
        RETURN coalesce(v_perms ->> 'canViewOrders', 'false') = 'true';
    END IF;

    -- 2) Matriz do cargo. Com dimensão de produto, vale a de 'platform'
    --    (organization_members não guarda productContext — é sempre 'platform').
    SELECT o.settings -> 'module_visibility' INTO v_matriz
      FROM public.organizations o WHERE o.id = p_org;
    IF v_matriz IS NOT NULL AND (v_matriz ? 'platform' OR v_matriz ? 'pro' OR v_matriz ? 'offices') THEN
        v_matriz := v_matriz -> 'platform';
    END IF;
    v_config := v_matriz -> v_cargo;
    IF v_config IS NOT NULL AND v_config ? 'compras' THEN
        RETURN coalesce(v_config ->> 'compras', 'false') = 'true';
    END IF;

    -- 3) Sem nada gravado: o padrão do módulo Compras é ligado.
    RETURN TRUE;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_pode_criar_pedido_de(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_pode_criar_pedido_de(UUID, UUID) TO service_role;

-- ── 3. Pode pedir em alguma org? (ação `ler`, antes de escolher a obra) ──────
CREATE OR REPLACE FUNCTION public.fn_pode_criar_pedido_em_alguma_de(p_user UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_email TEXT;
BEGIN
    IF p_user IS NULL THEN
        RETURN FALSE;
    END IF;
    SELECT lower(u.email) INTO v_email FROM auth.users u WHERE u.id = p_user;

    RETURN EXISTS (
        SELECT 1
          FROM public.organization_members om
         WHERE (
                 (om.user_id IS NOT NULL AND om.user_id = p_user)
              OR (om.user_id IS NULL AND lower(om.email) = v_email)
           )
           AND public.fn_pode_criar_pedido_de(p_user, om.organization_id)
    );
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_pode_criar_pedido_em_alguma_de(UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_pode_criar_pedido_em_alguma_de(UUID) TO service_role;

-- ── 4. Sequencial da Nomenclatura com o usuário explícito ────────────────────
CREATE OR REPLACE FUNCTION public.fn_next_document_seq_de(
    p_user UUID,
    p_org_id UUID,
    p_doc_type TEXT,
    p_scope_key TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_next INTEGER;
BEGIN
    IF p_org_id IS NULL THEN
        RAISE EXCEPTION 'Organização não informada.' USING ERRCODE = '22023';
    END IF;
    IF p_doc_type IS NULL OR p_doc_type = '' THEN
        RAISE EXCEPTION 'Tipo de documento não informado.' USING ERRCODE = '22023';
    END IF;

    IF NOT public.is_org_member_de(p_user, p_org_id) THEN
        RAISE EXCEPTION 'Sem acesso a esta organização.' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.document_number_counters
        (organization_id, doc_type, scope_key, last_seq, updated_at)
    VALUES (p_org_id, p_doc_type, COALESCE(p_scope_key, ''), 1, NOW())
    ON CONFLICT (organization_id, doc_type, scope_key) DO UPDATE
        SET last_seq   = public.document_number_counters.last_seq + 1,
            updated_at = NOW()
    RETURNING last_seq INTO v_next;

    RETURN v_next;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_next_document_seq_de(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_next_document_seq_de(UUID, UUID, TEXT, TEXT) TO service_role;
