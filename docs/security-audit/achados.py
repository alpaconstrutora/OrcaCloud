# -*- coding: utf-8 -*-
"""
Dados da auditoria de segurança do ORÇACLOUD / ÒPURA.

Fonte única de verdade do relatório: gerar_relatorio.py apenas renderiza
o que está aqui. Para atualizar o PDF depois de corrigir algo, edite este
arquivo (remova o achado, acrescente outro) e rode:

    ./.venv/Scripts/python.exe gerar_relatorio.py

Severidades válidas: critica, alta, media, baixa, informativa.
"""

PROJETO = "ORÇACLOUD / ÒPURA"
DATA_AUDITORIA = "01 de setembro de 2026"

ESCOPO = (
    "Repositório orçacloud-saas (branch main): 24 Edge Functions Deno, ~800 migrations SQL, "
    "~235 serviços e ~340 componentes React, scripts de build/CI e arquivos de configuração. "
    "A postura efetiva de RLS, as policies e as ACLs de função foram lidas do banco Postgres "
    "REMOTO de produção — não das migrations —, porque o próprio repositório documenta drift "
    "no histórico de migrations. Onde havia policy permissiva, a exploração foi confirmada na "
    "prática: por requisição HTTP real ao PostgREST com a chave anon pública, e — para os "
    "achados críticos — assumindo os papéis anon e authenticated no banco de produção. Toda "
    "prova que escreve roda dentro de BEGIN ... RAISE EXCEPTION, que aborta a transação por "
    "construção: nenhum dado foi criado, alterado ou removido durante esta auditoria."
)

STACK = [
    ("Frontend", "React 19 + TypeScript 5.8 (strict), Vite 6, Tailwind v4, Zustand + TanStack Query"),
    ("Backend", "Supabase — PostgreSQL 17 + PostgREST + Auth (GoTrue) + Storage + Realtime"),
    ("Rotas de servidor", "24 Edge Functions em Deno (supabase/functions/*/index.ts)"),
    ("Camada de dados", "Sem ORM. Query builder do supabase-js, chamado por ~235 serviços em services/"),
    ("Autenticação", "Supabase Auth (JWT). Papel no app via organization_members.role"),
    ("Isolamento de tenant", "Row Level Security por organization_id, via is_org_member() / is_org_manager()"),
    ("Deploy", "Vercel (frontend) + Supabase CLI (functions/migrations). Sem Docker/Helm/Terraform"),
]

METODOLOGIA = [
    ("1. Banco sem tranca",
     "O mecanismo de isolamento deste projeto é RLS por organization_id, apoiada nas funções "
     "SECURITY DEFINER is_org_member() e is_org_manager() sobre organization_members. Auditado "
     "consultando o banco remoto (pg_class.relrowsecurity, pg_policies, pg_proc.proacl), e não "
     "as migrations. Cada policy permissiva encontrada foi testada por requisição HTTP real."),
    ("2. Permissão definida no navegador",
     "Não há servidor de aplicação próprio: o equivalente são as Edge Functions, que usam a "
     "serviceRoleKey e portanto ignoram a RLS. Cada uma foi lida por inteiro procurando o par "
     "“valida que existe um usuário” sem o par “valida QUAL usuário é e o que ele pode fazer”."),
    ("3. IDOR",
     "Percorridos os 24 handlers de Edge Function, um a um, e todas as funções SECURITY DEFINER "
     "do schema public executáveis pelo papel anon. Critério: todo id que chega pelo corpo, path "
     "ou query e é usado num acesso com service_role precisa de checagem explícita de posse, "
     "porque nesse caminho a RLS não protege."),
    ("4. Chaves expostas",
     "git grep por padrões de segredo em todo o conteúdo versionado, mais inspeção de .env*, "
     ".gitignore, supabase/config.toml, migrations, scripts e CI, com atenção a valores de "
     "fallback em COALESCE(...) e ?? que viram segredo real quando a variável não é definida."),
    ("5. Inputs sem tratamento",
     "No frontend: varredura por dangerouslySetInnerHTML, innerHTML/outerHTML/insertAdjacentHTML, "
     "eval e new Function, cruzada com a policy de escrita da tabela que alimenta cada sink. "
     "No backend: montagem de HTML de e-mail por interpolação nas Edge Functions."),
]

CATEGORIAS = [
    ("C1", "Banco sem tranca (isolamento de tenant)"),
    ("C2", "Permissão definida no navegador"),
    ("C3", "IDOR (objeto acessado por id, sem posse)"),
    ("C4", "Chaves e segredos expostos"),
    ("C5", "Inputs sem tratamento (XSS)"),
]

