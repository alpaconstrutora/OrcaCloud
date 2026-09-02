<!-- Gerado por docs/security-audit/gerar_relatorio.py. Nao editar a mao: a fonte e achados.py. -->
# Issues de seguranca — ORÇACLOUD / ÒPURA

15 issues para 22 achados. Cada bloco entre `--- ISSUE n ---` e `--- FIM ISSUE n ---` e o corpo completo de uma issue.

--- ISSUE 1 ---

## [Segurança] Policy de INSERT em organization_members permite auto-promoção a owner de qualquer organização

**Labels:** `security`, `severidade:critica`, `multi-tenant`

### Problema

organization_members é a tabela que define quem pertence a que organização e com que papel. Toda a RLS do sistema depende dela: is_org_member(org) e is_org_manager(org) são SECURITY DEFINER e resolvem a permissão consultando exatamente essa tabela, casando por auth.uid() ou pelo e-mail do JWT. A policy de INSERT tem WITH CHECK (true) — não restringe organization_id, não restringe email e não restringe role. Qualquer conta autenticada (inclusive uma recém-criada por self-signup, que está habilitado em supabase/config.toml) executa um único INSERT informando o próprio e-mail, o organization_id alvo e role='owner'. A partir daí is_org_member e is_org_manager retornam TRUE para aquela organização, e todas as policies org-scoped do sistema — financeiro, folha, contratos, documentos — passam a liberar leitura e escrita. Quebra total do multi-tenant e escalada de privilégio numa única requisição.

COMPROVADO EM PRODUÇÃO, em transação abortada. Assumindo o papel authenticated com um e-mail sem nenhum vínculo, o INSERT com role='owner' foi ACEITO pela RLS, e as medições antes/depois na mesma transação foram: vínculos do ator 0 → 1; is_org_member FALSE → TRUE; is_org_manager FALSE → TRUE; linhas visíveis em organizations 0 → 1; em internal_transactions 0 → 2214. Ou seja: de nenhum acesso a 2.214 lançamentos financeiros e direitos de proprietário, com uma instrução. Nada foi persistido — o bloco termina em RAISE EXCEPTION, que aborta a transação por construção.

### Evidência

`supabase/migrations/20260215000009_fix_org_rls_recursive.sql` (linhas 65-67):

```
create policy "Authenticated users can create memberships"
  on organization_members for insert to authenticated
  with check (true);
```

_Verificado assim:_ Definição lida em pg_policies no banco remoto; cadeia confirmada em pg_get_functiondef de is_org_member e is_org_manager; e exploração executada de ponta a ponta contra o banco de produção dentro de BEGIN ... RAISE EXCEPTION (rollback garantido, zero resíduo).

### Impacto

- Tomada de controle completa de qualquer tenant do SaaS por qualquer usuário cadastrado que conheça o UUID da organização alvo.

> **Condição de explorabilidade (C1-01):** O atacante precisa conhecer o organization_id (UUID) do alvo: a RLS de organizations impede listar as organizações, e a primeira execução da prova, sem o UUID, inseriu organization_id NULL e não escalou nada. Isso reduz a superfície, mas não é um controle de segurança — o UUID não é segredo: ele viaja no link de convite (invite-member monta redirectTo como /?org=<uuid>), aparece na URL da aplicação e é conhecido por qualquer pessoa que já tenha sido membro. O cenário realista é o ex-funcionário removido que anotou o UUID e se readiciona como owner.

### Correção sugerida

Trocar o WITH CHECK (true) por uma condição que só permita a linha que o fluxo legítimo precisa, e mover a criação de membro para o servidor. Concretamente: (a) restringir a policy a is_org_manager(organization_id) OR is_superadmin(); (b) para o auto-vínculo do primeiro dono ao criar a organização, usar uma RPC SECURITY DEFINER dedicada que só aceite organização sem nenhum membro; (c) o convite de terceiros já tem caminho correto e checado — a Edge Function invite-member.

### Critérios de aceite

- [ ] A policy "Authenticated users can create memberships" não existe mais em pg_policies
- [ ] Usuário não-membro recebe erro de RLS ao tentar INSERT em organization_members (teste automatizado)
- [ ] Criar organização nova continua funcionando e o criador vira owner
- [ ] Convite via invite-member continua criando a linha de membership
- [ ] Existe teste automatizado que falha se a condição voltar

--- FIM ISSUE 1 ---

--- ISSUE 2 ---

## [Segurança] As 8 RPCs que emitem e revogam credencial de portal são executáveis por anon

**Labels:** `security`, `severidade:critica`, `multi-tenant`

### Problema

O defeito não está em duas funções, e sim em oito — uma varredura de pg_proc mostrou que TODOS os emissores de credencial de portal têm o mesmo problema: client_portal_generate_token, broker_portal_generate_token, investor_portal_generate_token, partner_portal_generate_token, supplier_portal_generate_token e portal_generate_token (colaborador), mais partner_portal_revoke_token e supplier_portal_revoke_token, que permitem a um anônimo REVOGAR o acesso de um parceiro ou fornecedor legítimo — negação de serviço direta. São cinco portais sequestráveis e dois revogáveis por quem só tem a chave pública.

Todas são SECURITY DEFINER (rodam como owner, ignorando RLS), recebem o id do titular como parâmetro e emitem um token de portal válido por 90 dias — sem verificar quem chama, sem conferir que o titular pertence a p_org_id e sem exigir sequer sessão. As migrations fazem GRANT EXECUTE TO authenticated, mas nunca fazem REVOKE EXECUTE FROM PUBLIC; como o PostgreSQL concede EXECUTE a PUBLIC por padrão, a ACL efetiva no banco remoto é {=X/postgres, postgres=X, anon=X, authenticated=X, service_role=X} — o “=X” inicial é o PUBLIC, e anon aparece explicitamente. O papel anon executa. A cadeia completa é: chamar client_portal_generate_token, receber um token válido, chamar client_portal_get_data(token) (também SECURITY DEFINER e anon) para ler contratos, parcelas e avisos daquele cliente, e chamar a Edge Function portal-ged-download com o mesmo token para baixar os documentos do GED. O ON CONFLICT DO UPDATE ainda substitui o token legítimo, derrubando o acesso do cliente real — negação de serviço como efeito colateral.

COMPROVADO EM PRODUÇÃO, em transação abortada. Assumindo o papel anon (exatamente o que a chave publicada no bundle concede) e sem login nenhum: a leitura direta da tabela clients retornou 0 linhas — a RLS funciona —, mas client_portal_generate_token(<client_id>, <org_id>) executou e devolveu um token UUID válido; em seguida client_portal_get_data(<token>) devolveu o payload do portal com "valid": true e os dados cadastrais do cliente, incluindo nome completo e CPF (redigido neste relatório). Ou seja, a RPC de emissão de credencial contorna por completo a RLS que protege a tabela. Nada foi persistido: o bloco termina em RAISE EXCEPTION, então o token gerado foi descartado e o token legítimo do cliente permanece intacto.

