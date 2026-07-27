-- Código sequencial de 3 dígitos (001, 002, ...) para negociações de Venda de
-- Ativos (commercial_deals.type = 'SALE'). Sequência por organização, atribuída
-- na criação (app: commercialService.saveDeal) e estável — nunca reaproveitada.
--
-- Coluna nullable + backfill idempotente. Não há trigger: a geração é feita na
-- aplicação, na mesma organização/escopo (type='SALE') que a tela exibe. A
-- coluna é TEXT porque o código é exibido com zero-padding (001), não como int.

ALTER TABLE commercial_deals ADD COLUMN IF NOT EXISTS code TEXT;

COMMENT ON COLUMN commercial_deals.code IS
    'Código sequencial de 3 dígitos por organização das negociações de Venda de Ativos (type=SALE). Atribuído na criação, estável, não reaproveitado.';

-- Backfill: numera as negociações SALE existentes por organização, na ordem de
-- criação (created_at → date → id como desempate), começando em 001. Só preenche
-- linhas ainda sem código, então é seguro reexecutar.
WITH ranked AS (
    SELECT
        id,
        LPAD(
            (ROW_NUMBER() OVER (
                PARTITION BY organization_id
                ORDER BY created_at NULLS LAST, date NULLS LAST, id
            ))::text,
            3, '0'
        ) AS new_code
    FROM commercial_deals
    WHERE type = 'SALE' AND code IS NULL
)
UPDATE commercial_deals d
SET code = r.new_code
FROM ranked r
WHERE d.id = r.id;