ACHADOS = [
    # ---------------- C1 ----------------
    dict(
        id="C1-01", cat="C1", sev="critica",
        titulo="Qualquer usuário autenticado se auto-promove a owner de qualquer organização",
        arquivo="supabase/migrations/20260215000009_fix_org_rls_recursive.sql",
        linhas="65-67",
        trecho='create policy "Authenticated users can create memberships"\n'
               '  on organization_members for insert to authenticated\n'
               '  with check (true);',
        porque=(
            "organization_members é a tabela que define quem pertence a que organização e com que papel. "
            "Toda a RLS do sistema depende dela: is_org_member(org) e is_org_manager(org) são SECURITY "
            "DEFINER e resolvem a permissão consultando exatamente essa tabela, casando por auth.uid() ou "
            "pelo e-mail do JWT. A policy de INSERT tem WITH CHECK (true) — não restringe organization_id, "
            "não restringe email e não restringe role. Qualquer conta autenticada (inclusive uma "
            "recém-criada por self-signup, que está habilitado em supabase/config.toml) executa um único "
            "INSERT informando o próprio e-mail, o organization_id alvo e role='owner'. A partir daí "
            "is_org_member e is_org_manager retornam TRUE para aquela organização, e todas as policies "
            "org-scoped do sistema — financeiro, folha, contratos, documentos — passam a liberar leitura e "
            "escrita. Quebra total do multi-tenant e escalada de privilégio numa única requisição.\n\n"
            "COMPROVADO EM PRODUÇÃO, em transação abortada. Assumindo o papel authenticated com um e-mail "
            "sem nenhum vínculo, o INSERT com role='owner' foi ACEITO pela RLS, e as medições antes/depois "
            "na mesma transação foram: vínculos do ator 0 → 1; is_org_member FALSE → TRUE; is_org_manager "
            "FALSE → TRUE; linhas visíveis em organizations 0 → 1; em internal_transactions 0 → 2214. Ou "
            "seja: de nenhum acesso a 2.214 lançamentos financeiros e direitos de proprietário, com uma "
            "instrução. Nada foi persistido — o bloco termina em RAISE EXCEPTION, que aborta a transação "
            "por construção."
        ),
        impacto="Tomada de controle completa de qualquer tenant do SaaS por qualquer usuário cadastrado que conheça o UUID da organização alvo.",
        condicao=(
            "O atacante precisa conhecer o organization_id (UUID) do alvo: a RLS de organizations impede "
            "listar as organizações, e a primeira execução da prova, sem o UUID, inseriu organization_id "
            "NULL e não escalou nada. Isso reduz a superfície, mas não é um controle de segurança — o UUID "
            "não é segredo: ele viaja no link de convite (invite-member monta redirectTo como /?org=<uuid>), "
            "aparece na URL da aplicação e é conhecido por qualquer pessoa que já tenha sido membro. O "
            "cenário realista é o ex-funcionário removido que anotou o UUID e se readiciona como owner."
        ),
        correcao=(
            "Trocar o WITH CHECK (true) por uma condição que só permita a linha que o fluxo legítimo "
            "precisa, e mover a criação de membro para o servidor. Concretamente: (a) restringir a policy a "
            "is_org_manager(organization_id) OR is_superadmin(); (b) para o auto-vínculo do primeiro dono ao "
            "criar a organização, usar uma RPC SECURITY DEFINER dedicada que só aceite organização sem "
            "nenhum membro; (c) o convite de terceiros já tem caminho correto e checado — a Edge Function "
            "invite-member."
        ),
        aceite=[
            "A policy \"Authenticated users can create memberships\" não existe mais em pg_policies",
            "Usuário não-membro recebe erro de RLS ao tentar INSERT em organization_members (teste automatizado)",
            "Criar organização nova continua funcionando e o criador vira owner",
            "Convite via invite-member continua criando a linha de membership",
        ],
        verificacao=(
            "Definição lida em pg_policies no banco remoto; cadeia confirmada em pg_get_functiondef de "
            "is_org_member e is_org_manager; e exploração executada de ponta a ponta contra o banco de "
            "produção dentro de BEGIN ... RAISE EXCEPTION (rollback garantido, zero resíduo)."
        ),
    ),
    dict(
        id="C1-02", cat="C1", sev="critica",
        titulo="Tabela invoices legível por anônimo e por qualquer tenant (829 registros expostos)",
        arquivo="supabase/migrations/20260516100000_fix_invoices_rls_boletos.sql",
        linhas="14-24",
        trecho='-- Política única: membros autenticados de qualquer organização têm acesso total\n'
               'CREATE POLICY "invoices_authenticated_all" ON public.invoices\n'
               '    FOR ALL TO authenticated\n'
               '    USING (true)\n'
               '    WITH CHECK (true);',
        porque=(
            "Estado atual no banco remoto: três policies em invoices — “Suppliers can view their own "
            "invoices” (SELECT, papel anon, USING true), “Suppliers can insert their own invoices” (INSERT, "
            "papel anon, WITH CHECK true) e “invoices_authenticated_all” (ALL, authenticated, USING/CHECK "
            "true). Nenhuma tem recorte: o nome fala em “their own”, mas a expressão é literalmente true. A "
            "tabela sequer possui coluna organization_id — o vínculo com o tenant é indireto, por "
            "supplier_id. A chave anon fica publicada no bundle JavaScript por construção, então a policy "
            "anon equivale a acesso público. Verificado ao vivo: GET /rest/v1/invoices com a chave anon do "
            ".env, sem qualquer login, retornou HTTP 206 e Content-Range 0-828/829 — 829 notas fiscais de "
            "fornecedor de todos os tenants, com nome de arquivo, fornecedor e caminho no storage. O INSERT "
            "anon com CHECK true também permite injetar notas forjadas."
        ),
        impacto="Vazamento público de 829 notas fiscais (fornecedor, valor, vencimento, centro de custo, caminho do arquivo) e inserção de notas falsas por anônimo.",
        correcao=(
            "Remover as duas policies anon e substituir invoices_authenticated_all por policies com recorte "
            "real. Como a tabela não tem organization_id, o caminho mais seguro é (a) acrescentar a coluna "
            "com backfill a partir de suppliers/purchase_orders, ou (b) enquanto isso, escrever a policy via "
            "EXISTS sobre suppliers com is_org_member(suppliers.organization_id). O Portal do Fornecedor não "
            "precisa da policy anon: ele já passa pelas Edge Functions supplier-portal-download e "
            "supplier-portal-upload, que usam service_role após validar o token."
        ),
        aceite=[
            "GET /rest/v1/invoices com a chave anon retorna lista vazia",
            "Usuário autenticado do tenant A não vê nenhuma nota do tenant B",
            "POST anon em /rest/v1/invoices é recusado por RLS",
            "Portal do Fornecedor continua listando e enviando notas normalmente",
        ],
        verificacao="Confirmado por requisição HTTP real (HTTP 206, Content-Range 0-828/829) com a chave anon pública.",
    ),
    dict(
        id="C1-03", cat="C1", sev="media",
        titulo="Policies anon FOR ALL USING(true) sobrevivendo em opura_cno_areas e opura_cno_reductions",
        arquivo="pg_policies (banco remoto)",
        linhas="Allow anon all on opura_cno_areas / opura_cno_reductions",
        trecho="tablename            | policyname                             | cmd | roles  | using\n"
               "opura_cno_areas      | Allow anon all on opura_cno_areas      | ALL | {anon} | true\n"
               "opura_cno_reductions | Allow anon all on opura_cno_reductions | ALL | {anon} | true",
        porque=(
            "São duas das policies “Regra 8 / Dev” que a migration 20270208000002 se propôs a eliminar (81 "
            "removidas) e que escaparam do rollout. FOR ALL com USING(true) para o papel anon significa "
            "leitura, escrita e exclusão por qualquer portador da chave pública. A exploração hoje é "
            "limitada porque as duas tabelas estão vazias (verificado por PostgREST: Content-Range */0), mas "
            "nada impede a escrita — o anônimo pode popular a tabela — e a exposição passa a ser total no dia "
            "em que o módulo CNO receber dados de produção. É um buraco latente, não um buraco fechado."
        ),
        impacto="Leitura e escrita anônima sobre dados de CNO/previdência assim que o módulo entrar em uso.",
        correcao="DROP das duas policies, no mesmo padrão da migration 20270208000002, deixando só as policies org-scoped de authenticated.",
        aceite=[
            "Nenhuma policy com roles={anon} e qual=true resta em opura_cno_areas/opura_cno_reductions",
            "O módulo CNO continua funcionando para usuário autenticado membro da organização",
        ],
        verificacao="pg_policies no banco remoto; contagem de linhas via PostgREST com chave anon (0 linhas hoje).",
    ),
    dict(
        id="C1-04", cat="C1", sev="baixa",
        titulo="payment_types compartilhado entre todos os tenants apesar de ter organization_id",
        arquivo="pg_policies (banco remoto)",
        linhas="Allow authenticated users to manage / to read payment types",
        trecho="payment_types | Allow authenticated users to manage payment types | ALL    | {authenticated} | true\n"
               "payment_types | Allow authenticated users to read payment types   | SELECT | {authenticated} | true",
        porque=(
            "A tabela tem coluna de tenant, mas as duas policies usam USING(true) para authenticated. Foi a "
            "única tabela com coluna de tenant nessa condição em toda a varredura cruzada entre pg_policies "
            "e information_schema.columns. Qualquer usuário logado lê, altera e apaga os tipos de pagamento "
            "de qualquer organização. O dado em si é catálogo (baixa sensibilidade), mas a escrita permite "
            "sabotagem do cadastro alheio e os nomes podem revelar estrutura financeira de outro tenant."
        ),
        impacto="Leitura e alteração cruzada de catálogo financeiro entre tenants.",
        correcao="Reescrever as duas policies com is_org_member(organization_id), preservando leitura de linhas globais (organization_id IS NULL) se o catálogo tiver seeds do sistema.",
        aceite=[
            "Usuário do tenant A não lê nem altera payment_types do tenant B",
            "Seeds globais (organization_id IS NULL) continuam visíveis a todos",
        ],
        verificacao="pg_policies cruzado com information_schema.columns (presença de organization_id).",
    ),

    dict(
        id="C1-05", cat="C1", sev="alta",
        titulo="A perna “OR is_shared” das policies de leitura ignora a organização (127 registros cruzam o tenant)",
        arquivo="supabase/migrations/aplicar_20270914000021_org_not_null_e_policies_is_shared.sql",
        linhas="67-69",
        trecho='CREATE POLICY "Allow authenticated users to read clients"\n'
               'ON public.clients FOR SELECT TO authenticated\n'
               'USING (public.is_org_member(organization_id) OR is_shared);',
        porque=(
            "A intenção do sinalizador is_shared é permitir que um cadastro seja reaproveitado entre as "
            "organizações de um mesmo grupo. Mas a expressão escrita não tem a segunda metade da regra: "
            "“OR is_shared” é verdadeiro sozinho, sem nenhuma condição sobre quem está lendo. Não é "
            "“compartilhado com as organizações do grupo” — é compartilhado com TODOS os usuários "
            "autenticados do SaaS inteiro, inclusive clientes concorrentes que nunca tiveram relação com "
            "aquele tenant. O mesmo padrão está em três policies: clients, suppliers "
            "(“Users can view suppliers of their organization” — o nome contradiz a expressão) e "
            "partner_workspaces.\n\n"
            "COMPROVADO EM PRODUÇÃO (somente leitura). Assumindo o papel authenticated com um e-mail sem "
            "nenhuma linha em organization_members, a contagem de linhas visíveis foi: clients 7, "
            "suppliers 119, partner_workspaces 1 — enquanto organizations retornou 0, o que prova que a "
            "identidade usada realmente não tinha vínculo nenhum. São 119 de 244 fornecedores (49% da base) "
            "e 7 de 46 clientes expostos a qualquer conta do SaaS. Os registros de clients carregam PII: "
            "nome, CPF/CNPJ, endereço e telefone."
        ),
        impacto="Vazamento cross-tenant de 127 cadastros — incluindo CPF/CNPJ, endereço e telefone de pessoas físicas — para qualquer usuário autenticado de qualquer organização do SaaS.",
        condicao=(
            "O impacto REAL hoje é baixo e o defeito é uma bomba-relógio, não um vazamento em curso: "
            "as quatro organizações existentes no banco pertencem todas ao mesmo cliente (Alpa "
            "Construtora, ALPA Empreendimentos, a SPE Garden Cambuhy e uma organização pessoal), então "
            "os 127 registros circulam hoje apenas dentro do grupo que os possui. O defeito vira "
            "vazamento real no instante em que o segundo cliente entrar no SaaS — e é por isso que a "
            "correção é pré-requisito de onboarding, não item de manutenção. Registrado assim para não "
            "superdimensionar o presente nem subdimensionar o risco."
        ),
        correcao=(
            "Completar a regra: o compartilhamento precisa dizer COM QUEM. Substituir “OR is_shared” por "
            "uma condição que exija que o leitor pertença ao mesmo grupo/holding do dono do registro — por "
            "exemplo “OR (is_shared AND is_org_member(<org do grupo>))”, ou uma tabela explícita de "
            "compartilhamento (organization_id dono, organization_id destino). Aplicar às três policies. "
            "Enquanto a regra correta não existir, o caminho seguro é remover a perna is_shared."
        ),
        aceite=[
            "Usuário sem vínculo em organization_members lê 0 linhas de clients, suppliers e partner_workspaces",
            "Usuário de uma organização do grupo continua vendo os cadastros compartilhados do grupo",
            "Usuário de organização fora do grupo não vê nenhum registro is_shared",
            "As três policies (clients, suppliers, partner_workspaces) usam a mesma regra revisada",
        ],
        verificacao="pg_policies (busca por qual LIKE '%is_shared%') no banco remoto, contagem de linhas is_shared por tabela, e leitura executada como papel authenticated sem vínculo, em transação abortada.",
    ),

    # ---------------- C2 ----------------
    dict(
        id="C2-01", cat="C2", sev="alta",
        titulo="sinapi-import: qualquer usuário logado reescreve a base de preços SINAPI de todos os tenants",
        arquivo="supabase/functions/sinapi-import/index.ts",
        linhas="47-89",
        trecho="const { data: { user }, error: authError } = await userClient.auth.getUser();\n"
               "if (authError || !user) return json({ error: 'Unauthorized' }, 401);\n"
               "\n"
               "const adminClient = createClient(supabaseUrl, serviceKey, { ... });\n"
               "// ... nenhuma checagem de papel entre as duas coisas ...\n"
               "const { error } = await adminClient\n"
               "    .from('sinapi_items')\n"
               "    .upsert(items, { onConflict: 'code,reference_date', ignoreDuplicates: false });",
        porque=(
            "A função verifica apenas que existe um usuário válido — nunca qual o papel dele nem a que "
            "organização pertence — e depois grava com adminClient (service_role), que ignora a RLS. A RLS "
            "de sinapi_items foi escrita justamente para impedir isso: leitura para authenticated/anon, "
            "escrita somente para service_role. A Edge Function contorna essa proteção em nome de quem "
            "chamar. sinapi_items e sinapi_references são dados GLOBAIS, sem organization_id: são a tabela "
            "de preços usada por todos os orçamentos de todos os tenants. Do lado do frontend não há sequer "
            "gate de papel — SinapiImportModal é aberto por DatabaseExplorer.tsx:1621 sem nenhuma checagem "
            "de isAdmin. O upsert é por (code, reference_date), então o atacante sobrescreve preços "
            "existentes, não apenas acrescenta."
        ),
        impacto="Corrupção da base de preços que alimenta os orçamentos de todos os clientes do SaaS; orçamentos passam a sair com valores manipulados.",
        correcao=(
            "Exigir papel privilegiado no servidor antes do upsert: consultar organization_members pelo "
            "e-mail do usuário validado e aceitar somente owner/admin (ou um papel de superadmin dedicado, "
            "já que o dado é global) — exatamente o padrão que invite-member/index.ts:51-60 já usa. "
            "Adicionar também o gate de papel na UI, para coerência."
        ),
        aceite=[
            "Chamada a sinapi-import com JWT sem papel privilegiado retorna 403",
            "Chamada com owner/admin continua importando a competência",
            "O botão de importação SINAPI só aparece para papel privilegiado",
        ],
        verificacao="Código lido integralmente; RLS de sinapi_items/sinapi_references confirmada em pg_policies (escrita só service_role).",
    ),
    dict(
        id="C2-02", cat="C2", sev="alta",
        titulo="send-bi-report é um relay de e-mail aberto a qualquer usuário autenticado",
        arquivo="supabase/functions/send-bi-report/index.ts",
        linhas="37-71",
        trecho="const { data: { user }, error: authError } = await userClient.auth.getUser();\n"
               "if (authError || !user) return json({ error: 'Token inválido' }, 401);\n"
               "\n"
               "const { recipients, subject, htmlBody, scheduleId, organizationId } = await req.json();\n"
               "if (!recipients?.length) return json({ error: 'Nenhum destinatário informado.' }, 400);\n"
               "\n"
               "const sendRes = await fetch('https://api.resend.com/emails', {\n"
               "    body: JSON.stringify({ from, to: recipients, subject, html: htmlBody }),\n"
               "});",
        porque=(
            "Depois de confirmar que existe um usuário, a função repassa para a Resend, sem nenhuma "
            "validação, três campos inteiramente controlados pelo chamador: a lista de destinatários, o "
            "assunto e o corpo HTML. O campo organizationId é recebido e nunca usado em consulta alguma. O "
            "remetente é o domínio verificado da empresa (relatorios@opura.com.br, linha 57). Qualquer "
            "usuário cadastrado — inclusive alguém que acabou de se cadastrar, já que o self-signup está "
            "habilitado — dispara e-mail com HTML arbitrário para qualquer endereço, assinado pelo domínio "
            "da empresa. É o vetor clássico de phishing com reputação emprestada, e queima a reputação do "
            "domínio no envio em massa. O scheduleId também é usado sem checagem de posse: a linha 85 "
            "atualiza bi_report_schedules por id, com service_role."
        ),
        impacto="Phishing e spam saindo do domínio corporativo verificado; atualização de agendamentos de relatório de outros tenants.",
        correcao=(
            "Validar que o usuário é membro de organizationId; derivar os destinatários no servidor a partir "
            "de bi_report_schedules daquela organização em vez de aceitar a lista do body; montar o HTML no "
            "servidor a partir dos dados do relatório; e filtrar scheduleId por organization_id."
        ),
        aceite=[
            "Chamada com organizationId de outra organização retorna 403",
            "Destinatários fora do agendamento da organização são rejeitados",
            "O corpo do e-mail não vem mais cru do cliente",
            "O envio agendado legítimo continua funcionando",
        ],
        verificacao="Código lido integralmente; nenhuma consulta a organization_members no arquivo.",
    ),
    dict(
        id="C2-03", cat="C2", sev="alta",
        titulo="organization_id vem do corpo da requisição e nunca é conferido contra a associação do chamador",
        arquivo="supabase/functions/asaas-charge/index.ts",
        linhas="47-73 (e asaas-payment/index.ts:70-89; sign-contract/index.ts:36-62)",
        trecho="const { data: { user }, error: authError } = await userClient.auth.getUser();\n"
               "if (authError || !user) return json({ error: 'Token inválido' }, 401);\n"
               "\n"
               "const admin = createClient(supabaseUrl, serviceRoleKey, { ... });  // ignora RLS\n"
               "const { organization_id, transaction_id } = body;\n"
               "if (!organization_id) return json({ error: 'organization_id é obrigatório.' }, 400);\n"
               "// organization_id é usado como filtro, nunca validado contra o usuário",
        porque=(
            "As três funções seguem o mesmo padrão: validam que existe um usuário, criam um cliente com "
            "service_role (que ignora a RLS) e passam a usar o organization_id vindo do corpo como se fosse "
            "confiável. Ele aparece em .eq(), o que dá a impressão de escopo — mas o escopo é o que o "
            "atacante escolheu, não o que ele tem direito. Um usuário do tenant A que conheça (ou enumere) "
            "um transaction_id do tenant B emite cobrança real no Asaas contra o recebível alheio, cancela "
            "cobranças do tenant B (action 'cancel', linhas 125-161) e reverte o status do recebível. Em "
            "asaas-payment o mesmo vale para boleto_id e supplier_payment_id, com efeito de dinheiro saindo. "
            "Como a RLS está fora do caminho, ela não serve de rede de segurança."
        ),
        impacto="Operações financeiras reais (emissão, cancelamento, pagamento de boleto) executadas sobre dados de outro tenant.",
        correcao=(
            "Nas três funções, logo após getUser(), consultar organization_members filtrando por "
            "organization_id e pelo e-mail/uid do usuário, devolvendo 403 se não houver linha — o mesmo "
            "bloco que invite-member/index.ts:51-60 já implementa. Extrair para um módulo compartilhado em "
            "supabase/functions/_shared/ e reusar em toda função que receba organization_id."
        ),
        aceite=[
            "Chamada a asaas-charge com organization_id de outra org retorna 403",
            "Idem para asaas-payment e sign-contract",
            "Existe um helper compartilhado de checagem de associação usado pelas três",
            "Os fluxos legítimos de cobrança, pagamento e assinatura seguem funcionando",
        ],
        verificacao="Três arquivos lidos integralmente; nenhuma consulta a organization_members em nenhum deles.",
    ),

    # ---------------- C3 ----------------
    dict(
        id="C3-01", cat="C3", sev="critica",
        titulo="As 8 RPCs que emitem e revogam credencial de portal são executáveis por anônimo",
        arquivo="supabase/migrations/20261128000001_client_portal_tokens.sql",
        linhas="69-89 (e 20261224000001_broker_portal_tokens.sql:42-66)",
        trecho="CREATE OR REPLACE FUNCTION public.client_portal_generate_token(p_client_id uuid, p_org_id uuid)\n"
               " RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $function$\n"
               "DECLARE v_token TEXT;\n"
               "BEGIN\n"
               "    v_token := gen_random_uuid()::text;\n"
               "    INSERT INTO public.client_portal_tokens (org_id, client_id, token)\n"
               "    VALUES (p_org_id, p_client_id, v_token)\n"
               "    ON CONFLICT (client_id) DO UPDATE SET token = v_token, ...;\n"
               "    RETURN v_token;\n"
               "END; $function$\n"
               "\n"
               "GRANT EXECUTE ON FUNCTION public.client_portal_generate_token(UUID, UUID) TO authenticated;\n"
               "-- nunca há REVOKE EXECUTE ... FROM PUBLIC",
        porque=(
            "O defeito não está em duas funções, e sim em oito — uma varredura de pg_proc mostrou que TODOS "
            "os emissores de credencial de portal têm o mesmo problema: client_portal_generate_token, "
            "broker_portal_generate_token, investor_portal_generate_token, partner_portal_generate_token, "
            "supplier_portal_generate_token e portal_generate_token (colaborador), mais "
            "partner_portal_revoke_token e supplier_portal_revoke_token, que permitem a um anônimo REVOGAR "
            "o acesso de um parceiro ou fornecedor legítimo — negação de serviço direta. São cinco portais "
            "sequestráveis e dois revogáveis por quem só tem a chave pública.\n\n"
            "Todas são SECURITY DEFINER (rodam como owner, ignorando RLS), recebem o id do titular "
            "como parâmetro e emitem um token de portal válido por 90 dias — sem verificar "
            "quem chama, sem conferir que o titular pertence a p_org_id e sem exigir sequer sessão. As "
            "migrations fazem GRANT EXECUTE TO authenticated, mas nunca fazem REVOKE EXECUTE FROM PUBLIC; "
            "como o PostgreSQL concede EXECUTE a PUBLIC por padrão, a ACL efetiva no banco remoto é "
            "{=X/postgres, postgres=X, anon=X, authenticated=X, service_role=X} — o “=X” inicial é o PUBLIC, "
            "e anon aparece explicitamente. O papel anon executa. A cadeia completa é: chamar "
            "client_portal_generate_token, receber um token válido, chamar client_portal_get_data(token) "
            "(também SECURITY DEFINER e anon) para ler contratos, parcelas e avisos daquele cliente, e "
            "chamar a Edge Function portal-ged-download com o mesmo token para baixar os documentos do GED. "
            "O ON CONFLICT DO UPDATE ainda substitui o token legítimo, derrubando o acesso do cliente real — "
            "negação de serviço como efeito colateral.\n\n"
            "COMPROVADO EM PRODUÇÃO, em transação abortada. Assumindo o papel anon (exatamente o que a "
            "chave publicada no bundle concede) e sem login nenhum: a leitura direta da tabela clients "
            "retornou 0 linhas — a RLS funciona —, mas client_portal_generate_token(<client_id>, <org_id>) "
            "executou e devolveu um token UUID válido; em seguida client_portal_get_data(<token>) devolveu "
            "o payload do portal com \"valid\": true e os dados cadastrais do cliente, incluindo nome "
            "completo e CPF (redigido neste relatório). Ou seja, a RPC de emissão de credencial contorna "
            "por completo a RLS que protege a tabela. Nada foi persistido: o bloco termina em RAISE "
            "EXCEPTION, então o token gerado foi descartado e o token legítimo do cliente permanece intacto."
        ),
        impacto="Sequestro anônimo dos Portais do Cliente, Corretor, Investidor, Parceiro, Fornecedor e Colaborador; e revogação anônima do acesso de parceiros e fornecedores legítimos.",
        correcao=(
            "Duas correções, ambas necessárias. (1) REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC, anon nas "
            "oito funções, e varrer as demais SECURITY DEFINER pelo mesmo defeito de ACL. (2) Adicionar "
            "autorização dentro da função: exigir is_org_manager(p_org_id) e validar que o id do titular "
            "pertence a p_org_id — emitir credencial de acesso é operação "
            "administrativa e não deve depender só do GRANT."
        ),
        aceite=[
            "has_function_privilege('anon', ...) retorna false para as oito funções",
            "Chamada da RPC com a chave anon retorna erro de permissão",
            "Chamada por autenticado que não é gestor da organização retorna erro",
            "Gerar link do Portal do Cliente/Corretor pela tela de admin continua funcionando",
            "Varredura de pg_proc confirma que nenhuma SECURITY DEFINER sensível tem ACL com PUBLIC",
        ],
        verificacao=(
            "pg_get_functiondef e pg_proc.proacl lidos no banco remoto (ACL efetiva confirma anon=X em "
            "ambas); e cadeia emissão → leitura executada como papel anon contra o banco de produção, "
            "dentro de BEGIN ... RAISE EXCEPTION (rollback garantido, token descartado)."
        ),
    ),
    dict(
        id="C3-02", cat="C3", sev="critica",
        titulo="Portal do Colaborador inteiro exposto: anônimo lê folha de pagamento só com o UUID do colaborador",
        arquivo="supabase/functions/labor-portal-ged-download/index.ts + 8 RPCs SECURITY DEFINER",
        linhas="32-65 (e components/LaborPortal.tsx:78-124)",
        trecho="// A ponta visível — a Edge Function:\n"
               "const { employeeId, storagePath } = await req.json();\n"
               "const { data: emp } = await admin.from('employees').select('id').eq('id', employeeId).maybeSingle();\n"
               "if (empError || !emp) return json({ error: 'Colaborador não encontrado' }, 403);\n"
               "// única checagem: o colaborador EXISTE. Sem token, sessão ou prova de identidade.\n"
               "\n"
               "// A causa real — a camada de RPC, toda executável por anon e por employee_id cru:\n"
               "//   portal_employee_summary(p_employee_id)   portal_get_payroll_runs(p_employee_id)\n"
               "//   portal_get_documents(p_employee_id)      portal_get_ged_documents(p_employee_id)\n"
               "//   portal_get_absences(p_employee_id)       portal_get_time_entries(p_employee_id)\n"
               "//   portal_get_trainings(p_employee_id)      is_employee_shared_with_user(p_employee_id)",
        porque=(
            "A Edge Function não valida token nem sessão: o único controle é que o employeeId informado "
            "exista na tabela employees. Mas ela é apenas a ponta visível. A varredura de pg_proc mostrou "
            "que o Portal do Colaborador INTEIRO funciona assim: as sete funções de leitura "
            "(portal_employee_summary, portal_get_payroll_runs, portal_get_documents, "
            "portal_get_ged_documents, portal_get_absences, portal_get_time_entries, portal_get_trainings) "
            "são SECURITY DEFINER, recebem p_employee_id cru e são executáveis pelo papel anon. "
            "components/LaborPortal.tsx:78-124 as chama exatamente assim, com o employeeId cru.\n\n"
            "O próprio comentário da Edge Function admite o desenho (“a sessão do portal é anon/employeeId, "
            "sem token assinado nem login Supabase”), e a função irmã academy-portal-media documenta "
            "explicitamente, nas linhas 32-33, por que está errado: “O recorte vem do TOKEN (portal_tokens), "
            "não de um employeeId cru passado pelo cliente. Passar employeeId seria enumerável.” Existe "
            "portal_tokens com employee_id, e existe até o padrão pronto do outro lado — "
            "fn_portal_get_ged_documents(p_token), usada pelo Portal do Cliente. A primitiva certa está "
            "escrita e não foi usada aqui.\n\n"
            "COMPROVADO EM PRODUÇÃO (somente leitura, papel anon, sem login). O contraste é o que torna o "
            "achado inequívoco: anon NÃO tem sequer GRANT SELECT na tabela employees — a consulta direta "
            "falha com 42501 e a mensagem do Postgres chega a sugerir o GRANT que falta. Ainda assim, "
            "portal_employee_summary(<uuid>) devolveu o cadastro do colaborador (nome, cargo, status) e "
            "portal_get_payroll_runs(<uuid>) devolveu as FOLHAS DE PAGAMENTO, com competência e valores. "
            "As RPCs SECURITY DEFINER contornam por completo a proteção da tabela."
        ),
        impacto="Leitura anônima de folha de pagamento, ponto, ausências, treinamentos e documentos de RH de qualquer colaborador de qualquer tenant, bastando o UUID — que também pode ser mintado por anon via portal_generate_token (C3-01).",
        correcao=(
            "Criar as variantes fn_portal_*(p_token text) das sete funções, derivando o employee_id de "
            "portal_tokens (validando is_active e expires_at) — mesmo desenho de "
            "fn_portal_get_ged_documents(p_token), que já existe. Depois REVOKE EXECUTE ... FROM PUBLIC, "
            "anon nas sete antigas. Migrar components/LaborPortal.tsx para o token e aplicar o mesmo na "
            "Edge Function labor-portal-ged-download. Nenhum identificador de titular deve chegar cru pelo "
            "corpo da requisição."
        ),
        aceite=[
            "has_function_privilege('anon', ...) é false para as sete RPCs por p_employee_id",
            "As novas fn_portal_*(p_token) devolvem os mesmos dados para token válido e erro para token expirado/inativo",
            "A Edge Function rejeita requisição sem token com 401",
            "Token de um colaborador não lê dado de outro",
            "O Portal do Colaborador abre por link com token e mostra folha, ponto, ausências e documentos",
        ],
        verificacao=(
            "pg_proc (prosecdef + has_function_privilege para anon) no banco remoto; chamadas executadas "
            "como papel anon contra produção, em transação abortada, devolvendo cadastro e folha de "
            "pagamento; e components/LaborPortal.tsx:78-124 confirmado passando employeeId cru."
        ),
    ),
    dict(
        id="C3-03", cat="C3", sev="alta",
        titulo="sign-contract altera assinatura de contrato de qualquer tenant e consulta documento alheio no ZapSign",
        arquivo="supabase/functions/sign-contract/index.ts",
        linhas="107-163",
        trecho="if (target === 'document_version') {\n"
               "    await adminClient.from('contract_document_versions').update({\n"
               "        signature_token: zapDoc.token, signature_status: 'SENT', signature_url: signUrl,\n"
               "    }).eq('id', documentVersionId);      // id veio do body, sem checagem de posse\n"
               "...\n"
               "if (action === 'status') {\n"
               "    const { signatureToken } = body;\n"
               "    const zapResp = await fetch(`${ZAPSIGN_API}/docs/${signatureToken}/`, { ... });\n"
               "    return json({ status: zapDoc.status, signers: zapDoc.signers, signed_file: zapDoc.signed_file });",
        porque=(
            "Depois de validar que existe um usuário, a função escreve com adminClient (service_role) em "
            "quatro tabelas usando ids que vieram direto do corpo: documentVersionId, addendumId, contractId "
            "e dealId. Nenhum é conferido contra a organização do chamador — o organizationId até é exigido "
            "na linha 60, mas nunca é usado para validar coisa alguma. Um usuário autenticado de qualquer "
            "tenant sobrescreve signature_token, signature_status e signature_url de contratos alheios. Na "
            "action 'status' o problema é de leitura: signatureToken vem do corpo e a função consulta a API "
            "do ZapSign com o token da conta corporativa, devolvendo signers e a URL do arquivo assinado de "
            "qualquer documento daquela conta — vazamento de contrato assinado de outro cliente. A action "
            "'webhook' (linhas 166-225) fecha o conjunto: qualquer autenticado marca um contrato como SIGNED "
            "informando o token."
        ),
        impacto="Adulteração do estado de assinatura de contratos de outros tenants e leitura de documentos assinados alheios via ZapSign.",
        correcao=(
            "Validar associação do usuário a organizationId; carregar a linha alvo e conferir que seu "
            "organization_id bate com o do chamador antes de qualquer update; na action 'status', localizar "
            "primeiro a linha local que possui aquele signature_token dentro da organização do usuário e só "
            "então consultar o ZapSign. A action 'webhook' deve sair desta função e virar endpoint próprio, "
            "autenticado por segredo compartilhado com o ZapSign."
        ),
        aceite=[
            "Enviar para assinatura um contractId de outra organização retorna 403",
            "action 'status' com signatureToken fora da organização retorna 403",
            "A rota de webhook não aceita mais ser chamada por JWT de usuário",
            "Envio, consulta e retorno de assinatura seguem funcionando no fluxo legítimo",
        ],
        verificacao="Arquivo lido integralmente; organizationId exigido na linha 60 e não referenciado em nenhuma consulta.",
    ),
    dict(
        id="C3-04", cat="C3", sev="alta",
        titulo="asaas-webhook falha aberto: sem a variável de ambiente, aceita qualquer POST",
        arquivo="supabase/functions/asaas-webhook/index.ts",
        linhas="28-36",
        trecho="const webhookToken = Deno.env.get('ASAAS_WEBHOOK_TOKEN') ?? '';\n"
               "const incoming = req.headers.get('asaas-access-token') ?? '';\n"
               "console.log(`[asaas-webhook] incoming=${mask(incoming)} expected=${mask(webhookToken)} ...`);\n"
               "if (webhookToken && incoming !== webhookToken) {\n"
               "    return json({ error: 'Invalid webhook token' }, 401);\n"
               "}",
        porque=(
            "A condição começa por “webhookToken &&”. Se ASAAS_WEBHOOK_TOKEN não estiver definida no "
            "ambiente do projeto — ou for string vazia, ou for removida numa troca de ambiente — a expressão "
            "curto-circuita e a validação inteira é pulada: a função passa a aceitar qualquer POST anônimo. "
            "Daí em diante o corpo é processado com service_role: PAYMENT_RECEIVED marca client_charges como "
            "paga, faz a baixa do recebível em internal_transactions (business_status RECEBIDO, status "
            "CONCILIATED) e insere lançamento de taxa; BILL_PAID marca supplier_payments e boletos como "
            "pagos. O identificador precisa apenas casar com um asaas_payment_id/asaas_bill_id existente. É "
            "uma falha fail-open: o modo inseguro é o default silencioso. A linha 33 ainda registra em log um "
            "prefixo e um sufixo do token esperado, junto do comprimento — vazamento parcial de segredo no log."
        ),
        impacto="Baixa fraudulenta de contas a receber e a pagar por requisição anônima, caso a variável não esteja configurada.",
        correcao=(
            "Inverter para fail-closed: se webhookToken estiver vazio, responder 503 e não processar nada. "
            "Comparar em tempo constante. Remover o log das linhas 32-33 ou reduzi-lo a um booleano de "
            "match. Adicionar validação de inicialização que recuse subir sem a variável."
        ),
        aceite=[
            "Com ASAAS_WEBHOOK_TOKEN ausente, a função responde 503 e não altera nenhuma linha",
            "POST com token errado responde 401",
            "O log não contém mais nenhum trecho do token esperado",
            "O webhook real do Asaas continua sendo processado",
        ],
        verificacao="Arquivo lido integralmente; condição de guarda na linha 34.",
        condicao="Explorabilidade condicionada a ASAAS_WEBHOOK_TOKEN ausente ou vazia no ambiente do projeto Supabase.",
    ),
    dict(
        id="C3-05", cat="C3", sev="media",
        titulo="asaas-charge action 'resend' envia boleto de outro tenant para e-mail escolhido pelo atacante",
        arquivo="supabase/functions/asaas-charge/index.ts",
        linhas="84-115",
        trecho="const { data: ch } = await admin.from('client_charges')\n"
               "    .select('asaas_payment_id,billing_type,party_email,status')\n"
               "    .eq('id', chargeId).eq('organization_id', organization_id).maybeSingle();\n"
               "\n"
               "const emailOverride = body.email ?? ch.party_email;\n"
               "if (emailOverride) sendBody.emails = [emailOverride];\n"
               "await fetch(`${asaasBase}/payments/${ch.asaas_payment_id}/sendByMail`, { ... });",
        porque=(
            "Consequência direta de C2-03. Como organization_id não é validado contra o chamador, o par "
            "(charge_id, organization_id) do tenant alvo satisfaz os dois .eq(). O campo email do corpo então "
            "sobrepõe o destinatário legítimo e o Asaas envia a segunda via do boleto — com valor, "
            "vencimento, dados do sacado e linha digitável — para o endereço do atacante. É exfiltração de "
            "dado financeiro de outro tenant por um canal que não passa pela RLS."
        ),
        impacto="Exfiltração de boletos e dados de cobrança de outro tenant para endereço arbitrário.",
        correcao="Corrigir C2-03 (checagem de associação) e, adicionalmente, restringir emailOverride aos endereços já cadastrados daquele cliente, em vez de aceitar qualquer string.",
        aceite=[
            "resend com charge_id de outra organização retorna 403",
            "email fora dos endereços cadastrados do cliente é rejeitado",
            "Segunda via legítima continua sendo enviada",
        ],
        verificacao="Arquivo lido integralmente; caminho de 'resend' nas linhas 84-115.",
    ),
    dict(
        id="C3-06", cat="C3", sev="media",
        titulo="notify-broker-proposal e notify-opportunity-interest não verificam Authorization nenhuma",
        arquivo="supabase/functions/notify-broker-proposal/index.ts",
        linhas="22-40 (e notify-opportunity-interest/index.ts:28-53)",
        trecho="serve(async (req: Request) => {\n"
               "    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });\n"
               "\n"
               "    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';\n"
               "    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';\n"
               "    // nenhuma leitura de req.headers.get('Authorization') em todo o arquivo\n"
               "    const { proposalId, organizationId } = await req.json();",
        porque=(
            "Ao contrário das demais, estas duas funções não leem o header Authorization em momento algum. "
            "Elas filtram corretamente por organizationId nas consultas (o que impede montar notificação com "
            "dados de outro tenant — ponto positivo), mas qualquer um que conheça um par válido de ids "
            "dispara notificação in-app e e-mail para todos os owners/admins daquela organização, quantas "
            "vezes quiser. Serve como amplificador de spam e de phishing interno, já que o conteúdo do "
            "e-mail vem de campos gravados por formulário público (ver C5-03). Ainda que o verify_jwt da "
            "plataforma esteja ligado, ele é satisfeito pela chave anon, que é pública."
        ),
        impacto="Spam ilimitado de notificação e e-mail para administradores, com conteúdo parcialmente controlado pelo atacante.",
        correcao="Adotar o gate já usado nas funções de cron (comparar Authorization com Bearer <service_role>) e chamar estas funções a partir de trigger/serviço, ou exigir sessão válida com associação a organizationId. Somar rate limiting por (organizationId, interestId).",
        aceite=[
            "Chamada sem credencial válida retorna 401",
            "O fluxo real de nova proposta / novo interesse continua notificando os admins",
        ],
        verificacao="Dois arquivos lidos integralmente; ausência de qualquer leitura de Authorization.",
    ),
    dict(
        id="C3-07", cat="C3", sev="media",
        titulo="partner-portal-upload grava em bucket público com contractId arbitrário e content-type do usuário",
        arquivo="supabase/functions/partner-portal-upload/index.ts",
        linhas="88-102",
        trecho="if (target === 'invoice') {\n"
               "    if (!contractId) return json({ error: 'contractId é obrigatório ...' }, 400);\n"
               "    const path = `invoices/${contractId}/${Date.now()}_${safeName}`;\n"
               "    const { error: uploadError } = await admin.storage.from('documents')\n"
               "        .upload(path, bytes, { contentType: file.type || 'application/octet-stream', ... });\n"
               "    const { data: pub } = admin.storage.from('documents').getPublicUrl(path);\n"
               "    return json({ publicUrl: pub.publicUrl });",
        porque=(
            "O ramo target='invoice' nunca confere que contractId pertence ao workspace do token validado — "
            "diferente do ramo padrão, que usa o workspaceId derivado do token no caminho. Um parceiro "
            "qualquer grava arquivo na pasta de qualquer contrato. O bucket documents é público (confirmado "
            "em storage.buckets: public=true, allowed_mime_types NULL, file_size_limit NULL) e a função "
            "aceita o content-type informado pelo cliente, então dá para publicar text/html arbitrário numa "
            "URL do domínio de storage da organização — útil para phishing e para hospedar carga maliciosa "
            "com ar de legitimidade. Não há limite de tipo nem de tamanho no bucket."
        ),
        impacto="Contaminação de anexos de contratos alheios e hospedagem de conteúdo arbitrário (inclusive HTML) em URL pública da organização.",
        correcao=(
            "Validar que contractId pertence ao workspace do token antes de montar o caminho; forçar "
            "allowlist de content-type (application/pdf e imagens) em vez de confiar em file.type; definir "
            "allowed_mime_types e file_size_limit no bucket documents; avaliar torná-lo privado com URL "
            "assinada, no padrão já adotado para opura-docs."
        ),
        aceite=[
            "Upload com contractId de outro workspace retorna 403",
            "Upload de text/html é recusado",
            "O bucket documents tem allowed_mime_types e file_size_limit definidos",
            "Envio de NF pelo Portal do Parceiro continua funcionando",
        ],
        verificacao="Arquivo lido integralmente; flag public=true confirmada em storage.buckets no banco remoto.",
    ),

    # ---------------- C4 ----------------
    dict(
        id="C4-01", cat="C4", sev="baixa",
        titulo="Chave publishable e project ref do Supabase embutidos em script versionado",
        arquivo="check_suppliers.js",
        linhas="3-4",
        trecho="const supabaseUrl = 'https://oxedkknreghxrgenyjiu.supabase.co';\n"
               "const supabaseKey = 'sb_publishable_IgIC72BIXClNix4ARLo0QA_0UGDrnzW';\n"
               "const supabase = createClient(supabaseUrl, supabaseKey);",
        porque=(
            "A chave publishable/anon é desenhada para ser pública — ela já vai no bundle do frontend — "
            "então o vazamento em si não é o problema. O que importa é o efeito combinado: o arquivo está "
            "versionado (git ls-files confirma) e dá a qualquer leitor do repositório um cliente pronto, "
            "apontado para o projeto de produção, sem passo nenhum de configuração. Foi exatamente com essa "
            "chave que o achado C1-02 foi confirmado. Os demais scripts da raiz (test_db.js, test_insert.js, "
            "unlink_db.js, query_doc.js) fazem o certo: leem de process.env ou do .env. Este é o único com "
            "valor cravado. Registra-se que nenhum segredo real — service_role, JWT, chave de API — foi "
            "encontrado em conteúdo versionado."
        ),
        impacto="Reduz a zero o atrito para explorar qualquer falha de RLS no projeto de produção.",
        correcao="Trocar os literais por process.env, como nos demais scripts; ou mover check_suppliers.js para _dev_scripts/ (já no .gitignore) e remover do índice do git.",
        aceite=[
            "Nenhum literal de URL/chave de projeto em arquivo versionado",
            "git grep por 'sb_publishable_' e por '.supabase.co' em código não retorna credencial cravada",
        ],
        verificacao="git ls-files confirma o arquivo versionado; git grep por padrões de segredo em todo o conteúdo versionado não encontrou segredo real.",
    ),
    dict(
        id="C4-02", cat="C4", sev="baixa",
        titulo="Placeholders de segredo como fallback de COALESCE nos agendamentos pg_cron",
        arquivo="supabase/migrations/20260224000002_setup_billing_cron.sql",
        linhas="37 (e 20261118000011_task_alert_sent_at.sql:31-35)",
        trecho="'Authorization', 'Bearer ' || (SELECT COALESCE(current_setting('vault.service_role_key', true), 'INTERNAL_SECRET_HERE'))\n"
               "\n"
               "-- 20261118000011_task_alert_sent_at.sql:\n"
               "'Authorization', 'Bearer ' || coalesce(\n"
               "    current_setting('vault.service_role_key', true),\n"
               "    current_setting('app.service_role_key', true),\n"
               "    'CONFIGURE_SERVICE_ROLE_KEY')",
        porque=(
            "O padrão COALESCE(variável, 'PLACEHOLDER') faz o literal virar o segredo efetivo quando a "
            "variável não está configurada. Aqui o efeito imediato é de disponibilidade, não de exposição: "
            "as funções alvo comparam o header com Bearer <service_role> e recusam o placeholder, então o "
            "cron de faturamento e o de alerta de tarefa falham 401 em silêncio — ninguém é avisado de que "
            "pararam. O risco de segurança é o inverso do costume: como o valor certo precisa ser colado à "
            "mão (o comentário da linha 47 manda literalmente substituir pela service_role key), o próximo "
            "passo natural de quem for consertar é cravar a chave real numa migration versionada. Não há "
            "validação de inicialização que recuse o placeholder."
        ),
        impacto="Jobs de cron falhando silenciosamente e convite estrutural a commitar a service_role key numa migration.",
        correcao=(
            "Remover os fallbacks literais e deixar a chamada falhar de forma visível quando a chave não "
            "estiver no Vault; ler o segredo apenas de vault.decrypted_secrets, como a migration "
            "20260514000002 (quality-sla-enforcement) já faz corretamente; e acrescentar teste que recuse "
            "migration contendo os literais INTERNAL_SECRET_HERE / CONFIGURE_SERVICE_ROLE_KEY / "
            "SUA_SERVICE_ROLE_KEY."
        ),
        aceite=[
            "Nenhuma migration contém os literais de placeholder de segredo",
            "Os dois jobs leem a chave do Vault, no padrão da 20260514000002",
            "Existe verificação mecânica que quebra o build se o padrão voltar",
            "Os jobs de faturamento e de alerta de tarefa executam com 200",
        ],
        verificacao="Migrations lidas na íntegra; padrão correto identificado em 20260514000002_quality_sla_cron.sql:21.",
    ),
    dict(
        id="C4-03", cat="C4", sev="informativa",
        titulo="Project ref do Supabase cravado como fallback de Access-Control-Allow-Origin",
        arquivo="supabase/functions/process-billing-ruler/index.ts",
        linhas="8-11",
        trecho="const corsHeaders = {\n"
               "    'Access-Control-Allow-Origin': Deno.env.get('FRONTEND_URL') ?? 'https://oxedkknreghxrgenyjiu.supabase.co',\n"
               "    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',\n"
               "}",
        porque=(
            "Não é credencial e não concede acesso: o project ref é visível em qualquer requisição do app. "
            "Fica o registro como higiene — identificador de ambiente de produção cravado no código, que "
            "vira armadilha em fork, em homologação ou numa eventual migração de projeto. Como toda produção "
            "real define FRONTEND_URL, o fallback nunca deveria ser exercido."
        ),
        impacto="Nenhum impacto direto de segurança; risco de configuração errada silenciosa entre ambientes.",
        correcao="Falhar explicitamente quando FRONTEND_URL não estiver definida, em vez de cair num literal de produção.",
        aceite=["Nenhum project ref literal em supabase/functions/"],
        verificacao="Arquivo lido integralmente.",
    ),

    # ---------------- C5 ----------------
    dict(
        id="C5-01", cat="C5", sev="alta",
        titulo="XSS armazenado na Academia: qualquer membro injeta HTML servido a todos os matriculados",
        arquivo="components/academy/AcademyLessonPlayer.tsx",
        linhas="180-183",
        trecho="case 'TEXTO':\n"
               "    return (\n"
               "        <div\n"
               "            className=\"prose prose-sm max-w-none ...\"\n"
               "            dangerouslySetInnerHTML={{ __html: lesson.conteudo_html || '' }}\n"
               "        />\n"
               "    );",
        porque=(
            "conteudo_html vem da tabela academy_lessons e é injetado sem qualquer sanitização. As policies "
            "de escrita dessa tabela são academy_lessons_insert e academy_lessons_update, ambas com "
            "expressão is_org_member(org_id) — ou seja, QUALQUER membro da organização, no papel mais baixo, "
            "escreve o HTML. O conteúdo é depois renderizado para todo colaborador matriculado que abrir a "
            "aula, incluindo owners e admins. Não existe biblioteca de sanitização no projeto: package.json "
            "não declara DOMPurify nem equivalente, e não há utilitário próprio de escape. Um membro comum "
            "publica aula com <img src=x onerror=...> e executa script na sessão de um administrador — o "
            "token do Supabase é acessível ao JavaScript da página, então o resultado é sequestro de sessão "
            "privilegiada. É escalada de privilégio dentro do tenant."
        ),
        impacto="Execução de script na sessão de administradores; roubo de sessão e escalada de privilégio dentro da organização.",
        correcao=(
            "Adicionar dependência de sanitização (DOMPurify) e criar um helper único — por exemplo "
            "utils/sanitizeHtml.ts — com allowlist de tags e atributos, proibindo event handlers e "
            "javascript: em href/src. Aplicar em todo dangerouslySetInnerHTML que renderize dado de banco. "
            "Sanitizar também na escrita, para não depender só da leitura."
        ),
        aceite=[
            "DOMPurify (ou equivalente) consta em package.json",
            "Existe helper único de sanitização e AcademyLessonPlayer o usa",
            "Teste cobrindo <img onerror>, <script> e href=javascript: prova que são neutralizados",
            "Aula com HTML legítimo (negrito, lista, link http) continua renderizando",
        ],
        verificacao="Sink lido no arquivo; policies de academy_lessons confirmadas em pg_policies (is_org_member); ausência de lib de sanitização confirmada em package.json.",
    ),
    dict(
        id="C5-02", cat="C5", sev="alta",
        titulo="Template de contrato injetado via innerHTML na geração de PDF",
        arquivo="components/ContractDetailView.tsx",
        linhas="885-893",
        trecho="const rendered = renderTemplate(template.body_html, varMap);\n"
               "\n"
               "const container = window.document.createElement('div');\n"
               "container.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;...';\n"
               "container.innerHTML = rendered;\n"
               "window.document.body.appendChild(container);",
        porque=(
            "body_html vem de contract_templates, cuja policy de escrita é contract_templates_org com "
            "is_org_member(organization_id) — de novo, qualquer membro da organização. O HTML é atribuído "
            "via innerHTML a um elemento que é efetivamente anexado ao documento (linha 893), no contexto de "
            "quem gera o PDF, tipicamente um usuário do financeiro ou administrador. innerHTML não executa "
            "<script>, mas executa handlers de erro e de carga: <img src=x onerror=...> e <svg onload=...> "
            "disparam normalmente. O container fica fora da tela, então a vítima não vê nada acontecer. Não "
            "há sanitização em renderTemplate nem no ponto de uso."
        ),
        impacto="Execução de script na sessão de quem gera o PDF do contrato, disparada por qualquer membro da organização.",
        correcao="Sanitizar rendered com o mesmo helper de C5-01 antes da atribuição; aplicar também nos dois pontos de preview de template (C5-04).",
        aceite=[
            "ContractDetailView sanitiza antes de atribuir a innerHTML",
            "ContractTemplateManager.tsx:251 e DunningModule.tsx:245 usam o mesmo helper",
            "Teste com <img onerror> em body_html prova que o handler não dispara",
            "O PDF gerado a partir de template legítimo permanece idêntico",
        ],
        verificacao="Sink lido no arquivo; policy contract_templates_org confirmada em pg_policies.",
    ),
    dict(
        id="C5-03", cat="C5", sev="media",
        titulo="E-mails HTML montados por interpolação, com campo vindo de formulário público anônimo",
        arquivo="supabase/functions/notify-opportunity-interest/index.ts",
        linhas="134-174 (e notify-broker-proposal/index.ts:128-149)",
        trecho="<p style=\"...\">${opp.title}</p>\n"
               "${opp.subtitle ? `<p style=\"...\">${opp.subtitle}</p>` : ''}\n"
               "<span style=\"...\">${interest.contact_name}</span>\n"
               "<a href=\"mailto:${interest.contact_email}\" style=\"...\">${interest.contact_email}</a>\n"
               "<p style=\"...\">\"${interest.message}\"</p>",
        porque=(
            "O HTML do e-mail é montado por template string, sem nenhum escape. Os campos contact_name, "
            "contact_email, contact_phone e message vêm de opportunity_interests, alimentada pelo formulário "
            "público de manifestação de interesse (RPC fn_investor_portal_submit_interest, confirmada como "
            "executável por anon) — ou seja, são texto de atacante anônimo. Em notify-broker-proposal o "
            "mesmo vale para notes, buyer_name e broker_email. O destinatário é a caixa de todos os "
            "owners/admins da organização. Clientes de e-mail modernos bloqueiam script, então não é XSS "
            "clássico; o que se consegue é quebrar a estrutura do HTML e injetar conteúdo e âncoras "
            "arbitrárias — um <a href> convincente dentro de uma mensagem que chega do domínio corporativo "
            "da própria empresa. Combinado com C3-06 (as duas funções não exigem credencial), o atacante "
            "escolhe a hora e a frequência do disparo. contact_email ainda vai para dentro de um atributo "
            "href, o contexto mais frouxo dos presentes."
        ),
        impacto="Phishing dirigido a administradores, com conteúdo controlado pelo atacante, entregue pelo domínio corporativo.",
        correcao=(
            "Criar helper de escape de HTML (e um específico para contexto de atributo) em "
            "supabase/functions/_shared/ e aplicar a toda interpolação de dado do banco nas duas funções. "
            "Validar contact_email como e-mail antes de usá-lo em href, e truncar message a um tamanho máximo."
        ),
        aceite=[
            "Existe helper de escape compartilhado e as duas funções o usam em toda interpolação",
            "Interesse com <a href> ou aspas no campo message chega ao e-mail como texto literal",
            "contact_email inválido não é renderizado como href",
            "O e-mail legítimo continua com o mesmo layout",
        ],
        verificacao="Duas funções lidas integralmente; fn_investor_portal_submit_interest confirmada como executável por anon em pg_proc.",
    ),
    dict(
        id="C5-04", cat="C5", sev="baixa",
        titulo="Preview de template renderiza HTML do próprio autor sem sanitização (self-XSS)",
        arquivo="components/ContractTemplateManager.tsx",
        linhas="248-252 (e components/DunningModule.tsx:243-246)",
        trecho="{previewMode ? (\n"
               "    <div\n"
               "        className=\"min-h-[480px] ... prose prose-sm max-w-none\"\n"
               "        dangerouslySetInnerHTML={{ __html: previewContent }}\n"
               "    />\n"
               ") : ( ... )}",
        porque=(
            "Nos dois casos o HTML renderizado é o que o próprio usuário acabou de digitar no textarea ao "
            "lado (previewContent vem de renderTemplate(bodyHtml, ...) na linha 191; previewBody vem de "
            "form.body_template na linha 101 do DunningModule). Sozinho isso é self-XSS: a vítima teria de "
            "colar o payload em si mesma, o que não configura vulnerabilidade explorada por terceiro. Fica "
            "registrado como baixa por dois motivos: é o mesmo dado que, depois de salvo, alimenta o sink de "
            "C5-02 e o corpo dos e-mails de cobrança; e a correção é a mesma linha de código, então separar "
            "as duas passadas só cria retrabalho."
        ),
        impacto="Sem impacto direto isolado; relevante como parte da mesma superfície de C5-02.",
        correcao="Aplicar o helper de sanitização de C5-01 nos dois pontos de preview.",
        aceite=["Os dois previews passam pelo helper de sanitização"],
        verificacao="Origem de previewContent e previewBody rastreada até o estado local do formulário.",
    ),
]