### Evidência

`supabase/migrations/20261128000001_client_portal_tokens.sql` (linhas 69-89 (e 20261224000001_broker_portal_tokens.sql:42-66)):

```
CREATE OR REPLACE FUNCTION public.client_portal_generate_token(p_client_id uuid, p_org_id uuid)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE v_token TEXT;
BEGIN
    v_token := gen_random_uuid()::text;
    INSERT INTO public.client_portal_tokens (org_id, client_id, token)
    VALUES (p_org_id, p_client_id, v_token)
    ON CONFLICT (client_id) DO UPDATE SET token = v_token, ...;
    RETURN v_token;
END; $function$

GRANT EXECUTE ON FUNCTION public.client_portal_generate_token(UUID, UUID) TO authenticated;
-- nunca há REVOKE EXECUTE ... FROM PUBLIC
```

_Verificado assim:_ pg_get_functiondef e pg_proc.proacl lidos no banco remoto (ACL efetiva confirma anon=X em ambas); e cadeia emissão → leitura executada como papel anon contra o banco de produção, dentro de BEGIN ... RAISE EXCEPTION (rollback garantido, token descartado).

### Impacto

- Sequestro anônimo dos Portais do Cliente, Corretor, Investidor, Parceiro, Fornecedor e Colaborador; e revogação anônima do acesso de parceiros e fornecedores legítimos.

### Correção sugerida

Duas correções, ambas necessárias. (1) REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC, anon nas oito funções, e varrer as demais SECURITY DEFINER pelo mesmo defeito de ACL. (2) Adicionar autorização dentro da função: exigir is_org_manager(p_org_id) e validar que o id do titular pertence a p_org_id — emitir credencial de acesso é operação administrativa e não deve depender só do GRANT.

### Critérios de aceite

- [ ] has_function_privilege('anon', ...) retorna false para as oito funções
- [ ] Chamada da RPC com a chave anon retorna erro de permissão
- [ ] Chamada por autenticado que não é gestor da organização retorna erro
- [ ] Gerar link do Portal do Cliente/Corretor pela tela de admin continua funcionando
- [ ] Varredura de pg_proc confirma que nenhuma SECURITY DEFINER sensível tem ACL com PUBLIC
- [ ] Existe teste automatizado que falha se a condição voltar

--- FIM ISSUE 2 ---

--- ISSUE 3 ---

## [Segurança] Tabela invoices legível e gravável por anônimo e sem isolamento entre tenants

**Labels:** `security`, `severidade:critica`, `multi-tenant`

### Problema

Estado atual no banco remoto: três policies em invoices — “Suppliers can view their own invoices” (SELECT, papel anon, USING true), “Suppliers can insert their own invoices” (INSERT, papel anon, WITH CHECK true) e “invoices_authenticated_all” (ALL, authenticated, USING/CHECK true). Nenhuma tem recorte: o nome fala em “their own”, mas a expressão é literalmente true. A tabela sequer possui coluna organization_id — o vínculo com o tenant é indireto, por supplier_id. A chave anon fica publicada no bundle JavaScript por construção, então a policy anon equivale a acesso público. Verificado ao vivo: GET /rest/v1/invoices com a chave anon do .env, sem qualquer login, retornou HTTP 206 e Content-Range 0-828/829 — 829 notas fiscais de fornecedor de todos os tenants, com nome de arquivo, fornecedor e caminho no storage. O INSERT anon com CHECK true também permite injetar notas forjadas.

### Evidência

`supabase/migrations/20260516100000_fix_invoices_rls_boletos.sql` (linhas 14-24):

```
-- Política única: membros autenticados de qualquer organização têm acesso total
CREATE POLICY "invoices_authenticated_all" ON public.invoices
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);
```

_Verificado assim:_ Confirmado por requisição HTTP real (HTTP 206, Content-Range 0-828/829) com a chave anon pública.

### Impacto

- Vazamento público de 829 notas fiscais (fornecedor, valor, vencimento, centro de custo, caminho do arquivo) e inserção de notas falsas por anônimo.

### Correção sugerida

Remover as duas policies anon e substituir invoices_authenticated_all por policies com recorte real. Como a tabela não tem organization_id, o caminho mais seguro é (a) acrescentar a coluna com backfill a partir de suppliers/purchase_orders, ou (b) enquanto isso, escrever a policy via EXISTS sobre suppliers com is_org_member(suppliers.organization_id). O Portal do Fornecedor não precisa da policy anon: ele já passa pelas Edge Functions supplier-portal-download e supplier-portal-upload, que usam service_role após validar o token.

### Critérios de aceite

- [ ] GET /rest/v1/invoices com a chave anon retorna lista vazia
- [ ] Usuário autenticado do tenant A não vê nenhuma nota do tenant B
- [ ] POST anon em /rest/v1/invoices é recusado por RLS
- [ ] Portal do Fornecedor continua listando e enviando notas normalmente
- [ ] Existe teste automatizado que falha se a condição voltar

--- FIM ISSUE 3 ---

--- ISSUE 4 ---

## [Segurança] A perna “OR is_shared” das policies de leitura vaza 127 cadastros entre tenants

**Labels:** `security`, `severidade:alta`, `multi-tenant`

### Problema

A intenção do sinalizador is_shared é permitir que um cadastro seja reaproveitado entre as organizações de um mesmo grupo. Mas a expressão escrita não tem a segunda metade da regra: “OR is_shared” é verdadeiro sozinho, sem nenhuma condição sobre quem está lendo. Não é “compartilhado com as organizações do grupo” — é compartilhado com TODOS os usuários autenticados do SaaS inteiro, inclusive clientes concorrentes que nunca tiveram relação com aquele tenant. O mesmo padrão está em três policies: clients, suppliers (“Users can view suppliers of their organization” — o nome contradiz a expressão) e partner_workspaces.

COMPROVADO EM PRODUÇÃO (somente leitura). Assumindo o papel authenticated com um e-mail sem nenhuma linha em organization_members, a contagem de linhas visíveis foi: clients 7, suppliers 119, partner_workspaces 1 — enquanto organizations retornou 0, o que prova que a identidade usada realmente não tinha vínculo nenhum. São 119 de 244 fornecedores (49% da base) e 7 de 46 clientes expostos a qualquer conta do SaaS. Os registros de clients carregam PII: nome, CPF/CNPJ, endereço e telefone.

### Evidência

`supabase/migrations/aplicar_20270914000021_org_not_null_e_policies_is_shared.sql` (linhas 67-69):

```
CREATE POLICY "Allow authenticated users to read clients"
ON public.clients FOR SELECT TO authenticated
USING (public.is_org_member(organization_id) OR is_shared);
```

_Verificado assim:_ pg_policies (busca por qual LIKE '%is_shared%') no banco remoto, contagem de linhas is_shared por tabela, e leitura executada como papel authenticated sem vínculo, em transação abortada.

### Impacto

