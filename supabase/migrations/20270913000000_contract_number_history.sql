-- "Regerar número" do contrato — histórico + trava de emissão.
--
-- O número de um documento é gerado SÓ na criação (ContractModal) e nunca muda
-- ao editar, de propósito: ele é a identidade do documento e está no papel
-- assinado, no e-mail ao fornecedor e nas referências do financeiro. Mas trocar
-- o centro de custo ou o empreendimento de um contrato faz o número antigo
-- deixar de refletir a máscara — daí o pedido (2026-08-18) de um botão explícito
-- de regerar, com bloqueio depois que o número já saiu para fora.
--
-- ⚠️ ANTI-DEADLOCK (40P01) — a v1 desta migration TOMOU deadlock ao ser
-- aplicada (2026-08-18). A tabela nova tinha FK para `contracts` e
-- `organizations`; criar a constraint pega ShareRowExclusiveLock na tabela
-- REFERENCIADA, e `contracts` está quente (o app lê/escreve o tempo todo).
-- Mesmo padrão já adotado em `empreendimento_field_proposals` e nas colunas de
-- proveniência do módulo Empreendimentos: **tabela nova sem FK nenhuma**.
--   · A integridade vem da RPC, que só grava depois de achar o contrato.
--   · Perder o ON DELETE CASCADE aqui é BOM, não ruim: trilha de auditoria deve
--     sobreviver à exclusão do contrato — é justamente quando alguém vai
--     procurar pelo número antigo.
--
-- REGRA DE BLOQUEIO (decisão do usuário): "qualquer saída para fora". Regerar é
-- recusado se, para aquele contrato, existir:
--   a) versão de documento EMITIDA no Portal do Cliente (`emitted = true`), ou
--   b) versão ENVIADA para assinatura (`signature_token` preenchido, ou
--      `signature_status` em SENT/SIGNED), ou
--   c) o próprio contrato assinado (`contracts.signature_status = 'SIGNED'`,
--      `signed_contract_url` preenchido, ou `status` em Assinado/Ativo/
--      Concluído/Encerrado).
--
-- A validação mora AQUI, não só na tela: a UI desabilita o botão, mas o servidor
-- é quem garante — mesmo motivo de `contractDocumentVersionService.remove` já
-- recusar excluir versão emitida.
--
-- Ver docs/planos/2026-08-17-nomenclatura-slots-configuravel.md.

-- ═══ BLOCO 1 — tabela nova (não toca em nenhuma tabela existente) ══════════
CREATE TABLE IF NOT EXISTS public.contract_number_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,   -- sem FK (anti-deadlock, ver topo)
    contract_id     UUID NOT NULL,   -- sem FK (anti-deadlock, ver topo)
    old_number      TEXT,
    new_number      TEXT NOT NULL,
    changed_by      TEXT,
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.contract_number_history IS
    'Trilha de "Regerar número" de contrato. Sem FK de propósito (anti-deadlock e para a trilha sobreviver à exclusão do contrato).';

CREATE INDEX IF NOT EXISTS idx_contract_number_history_contract
    ON public.contract_number_history(contract_id, changed_at DESC);
-- Busca pelo número ANTIGO ("quem era o CT-001-091-0004?") é o motivo da tabela.
CREATE INDEX IF NOT EXISTS idx_contract_number_history_old_number
    ON public.contract_number_history(organization_id, old_number);

ALTER TABLE public.contract_number_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contract_number_history_select" ON public.contract_number_history;
CREATE POLICY "contract_number_history_select" ON public.contract_number_history
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id));

-- Sem policy de INSERT/UPDATE/DELETE de propósito: só a RPC abaixo escreve, e
-- ela é SECURITY DEFINER. Trilha que o próprio usuário pode reescrever não é
-- trilha.

REVOKE ALL ON public.contract_number_history FROM PUBLIC;
REVOKE ALL ON public.contract_number_history FROM anon;
GRANT SELECT ON public.contract_number_history TO authenticated;