PONTOS_FORTES = [
    dict(titulo="RLS habilitada em toda a base, sem exceção de negócio",
         evidencia="pg_class.relrowsecurity: a única tabela do schema public com RLS desligada é spatial_ref_sys, de referência do PostGIS. As 15 tabelas com zero policies (backups _bkp_*, contadores, order_chats, commercial_*) ficam inacessíveis por PostgREST — negam por padrão, que é o comportamento seguro."),
    dict(titulo="A limpeza das policies anon de desenvolvimento foi real e verificável",
         evidencia="A migration 20270208000002 removeu 81 policies que davam acesso irrestrito ao papel anon. Testado ao vivo com a chave anon pública: suppliers, clients e internal_transactions retornam Content-Range */0. Só invoices ficou de fora (C1-02) — e a própria migration já registrava a ressalva nas linhas 30-32."),
    dict(titulo="Nenhuma view exposta ao papel anon",
         evidencia="Varredura de pg_class (relkind v/m) com has_table_privilege('anon', ...): restam apenas geography_columns e geometry_columns, ambas do PostGIS. O passivo histórico de views legíveis por anon foi de fato eliminado."),
    dict(titulo="invite-member é o modelo correto de autorização no servidor",
         evidencia="supabase/functions/invite-member/index.ts:41-60 valida o JWT com um cliente anon, consulta organization_members pela organizationId E pelo e-mail do usuário, e exige role em ['admin','owner'] antes de qualquer ação privilegiada. É o único ponto do sistema que faz o ciclo completo — e o padrão que C2-01, C2-02 e C2-03 deveriam seguir."),
    dict(titulo="As funções de cron falham fechado",
         evidencia="process-billing-ruler/index.ts:19-25, quality-sla-enforcement/index.ts:26-33 e task-alert-notifier/index.ts:28-31 exigem Authorization exatamente igual a 'Bearer <service_role>' e retornam 401 caso contrário. Sem modo permissivo e sem fallback — o oposto do defeito de C3-04."),
    dict(titulo="academy-portal-media documenta e aplica o padrão seguro de portal",
         evidencia="index.ts:25-35 explicita duas decisões: nunca aceitar storagePath do cliente (o caminho é derivado no servidor a partir de lessonId/materialId/certificateId) e tirar o recorte do token em portal_tokens, não de um employeeId cru “porque seria enumerável”. Confere matrícula ativa antes de assinar e registra toda abertura em academy_access_logs."),
    dict(titulo="Os três portais de download validam vínculo antes de assinar a URL",
         evidencia="supplier-portal-download/index.ts:38-57 confere token e casa file_path com supplier_id; portal-ged-download/index.ts:38-64 confere token e exige que o path seja a versão ativa de documento compartilhado com aquele cliente; partner-portal-download/index.ts:61-71 delega à RPC partner_portal_can_download, que cobre compartilhamento avulso e por pasta. Nos três, o service_role só entra depois da checagem."),
    dict(titulo="supplier-portal-upload trata o upload com cuidado incomum",
         evidencia="index.ts:39-101: limite de 5MB antes de ler o arquivo, validação do token, conferência de que orderId pertence àquele supplier_id (linhas 57-65), sanitização do nome do arquivo por allowlist de caracteres com truncamento, caminho prefixado pelo supplier_id do token e remoção do objeto no storage se a gravação no banco falhar."),
    dict(titulo="eval e new Function foram deliberadamente eliminados do cálculo de folha",
         evidencia="services/payrollEngine.ts:8 documenta um parser aritmético próprio que “substitui new Function() / eval()”. A varredura por eval( e new Function( em components/, services/, utils/, lib/ e hooks/ não encontrou nenhuma outra ocorrência."),
    dict(titulo="Nenhum segredo real versionado e .gitignore correto",
         evidencia="git grep por eyJhbGciOi, service_role, sb_secret_, sk-ant-, $aact_ e padrões de api_key em todo o conteúdo versionado não retornou nenhum segredo real — só nomes de variável e instruções de documentação. O .gitignore cobre .env, .env.local e .env.*.local, e git ls-files confirma que apenas .env.example está versionado, com placeholders."),
    dict(titulo="As funções notify-* filtram por organizationId nas consultas",
         evidencia="notify-opportunity-interest/index.ts:58-76 cruza opportunityId com organizationId e interestId com opportunityId; notify-broker-proposal/index.ts:43-55 cruza proposalId com organizationId. Impede montar notificação com dado de outro tenant — o defeito ali é a ausência de autenticação (C3-06), não o escopo da consulta."),
    dict(titulo="As regras obrigatórias do projeto têm verificação mecânica no CI",
         evidencia="scripts/check-*.sh e __tests__/orgContextGuard.test.ts, este último rodando no CI a cada push/PR como catraca com BASELINE que só pode diminuir. É a estrutura certa para transformar cada achado deste relatório em regressão impossível."),
]