- Vazamento cross-tenant de 127 cadastros — incluindo CPF/CNPJ, endereço e telefone de pessoas físicas — para qualquer usuário autenticado de qualquer organização do SaaS.

> **Condição de explorabilidade (C1-05):** O impacto REAL hoje é baixo e o defeito é uma bomba-relógio, não um vazamento em curso: as quatro organizações existentes no banco pertencem todas ao mesmo cliente (Alpa Construtora, ALPA Empreendimentos, a SPE Garden Cambuhy e uma organização pessoal), então os 127 registros circulam hoje apenas dentro do grupo que os possui. O defeito vira vazamento real no instante em que o segundo cliente entrar no SaaS — e é por isso que a correção é pré-requisito de onboarding, não item de manutenção. Registrado assim para não superdimensionar o presente nem subdimensionar o risco.

### Correção sugerida

Completar a regra: o compartilhamento precisa dizer COM QUEM. Substituir “OR is_shared” por uma condição que exija que o leitor pertença ao mesmo grupo/holding do dono do registro — por exemplo “OR (is_shared AND is_org_member(<org do grupo>))”, ou uma tabela explícita de compartilhamento (organization_id dono, organization_id destino). Aplicar às três policies. Enquanto a regra correta não existir, o caminho seguro é remover a perna is_shared.

### Critérios de aceite

- [ ] Usuário sem vínculo em organization_members lê 0 linhas de clients, suppliers e partner_workspaces
- [ ] Usuário de uma organização do grupo continua vendo os cadastros compartilhados do grupo
- [ ] Usuário de organização fora do grupo não vê nenhum registro is_shared
- [ ] As três policies (clients, suppliers, partner_workspaces) usam a mesma regra revisada
- [ ] Existe teste automatizado que falha se a condição voltar

--- FIM ISSUE 4 ---

--- ISSUE 5 ---

## [Segurança] Portal do Colaborador exposto: anon lê folha de pagamento só com o UUID do colaborador

**Labels:** `security`, `severidade:critica`, `multi-tenant`

### Problema

A Edge Function não valida token nem sessão: o único controle é que o employeeId informado exista na tabela employees. Mas ela é apenas a ponta visível. A varredura de pg_proc mostrou que o Portal do Colaborador INTEIRO funciona assim: as sete funções de leitura (portal_employee_summary, portal_get_payroll_runs, portal_get_documents, portal_get_ged_documents, portal_get_absences, portal_get_time_entries, portal_get_trainings) são SECURITY DEFINER, recebem p_employee_id cru e são executáveis pelo papel anon. components/LaborPortal.tsx:78-124 as chama exatamente assim, com o employeeId cru.

O próprio comentário da Edge Function admite o desenho (“a sessão do portal é anon/employeeId, sem token assinado nem login Supabase”), e a função irmã academy-portal-media documenta explicitamente, nas linhas 32-33, por que está errado: “O recorte vem do TOKEN (portal_tokens), não de um employeeId cru passado pelo cliente. Passar employeeId seria enumerável.” Existe portal_tokens com employee_id, e existe até o padrão pronto do outro lado — fn_portal_get_ged_documents(p_token), usada pelo Portal do Cliente. A primitiva certa está escrita e não foi usada aqui.

COMPROVADO EM PRODUÇÃO (somente leitura, papel anon, sem login). O contraste é o que torna o achado inequívoco: anon NÃO tem sequer GRANT SELECT na tabela employees — a consulta direta falha com 42501 e a mensagem do Postgres chega a sugerir o GRANT que falta. Ainda assim, portal_employee_summary(<uuid>) devolveu o cadastro do colaborador (nome, cargo, status) e portal_get_payroll_runs(<uuid>) devolveu as FOLHAS DE PAGAMENTO, com competência e valores. As RPCs SECURITY DEFINER contornam por completo a proteção da tabela.

### Evidência

`supabase/functions/labor-portal-ged-download/index.ts + 8 RPCs SECURITY DEFINER` (linhas 32-65 (e components/LaborPortal.tsx:78-124)):

```
// A ponta visível — a Edge Function:
const { employeeId, storagePath } = await req.json();
const { data: emp } = await admin.from('employees').select('id').eq('id', employeeId).maybeSingle();
if (empError || !emp) return json({ error: 'Colaborador não encontrado' }, 403);
// única checagem: o colaborador EXISTE. Sem token, sessão ou prova de identidade.

// A causa real — a camada de RPC, toda executável por anon e por employee_id cru:
//   portal_employee_summary(p_employee_id)   portal_get_payroll_runs(p_employee_id)
//   portal_get_documents(p_employee_id)      portal_get_ged_documents(p_employee_id)
//   portal_get_absences(p_employee_id)       portal_get_time_entries(p_employee_id)
//   portal_get_trainings(p_employee_id)      is_employee_shared_with_user(p_employee_id)
```

_Verificado assim:_ pg_proc (prosecdef + has_function_privilege para anon) no banco remoto; chamadas executadas como papel anon contra produção, em transação abortada, devolvendo cadastro e folha de pagamento; e components/LaborPortal.tsx:78-124 confirmado passando employeeId cru.

### Impacto

- Leitura anônima de folha de pagamento, ponto, ausências, treinamentos e documentos de RH de qualquer colaborador de qualquer tenant, bastando o UUID — que também pode ser mintado por anon via portal_generate_token (C3-01).

### Correção sugerida

Criar as variantes fn_portal_*(p_token text) das sete funções, derivando o employee_id de portal_tokens (validando is_active e expires_at) — mesmo desenho de fn_portal_get_ged_documents(p_token), que já existe. Depois REVOKE EXECUTE ... FROM PUBLIC, anon nas sete antigas. Migrar components/LaborPortal.tsx para o token e aplicar o mesmo na Edge Function labor-portal-ged-download. Nenhum identificador de titular deve chegar cru pelo corpo da requisição.

### Critérios de aceite

- [ ] has_function_privilege('anon', ...) é false para as sete RPCs por p_employee_id
- [ ] As novas fn_portal_*(p_token) devolvem os mesmos dados para token válido e erro para token expirado/inativo
- [ ] A Edge Function rejeita requisição sem token com 401
- [ ] Token de um colaborador não lê dado de outro
- [ ] O Portal do Colaborador abre por link com token e mostra folha, ponto, ausências e documentos
- [ ] Existe teste automatizado que falha se a condição voltar

--- FIM ISSUE 5 ---

--- ISSUE 6 ---

## [Segurança] Edge Functions confiam no organization_id do corpo da requisição sem checar associação

**Labels:** `security`, `severidade:alta`, `multi-tenant`

### Problema

**C2-03 - organization_id vem do corpo da requisição e nunca é conferido contra a associação do chamador**

