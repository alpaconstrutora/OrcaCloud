-- ============================================================================
-- Planta Inteligente — remover as 4 FKs para auth.users
-- Corrige: aplicar_20270905000000_blueprint_kernel_foundation.sql
--
-- ─── MOTIVO 1: `ON DELETE SET NULL` APAGA TRILHA DE AUDITORIA ───────────────
--
-- É o argumento mais forte, e não tem a ver com lock.
--
-- As quatro colunas registram QUEM fez alguma coisa: criou o estudo, criou o
-- ramo, publicou a versão, gerou o evento de auditoria. Com `ON DELETE SET NULL`,
-- excluir um usuário do sistema apaga a autoria de tudo que ele fez — a
-- publicação passa a não ter autor, o evento de auditoria não tem ator.
--
-- Trilha de auditoria que perde o autor quando a pessoa sai da empresa não é
-- trilha. `blueprint_audit_events` é append-only justamente para sobreviver ao
-- objeto observado; não faz sentido ela não sobreviver ao usuário.
--
-- Guardar o UUID sem FK preserva o registro. Se o usuário for excluído, o id
-- fica órfão — e órfão que diz "foi este id" vale mais que NULL que não diz nada.
--
-- ─── MOTIVO 2: FK para auth.users deadlocka ─────────────────────────────────
--
-- auth.users é a tabela mais quente do Supabase: toda sessão logada renova token
-- e escreve nela. Criar ou remover FK que a referencia exige lock forte, e o
-- `aplicar_20270905000003` falhou exatamente assim (40P01).
--
-- ⚠️ ESTA MIGRATION CARREGA O MESMO RISCO QUE ESTÁ REMOVENDO. Derrubar uma FK
--    apaga os gatilhos de integridade das DUAS pontas, então também precisa de
--    lock em auth.users. É dor de uma vez para tirar risco recorrente.
--
--    Rodar com o MENOR número possível de pessoas logadas. Se der 40P01, não é
--    problema: `lock_timeout` aborta sem estragar nada, e basta repetir depois.
--
-- ⚠️ APLICAR À MÃO, **UM BLOCO POR VEZ**. Quatro blocos separados de propósito:
--    juntos, seguraria lock nas quatro tabelas ao mesmo tempo, o que aumenta a
--    janela de deadlock em vez de diminuir.
-- ============================================================================

-- ═══ BLOCO 0 — descobrir os nomes reais ═════════════════════════════════════
-- Rodar primeiro. Os nomes abaixo seguem a convenção do Postgres, mas confirme
-- antes de rodar os DROPs: se algum vier diferente, ajuste o bloco correspondente.

SELECT t.relname AS tabela, c.conname AS constraint_name
  FROM pg_constraint c
  JOIN pg_class t  ON t.oid = c.conrelid
  JOIN pg_class rt ON rt.oid = c.confrelid
  JOIN pg_namespace rn ON rn.oid = rt.relnamespace
 WHERE t.relname LIKE 'blueprint%'
   AND rt.relname = 'users'
   AND rn.nspname = 'auth'
 ORDER BY 1;

-- ═══ BLOCO 1 — blueprint_studies.created_by ═════════════════════════════════
SET lock_timeout = '5s';
ALTER TABLE public.blueprint_studies
  DROP CONSTRAINT IF EXISTS blueprint_studies_created_by_fkey;

-- ═══ BLOCO 2 — blueprint_branches.created_by ════════════════════════════════
SET lock_timeout = '5s';
ALTER TABLE public.blueprint_branches
  DROP CONSTRAINT IF EXISTS blueprint_branches_created_by_fkey;

-- ═══ BLOCO 3 — blueprint_snapshots.published_by ═════════════════════════════
SET lock_timeout = '5s';
ALTER TABLE public.blueprint_snapshots
  DROP CONSTRAINT IF EXISTS blueprint_snapshots_published_by_fkey;

-- ═══ BLOCO 4 — blueprint_audit_events.actor ═════════════════════════════════
SET lock_timeout = '5s';
ALTER TABLE public.blueprint_audit_events
  DROP CONSTRAINT IF EXISTS blueprint_audit_events_actor_fkey;

-- ═══ BLOCO 5 — documentar a intenção ════════════════════════════════════════
-- Sem isto, alguém relê o schema daqui a um ano, vê UUID solto e "conserta"
-- recriando a FK — trazendo de volta os dois problemas.
SET lock_timeout = '5s';

COMMENT ON COLUMN public.blueprint_studies.created_by IS
  'auth.users.id SEM chave estrangeira, de propósito: FK para auth.users deadlocka '
  '(tabela quente) e ON DELETE SET NULL apagaria a autoria. NÃO recriar a FK.';
COMMENT ON COLUMN public.blueprint_branches.created_by IS
  'auth.users.id sem FK — ver comentário em blueprint_studies.created_by.';
COMMENT ON COLUMN public.blueprint_snapshots.published_by IS
  'auth.users.id sem FK. Quem publicou tem de continuar registrado mesmo que o '
  'usuário seja excluído — snapshot sem autor não é rastreável.';
COMMENT ON COLUMN public.blueprint_audit_events.actor IS
  'auth.users.id sem FK. Trilha append-only que perde o ator quando a pessoa sai '
  'da empresa não é trilha.';

-- ═══ BLOCO 6 — conferência ══════════════════════════════════════════════════
-- Rodar por último e sozinho. Esperado: 0.

SELECT count(*) AS fks_para_auth_users_restantes
  FROM pg_constraint c
  JOIN pg_class t  ON t.oid = c.conrelid
  JOIN pg_class rt ON rt.oid = c.confrelid
  JOIN pg_namespace rn ON rn.oid = rt.relnamespace
 WHERE t.relname LIKE 'blueprint%'
   AND rt.relname = 'users'
   AND rn.nspname = 'auth';