PONTOS_FRACOS = [
    dict(titulo="A tabela que define quem é membro pode ser escrita por qualquer um",
         texto="C1-01 não é um furo a mais na RLS: é o furo que anula a RLS inteira. Toda policy org-scoped do sistema pergunta a organization_members quem você é, e qualquer autenticado pode responder por si mesmo, escolhendo o papel. Enquanto essa policy existir, os controles corretos das outras tabelas não valem nada, e nenhuma outra correção deste relatório muda o resultado final."),
    dict(titulo="Edge Function com service_role vira caminho paralelo que ignora a RLS",
         texto="O projeto investiu pesado em RLS, mas 11 das 24 funções criam um cliente com serviceRoleKey. Nesse caminho a RLS deixa de existir e a autorização passa a ser responsabilidade manual do handler — e o padrão dominante é confundir autenticação com autorização: confirma-se que existe um usuário, nunca que aquele usuário pode agir sobre aquele objeto daquela organização (C2-01, C2-02, C2-03, C3-03). O organization_id chega pelo corpo da requisição e é tratado como fato."),
    dict(titulo="Regras de compartilhamento escritas pela metade",
         texto="C1-05 é o mesmo tipo de erro que C1-01, num lugar diferente: a policy diz que o registro é compartilhado, mas não diz com quem, e “OR is_shared” avaliado sozinho é sempre verdadeiro. O nome da policy de suppliers — “Users can view suppliers of their organization” — descreve uma regra que a expressão não implementa, e é justamente esse descompasso entre o nome e a expressão que faz o defeito passar despercebido em revisão. Vale como alerta geral: toda perna de OR numa policy precisa ser lida como “isto sozinho basta para liberar a linha?”."),
    dict(titulo="Credencial de portal emitida sem autorização, por default de GRANT do PostgreSQL",
         texto="C3-01 nasce de um detalhe de plataforma: toda função nova recebe EXECUTE para PUBLIC, e as migrations concedem a authenticated sem nunca revogar de PUBLIC. O resultado é que duas funções que EMITEM credencial de acesso ficaram abertas ao papel anon. É defeito sistêmico de processo, não esquecimento pontual — o mesmo padrão vale para toda SECURITY DEFINER criada sem o REVOKE."),
    dict(titulo="Identidade de portal ora é token, ora é um id cru enumerável",
         texto="Há dois desenhos convivendo. O bom usa token opaco com validade e vínculo (academy-portal-media, os três downloads). O ruim aceita o identificador do titular direto no corpo — labor-portal-ged-download com employeeId (C3-02). O código do próprio projeto já diagnosticou a diferença por escrito, e a versão ruim continua em produção."),
    dict(titulo="Nenhuma sanitização de HTML em todo o projeto",
         texto="Não existe DOMPurify nem helper próprio de escape. São quatro sinks no frontend e duas montagens de e-mail no backend, todos alimentados por tabelas cuja policy de escrita é is_org_member — isto é, o membro de papel mais baixo consegue injetar HTML que será renderizado na sessão de um administrador (C5-01, C5-02). Falta a peça, não a aplicação dela."),
    dict(titulo="Guardas que falham abertas e placeholders que viram segredo",
         texto="C3-04 só protege se a variável existir (“if (webhookToken && ...)”), e C4-02 substitui segredo ausente por um literal. Nos dois casos o modo inseguro é o comportamento default, e silencioso. Falta validação de inicialização que recuse subir sem os segredos obrigatórios."),
]