As três funções seguem o mesmo padrão: validam que existe um usuário, criam um cliente com service_role (que ignora a RLS) e passam a usar o organization_id vindo do corpo como se fosse confiável. Ele aparece em .eq(), o que dá a impressão de escopo — mas o escopo é o que o atacante escolheu, não o que ele tem direito. Um usuário do tenant A que conheça (ou enumere) um transaction_id do tenant B emite cobrança real no Asaas contra o recebível alheio, cancela cobranças do tenant B (action 'cancel', linhas 125-161) e reverte o status do recebível. Em asaas-payment o mesmo vale para boleto_id e supplier_payment_id, com efeito de dinheiro saindo. Como a RLS está fora do caminho, ela não serve de rede de segurança.

**C3-05 - asaas-charge action 'resend' envia boleto de outro tenant para e-mail escolhido pelo atacante**

Consequência direta de C2-03. Como organization_id não é validado contra o chamador, o par (charge_id, organization_id) do tenant alvo satisfaz os dois .eq(). O campo email do corpo então sobrepõe o destinatário legítimo e o Asaas envia a segunda via do boleto — com valor, vencimento, dados do sacado e linha digitável — para o endereço do atacante. É exfiltração de dado financeiro de outro tenant por um canal que não passa pela RLS.

### Evidência

`supabase/functions/asaas-charge/index.ts` (linhas 47-73 (e asaas-payment/index.ts:70-89; sign-contract/index.ts:36-62)):

```
const { data: { user }, error: authError } = await userClient.auth.getUser();
if (authError || !user) return json({ error: 'Token inválido' }, 401);

const admin = createClient(supabaseUrl, serviceRoleKey, { ... });  // ignora RLS
const { organization_id, transaction_id } = body;
if (!organization_id) return json({ error: 'organization_id é obrigatório.' }, 400);
// organization_id é usado como filtro, nunca validado contra o usuário
```

_Verificado assim:_ Três arquivos lidos integralmente; nenhuma consulta a organization_members em nenhum deles.

`supabase/functions/asaas-charge/index.ts` (linhas 84-115):

```
const { data: ch } = await admin.from('client_charges')
    .select('asaas_payment_id,billing_type,party_email,status')
    .eq('id', chargeId).eq('organization_id', organization_id).maybeSingle();

const emailOverride = body.email ?? ch.party_email;
if (emailOverride) sendBody.emails = [emailOverride];
await fetch(`${asaasBase}/payments/${ch.asaas_payment_id}/sendByMail`, { ... });
```

_Verificado assim:_ Arquivo lido integralmente; caminho de 'resend' nas linhas 84-115.

### Impacto

- Operações financeiras reais (emissão, cancelamento, pagamento de boleto) executadas sobre dados de outro tenant.
- Exfiltração de boletos e dados de cobrança de outro tenant para endereço arbitrário.

### Correção sugerida

**C2-03:** Nas três funções, logo após getUser(), consultar organization_members filtrando por organization_id e pelo e-mail/uid do usuário, devolvendo 403 se não houver linha — o mesmo bloco que invite-member/index.ts:51-60 já implementa. Extrair para um módulo compartilhado em supabase/functions/_shared/ e reusar em toda função que receba organization_id.

**C3-05:** Corrigir C2-03 (checagem de associação) e, adicionalmente, restringir emailOverride aos endereços já cadastrados daquele cliente, em vez de aceitar qualquer string.

### Critérios de aceite

- [ ] Chamada a asaas-charge com organization_id de outra org retorna 403
- [ ] Idem para asaas-payment e sign-contract
- [ ] Existe um helper compartilhado de checagem de associação usado pelas três
- [ ] Os fluxos legítimos de cobrança, pagamento e assinatura seguem funcionando
- [ ] resend com charge_id de outra organização retorna 403
- [ ] email fora dos endereços cadastrados do cliente é rejeitado
- [ ] Segunda via legítima continua sendo enviada
- [ ] Existe teste automatizado que falha se a condição voltar

--- FIM ISSUE 6 ---

--- ISSUE 7 ---

## [Segurança] sign-contract altera e lê documentos de assinatura sem checagem de posse

**Labels:** `security`, `severidade:alta`, `multi-tenant`

### Problema

Depois de validar que existe um usuário, a função escreve com adminClient (service_role) em quatro tabelas usando ids que vieram direto do corpo: documentVersionId, addendumId, contractId e dealId. Nenhum é conferido contra a organização do chamador — o organizationId até é exigido na linha 60, mas nunca é usado para validar coisa alguma. Um usuário autenticado de qualquer tenant sobrescreve signature_token, signature_status e signature_url de contratos alheios. Na action 'status' o problema é de leitura: signatureToken vem do corpo e a função consulta a API do ZapSign com o token da conta corporativa, devolvendo signers e a URL do arquivo assinado de qualquer documento daquela conta — vazamento de contrato assinado de outro cliente. A action 'webhook' (linhas 166-225) fecha o conjunto: qualquer autenticado marca um contrato como SIGNED informando o token.

### Evidência

`supabase/functions/sign-contract/index.ts` (linhas 107-163):

```
if (target === 'document_version') {
    await adminClient.from('contract_document_versions').update({
        signature_token: zapDoc.token, signature_status: 'SENT', signature_url: signUrl,
    }).eq('id', documentVersionId);      // id veio do body, sem checagem de posse
...
if (action === 'status') {
    const { signatureToken } = body;
    const zapResp = await fetch(`${ZAPSIGN_API}/docs/${signatureToken}/`, { ... });
    return json({ status: zapDoc.status, signers: zapDoc.signers, signed_file: zapDoc.signed_file });
```

_Verificado assim:_ Arquivo lido integralmente; organizationId exigido na linha 60 e não referenciado em nenhuma consulta.

### Impacto

- Adulteração do estado de assinatura de contratos de outros tenants e leitura de documentos assinados alheios via ZapSign.

### Correção sugerida

Validar associação do usuário a organizationId; carregar a linha alvo e conferir que seu organization_id bate com o do chamador antes de qualquer update; na action 'status', localizar primeiro a linha local que possui aquele signature_token dentro da organização do usuário e só então consultar o ZapSign. A action 'webhook' deve sair desta função e virar endpoint próprio, autenticado por segredo compartilhado com o ZapSign.

### Critérios de aceite

- [ ] Enviar para assinatura um contractId de outra organização retorna 403
- [ ] action 'status' com signatureToken fora da organização retorna 403
- [ ] A rota de webhook não aceita mais ser chamada por JWT de usuário
- [ ] Envio, consulta e retorno de assinatura seguem funcionando no fluxo legítimo
- [ ] Existe teste automatizado que falha se a condição voltar

--- FIM ISSUE 7 ---

--- ISSUE 8 ---

## [Segurança] sinapi-import permite a qualquer usuário logado reescrever a base de preços global

**Labels:** `security`, `severidade:alta`, `multi-tenant`

### Problema

