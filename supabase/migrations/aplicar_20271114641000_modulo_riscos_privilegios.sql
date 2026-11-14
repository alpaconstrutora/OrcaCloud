-- Módulo ÒPURA Riscos — aperto de privilégios (14/11/2026), depois de aplicar 20271114637000.
--
-- Achado ao conferir o banco: os default privileges do Supabase concedem ALL a `authenticated`
-- em tabela nova, e o GRANT da migration de estrutura SOMA, não substitui. Resultado medido:
-- authenticated com UPDATE/DELETE em `risk_evaluations` e `risk_audit_logs` (que deviam ser só
-- SELECT/INSERT) e TRUNCATE nas 7 tabelas.
--   • UPDATE/DELETE já eram barrados (sem policy → RLS nega; avaliação também tem gatilho), mas o
--     privilégio não deve existir: append-only é regra de negócio (CA05), não só de policy.
--   • TRUNCATE ignora RLS e não dispara gatilho de linha. A API (PostgREST) não expõe TRUNCATE, então
--     não é explorável pelo app — fecha-se mesmo assim.
-- O mesmo TRUNCATE para authenticated existe em tabelas antigas (ex.: empreendimento_audit_logs);
-- fora do escopo deste módulo, registrado no plano.

REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.risk_evaluations FROM authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.risk_audit_logs  FROM authenticated;
REVOKE TRUNCATE ON TABLE public.risk_categories    FROM authenticated;
REVOKE TRUNCATE ON TABLE public.risk_catalog       FROM authenticated;
REVOKE TRUNCATE ON TABLE public.risk_matrix_config FROM authenticated;
REVOKE TRUNCATE ON TABLE public.project_risks      FROM authenticated;
REVOKE TRUNCATE ON TABLE public.risk_actions       FROM authenticated;