RECOMENDACOES = [
    dict(p="P1", prazo="Imediato (hoje)", itens=[
        ("Substituir a policy de INSERT de organization_members por is_org_manager(organization_id) OR is_superadmin(), movendo o auto-vínculo do primeiro dono para uma RPC dedicada", "C1-01"),
        ("REVOKE EXECUTE FROM PUBLIC, anon em client_portal_generate_token e broker_portal_generate_token, e exigir is_org_manager dentro das duas funções", "C3-01"),
        ("Reescrever as policies de invoices com recorte por organização e remover as duas policies anon", "C1-02"),
        ("Completar a regra de is_shared nas policies de clients, suppliers e partner_workspaces — dizer com QUEM o registro é compartilhado, ou remover a perna até haver regra correta", "C1-05"),
        ("Trocar employeeId por token em labor-portal-ged-download, no desenho de academy-portal-media", "C3-02"),
    ]),
    dict(p="P2", prazo="Esta semana", itens=[
        ("Criar supabase/functions/_shared/auth.ts com checagem de associação e papel, e aplicar em asaas-charge, asaas-payment, sign-contract, send-bi-report e sinapi-import", "C2-01, C2-02, C2-03, C3-05"),
        ("Adicionar checagem de posse por objeto em sign-contract (contrato, aditivo, versão, deal) e escopar a action 'status'", "C3-03"),
        ("Tornar o asaas-webhook fail-closed e tirar o token do log", "C3-04"),
        ("Adicionar DOMPurify, criar utils/sanitizeHtml.ts e aplicar nos quatro sinks do frontend", "C5-01, C5-02, C5-04"),
        ("Autenticar notify-broker-proposal e notify-opportunity-interest e escapar as interpolações de HTML dos e-mails", "C3-06, C5-03"),
    ]),
    dict(p="P3", prazo="Este mês", itens=[
        ("Varrer pg_proc atrás de toda SECURITY DEFINER com ACL herdando PUBLIC e revogar; adicionar o REVOKE ao template de migration", "C3-01"),
        ("Remover as policies anon remanescentes de opura_cno_areas e opura_cno_reductions e escopar payment_types", "C1-03, C1-04"),
        ("Validar contractId e restringir content-type em partner-portal-upload; definir allowed_mime_types e file_size_limit no bucket documents", "C3-07"),
        ("Eliminar os placeholders de segredo das migrations de cron e ler do Vault", "C4-02"),
        ("Tirar do git a credencial cravada em check_suppliers.js e o project ref de process-billing-ruler", "C4-01, C4-03"),
    ]),
    dict(p="P4", prazo="Contínuo", itens=[
        ("Transformar cada achado em verificação mecânica no CI, ao lado de __tests__/orgContextGuard.test.ts: teste que recusa policy com qual=true para anon, teste que recusa SECURITY DEFINER com ACL PUBLIC, teste que recusa dangerouslySetInnerHTML sem passar pelo helper de sanitização", "todos"),
        ("Adotar revisão obrigatória para toda migration que crie policy ou função SECURITY DEFINER", "C1, C3"),
    ]),
]

