-- ============================================================
-- Migration: aplicar_20270918000026_org_roles_faixa_compat.sql
-- COMPATIBILIDADE — desfazer a quebra que a ...000025 causou em produção
--
-- O QUE EU FIZ DE ERRADO
-- A ...000025 tirou `salario_minimo`/`salario_maximo` de `org_roles`. A correção
-- em si está certa. O erro foi de SEQUÊNCIA: apliquei no banco às 23:17, e o
-- frontend de produção é de 19:04 — quatro horas atrás. Esse frontend ainda
-- manda as duas colunas no payload de `saveRole`, e o PostgREST responde:
--
--     PGRST204 — Could not find the 'salario_minimo' column of 'org_roles'
--
-- Ou seja: **criar e editar cargo passou a falhar em produção**, e ficou assim
-- até esta migration. Remoção de coluna precisa ser compatível para trás até o
-- frontend correspondente estar no ar. Migration e deploy são um par; aplicar só
-- a metade que eu controlo não é meio caminho andado, é quebra.
--
-- O QUE ESTA MIGRATION FAZ
-- Devolve as duas colunas a `org_roles` como **casca**: elas existem para o
-- payload antigo não estourar, mas ficam SEMPRE nulas. Uma trigger BEFORE
-- intercepta o que for escrito nelas, encaminha para `org_role_salary_bands` —
-- onde a RLS de admin continua valendo — e zera o campo antes de gravar.
--
-- Resultado, com o frontend velho no ar:
--   • salvar cargo volta a funcionar;
--   • faixa escrita por admin vai para a tabela restrita, como deve;
--   • ninguém lê faixa por `org_roles`: a coluna é sempre NULL — o vazamento
--     que a ...000025 fechou continua fechado.
--
-- Custo assumido: enquanto o frontend novo não sobe, nem o admin VÊ a faixa na
-- tela (ela existe no banco, intacta). É bem menos grave que não poder salvar.
--
-- QUANDO O FRONTEND NOVO ESTIVER EM PRODUÇÃO
-- Estas duas colunas e a trigger podem cair. Não caem sozinhas de propósito:
-- some-as só depois de confirmar que produção já roda o `listRoles` que lê
-- `org_role_salary_bands` — que é exatamente a conferência que faltou aqui.
-- ============================================================

ALTER TABLE public.org_roles ADD COLUMN IF NOT EXISTS salario_minimo NUMERIC;
ALTER TABLE public.org_roles ADD COLUMN IF NOT EXISTS salario_maximo NUMERIC;

COMMENT ON COLUMN public.org_roles.salario_minimo IS
    'CASCA de compatibilidade — sempre NULL. A faixa real vive em org_role_salary_bands (restrita a admin). Remover junto com trg_org_roles_faixa_compat quando o frontend novo estiver em producao.';
COMMENT ON COLUMN public.org_roles.salario_maximo IS
    'CASCA de compatibilidade — sempre NULL. Ver comentario de salario_minimo.';

CREATE OR REPLACE FUNCTION public.fn_org_roles_faixa_compat()
RETURNS trigger
LANGUAGE plpgsql
-- SECURITY INVOKER de propósito: a escrita em `org_role_salary_bands` passa pela
-- RLS de quem chamou. Se fosse DEFINER, esta trigger viraria um caminho lateral
-- para qualquer colaborador gravar faixa salarial — exatamente o que a
-- ...000025 foi feita para impedir.
AS $$
BEGIN
    -- Nada informado: não mexe na faixa existente.
    --
    -- Este ramo é o que protege o dado. A tela do não-admin não recebe a faixa,
    -- então o formulário dele devolve NULL nos dois campos a cada save. Se aqui
    -- houvesse um DELETE, todo save de colaborador comum apagaria a faixa de
    -- quem pode vê-la.
    IF NEW.salario_minimo IS NULL AND NEW.salario_maximo IS NULL THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.org_role_salary_bands (role_id, company_id, salario_minimo, salario_maximo)
    VALUES (NEW.id, NEW.company_id, NEW.salario_minimo, NEW.salario_maximo)
    ON CONFLICT (role_id) DO UPDATE
       SET salario_minimo = EXCLUDED.salario_minimo,
           salario_maximo = EXCLUDED.salario_maximo,
           updated_at     = NOW();

    -- A casca nunca guarda valor.
    NEW.salario_minimo := NULL;
    NEW.salario_maximo := NULL;

    RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_org_roles_faixa_compat() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_org_roles_faixa_compat ON public.org_roles;
CREATE TRIGGER trg_org_roles_faixa_compat
    BEFORE INSERT OR UPDATE ON public.org_roles
    FOR EACH ROW EXECUTE FUNCTION public.fn_org_roles_faixa_compat();

-- ── Verificação embutida ────────────────────────────────────────────────────
DO $$
DECLARE
    v_vazadas int;
    v_bandas  int;
BEGIN
    -- A casca não pode ter nascido com dado (a ...000025 já esvaziou a origem).
    SELECT count(*) INTO v_vazadas FROM public.org_roles
     WHERE salario_minimo IS NOT NULL OR salario_maximo IS NOT NULL;
    IF v_vazadas > 0 THEN
        RAISE EXCEPTION '% cargo(s) com faixa na casca — deveria estar sempre NULL', v_vazadas;
    END IF;

    SELECT count(*) INTO v_bandas FROM public.org_role_salary_bands;
    IF v_bandas = 0 THEN
        RAISE EXCEPTION 'org_role_salary_bands vazia — a ...000025 perdeu o dado?';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_trigger
                    WHERE tgname = 'trg_org_roles_faixa_compat' AND NOT tgisinternal) THEN
        RAISE EXCEPTION 'trigger de compatibilidade nao foi criada';
    END IF;

    RAISE NOTICE 'OK: casca criada, % faixa(s) preservada(s) na tabela restrita, escrita antiga encaminhada.', v_bandas;
END $$;