A função verifica apenas que existe um usuário válido — nunca qual o papel dele nem a que organização pertence — e depois grava com adminClient (service_role), que ignora a RLS. A RLS de sinapi_items foi escrita justamente para impedir isso: leitura para authenticated/anon, escrita somente para service_role. A Edge Function contorna essa proteção em nome de quem chamar. sinapi_items e sinapi_references são dados GLOBAIS, sem organization_id: são a tabela de preços usada por todos os orçamentos de todos os tenants. Do lado do frontend não há sequer gate de papel — SinapiImportModal é aberto por DatabaseExplorer.tsx:1621 sem nenhuma checagem de isAdmin. O upsert é por (code, reference_date), então o atacante sobrescreve preços existentes, não apenas acrescenta.

### Evidência

`supabase/functions/sinapi-import/index.ts` (linhas 47-89):

```
const { data: { user }, error: authError } = await userClient.auth.getUser();
if (authError || !user) return json({ error: 'Unauthorized' }, 401);

const adminClient = createClient(supabaseUrl, serviceKey, { ... });
// ... nenhuma checagem de papel entre as duas coisas ...
const { error } = await adminClient
    .from('sinapi_items')
    .upsert(items, { onConflict: 'code,reference_date', ignoreDuplicates: false });
```

_Verificado assim:_ Código lido integralmente; RLS de sinapi_items/sinapi_references confirmada em pg_policies (escrita só service_role).

### Impacto

- Corrupção da base de preços que alimenta os orçamentos de todos os clientes do SaaS; orçamentos passam a sair com valores manipulados.

### Correção sugerida

Exigir papel privilegiado no servidor antes do upsert: consultar organization_members pelo e-mail do usuário validado e aceitar somente owner/admin (ou um papel de superadmin dedicado, já que o dado é global) — exatamente o padrão que invite-member/index.ts:51-60 já usa. Adicionar também o gate de papel na UI, para coerência.

### Critérios de aceite

- [ ] Chamada a sinapi-import com JWT sem papel privilegiado retorna 403
- [ ] Chamada com owner/admin continua importando a competência
- [ ] O botão de importação SINAPI só aparece para papel privilegiado
- [ ] Existe teste automatizado que falha se a condição voltar

--- FIM ISSUE 8 ---

--- ISSUE 9 ---

## [Segurança] send-bi-report é um relay de e-mail aberto a qualquer usuário autenticado

**Labels:** `security`, `severidade:alta`, `multi-tenant`

### Problema

Depois de confirmar que existe um usuário, a função repassa para a Resend, sem nenhuma validação, três campos inteiramente controlados pelo chamador: a lista de destinatários, o assunto e o corpo HTML. O campo organizationId é recebido e nunca usado em consulta alguma. O remetente é o domínio verificado da empresa (relatorios@opura.com.br, linha 57). Qualquer usuário cadastrado — inclusive alguém que acabou de se cadastrar, já que o self-signup está habilitado — dispara e-mail com HTML arbitrário para qualquer endereço, assinado pelo domínio da empresa. É o vetor clássico de phishing com reputação emprestada, e queima a reputação do domínio no envio em massa. O scheduleId também é usado sem checagem de posse: a linha 85 atualiza bi_report_schedules por id, com service_role.

### Evidência

`supabase/functions/send-bi-report/index.ts` (linhas 37-71):

```
const { data: { user }, error: authError } = await userClient.auth.getUser();
if (authError || !user) return json({ error: 'Token inválido' }, 401);

const { recipients, subject, htmlBody, scheduleId, organizationId } = await req.json();
if (!recipients?.length) return json({ error: 'Nenhum destinatário informado.' }, 400);

const sendRes = await fetch('https://api.resend.com/emails', {
    body: JSON.stringify({ from, to: recipients, subject, html: htmlBody }),
});
```

_Verificado assim:_ Código lido integralmente; nenhuma consulta a organization_members no arquivo.

### Impacto

- Phishing e spam saindo do domínio corporativo verificado; atualização de agendamentos de relatório de outros tenants.

### Correção sugerida

Validar que o usuário é membro de organizationId; derivar os destinatários no servidor a partir de bi_report_schedules daquela organização em vez de aceitar a lista do body; montar o HTML no servidor a partir dos dados do relatório; e filtrar scheduleId por organization_id.

### Critérios de aceite

- [ ] Chamada com organizationId de outra organização retorna 403
- [ ] Destinatários fora do agendamento da organização são rejeitados
- [ ] O corpo do e-mail não vem mais cru do cliente
- [ ] O envio agendado legítimo continua funcionando
- [ ] Existe teste automatizado que falha se a condição voltar

--- FIM ISSUE 9 ---

--- ISSUE 10 ---

## [Segurança] asaas-webhook falha aberto quando ASAAS_WEBHOOK_TOKEN não está configurada

**Labels:** `security`, `severidade:alta`, `multi-tenant`

### Problema

A condição começa por “webhookToken &&”. Se ASAAS_WEBHOOK_TOKEN não estiver definida no ambiente do projeto — ou for string vazia, ou for removida numa troca de ambiente — a expressão curto-circuita e a validação inteira é pulada: a função passa a aceitar qualquer POST anônimo. Daí em diante o corpo é processado com service_role: PAYMENT_RECEIVED marca client_charges como paga, faz a baixa do recebível em internal_transactions (business_status RECEBIDO, status CONCILIATED) e insere lançamento de taxa; BILL_PAID marca supplier_payments e boletos como pagos. O identificador precisa apenas casar com um asaas_payment_id/asaas_bill_id existente. É uma falha fail-open: o modo inseguro é o default silencioso. A linha 33 ainda registra em log um prefixo e um sufixo do token esperado, junto do comprimento — vazamento parcial de segredo no log.

### Evidência

`supabase/functions/asaas-webhook/index.ts` (linhas 28-36):

```
const webhookToken = Deno.env.get('ASAAS_WEBHOOK_TOKEN') ?? '';
const incoming = req.headers.get('asaas-access-token') ?? '';
console.log(`[asaas-webhook] incoming=${mask(incoming)} expected=${mask(webhookToken)} ...`);
if (webhookToken && incoming !== webhookToken) {
    return json({ error: 'Invalid webhook token' }, 401);
}
```

_Verificado assim:_ Arquivo lido integralmente; condição de guarda na linha 34.

### Impacto

- Baixa fraudulenta de contas a receber e a pagar por requisição anônima, caso a variável não esteja configurada.

> **Condição de explorabilidade (C3-04):** Explorabilidade condicionada a ASAAS_WEBHOOK_TOKEN ausente ou vazia no ambiente do projeto Supabase.

### Correção sugerida

Inverter para fail-closed: se webhookToken estiver vazio, responder 503 e não processar nada. Comparar em tempo constante. Remover o log das linhas 32-33 ou reduzi-lo a um booleano de match. Adicionar validação de inicialização que recuse subir sem a variável.

### Critérios de aceite

- [ ] Com ASAAS_WEBHOOK_TOKEN ausente, a função responde 503 e não altera nenhuma linha
- [ ] POST com token errado responde 401
- [ ] O log não contém mais nenhum trecho do token esperado
- [ ] O webhook real do Asaas continua sendo processado
- [ ] Existe teste automatizado que falha se a condição voltar