-- ═══ BLOCO 2 — diagnóstico do bloqueio ═════════════════════════════════════
-- CREATE FUNCTION não trava as tabelas que a função consulta — só o catálogo.
-- Devolve NULL se pode regerar, ou a razão (texto pronto para a tela) se não.
-- Separada da ação para a UI conseguir desabilitar o botão e explicar por quê
-- ANTES do clique, sem duplicar a regra no front.
CREATE OR REPLACE FUNCTION public.fn_contract_number_lock_reason(p_contract_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_contract RECORD;
BEGIN
    SELECT c.id, c.organization_id, c.status, c.signature_status, c.signed_contract_url
      INTO v_contract
      FROM public.contracts c
     WHERE c.id = p_contract_id;

    IF NOT FOUND THEN
        RETURN 'Contrato não encontrado.';
    END IF;

    IF NOT public.is_org_member(v_contract.organization_id) THEN
        RETURN 'Sem acesso a este contrato.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.contract_document_versions v
        WHERE v.contract_id = p_contract_id AND v.emitted = true
    ) THEN
        RETURN 'Este contrato já teve um documento emitido no Portal do Cliente — o número não pode mais mudar.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.contract_document_versions v
        WHERE v.contract_id = p_contract_id
          AND (v.signature_token IS NOT NULL OR v.signature_status IN ('SENT', 'SIGNED'))
    ) THEN
        RETURN 'Este contrato já foi enviado para assinatura — o número não pode mais mudar.';
    END IF;

    IF v_contract.signature_status = 'SIGNED' OR COALESCE(v_contract.signed_contract_url, '') <> '' THEN
        RETURN 'Este contrato já está assinado — o número não pode mais mudar.';
    END IF;

    IF v_contract.status IN ('Assinado', 'Ativo', 'Concluído', 'Encerrado') THEN
        RETURN format('Contrato em "%s" — o número só pode ser regerado enquanto ele não saiu para fora.', v_contract.status);
    END IF;

    RETURN NULL;
END;
$X$;

-- ═══ BLOCO 3 — ação ════════════════════════════════════════════════════════
-- Grava o novo número (calculado no cliente, pelo mesmo motor da criação) e a
-- trilha, numa transação só, revalidando a trava — a UI pode estar
-- desatualizada em relação a outra aba que acabou de emitir o documento.
CREATE OR REPLACE FUNCTION public.fn_regenerate_contract_number(
    p_contract_id UUID,
    p_new_number TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_reason TEXT;
    v_old TEXT;
    v_org UUID;
BEGIN
    IF COALESCE(p_new_number, '') = '' THEN
        RAISE EXCEPTION 'Número novo não informado.' USING ERRCODE = '22023';
    END IF;

    v_reason := public.fn_contract_number_lock_reason(p_contract_id);
    IF v_reason IS NOT NULL THEN
        RAISE EXCEPTION '%', v_reason USING ERRCODE = '42501';
    END IF;

    SELECT number, organization_id INTO v_old, v_org
      FROM public.contracts WHERE id = p_contract_id;

    UPDATE public.contracts
       SET number = p_new_number, updated_at = NOW()
     WHERE id = p_contract_id;

    INSERT INTO public.contract_number_history
        (organization_id, contract_id, old_number, new_number, changed_by)
    VALUES (v_org, p_contract_id, v_old, p_new_number, auth.jwt() ->> 'email');

    RETURN p_new_number;
END;
$X$;

-- ═══ BLOCO 4 — grants ══════════════════════════════════════════════════════
REVOKE ALL ON FUNCTION public.fn_contract_number_lock_reason(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_contract_number_lock_reason(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_contract_number_lock_reason(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.fn_regenerate_contract_number(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_regenerate_contract_number(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_regenerate_contract_number(UUID, TEXT) TO authenticated;
