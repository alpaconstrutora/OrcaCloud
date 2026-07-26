-- ============================================================
-- Renovação de contratos de LOCAÇÃO — contrato-filho vinculado ao pai.
--
-- Renovação NÃO é aditivo (`contract_addendums`): é um contrato NOVO, com
-- número próprio (CL-{ano}-{seq}), vigência própria e parcelas próprias. O pai
-- é encerrado e suas parcelas PENDENTES a partir do início do filho são
-- cortadas. Ver services/contractRenewalService.ts.
--
-- ⚠️ Sem FOREIGN KEY em `parent_contract_id` DE PROPÓSITO: `contracts` é tabela
-- quente e FK exige ShareRowExclusiveLock nas duas pontas — DDL com FK aqui já
-- deadlockou antes. A integridade é garantida na aplicação + índice único.
-- Colunas nullable, sem default → alteração metadata-only, não reescreve a tabela.
-- ============================================================

SET lock_timeout = '3s';

-- ── 1) contracts: vínculo pai → filho ──────────────────────────────────────
ALTER TABLE public.contracts
    ADD COLUMN IF NOT EXISTS parent_contract_id   uuid,
    ADD COLUMN IF NOT EXISTS renewal_seq          smallint,
    ADD COLUMN IF NOT EXISTS renewed_at           date,
    ADD COLUMN IF NOT EXISTS renewal_notice_days  smallint;

COMMENT ON COLUMN public.contracts.parent_contract_id IS
 'Renovação: contrato anterior que este substitui. SEM FK de propósito (DDL com FK em contracts deadlocka); integridade na aplicação. Um pai tem no máximo um filho (uq_contracts_parent).';
COMMENT ON COLUMN public.contracts.renewal_seq IS
 'Ordinal da renovação na cadeia: 1 = primeira renovação. NULL = contrato original.';
COMMENT ON COLUMN public.contracts.renewed_at IS
 'Data em que a renovação foi efetivada (carimbo da ação, não a vigência).';
COMMENT ON COLUMN public.contracts.renewal_notice_days IS
 'Antecedência (dias) para alertar renovação deste contrato. NULL = usa o padrão do cron (60).';

-- ── 2) Um pai só pode ter UM filho ─────────────────────────────────────────
-- Rede de segurança contra duplo clique / corrida no botão Renovar.
-- Índice parcial: contratos originais (NULL) não entram.
CREATE UNIQUE INDEX IF NOT EXISTS uq_contracts_parent
    ON public.contracts (parent_contract_id)
    WHERE parent_contract_id IS NOT NULL;

-- ── 3) Fila "vencendo" (aba Renovações + cron) ─────────────────────────────
CREATE INDEX IF NOT EXISTS ix_contracts_locacao_end_date
    ON public.contracts (organization_id, end_date)
    WHERE domain = 'LOCACAO' AND end_date IS NOT NULL;

RESET lock_timeout;
