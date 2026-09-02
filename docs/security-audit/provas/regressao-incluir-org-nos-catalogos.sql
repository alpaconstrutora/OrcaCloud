-- VERIFICAÇÃO — `fn_incluir_org_nos_catalogos` não pode ser a porta dos fundos
-- do C1-06.
--
-- O risco desta função é evidente: se bastasse ser gestor da organização de
-- DESTINO, o admin do cliente #2 a chamaria para a própria organização e se
-- serviria dos catálogos do grupo — desfazendo exatamente o que o C1-06 fechou.
--
-- Três cenários, em transação abortada:
--   1. gestor do grupo incluindo uma organização nova do grupo  → deve INCLUIR
--   2. cliente #2 chamando para a PRÓPRIA organização           → não leva nada
--   3. usuário sem vínculo                                      → recusado
BEGIN;

SELECT set_config('v.gestor',     (SELECT email FROM organization_members WHERE role IN ('owner','admin') ORDER BY email LIMIT 1), true);
SELECT set_config('v.gestor_uid', (SELECT user_id::text FROM organization_members WHERE role IN ('owner','admin') ORDER BY email LIMIT 1), true);

-- Organização NOVA do grupo (o gestor acima vira owner dela).
INSERT INTO organizations (name) VALUES ('ZZ Nova Do Grupo (teste)');
INSERT INTO organization_members (organization_id, email, user_id, role)
SELECT o.id, current_setting('v.gestor'), current_setting('v.gestor_uid')::uuid, 'owner'
  FROM organizations o WHERE o.name = 'ZZ Nova Do Grupo (teste)';

-- Organização do "cliente #2", com um admin próprio, sem relação com o grupo.
INSERT INTO organizations (name) VALUES ('ZZ Cliente Dois (teste)');
INSERT INTO organization_members (organization_id, email, role)
SELECT o.id, 'cliente-dois@exemplo-invalido.test', 'owner'
  FROM organizations o WHERE o.name = 'ZZ Cliente Dois (teste)';

-- ⚠️ Os ids têm de ser capturados AQUI, ainda como postgres. Depois do
-- `SET LOCAL ROLE`, um SELECT em `organizations` roda sob RLS e — sem claims
-- definidos ainda — devolve NULL, o que fazia a prova acusar uma regressão
-- inexistente ("informe a organizacao").
SELECT set_config('v.nova', (SELECT id::text FROM organizations WHERE name = 'ZZ Nova Do Grupo (teste)'), true);
SELECT set_config('v.dois', (SELECT id::text FROM organizations WHERE name = 'ZZ Cliente Dois (teste)'), true);

SET LOCAL ROLE authenticated;

DO $$
DECLARE
    v_nova uuid := current_setting('v.nova')::uuid;
    v_dois uuid := current_setting('v.dois')::uuid;
    r_ok text; r_dois text; r_estranho text;
    v_dois_ve int;
BEGIN
    -- 1) Gestor do grupo inclui a organização nova
    PERFORM set_config('request.jwt.claims',
        json_build_object('role','authenticated','email',current_setting('v.gestor'),
                          'sub',current_setting('v.gestor_uid'))::text, true);
    BEGIN
        r_ok := fn_incluir_org_nos_catalogos(v_nova)::text;
    EXCEPTION WHEN OTHERS THEN r_ok := 'RECUSOU — ' || SQLERRM || '  <-- REGRESSAO!';
    END;

    -- 2) Cliente #2 chamando para a PRÓPRIA organização
    PERFORM set_config('request.jwt.claims',
        '{"role":"authenticated","email":"cliente-dois@exemplo-invalido.test"}', true);
    BEGIN
        r_dois := fn_incluir_org_nos_catalogos(v_dois)::text;
    EXCEPTION WHEN OTHERS THEN r_dois := 'recusado (' || SQLERRM || ')';
    END;
    -- Mesmo que a chamada não levante erro, o que importa é o que ele passa a ver.
    SELECT count(*) INTO v_dois_ve FROM rubrics WHERE organization_id IS NOT NULL;

    -- 3) Usuário sem vínculo nenhum
    PERFORM set_config('request.jwt.claims',
        '{"role":"authenticated","email":"ninguem@exemplo-invalido.test"}', true);
    BEGIN
        PERFORM fn_incluir_org_nos_catalogos(v_nova);
        r_estranho := 'INCLUIU  <-- FALHA';
    EXCEPTION WHEN OTHERS THEN r_estranho := 'recusado (' || SQLERRM || ')';
    END;

    RAISE EXCEPTION E'\n=== fn_incluir_org_nos_catalogos (transacao abortada) ===\n'
        '1. gestor do grupo -> org nova do grupo:\n     %\n'
        '2. cliente #2 -> propria organizacao:\n     %\n'
        '   rubricas do grupo que o cliente #2 passa a ver: %   <- tem de ser 0\n'
        '3. usuario sem vinculo:\n     %\n'
        '=== fim ===', r_ok, r_dois, v_dois_ve, r_estranho;
END $$;

ROLLBACK;
