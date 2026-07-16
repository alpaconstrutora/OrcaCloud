-- ============================================================
-- Migration: 20270208000003_drop_anon_storage_measure_plants.sql
-- SEGURANÇA — passo storage do rollout anon (sequência da 20270208000002,
-- que cobriu só as tabelas de public).
--
-- Diferença fundamental do storage p/ as tabelas: aqui o risco real são
-- (a) as policies anon de ESCRITA (INSERT/UPDATE/DELETE) — leitura anon em
-- bucket `public=true` é inócua (o bucket já é mundialmente legível pela flag,
-- dropar a policy de SELECT não muda nada) — e (b) a própria flag public=true.
--
-- Das 9 policies anon em storage.objects, só o bucket `measure-plants` tem
-- escrita anon SEGURA de remover:
--   • O tool de Medição (MeasureAIModule → measureService) roda 100% no app
--     AUTENTICADO (não é renderizado antes do session guard; nenhum portal
--     usa measureService). Escrita real acontece como `authenticated`.
--   • Já existem as policies "Allow authenticated insert/update/delete to
--     measure-plants" → zero risco de lockout.
--   • As 3 policies anon aqui deixavam qualquer um com a anon key subir,
--     sobrescrever ou apagar arquivos no bucket.
--
-- MANTIDAS DE PROPÓSITO (NÃO são dev cruft — fluxo público real ou inócuo):
--   • broker-materials (anon INSERT/UPDATE/DELETE) — o Portal do Corretor roda
--     anon via token (BrokerPortalTokenGate) e renderiza <BrokerMaterials/>, que
--     escreve via brokerMaterialService como anon. Dropar QUEBRARIA o portal.
--     (Se corretor não deveria escrever, é decisão de produto + rotear por
--     RPC/edge, não remover a policy solta.)
--   • invoices (anon SELECT + INSERT) — SELECT inócuo (bucket public=true);
--     INSERT sustenta o envio de NF pelo fornecedor (fluxo anon). Avaliar junto
--     das policies de invoices em [[project_rls_anon_rollout]].
--   • opportunity-photos (anon SELECT) — inócuo (bucket public=true), leitura
--     intencional do marketplace público.
--
-- Idempotente: DROP POLICY IF EXISTS.
-- ============================================================

DROP POLICY IF EXISTS "Allow anon upload on measure-plants" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon update on measure-plants" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon delete on measure-plants" ON storage.objects;
