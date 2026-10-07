-- Colaborador com várias contas bancárias + uma principal
--
-- Pedido do usuário em 07/10/2026 (RH › Colaboradores › Editar Colaborador,
-- item 4): "aba dados bancarios: atualmente só é possível cadastrar apenas uma
-- conta bancária. permita cadastrar mais de uma e selecionar qual será a
-- principal." Plano: docs/planos/2026-10-07-rh-editar-colaborador.md (item 4).
--
-- Desenho
--   Até aqui a conta era 6 colunas soltas em `employees` (banco_codigo,
--   banco_nome, banco_agencia, banco_conta, banco_conta_tipo, banco_pix — de
--   20260528000000). Quem as lia: só o próprio formulário (nenhum serviço, RPC,
--   edge function ou exportação). Elas FICAM — o backfill copia, não move — para
--   o rollback ser trocar o front de volta; o formulário deixa de escrevê-las.
--   Considere-as obsoletas a partir desta migration.
--
--   employee_bank_accounts: N contas por colaborador, no máximo UMA principal
--   (índice único parcial). Gravação só pela RPC save_employee_bank_accounts,
--   que grava a lista inteira numa transação — a troca de principal nunca deixa
--   duas ou zero no meio do caminho (o padrão de supplier_bank_accounts zera a
--   principal antiga numa query e insere na seguinte, não-atômico).
--
-- REGRA #7
--   Pergunta 1 (policy): uma policy, TO authenticated, USING/WITH CHECK =
--   "o colaborador desta conta é visível para quem pergunta" — EXISTS em
--   `employees`, que roda sob a RLS vigente dela
--   (is_org_member(org_id) OR is_employee_shared_with_user(id), lida do banco
--   em 07/10/2026). Quem vê a conta é exatamente quem já via os banco_* do
--   colaborador. Nenhuma perna de OR solta; nada para anon.
--   ⚠️ NÃO copiar a RLS de supplier_bank_accounts: lá existe sba_anon_all e
--   `organization_id IS NULL OR ...`.
--   Pergunta 2 (quem executa): a RPC é SECURITY INVOKER (a RLS acima vale
--   dentro dela) e mesmo assim leva REVOKE de PUBLIC/anon + GRANT authenticated.

SET lock_timeout = '3s';

-- ─── PARTE 1 — tabela ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.employee_bank_accounts (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id   UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    org_id        UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    bank_code     TEXT,
    bank_name     TEXT,
    agency        TEXT,
    account       TEXT,
    account_type  TEXT NOT NULL DEFAULT 'corrente'
                  CHECK (account_type IN ('corrente', 'poupanca', 'pagamento')),
    pix_key       TEXT,
    pix_key_type  TEXT CHECK (pix_key_type IN ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria')),
    holder_name   TEXT,
    is_primary    BOOLEAN NOT NULL DEFAULT false,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.employee_bank_accounts IS
    'Contas bancárias/PIX do colaborador (N por colaborador, no máximo 1 principal). Escrita pela RPC save_employee_bank_accounts. Substitui employees.banco_* (obsoletas desde 20271007000020).';

CREATE INDEX IF NOT EXISTS employee_bank_accounts_employee_idx
    ON public.employee_bank_accounts (employee_id);

CREATE UNIQUE INDEX IF NOT EXISTS employee_bank_accounts_one_primary
    ON public.employee_bank_accounts (employee_id)
    WHERE is_primary;

ALTER TABLE public.employee_bank_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employee_bank_accounts_by_employee ON public.employee_bank_accounts;
CREATE POLICY employee_bank_accounts_by_employee ON public.employee_bank_accounts
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_bank_accounts.employee_id))
    WITH CHECK (EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_bank_accounts.employee_id));

REVOKE ALL ON TABLE public.employee_bank_accounts FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.employee_bank_accounts TO authenticated;

-- ─── PARTE 2 — RPC de gravação (lista inteira, atômica) ───────────────────────
-- p_accounts: [{ id?, bank_code, bank_name, agency, account, account_type,
--               pix_key, pix_key_type, holder_name, is_primary }]
--   · com `id` de conta DESTE colaborador → atualiza; sem `id` (ou id alheio) → insere;
--   · conta do colaborador que não veio na lista → apagada;
--   · linha toda em branco → ignorada;
--   · principal: a 1ª marcada; nenhuma marcada → a 1ª da lista. Lista vazia → nenhuma.
CREATE OR REPLACE FUNCTION public.save_employee_bank_accounts(p_employee_id UUID, p_accounts JSONB)
RETURNS SETOF public.employee_bank_accounts
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_org         UUID;
    v_acc         JSONB;
    v_ord         BIGINT;
    v_primary_ord BIGINT;
    v_id          UUID;
    v_keep        UUID[] := ARRAY[]::UUID[];
