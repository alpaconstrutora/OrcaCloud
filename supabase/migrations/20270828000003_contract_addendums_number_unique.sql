-- ============================================================
-- Numeração de aditivo: unicidade por contrato.
--
-- Hoje o número é gerado no COMPONENTE como `AD-${length + 1}`
-- (ContractAddendumModal.tsx) — por contagem, não por MAX, e sem unicidade no
-- banco. Excluir um aditivo, ou dois cliques simultâneos, produz números
-- repetidos no mesmo contrato. A geração passa para o service (MAX + retry em
-- 23505) e este índice é a rede de segurança.
--
-- ⚠️ Rodar o diagnóstico abaixo ANTES: com duplicata existente, o CREATE UNIQUE
-- INDEX falha. O UPDATE de renumeração já trata o caso, mas convém saber o
-- tamanho do estrago antes de mexer.
--
--   SELECT contract_id, number, count(*)
--     FROM public.contract_addendums
--    GROUP BY 1, 2 HAVING count(*) > 1;
-- ============================================================

SET lock_timeout = '3s';

-- Renumera duplicatas preservando a mais antiga; as demais ganham sufixo
-- estável (-DUP2, -DUP3…), sem colidir entre si.
WITH d AS (
    SELECT id,
           number,
           row_number() OVER (PARTITION BY contract_id, number ORDER BY created_at, id) AS rn
      FROM public.contract_addendums
)
UPDATE public.contract_addendums a
   SET number = d.number || '-DUP' || d.rn
  FROM d
 WHERE d.id = a.id
   AND d.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_addendums_contract_number
    ON public.contract_addendums (contract_id, number);

RESET lock_timeout;
