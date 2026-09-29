-- Security Advisor › "RLS Disabled in Public" em public.spatial_ref_sys
--
-- Pedido do usuário em 29/09/2026: "verifique esse aviso emitido pelo supabase"
-- e, apresentadas as opções, escolheu a 1 (trigger de bloqueio).
--
-- O que a tabela é: catálogo interno do PostGIS (8.500 SRIDs EPSG, dado
-- público). Nasceu em public porque a 20261124000000 fez
-- `CREATE EXTENSION postgis` sem `WITH SCHEMA extensions`; a extensão não é
-- relocável e as 5 colunas `geom` de opura_market_* dependem dela.
--
-- Por que não é "ALTER TABLE ... ENABLE ROW LEVEL SECURITY": a dona é
-- supabase_admin. Como postgres, o ALTER falha (42501) e o REVOKE dos grants
-- de anon/authenticated NÃO dá erro e NÃO faz nada (grantor é supabase_admin).
-- Testado em rollback antes desta migration. O aviso em si é falso positivo
-- reconhecido (supabase/supabase#47206, PR #48234 exclui tabelas de extensão
-- do lint 0013) e vai continuar aparecendo até o lint mudar.
--
-- O que ESTA migration fecha: anon/authenticated tinham INSERT/UPDATE/DELETE/
-- TRUNCATE via PostgREST (grant default do schema). Quem tem a chave pública
-- do bundle podia truncar a tabela e quebrar toda transformação geográfica do
-- Opura Market. O trigger é a única alavanca que postgres tem (herda o
-- privilégio TRIGGER dado a anon/authenticated).
--
-- Quem continua podendo escrever: postgres, service_role, supabase_admin —
-- ou seja, upgrade do PostGIS e manutenção por SQL seguem normais.
--
-- REGRA #7, pergunta 2: a função não é SECURITY DEFINER e uma função que
-- RETURNS trigger não é chamável por RPC, mas o REVOKE vai junto, literal,
-- porque é o padrão da casa e é o que a trava de segurancaMigrations confere.

CREATE OR REPLACE FUNCTION public.fn_spatial_ref_sys_bloquear_escrita_api()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    IF current_user IN ('anon', 'authenticated') THEN
        RAISE EXCEPTION
            'public.spatial_ref_sys é catálogo do PostGIS: escrita pela API não é permitida'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NULL;   -- trigger de statement: valor de retorno é ignorado
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_spatial_ref_sys_bloquear_escrita_api() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_spatial_ref_sys_bloquear_escrita_api ON public.spatial_ref_sys;

-- TRUNCATE só existe em trigger de statement; por isso FOR EACH STATEMENT,
-- que também é mais barato do que checar linha a linha.
CREATE TRIGGER trg_spatial_ref_sys_bloquear_escrita_api
    BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.spatial_ref_sys
    FOR EACH STATEMENT
    EXECUTE FUNCTION public.fn_spatial_ref_sys_bloquear_escrita_api();
