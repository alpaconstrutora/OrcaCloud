-- Checklist de documentos do cliente/comprador na negociação (Gerenciar
-- Negociação → Dados do Cliente). Guarda o mapa chave→marcado; as chaves
-- dependem do tipo de pessoa (PF/PJ) e são definidas no front (DEAL_DOC_CHECKLIST).
-- commercial_deals é tabela quente: lock_timeout curto para não deadlockar contra
-- transações concorrentes (lock_timeout < deadlock_timeout — memória do projeto).
SET lock_timeout = '3s';

ALTER TABLE commercial_deals ADD COLUMN IF NOT EXISTS doc_checklist JSONB;

COMMENT ON COLUMN commercial_deals.doc_checklist IS
    'Checklist de documentos do cliente/comprador (mapa chave→boolean). Chaves variam por tipo de pessoa (PF/PJ) — ver DEAL_DOC_CHECKLIST no DealModal.';