--- FIM ISSUE 10 ---

--- ISSUE 11 ---

## [Segurança] Ausência de sanitização de HTML nos quatro sinks de innerHTML do frontend

**Labels:** `security`, `severidade:alta`, `multi-tenant`

### Problema

**C5-01 - XSS armazenado na Academia: qualquer membro injeta HTML servido a todos os matriculados**

conteudo_html vem da tabela academy_lessons e é injetado sem qualquer sanitização. As policies de escrita dessa tabela são academy_lessons_insert e academy_lessons_update, ambas com expressão is_org_member(org_id) — ou seja, QUALQUER membro da organização, no papel mais baixo, escreve o HTML. O conteúdo é depois renderizado para todo colaborador matriculado que abrir a aula, incluindo owners e admins. Não existe biblioteca de sanitização no projeto: package.json não declara DOMPurify nem equivalente, e não há utilitário próprio de escape. Um membro comum publica aula com <img src=x onerror=...> e executa script na sessão de um administrador — o token do Supabase é acessível ao JavaScript da página, então o resultado é sequestro de sessão privilegiada. É escalada de privilégio dentro do tenant.

**C5-02 - Template de contrato injetado via innerHTML na geração de PDF**

body_html vem de contract_templates, cuja policy de escrita é contract_templates_org com is_org_member(organization_id) — de novo, qualquer membro da organização. O HTML é atribuído via innerHTML a um elemento que é efetivamente anexado ao documento (linha 893), no contexto de quem gera o PDF, tipicamente um usuário do financeiro ou administrador. innerHTML não executa <script>, mas executa handlers de erro e de carga: <img src=x onerror=...> e <svg onload=...> disparam normalmente. O container fica fora da tela, então a vítima não vê nada acontecer. Não há sanitização em renderTemplate nem no ponto de uso.

**C5-04 - Preview de template renderiza HTML do próprio autor sem sanitização (self-XSS)**

Nos dois casos o HTML renderizado é o que o próprio usuário acabou de digitar no textarea ao lado (previewContent vem de renderTemplate(bodyHtml, ...) na linha 191; previewBody vem de form.body_template na linha 101 do DunningModule). Sozinho isso é self-XSS: a vítima teria de colar o payload em si mesma, o que não configura vulnerabilidade explorada por terceiro. Fica registrado como baixa por dois motivos: é o mesmo dado que, depois de salvo, alimenta o sink de C5-02 e o corpo dos e-mails de cobrança; e a correção é a mesma linha de código, então separar as duas passadas só cria retrabalho.

### Evidência

`components/academy/AcademyLessonPlayer.tsx` (linhas 180-183):

```
case 'TEXTO':
    return (
        <div
            className="prose prose-sm max-w-none ..."
            dangerouslySetInnerHTML={{ __html: lesson.conteudo_html || '' }}
        />
    );
```

_Verificado assim:_ Sink lido no arquivo; policies de academy_lessons confirmadas em pg_policies (is_org_member); ausência de lib de sanitização confirmada em package.json.

`components/ContractDetailView.tsx` (linhas 885-893):

```
const rendered = renderTemplate(template.body_html, varMap);

const container = window.document.createElement('div');
container.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;...';
container.innerHTML = rendered;
window.document.body.appendChild(container);
```

_Verificado assim:_ Sink lido no arquivo; policy contract_templates_org confirmada em pg_policies.

`components/ContractTemplateManager.tsx` (linhas 248-252 (e components/DunningModule.tsx:243-246)):

```
{previewMode ? (
    <div
        className="min-h-[480px] ... prose prose-sm max-w-none"
        dangerouslySetInnerHTML={{ __html: previewContent }}
    />
) : ( ... )}
```

_Verificado assim:_ Origem de previewContent e previewBody rastreada até o estado local do formulário.

### Impacto

- Execução de script na sessão de administradores; roubo de sessão e escalada de privilégio dentro da organização.
- Execução de script na sessão de quem gera o PDF do contrato, disparada por qualquer membro da organização.
- Sem impacto direto isolado; relevante como parte da mesma superfície de C5-02.

### Correção sugerida

**C5-01:** Adicionar dependência de sanitização (DOMPurify) e criar um helper único — por exemplo utils/sanitizeHtml.ts — com allowlist de tags e atributos, proibindo event handlers e javascript: em href/src. Aplicar em todo dangerouslySetInnerHTML que renderize dado de banco. Sanitizar também na escrita, para não depender só da leitura.

**C5-02:** Sanitizar rendered com o mesmo helper de C5-01 antes da atribuição; aplicar também nos dois pontos de preview de template (C5-04).

**C5-04:** Aplicar o helper de sanitização de C5-01 nos dois pontos de preview.

### Critérios de aceite

- [ ] DOMPurify (ou equivalente) consta em package.json
- [ ] Existe helper único de sanitização e AcademyLessonPlayer o usa
- [ ] Teste cobrindo <img onerror>, <script> e href=javascript: prova que são neutralizados
- [ ] Aula com HTML legítimo (negrito, lista, link http) continua renderizando
- [ ] ContractDetailView sanitiza antes de atribuir a innerHTML
- [ ] ContractTemplateManager.tsx:251 e DunningModule.tsx:245 usam o mesmo helper
- [ ] Teste com <img onerror> em body_html prova que o handler não dispara
- [ ] O PDF gerado a partir de template legítimo permanece idêntico
- [ ] Os dois previews passam pelo helper de sanitização
- [ ] Existe teste automatizado que falha se a condição voltar

--- FIM ISSUE 11 ---

--- ISSUE 12 ---

## [Segurança] Funções notify-* sem autenticação e com HTML de e-mail montado por interpolação

**Labels:** `security`, `severidade:media`

### Problema

**C3-06 - notify-broker-proposal e notify-opportunity-interest não verificam Authorization nenhuma**

Ao contrário das demais, estas duas funções não leem o header Authorization em momento algum. Elas filtram corretamente por organizationId nas consultas (o que impede montar notificação com dados de outro tenant — ponto positivo), mas qualquer um que conheça um par válido de ids dispara notificação in-app e e-mail para todos os owners/admins daquela organização, quantas vezes quiser. Serve como amplificador de spam e de phishing interno, já que o conteúdo do e-mail vem de campos gravados por formulário público (ver C5-03). Ainda que o verify_jwt da plataforma esteja ligado, ele é satisfeito pela chave anon, que é pública.

**C5-03 - E-mails HTML montados por interpolação, com campo vindo de formulário público anônimo**

