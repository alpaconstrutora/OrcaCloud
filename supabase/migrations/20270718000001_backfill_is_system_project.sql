-- ============================================================================
-- BACKFILL: settings.isSystemProject nos projetos centralizadores do sistema
-- ============================================================================
--
-- Contexto
-- --------
-- "Gestão Comercial" é um projeto criado pelo próprio sistema
-- (services/commercialFinanceService.ts) para pendurar as parcelas e transações
-- da área comercial. Ele é gravado com classification = 'OBRA', então toda
-- consulta que pede "as obras" o traz junto e ele aparece em tabelas do app
-- como se fosse uma obra real.
--
-- O flag settings.isSystemProject = true só passou a ser gravado depois que
-- vários desses projetos já existiam em produção (um por organização). Os
-- registros antigos ficaram sem o flag, e por isso a única defesa que
-- funcionava era comparar o nome string a string, espalhado por 18 arquivos.
--
-- Esta migration marca as linhas legadas para que o flag passe a ser confiável.
-- O código NÃO depende só disto — utils/systemProjects.ts mantém o fallback por
-- nome, de propósito, para cobrir ambiente onde este UPDATE não tenha rodado.
--
-- Idempotente: o WHERE já exclui quem está marcado, então rodar de novo é no-op.
-- Não destrutiva: só acrescenta uma chave ao JSONB, não apaga nem renomeia nada.
-- ============================================================================

UPDATE projects
SET settings = jsonb_set(
        COALESCE(settings, '{}'::jsonb),
        '{isSystemProject}',
        'true'::jsonb,
        true  -- create_missing: cria a chave quando ela não existe
    )
WHERE name = 'Gestão Comercial'
  AND COALESCE(settings->>'isSystemProject', 'false') <> 'true';

-- Conferência (resultado esperado: todas as linhas com marcado = true)
DO $$
DECLARE
    faltando integer;
BEGIN
    SELECT COUNT(*) INTO faltando
    FROM projects
    WHERE name = 'Gestão Comercial'
      AND COALESCE(settings->>'isSystemProject', 'false') <> 'true';

    IF faltando > 0 THEN
        RAISE WARNING 'Ainda restam % projeto(s) "Gestão Comercial" sem isSystemProject', faltando;
    ELSE
        RAISE NOTICE 'Backfill concluido: todos os projetos de sistema estao marcados.';
    END IF;
END $$;