BEGIN
    -- Sob a RLS de employees (INVOKER): colaborador invisível = sem permissão.
    SELECT e.org_id INTO v_org FROM public.employees e WHERE e.id = p_employee_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Colaborador não encontrado ou sem permissão.' USING ERRCODE = '42501';
    END IF;

    IF p_accounts IS NULL OR jsonb_typeof(p_accounts) <> 'array' THEN
        RAISE EXCEPTION 'p_accounts deve ser uma lista.' USING ERRCODE = '22023';
    END IF;

    -- Só contam as linhas com algum dado (a mesma condição nas duas consultas).
    SELECT COALESCE(
               min(t.ord) FILTER (WHERE COALESCE((t.acc->>'is_primary')::BOOLEAN, false)),
               min(t.ord))
      INTO v_primary_ord
      FROM jsonb_array_elements(p_accounts) WITH ORDINALITY AS t(acc, ord)
     WHERE COALESCE(NULLIF(btrim(t.acc->>'bank_code'), ''), NULLIF(btrim(t.acc->>'bank_name'), ''),
                    NULLIF(btrim(t.acc->>'agency'), ''), NULLIF(btrim(t.acc->>'account'), ''),
                    NULLIF(btrim(t.acc->>'pix_key'), '')) IS NOT NULL;

    -- Zera a principal antes de regravar: o índice único parcial não pode ver
    -- duas principais no meio da troca.
    UPDATE public.employee_bank_accounts SET is_primary = false
     WHERE employee_id = p_employee_id AND is_primary;

    FOR v_ord, v_acc IN
        SELECT t.ord, t.acc
          FROM jsonb_array_elements(p_accounts) WITH ORDINALITY AS t(acc, ord)
         WHERE COALESCE(NULLIF(btrim(t.acc->>'bank_code'), ''), NULLIF(btrim(t.acc->>'bank_name'), ''),
                        NULLIF(btrim(t.acc->>'agency'), ''), NULLIF(btrim(t.acc->>'account'), ''),
                        NULLIF(btrim(t.acc->>'pix_key'), '')) IS NOT NULL
         ORDER BY t.ord
    LOOP
        v_id := NULL;
        IF (v_acc->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            UPDATE public.employee_bank_accounts SET
                bank_code    = NULLIF(btrim(v_acc->>'bank_code'), ''),
                bank_name    = NULLIF(btrim(v_acc->>'bank_name'), ''),
                agency       = NULLIF(btrim(v_acc->>'agency'), ''),
                account      = NULLIF(btrim(v_acc->>'account'), ''),
                account_type = COALESCE(NULLIF(v_acc->>'account_type', ''), 'corrente'),
                pix_key      = NULLIF(btrim(v_acc->>'pix_key'), ''),
                pix_key_type = NULLIF(v_acc->>'pix_key_type', ''),
                holder_name  = NULLIF(btrim(v_acc->>'holder_name'), ''),
                is_primary   = (v_ord = v_primary_ord),
                updated_at   = NOW()
             WHERE id = (v_acc->>'id')::UUID AND employee_id = p_employee_id
            RETURNING id INTO v_id;
        END IF;

        IF v_id IS NULL THEN
            INSERT INTO public.employee_bank_accounts
                (employee_id, org_id, bank_code, bank_name, agency, account, account_type,
                 pix_key, pix_key_type, holder_name, is_primary)
            VALUES
                (p_employee_id, v_org,
                 NULLIF(btrim(v_acc->>'bank_code'), ''), NULLIF(btrim(v_acc->>'bank_name'), ''),
                 NULLIF(btrim(v_acc->>'agency'), ''), NULLIF(btrim(v_acc->>'account'), ''),
                 COALESCE(NULLIF(v_acc->>'account_type', ''), 'corrente'),
                 NULLIF(btrim(v_acc->>'pix_key'), ''), NULLIF(v_acc->>'pix_key_type', ''),
                 NULLIF(btrim(v_acc->>'holder_name'), ''), (v_ord = v_primary_ord))
            RETURNING id INTO v_id;
        END IF;

        v_keep := v_keep || v_id;
    END LOOP;

    DELETE FROM public.employee_bank_accounts
     WHERE employee_id = p_employee_id AND NOT (id = ANY (v_keep));

    RETURN QUERY
        SELECT b.* FROM public.employee_bank_accounts b
         WHERE b.employee_id = p_employee_id
         ORDER BY b.is_primary DESC, b.created_at, b.id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_employee_bank_accounts(UUID, JSONB) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.save_employee_bank_accounts(UUID, JSONB) TO authenticated;

-- ─── PARTE 3 — backfill (idempotente) ──────────────────────────────────────────
-- Cada colaborador com algum banco_* preenchido ganha 1 conta principal com os
-- mesmos dados. Quem já tem conta na tabela nova não é tocado (rodar 2× = 1×).
INSERT INTO public.employee_bank_accounts
    (employee_id, org_id, bank_code, bank_name, agency, account, account_type, pix_key, is_primary)
SELECT e.id, e.org_id,
       NULLIF(btrim(e.banco_codigo), ''), NULLIF(btrim(e.banco_nome), ''),
       NULLIF(btrim(e.banco_agencia), ''), NULLIF(btrim(e.banco_conta), ''),
       CASE WHEN e.banco_conta_tipo IN ('corrente', 'poupanca') THEN e.banco_conta_tipo ELSE 'corrente' END,
       NULLIF(btrim(e.banco_pix), ''),
       true
  FROM public.employees e
 WHERE COALESCE(NULLIF(btrim(e.banco_codigo), ''), NULLIF(btrim(e.banco_nome), ''),
                NULLIF(btrim(e.banco_agencia), ''), NULLIF(btrim(e.banco_conta), ''),
                NULLIF(btrim(e.banco_pix), '')) IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.employee_bank_accounts b WHERE b.employee_id = e.id);

COMMENT ON COLUMN public.employees.banco_pix IS
    'OBSOLETA desde 20271007000020 — contas do colaborador vivem em employee_bank_accounts. Mantida só para rollback.';