# Agrupamento das issues do GitHub. Cada entrada vira um bloco pronto para copiar.
# achados = lista de ids agrupados numa única issue.
ISSUES = [
    dict(n=1, achados=["C1-01"], titulo="Policy de INSERT em organization_members permite auto-promoção a owner de qualquer organização", sev="critica"),
    dict(n=2, achados=["C3-01"], titulo="As 8 RPCs que emitem e revogam credencial de portal são executáveis por anon", sev="critica"),
    dict(n=3, achados=["C1-02"], titulo="Tabela invoices legível e gravável por anônimo e sem isolamento entre tenants", sev="critica"),
    dict(n=4, achados=["C1-05"], titulo="A perna “OR is_shared” das policies de leitura vaza 127 cadastros entre tenants", sev="alta"),
    dict(n=5, achados=["C3-02"], titulo="Portal do Colaborador exposto: anon lê folha de pagamento só com o UUID do colaborador", sev="critica"),
    dict(n=6, achados=["C2-03", "C3-05"], titulo="Edge Functions confiam no organization_id do corpo da requisição sem checar associação", sev="alta"),
    dict(n=7, achados=["C3-03"], titulo="sign-contract altera e lê documentos de assinatura sem checagem de posse", sev="alta"),
    dict(n=8, achados=["C2-01"], titulo="sinapi-import permite a qualquer usuário logado reescrever a base de preços global", sev="alta"),
    dict(n=9, achados=["C2-02"], titulo="send-bi-report é um relay de e-mail aberto a qualquer usuário autenticado", sev="alta"),
    dict(n=10, achados=["C3-04"], titulo="asaas-webhook falha aberto quando ASAAS_WEBHOOK_TOKEN não está configurada", sev="alta"),
    dict(n=11, achados=["C5-01", "C5-02", "C5-04"], titulo="Ausência de sanitização de HTML nos quatro sinks de innerHTML do frontend", sev="alta"),
    dict(n=12, achados=["C3-06", "C5-03"], titulo="Funções notify-* sem autenticação e com HTML de e-mail montado por interpolação", sev="media"),
    dict(n=13, achados=["C3-07"], titulo="partner-portal-upload aceita contractId arbitrário e content-type do usuário em bucket público", sev="media"),
    dict(n=14, achados=["C1-03", "C1-04"], titulo="Policies permissivas remanescentes em opura_cno_* e payment_types", sev="media"),
    dict(n=15, achados=["C4-01", "C4-02", "C4-03"], titulo="Higiene de segredos: credencial cravada, placeholders de service_role e project ref no código", sev="baixa"),
]

CORES = {
    "critica": "#B91C1C",
    "alta": "#EA580C",
    "media": "#D97706",
    "baixa": "#2563EB",
    "informativa": "#64748B",
    "forte": "#059669",
}

ROTULO_SEV = {
    "critica": "CRÍTICA", "alta": "ALTA", "media": "MÉDIA",
    "baixa": "BAIXA", "informativa": "INFORMATIVA",
}

ORDEM_SEV = ["critica", "alta", "media", "baixa", "informativa"]
