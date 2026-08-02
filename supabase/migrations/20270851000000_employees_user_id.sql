-- ============================================================
-- Vínculo explícito entre usuário do sistema e colaborador.
--
-- Até aqui, "quais são as MINHAS matrículas" era resolvido casando o e-mail
-- do login com employees.email via ILIKE no cliente — que falha em silêncio
-- quando os e-mails divergem, e é ambíguo quando se repetem.
--
-- organization_members (quem tem login) e employees (quem trabalha) são
-- cadastros independentes por design: a maior parte da mão de obra NÃO tem
-- login, e acessa pelo Portal do Colaborador via token.
-- ============================================================

SET lock_timeout = '3s';

-- SEM FK para auth.users: employees é tabela quente e REFERENCES pega
-- ShareRowExclusiveLock, que deadlocka (40P01) contra o app em produção.
-- ADD COLUMN nullable sem default não reescreve a tabela.
ALTER TABLE public.employees
    ADD COLUMN IF NOT EXISTS user_id UUID;

-- Um usuário aponta para no máximo um colaborador POR ORGANIZAÇÃO — a mesma
-- pessoa pode ser colaborador em duas empresas do mesmo grupo.
CREATE UNIQUE INDEX IF NOT EXISTS uq_employees_user_id
    ON public.employees(org_id, user_id)
    WHERE user_id IS NOT NULL;

COMMENT ON COLUMN public.employees.user_id IS
    'auth.users.id do usuário do sistema correspondente. NULL = colaborador sem login (caso mais comum: mão de obra de obra, que usa o Portal do Colaborador por token). Sem FK de propósito — ver cabeçalho da migration. O vínculo é feito na ficha do colaborador, nunca por backfill em massa: casar e-mail automaticamente vincularia a pessoa errada em base com e-mail repetido ou reaproveitado.';
