-- ============================================================================
-- Planta Inteligente — REGRESSÃO: estudo com versão publicada voltou a não poder
-- ser apagado (desde 20270919000034).
--
-- ACHADO pelo teste de integração (E1 do plano `2026-10-01-incendio-backlog-pos-roadmap.md`,
-- 01/10/2026): todos os 25 casos passaram, e a LIMPEZA falhou —
--   "blueprint: blueprint_snapshots é imutável (tentativa de DELETE em …)".
--
-- HISTÓRIA. A 20270905000002 tinha tirado o DELETE do gatilho de imutabilidade dos
-- snapshots, porque ele abortava o CASCADE de `blueprint_studies` (estudo publicado
-- impossível de excluir). A 20270919000034 (aprovação), ao separar o UPDATE num guarda
-- próprio, partiu do gatilho ORIGINAL (`BEFORE UPDATE OR DELETE`, da 20270905000000) e
-- deixou "o DELETE no guarda geral" — recriando `BEFORE DELETE`. O defeito voltou.
--
-- A CORREÇÃO é a mesma da 20270905000002: o snapshot é IMUTÁVEL (o guarda de UPDATE por
-- coluna, `trg_blueprint_snapshot_so_aprovacao`, fica), não INDELÉVEL. Apagar o estudo
-- leva junto o que é dele. O cliente continua sem apagar snapshot avulso: a tabela não
-- tem policy de DELETE (o RLS recusa); só o CASCADE, que roda como dono, passa.
--
-- ⚠️ APLICAR À MÃO: npx supabase db query --linked -f <este arquivo>. NUNCA `db push`.
--    Idempotente (DROP IF EXISTS).
-- ============================================================================

SET lock_timeout = '5s';

DROP TRIGGER IF EXISTS trg_blueprint_snapshots_immutable ON public.blueprint_snapshots;

-- Conferência. Esperado: gatilho_de_delete=0, guarda_de_update=1, policies_de_delete=0.
SELECT
  (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.blueprint_snapshots'::regclass AND tgname = 'trg_blueprint_snapshots_immutable') AS gatilho_de_delete,
  (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.blueprint_snapshots'::regclass AND tgname = 'trg_blueprint_snapshot_so_aprovacao') AS guarda_de_update,
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'blueprint_snapshots' AND cmd = 'DELETE') AS policies_de_delete;