O HTML do e-mail é montado por template string, sem nenhum escape. Os campos contact_name, contact_email, contact_phone e message vêm de opportunity_interests, alimentada pelo formulário público de manifestação de interesse (RPC fn_investor_portal_submit_interest, confirmada como executável por anon) — ou seja, são texto de atacante anônimo. Em notify-broker-proposal o mesmo vale para notes, buyer_name e broker_email. O destinatário é a caixa de todos os owners/admins da organização. Clientes de e-mail modernos bloqueiam script, então não é XSS clássico; o que se consegue é quebrar a estrutura do HTML e injetar conteúdo e âncoras arbitrárias — um <a href> convincente dentro de uma mensagem que chega do domínio corporativo da própria empresa. Combinado com C3-06 (as duas funções não exigem credencial), o atacante escolhe a hora e a frequência do disparo. contact_email ainda vai para dentro de um atributo href, o contexto mais frouxo dos presentes.

### Evidência

`supabase/functions/notify-broker-proposal/index.ts` (linhas 22-40 (e notify-opportunity-interest/index.ts:28-53)):

```
serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    // nenhuma leitura de req.headers.get('Authorization') em todo o arquivo
    const { proposalId, organizationId } = await req.json();
```

_Verificado assim:_ Dois arquivos lidos integralmente; ausência de qualquer leitura de Authorization.

`supabase/functions/notify-opportunity-interest/index.ts` (linhas 134-174 (e notify-broker-proposal/index.ts:128-149)):

```
<p style="...">${opp.title}</p>
${opp.subtitle ? `<p style="...">${opp.subtitle}</p>` : ''}
<span style="...">${interest.contact_name}</span>
<a href="mailto:${interest.contact_email}" style="...">${interest.contact_email}</a>
<p style="...">"${interest.message}"</p>
```

_Verificado assim:_ Duas funções lidas integralmente; fn_investor_portal_submit_interest confirmada como executável por anon em pg_proc.

### Impacto

- Spam ilimitado de notificação e e-mail para administradores, com conteúdo parcialmente controlado pelo atacante.
- Phishing dirigido a administradores, com conteúdo controlado pelo atacante, entregue pelo domínio corporativo.

### Correção sugerida

**C3-06:** Adotar o gate já usado nas funções de cron (comparar Authorization com Bearer <service_role>) e chamar estas funções a partir de trigger/serviço, ou exigir sessão válida com associação a organizationId. Somar rate limiting por (organizationId, interestId).

**C5-03:** Criar helper de escape de HTML (e um específico para contexto de atributo) em supabase/functions/_shared/ e aplicar a toda interpolação de dado do banco nas duas funções. Validar contact_email como e-mail antes de usá-lo em href, e truncar message a um tamanho máximo.

### Critérios de aceite

- [ ] Chamada sem credencial válida retorna 401
- [ ] O fluxo real de nova proposta / novo interesse continua notificando os admins
- [ ] Existe helper de escape compartilhado e as duas funções o usam em toda interpolação
- [ ] Interesse com <a href> ou aspas no campo message chega ao e-mail como texto literal
- [ ] contact_email inválido não é renderizado como href
- [ ] O e-mail legítimo continua com o mesmo layout
- [ ] Existe teste automatizado que falha se a condição voltar

--- FIM ISSUE 12 ---

--- ISSUE 13 ---

## [Segurança] partner-portal-upload aceita contractId arbitrário e content-type do usuário em bucket público

**Labels:** `security`, `severidade:media`

### Problema

O ramo target='invoice' nunca confere que contractId pertence ao workspace do token validado — diferente do ramo padrão, que usa o workspaceId derivado do token no caminho. Um parceiro qualquer grava arquivo na pasta de qualquer contrato. O bucket documents é público (confirmado em storage.buckets: public=true, allowed_mime_types NULL, file_size_limit NULL) e a função aceita o content-type informado pelo cliente, então dá para publicar text/html arbitrário numa URL do domínio de storage da organização — útil para phishing e para hospedar carga maliciosa com ar de legitimidade. Não há limite de tipo nem de tamanho no bucket.

### Evidência

`supabase/functions/partner-portal-upload/index.ts` (linhas 88-102):

```
if (target === 'invoice') {
    if (!contractId) return json({ error: 'contractId é obrigatório ...' }, 400);
    const path = `invoices/${contractId}/${Date.now()}_${safeName}`;
    const { error: uploadError } = await admin.storage.from('documents')
        .upload(path, bytes, { contentType: file.type || 'application/octet-stream', ... });
    const { data: pub } = admin.storage.from('documents').getPublicUrl(path);
    return json({ publicUrl: pub.publicUrl });
```

_Verificado assim:_ Arquivo lido integralmente; flag public=true confirmada em storage.buckets no banco remoto.

### Impacto

- Contaminação de anexos de contratos alheios e hospedagem de conteúdo arbitrário (inclusive HTML) em URL pública da organização.

### Correção sugerida

Validar que contractId pertence ao workspace do token antes de montar o caminho; forçar allowlist de content-type (application/pdf e imagens) em vez de confiar em file.type; definir allowed_mime_types e file_size_limit no bucket documents; avaliar torná-lo privado com URL assinada, no padrão já adotado para opura-docs.

### Critérios de aceite

- [ ] Upload com contractId de outro workspace retorna 403
- [ ] Upload de text/html é recusado
- [ ] O bucket documents tem allowed_mime_types e file_size_limit definidos
- [ ] Envio de NF pelo Portal do Parceiro continua funcionando
- [ ] Existe teste automatizado que falha se a condição voltar

--- FIM ISSUE 13 ---

--- ISSUE 14 ---

## [Segurança] Policies permissivas remanescentes em opura_cno_* e payment_types

**Labels:** `security`, `severidade:media`

### Problema

**C1-03 - Policies anon FOR ALL USING(true) sobrevivendo em opura_cno_areas e opura_cno_reductions**

São duas das policies “Regra 8 / Dev” que a migration 20270208000002 se propôs a eliminar (81 removidas) e que escaparam do rollout. FOR ALL com USING(true) para o papel anon significa leitura, escrita e exclusão por qualquer portador da chave pública. A exploração hoje é limitada porque as duas tabelas estão vazias (verificado por PostgREST: Content-Range */0), mas nada impede a escrita — o anônimo pode popular a tabela — e a exposição passa a ser total no dia em que o módulo CNO receber dados de produção. É um buraco latente, não um buraco fechado.

**C1-04 - payment_types compartilhado entre todos os tenants apesar de ter organization_id**

A tabela tem coluna de tenant, mas as duas policies usam USING(true) para authenticated. Foi a única tabela com coluna de tenant nessa condição em toda a varredura cruzada entre pg_policies e information_schema.columns. Qualquer usuário logado lê, altera e apaga os tipos de pagamento de qualquer organização. O dado em si é catálogo (baixa sensibilidade), mas a escrita permite sabotagem do cadastro alheio e os nomes podem revelar estrutura financeira de outro tenant.

### Evidência

`pg_policies (banco remoto)` (linhas Allow anon all on opura_cno_areas / opura_cno_reductions):

```
tablename            | policyname                             | cmd | roles  | using
opura_cno_areas      | Allow anon all on opura_cno_areas      | ALL | {anon} | true
opura_cno_reductions | Allow anon all on opura_cno_reductions | ALL | {anon} | true
```

