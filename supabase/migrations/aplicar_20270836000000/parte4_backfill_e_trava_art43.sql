-- ═════════════════════════════════════════════════════════════════════════════
-- Garantias Locatícias F1 — PARTE 4 de 5: backfill + trava do art. 43
-- ═════════════════════════════════════════════════════════════════════════════
-- ⚠️ Rodar SOZINHA, depois da parte 3. A ORDEM INTERNA É OBRIGATÓRIA: criar o
-- índice único antes do backfill abortaria se alguma locação legada já tivesse
-- duas garantias.
--
-- Esta parte lê `contracts` (AccessShare, leve) — por isso ficou isolada das
-- partes de DDL, que pegam locks pesados.

SET lock_timeout = '5s';

-- (4.1) Garantias que já existem em contrato de locação passam a scope=LOCACAO.
UPDATE public.contract_guarantees g
SET scope = 'LOCACAO'
FROM public.contracts c
WHERE c.id = g.contract_id
  AND c.domain = 'LOCACAO'
  AND g.scope <> 'LOCACAO';

-- (4.2) Se algum contrato de locação legado tiver MAIS DE UMA garantia, só a
-- mais recente continua ativa — as outras viram histórico (SUBSTITUIDA).
-- Nada é apagado: as linhas antigas permanecem consultáveis na cadeia.
WITH ranked AS (
    SELECT g.id,
           ROW_NUMBER() OVER (
               PARTITION BY g.contract_id
               ORDER BY g.valid_from DESC NULLS LAST, g.created_at DESC
           ) AS rn
    FROM public.contract_guarantees g
    WHERE g.scope = 'LOCACAO' AND g.is_active
)
UPDATE public.contract_guarantees g
SET is_active = false,
    status = CASE WHEN g.status = 'VIGENTE' THEN 'SUBSTITUIDA' ELSE g.status END
FROM ranked r
WHERE g.id = r.id AND r.rn > 1;

-- (4.3) Art. 43 da Lei 8.245/91: é vedado exigir mais de uma modalidade de
-- garantia no mesmo contrato de locação. Índice PARCIAL — contrato de OBRA
-- continua podendo ter RC Geral + RC Profissional + Ambiental simultâneas.
CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_guarantees_locacao_ativa
    ON public.contract_guarantees (contract_id)
    WHERE scope = 'LOCACAO' AND is_active;

-- (4.4) Conferência: deve retornar ZERO linhas. Se retornar alguma, o passo
-- 4.2 não pegou o caso e o índice acima teria falhado.
SELECT contract_id, COUNT(*) AS ativas
FROM public.contract_guarantees
WHERE scope = 'LOCACAO' AND is_active
GROUP BY contract_id
HAVING COUNT(*) > 1;
