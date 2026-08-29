-- ==========================================================================
-- Backfill de organização em `suppliers` e `clients` (parte segura)
-- ==========================================================================
-- CONTEXTO (2026-08-29)
-- Auditoria da perna `organization_id IS NULL OR is_org_member(...)` achou:
--   suppliers  140 linhas sem organização — leitura E escrita por qualquer
--              usuário autenticado, de qualquer inquilino
--   clients     17 linhas — e aqui pior: as policies de UPDATE/DELETE estão em
--              PUBLIC (`polroles = {0}`), e o `anon` tem grant pleno na tabela.
--              Ou seja, alteráveis e apagáveis SEM LOGIN, só com a chave anon.
--
-- Enquanto houver linha com organização nula, a perna casa e o buraco existe.
-- Zerar as linhas é o que fecha — sem tocar em policy, sem risco de quebrar o
-- portal do cliente (que pode operar como anon com token).
--
-- ESTA MIGRATION FAZ SÓ A PARTE QUE NÃO EXIGE DECISÃO:
-- as linhas cuja organização é DEDUZÍVEL de um vínculo existente e que
-- resolvem para UMA única organização.
--
--   suppliers: 21 resolvem (via purchase_orders/contracts) — 1 é duplicata real
--              (mesmo `document` de um fornecedor que já existe na organização
--              de destino, código 010) e fica de FORA: fundir cadastro é
--              decisão do dono, não backfill.  → 20 linhas
--   clients:   10 resolvem (via projects.settings.clientId / commercial_deals);
--              nenhuma é duplicata.                              → 10 linhas
--
-- ⚠️ `code` É ZERADO onde colide. Há índice único em
--    `(COALESCE(organization_id, uuid-zero), code)`, e TODAS as linhas sem
--    organização compartilham o mesmo espaço de numeração — então bater código
--    com a organização de destino é coincidência esperada, não duplicata
--    (conferido: 6 de 7 em suppliers e 9 de 9 em clients têm `document`
--    DIFERENTE). Mesmo tratamento e mesma justificativa da migration
--    `20270132000000`: código é rótulo de numeração, não dado financeiro, e o
--    dono renumera pela UI.
--
-- FICA DE FORA, esperando decisão: 117 fornecedores e 7 clientes SEM NENHUM
-- vínculo de onde deduzir a organização, mais a duplicata de código 010.
-- ==========================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1. suppliers
-- ────────────────────────────────────────────────────────────
WITH orgs AS (
  SELECT sp.id AS rid, o.organization_id
    FROM public.suppliers sp
    JOIN LATERAL (
      SELECT po.organization_id FROM public.purchase_orders po
       WHERE po.supplier_id = sp.id AND po.organization_id IS NOT NULL
      UNION
      SELECT ct.organization_id FROM public.contracts ct
       WHERE ct.supplier_id = sp.id AND ct.organization_id IS NOT NULL
    ) o ON true
   WHERE sp.organization_id IS NULL
), resolvidos AS (
  SELECT rid, (array_agg(DISTINCT organization_id))[1] AS org
    FROM orgs GROUP BY rid HAVING count(DISTINCT organization_id) = 1
), alvo AS (
  SELECT u.rid, u.org,
         EXISTS (SELECT 1 FROM public.suppliers x
                  WHERE x.organization_id = u.org AND x.code = s.code AND x.id <> s.id) AS colide,
         EXISTS (SELECT 1 FROM public.suppliers x
                  WHERE x.organization_id = u.org AND x.code = s.code AND x.id <> s.id
                    AND x.document IS NOT DISTINCT FROM s.document)                     AS duplicata
    FROM resolvidos u
    JOIN public.suppliers s ON s.id = u.rid
)
UPDATE public.suppliers s
   SET organization_id = a.org,
       code = CASE WHEN a.colide THEN NULL ELSE s.code END
  FROM alvo a
 WHERE s.id = a.rid
   AND NOT a.duplicata;
-- Esperado: UPDATE 20

-- ────────────────────────────────────────────────────────────
-- 2. clients
-- ────────────────────────────────────────────────────────────
WITH orgs AS (
  SELECT cl.id AS rid, o.organization_id
    FROM public.clients cl
    JOIN LATERAL (
      SELECT p.organization_id FROM public.projects p
       WHERE p.settings->>'clientId' = cl.id::text AND p.organization_id IS NOT NULL
      UNION
      SELECT d.organization_id FROM public.commercial_deals d
       WHERE d.client_id = cl.id AND d.organization_id IS NOT NULL
    ) o ON true
   WHERE cl.organization_id IS NULL
), resolvidos AS (
  SELECT rid, (array_agg(DISTINCT organization_id))[1] AS org
    FROM orgs GROUP BY rid HAVING count(DISTINCT organization_id) = 1
), alvo AS (
  SELECT u.rid, u.org,
         EXISTS (SELECT 1 FROM public.clients x
                  WHERE x.organization_id = u.org AND x.code = c.code AND x.id <> c.id) AS colide,
         EXISTS (SELECT 1 FROM public.clients x
                  WHERE x.organization_id = u.org AND x.code = c.code AND x.id <> c.id
                    AND x.document IS NOT DISTINCT FROM c.document)                     AS duplicata
    FROM resolvidos u
    JOIN public.clients c ON c.id = u.rid
)
UPDATE public.clients c
   SET organization_id = a.org,
       code = CASE WHEN a.colide THEN NULL ELSE c.code END
  FROM alvo a
 WHERE c.id = a.rid
   AND NOT a.duplicata;
-- Esperado: UPDATE 10

COMMIT;

-- ==========================================================================
-- CONFERÊNCIA (rodar depois)
-- SELECT 'suppliers' AS t, count(*) FROM public.suppliers WHERE organization_id IS NULL
-- UNION ALL SELECT 'clients', count(*) FROM public.clients WHERE organization_id IS NULL;
-- Esperado: suppliers 120 (140 - 20), clients 7 (17 - 10)
-- ==========================================================================
