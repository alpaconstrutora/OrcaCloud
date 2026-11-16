-- ============================================================================
-- Portal do Parceiro › anexo de solicitação sem travessia de caminho (15/11/2026)
--
-- Varredura de segurança de 15/11/2026. `partner_portal_create_request`
-- (chamável por `anon` com o token do link público) aceitava em
-- `p_attachment_paths` qualquer caminho que casasse com
-- `LIKE 'partner-uploads/<workspace>/%'`. Nada recusava segmento `.`/`..`:
-- `partner-uploads/<ws>/../<outra-pasta>/x` passa no LIKE, fica gravado em
-- `partner_requests.attachment_paths` e a Edge Function `partner-portal-download`
-- (que conferia o mesmo prefixo com `startsWith`) o assinava com a service_role
-- — o parser de URL do `fetch` resolve o `..` e a URL assinada sai da pasta do
-- workspace.
--
-- O que muda aqui: a RPC passa a recusar ('invalid_attachment_path', 22023, o
-- mesmo erro de antes) também o caminho em que sobra algum segmento `.`/`..`,
-- lido de dois jeitos:
--  (a) como o parser de URL lê o que vem depois de `/object/sign/<bucket>/`:
--      corta espaço/controle do fim, descarta tab/LF/CR, para no primeiro
--      `?`/`#`, `\` vira `/`, `%2e` vira `.` e `%2f`/`%5c` viram `/`;
--  (b) cru: descarta tab/LF/CR, corta espaço/controle do fim, `%2e` vira `.`,
--      sem cortar em `?`/`#`.
-- `#`, `?`, `\`, espaço e acento sozinhos continuam aceitos. O caminho que a
-- Edge `partner-portal-upload` devolve (`partner-uploads/{ws}/{epoch}_{nome
-- saneado}`) continua passando. O resto da função é o de
-- 20270121000000_partner_portal_request_attachments.sql, linha a linha.
--
-- A MESMA regra está na Edge, em `supabase/functions/_shared/caminhoSemTravessia.ts`,
-- chamada pela `partner-portal-download` antes de assinar: o banco recusa na
-- gravação; a Edge recusa na assinatura o que já estava gravado e o que chega
-- direto no corpo da requisição. Mudar uma é mudar as duas.
--
-- Linhas já gravadas NÃO são alteradas (a Edge passa a recusar o download).
--
-- REGRA #7: a função mantém SECURITY DEFINER e `SET search_path = public`; o
-- GRANT a anon/authenticated é o de antes, e entra o REVOKE de PUBLIC que a
-- trava de `__tests__/segurancaMigrations.test.ts` exige (anon e authenticated
-- continuam com EXECUTE pelo GRANT explícito).
-- Idempotente. Aplicar com: npx supabase db query --linked -f <este arquivo>   (nunca db push)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.partner_portal_create_request(
    p_token TEXT,
    p_title TEXT,
    p_description TEXT,
    p_type TEXT,
    p_priority TEXT,
    p_attachment_paths TEXT[] DEFAULT '{}'::text[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_ws UUID := public.partner_portal_workspace_from_token(p_token);
    v_row public.partner_requests;
    -- Espaço e controles C0 (chr(1)..chr(32)) que o parser de URL corta do fim.
    v_fim TEXT := (SELECT string_agg(chr(g.i), '' ORDER BY g.i) FROM generate_series(1, 32) AS g(i));
BEGIN
    IF v_ws IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;

    -- Impede referenciar arquivos de outro workspace (o path sempre começa com
    -- partner-uploads/{workspace_id}/, gerado pela Edge Function de upload).
    -- E recusa segmento `.`/`..` — lido como o parser de URL lê (a) e cru (b):
    -- sem isso `partner-uploads/{ws}/../...` passa pelo prefixo e sai da pasta.
    IF EXISTS (
        SELECT 1 FROM unnest(p_attachment_paths) p
        WHERE p NOT LIKE ('partner-uploads/' || v_ws::text || '/%')
           OR string_to_array(
                  replace(replace(replace(replace(replace(replace(replace(
                      split_part(split_part(translate(rtrim(p, v_fim), E'\t\n\r', ''), '?', 1), '#', 1),
                      chr(92), '/'),
                      '%2e', '.'), '%2E', '.'),
                      '%2f', '/'), '%2F', '/'),
                      '%5c', '/'), '%5C', '/'),
                  '/') && ARRAY['.', '..']::text[]
           OR string_to_array(
                  replace(replace(rtrim(translate(p, E'\t\n\r', ''), v_fim), '%2e', '.'), '%2E', '.'),
                  '/') && ARRAY['.', '..']::text[]
    ) THEN
        RAISE EXCEPTION 'invalid_attachment_path' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.partner_requests (
        partner_workspace_id, title, description, type, priority, status, created_by_email, attachment_paths
    ) VALUES (
        v_ws, p_title, p_description, p_type, p_priority, 'ABERTO', 'link-publico@portal-parceiro', p_attachment_paths
    )
    RETURNING * INTO v_row;

    RETURN jsonb_build_object('valid', TRUE, 'data', row_to_json(v_row));
END;
$X$;

REVOKE EXECUTE ON FUNCTION public.partner_portal_create_request(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.partner_portal_create_request(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]) TO anon, authenticated;