_Verificado assim:_ pg_policies no banco remoto; contagem de linhas via PostgREST com chave anon (0 linhas hoje).

`pg_policies (banco remoto)` (linhas Allow authenticated users to manage / to read payment types):

```
payment_types | Allow authenticated users to manage payment types | ALL    | {authenticated} | true
payment_types | Allow authenticated users to read payment types   | SELECT | {authenticated} | true
```

_Verificado assim:_ pg_policies cruzado com information_schema.columns (presença de organization_id).

### Impacto

- Leitura e escrita anônima sobre dados de CNO/previdência assim que o módulo entrar em uso.
- Leitura e alteração cruzada de catálogo financeiro entre tenants.

### Correção sugerida

**C1-03:** DROP das duas policies, no mesmo padrão da migration 20270208000002, deixando só as policies org-scoped de authenticated.

**C1-04:** Reescrever as duas policies com is_org_member(organization_id), preservando leitura de linhas globais (organization_id IS NULL) se o catálogo tiver seeds do sistema.

### Critérios de aceite

- [ ] Nenhuma policy com roles={anon} e qual=true resta em opura_cno_areas/opura_cno_reductions
- [ ] O módulo CNO continua funcionando para usuário autenticado membro da organização
- [ ] Usuário do tenant A não lê nem altera payment_types do tenant B
- [ ] Seeds globais (organization_id IS NULL) continuam visíveis a todos
- [ ] Existe teste automatizado que falha se a condição voltar

--- FIM ISSUE 14 ---

--- ISSUE 15 ---

## [Segurança] Higiene de segredos: credencial cravada, placeholders de service_role e project ref no código

**Labels:** `security`, `severidade:baixa`

### Problema

**C4-01 - Chave publishable e project ref do Supabase embutidos em script versionado**

A chave publishable/anon é desenhada para ser pública — ela já vai no bundle do frontend — então o vazamento em si não é o problema. O que importa é o efeito combinado: o arquivo está versionado (git ls-files confirma) e dá a qualquer leitor do repositório um cliente pronto, apontado para o projeto de produção, sem passo nenhum de configuração. Foi exatamente com essa chave que o achado C1-02 foi confirmado. Os demais scripts da raiz (test_db.js, test_insert.js, unlink_db.js, query_doc.js) fazem o certo: leem de process.env ou do .env. Este é o único com valor cravado. Registra-se que nenhum segredo real — service_role, JWT, chave de API — foi encontrado em conteúdo versionado.

**C4-02 - Placeholders de segredo como fallback de COALESCE nos agendamentos pg_cron**

O padrão COALESCE(variável, 'PLACEHOLDER') faz o literal virar o segredo efetivo quando a variável não está configurada. Aqui o efeito imediato é de disponibilidade, não de exposição: as funções alvo comparam o header com Bearer <service_role> e recusam o placeholder, então o cron de faturamento e o de alerta de tarefa falham 401 em silêncio — ninguém é avisado de que pararam. O risco de segurança é o inverso do costume: como o valor certo precisa ser colado à mão (o comentário da linha 47 manda literalmente substituir pela service_role key), o próximo passo natural de quem for consertar é cravar a chave real numa migration versionada. Não há validação de inicialização que recuse o placeholder.

**C4-03 - Project ref do Supabase cravado como fallback de Access-Control-Allow-Origin**

Não é credencial e não concede acesso: o project ref é visível em qualquer requisição do app. Fica o registro como higiene — identificador de ambiente de produção cravado no código, que vira armadilha em fork, em homologação ou numa eventual migração de projeto. Como toda produção real define FRONTEND_URL, o fallback nunca deveria ser exercido.

### Evidência

`check_suppliers.js` (linhas 3-4):

```
const supabaseUrl = 'https://oxedkknreghxrgenyjiu.supabase.co';
const supabaseKey = 'sb_publishable_IgIC72BIXClNix4ARLo0QA_0UGDrnzW';
const supabase = createClient(supabaseUrl, supabaseKey);
```

_Verificado assim:_ git ls-files confirma o arquivo versionado; git grep por padrões de segredo em todo o conteúdo versionado não encontrou segredo real.

`supabase/migrations/20260224000002_setup_billing_cron.sql` (linhas 37 (e 20261118000011_task_alert_sent_at.sql:31-35)):

```
'Authorization', 'Bearer ' || (SELECT COALESCE(current_setting('vault.service_role_key', true), 'INTERNAL_SECRET_HERE'))

-- 20261118000011_task_alert_sent_at.sql:
'Authorization', 'Bearer ' || coalesce(
    current_setting('vault.service_role_key', true),
    current_setting('app.service_role_key', true),
    'CONFIGURE_SERVICE_ROLE_KEY')
```

_Verificado assim:_ Migrations lidas na íntegra; padrão correto identificado em 20260514000002_quality_sla_cron.sql:21.

`supabase/functions/process-billing-ruler/index.ts` (linhas 8-11):

```
const corsHeaders = {
    'Access-Control-Allow-Origin': Deno.env.get('FRONTEND_URL') ?? 'https://oxedkknreghxrgenyjiu.supabase.co',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
```

_Verificado assim:_ Arquivo lido integralmente.

### Impacto

- Reduz a zero o atrito para explorar qualquer falha de RLS no projeto de produção.
- Jobs de cron falhando silenciosamente e convite estrutural a commitar a service_role key numa migration.
- Nenhum impacto direto de segurança; risco de configuração errada silenciosa entre ambientes.

### Correção sugerida

**C4-01:** Trocar os literais por process.env, como nos demais scripts; ou mover check_suppliers.js para _dev_scripts/ (já no .gitignore) e remover do índice do git.

**C4-02:** Remover os fallbacks literais e deixar a chamada falhar de forma visível quando a chave não estiver no Vault; ler o segredo apenas de vault.decrypted_secrets, como a migration 20260514000002 (quality-sla-enforcement) já faz corretamente; e acrescentar teste que recuse migration contendo os literais INTERNAL_SECRET_HERE / CONFIGURE_SERVICE_ROLE_KEY / SUA_SERVICE_ROLE_KEY.

**C4-03:** Falhar explicitamente quando FRONTEND_URL não estiver definida, em vez de cair num literal de produção.

### Critérios de aceite

- [ ] Nenhum literal de URL/chave de projeto em arquivo versionado
- [ ] git grep por 'sb_publishable_' e por '.supabase.co' em código não retorna credencial cravada
- [ ] Nenhuma migration contém os literais de placeholder de segredo
- [ ] Os dois jobs leem a chave do Vault, no padrão da 20260514000002
- [ ] Existe verificação mecânica que quebra o build se o padrão voltar
- [ ] Os jobs de faturamento e de alerta de tarefa executam com 200
- [ ] Nenhum project ref literal em supabase/functions/
- [ ] Existe teste automatizado que falha se a condição voltar

--- FIM ISSUE 15 ---
