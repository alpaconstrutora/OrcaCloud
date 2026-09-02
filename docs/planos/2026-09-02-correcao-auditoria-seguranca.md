# Correção dos achados da auditoria de segurança

## Pedido original

> faca um plano para correcao de todos os itens
>
> Sessão: `7f6aa2d5-360e-4202-b6d7-54b490852201` · 2026-09-02

### Pedidos anteriores que originaram os itens

**2026-09-01 — o pedido que gerou a auditoria** (transcrição literal):

> Revisa este código atrás de cinco falhas de segurança. Antes de começar, detecte a stack do
> projeto (linguagem, framework, ORM/query builder, mecanismo de auth, frontend, arquivos de
> deploy como Docker/CI/Helm/Terraform) e adapte cada categoria ao equivalente dessa stack:
>
> 1. BANCO SEM TRANCA (isolamento de inquilino/dono) — em Supabase é RLS ausente; em APIs
> próprias são queries de listagem/busca/agregação/relatório/exportação que não filtram pelo
> usuário autenticado ou pela organização/workspace/tenant ao qual ele pertence. Identifique
> primeiro QUAL é o mecanismo de isolamento do projeto (RLS, middleware de tenant, filtro manual
> por user_id, etc.) e aponte onde ele está ausente ou furado.
>
> 2. PERMISSÃO DEFINIDA NO NAVEGADOR — operações privilegiadas (admin, configurações, gestão de
> usuários, ações de escrita) em que o frontend esconde a UI por papel (isAdmin, canEdit, role...)
> mas o servidor NÃO faz a verificação equivalente. Cruze cada gate de papel do frontend com o
> endpoint correspondente e confirme se o backend valida o privilégio em toda rota sensível.
>
> 3. IDOR — rotas que buscam, alteram ou deletam um objeto por ID (path, query ou body) sem
> verificar se o objeto pertence ao usuário/tenant do chamador. Percorra sistematicamente TODOS os
> handlers de rota do backend, não amostras.
>
> 4. CHAVES EXPOSTAS (hardcode) — API keys, tokens, senhas, segredos de assinatura (JWT, webhooks),
> chaves privadas e credenciais padrão embutidos no código-fonte, configs, docker-compose, charts,
> CI, scripts e documentação. [...]
>
> 5. INPUTS SEM TRATAMENTO (XSS) — no frontend: innerHTML/dangerouslySetInnerHTML/equivalentes do
> framework [...] No backend: input do usuário entrando em HTML de e-mails, templates ou respostas
> sem escape. Verifique se existe lib de sanitização no projeto e se ela é aplicada nos pontos
> encontrados.
>
> [seguiam as regras da auditoria e a especificação do relatório em PDF — ver
> `docs/security-audit/` para o resultado]

**2026-09-02 — autorização para provar em produção** (transcrição literal):

> autorizado

Autorizou as duas provas que eu havia deixado pendentes no relatório: a exploração do C1-01 em
transação abortada e a emissão de token de portal pelo papel `anon`.

---

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 2026-09-02 | Posso executar as provas de conceito contra o banco de produção? | Sim ("autorizado"). Executadas em `BEGIN ... RAISE EXCEPTION` — rollback por construção, zero resíduo. |
| 2026-09-02 | Escopo do plano | "todos os itens" — os 22 achados do relatório, sem recorte por severidade. |

### Decisões D1 e D2 — resolvidas em 2026-09-02

| # | Pergunta | Recomendação apresentada | Resposta do usuário |
|---|---|---|---|
| D1 | `is_shared` (C1-05) deve virar "compartilhado com o grupo/holding" ou ser removido? | Não existe hoje conceito de grupo no schema. **Remover a perna `is_shared`** na Fase 1 e, se o compartilhamento for requisito de produto, desenhá-lo depois com tabela explícita. Remover é reversível; deixar vazando não é. | *"d1 - seguir sua recomendacao"* — **remover a perna `is_shared`**. |
| D2 | Migrar o Portal do Colaborador para token (Fase 1.5) exige deploy coordenado banco+frontend. Aceita a janela? | Subir 1.5 e 3.6 na mesma janela. A alternativa (manter as RPCs antigas por uma versão) prolonga o vazamento da folha de pagamento. | *"d2 - seguir sua recomendacao"* — **janela coordenada**. |

**Consequência de D2 na execução:** a migration 1.5 é dividida em duas partes para que a janela seja
curta e reversível:

- **1.5a** — *criar* as `fn_portal_*(p_token)`. Puramente aditivo, não quebra nada, pode subir já.
- **1.5b** — *revogar* as antigas por `p_employee_id`. Só depois de 3.6 estar em produção.

Entre 1.5a e 1.5b o vazamento continua aberto; é o menor intervalo possível sem derrubar o portal.

---

## Correção do escopo: dois achados estavam subdimensionados

Ao levantar o material para este plano, a varredura de `pg_proc` mostrou que **C3-01 e C3-02 são
maiores do que o relatório de 2026-09-01 registrou**. Isso muda o tamanho da Fase 1 e precisa ficar
escrito antes do plano, não depois.

**C3-01 — não são 2 funções, são 8.** Emissores de credencial de portal executáveis por `anon`
(todos SECURITY DEFINER, todos sem checagem de autorização, todos por falta de
`REVOKE EXECUTE ... FROM PUBLIC`):

| Função | Parâmetros |
|---|---|
| `client_portal_generate_token` | `p_client_id, p_org_id` |
| `broker_portal_generate_token` | `p_broker_id, p_org_id` |
| `investor_portal_generate_token` | `p_investor_id, p_org_id` |
| `partner_portal_generate_token` | `p_workspace_id, p_org_id` |
| `supplier_portal_generate_token` | `p_supplier_id, p_org_id` |
| `portal_generate_token` | `p_employee_id, p_org_id` |
| `partner_portal_revoke_token` | `p_workspace_id, p_org_id` (revogar = negação de serviço) |
| `supplier_portal_revoke_token` | `p_supplier_id, p_org_id` (idem) |

**C3-02 — o defeito não é da Edge Function, é da camada de RPC.** Eu reportei
`labor-portal-ged-download` como um caso isolado de "id cru em vez de token". Na verdade **toda a
família de leitura do Portal do Colaborador** aceita `p_employee_id` cru e é executável por `anon`:
`portal_employee_summary`, `portal_get_payroll_runs`, `portal_get_documents`,
`portal_get_ged_documents`, `portal_get_absences`, `portal_get_time_entries`,
`portal_get_trainings`, `is_employee_shared_with_user`.

**Comprovado em produção** (transação abortada, papel `anon`, sem login): `anon` não tem sequer
`GRANT SELECT` na tabela `employees` — a chamada direta falha com `42501` —, mas
`portal_employee_summary(<uuid>)` devolveu o cadastro do colaborador e
`portal_get_payroll_runs(<uuid>)` devolveu as **folhas de pagamento**. A Edge Function era só a
ponta visível.

**Consequência:** C3-02 sobe de **alta** para **crítica** (folha de pagamento de qualquer
colaborador, por anônimo, só com o UUID) e o relatório precisa ser regerado — item 0.1 abaixo.

---

## Plano

Ordem deliberada: **primeiro o que fecha buraco sem depender de deploy de frontend** (Fase 1, só
SQL), depois o que exige coordenação. Um item por arquivo. Cada item diz **o que muda** e **como sei
que terminou**.

Nomenclatura das migrations: prefixo a partir de `20270918000001` (o maior em uso hoje é
`20270917000004`) e prefixo `aplicar_`, porque **`supabase db push` é proibido** neste repositório
— aplicar com `npx supabase db query --linked -f <arquivo>`.

---

### Fase 0 — Corrigir o relatório antes de agir sobre ele

**0.1 · `docs/security-audit/achados.py`**
- **O que muda:** C3-01 passa a listar as 8 funções (hoje diz 2); C3-02 passa a descrever a família
  `portal_get_*` e sobe para `sev="critica"`; acrescentar a prova da folha de pagamento por `anon`.
  Reagrupar as issues 2 e 5 para refletir o escopo real.
- **Como sei que terminou:** `./.venv/Scripts/python.exe gerar_relatorio.py` roda; o PDF mostra
  4 críticos (não 3); o texto de C3-01 cita `investor_portal_generate_token` e
  `portal_generate_token`; `issues-github.md` regenerado.

**0.2 · `docs/security-audit/provas/poc-c3-02-portal-rpcs-anon.sql`** *(novo)*
- **O que muda:** arquivar a prova que demonstrou `portal_get_payroll_runs` por `anon`, no mesmo
  padrão dos outros três scripts (leitura, `BEGIN`/`ROLLBACK`).
- **Como sei que terminou:** o script roda e devolve o payload da folha; `provas/README.md` lista
  quatro provas.

---

### Fase 1 — P1: fechar a quebra de multi-tenant (somente SQL, sem deploy)

**1.1 · `supabase/migrations/aplicar_20270918000001_rls_organization_members_insert.sql`** *(novo)* — **C1-01**
- **O que muda:** `DROP POLICY "Authenticated users can create memberships"` e recriar como
  `WITH CHECK (is_org_manager(organization_id) OR is_superadmin())`.
  **Não é preciso criar RPC de auto-vínculo:** já verifiquei que `createOrganization` passa por
  `create_organization_v2`, que é `SECURITY DEFINER` e cujo `anon` não executa — a criação de
  organização continua funcionando sem tocar em nada.
- **Como sei que terminou:** `provas/poc-c1-01-escalada-owner.sql` passa a falhar no `INSERT` com
  violação de RLS (`42501`), em vez de chegar ao `RAISE EXCEPTION` final; criar organização nova
  pela UI continua deixando o criador como `owner`; editar membros como `admin` continua salvando.

**1.2 · `supabase/migrations/aplicar_20270918000002_rls_invoices_escopo_org.sql`** *(novo)* — **C1-02**
- **O que muda:** `DROP` das duas policies `anon` ("Suppliers can view/insert their own invoices") e
  de `invoices_authenticated_all`; criar policies escopadas via `EXISTS` sobre `suppliers` com
  `is_org_member(suppliers.organization_id)`. A tabela não tem `organization_id` — usar o vínculo por
  `supplier_id`; acrescentar a coluna fica para a Fase 4 (item 4.5), fora do caminho crítico.
- **Como sei que terminou:** `curl` em `/rest/v1/invoices` com a chave anon retorna `[]` (hoje
  retorna 829 registros); usuário do tenant A não vê nota do tenant B; o Portal do Fornecedor
  continua listando e enviando notas (as Edge Functions usam `service_role`, não dependem da policy).

**1.3 · `is_shared`** — **C1-05** — ⚠️ **BLOQUEADO: D1 precisa ser revisto** *(2026-09-02)*

A recomendação que dei em D1 — "remover a perna `is_shared`" — **estava errada**, e o erro só
apareceu quando fui escrever a migration. Dois fatos que eu não tinha verificado:

1. **`is_shared` é uma funcionalidade viva, não resíduo.** Os serviços consultam explicitamente os
   registros compartilhados: `services/clientService.ts:115`, `services/supplierService.ts:320,350`
   e `services/partnerService.ts:25` fazem
   `.or('organization_id.eq.<org>,is_shared.is.true')`. Remover a perna da policy faria 119
   fornecedores e 7 clientes **sumirem da tela** para as organizações que não são as donas.
2. **As quatro organizações do banco são do mesmo cliente** (Alpa Construtora, ALPA
   Empreendimentos, SPE Garden Cambuhy e uma pessoal). Ou seja: hoje os 127 registros circulam
   dentro do grupo que os possui — **não há vazamento em curso**. O defeito vira vazamento real no
   dia em que o segundo cliente entrar no SaaS.

Juntando: remover agora **quebra uma funcionalidade em uso para corrigir um vazamento que hoje não
atinge ninguém**. É a troca errada. Mas deixar como está é uma bomba-relógio armada para o
onboarding do próximo cliente.

**Nova recomendação (D1-bis), a confirmar:**

| Opção | O que faz | Custo | Quando |
|---|---|---|---|
| **A — recomendada** | Criar `supplier_org_shares` / `client_org_shares` espelhando a tabela `employee_org_shares`, que **já existe** neste banco e é exatamente o padrão certo (compartilhamento explícito, com destino). Migrar os 127 registros e trocar a policy para `is_org_member(organization_id) OR EXISTS (<share> onde is_org_member(destino))`. | ~meio dia | Antes do 2º cliente |
| B — paliativo | Restringir `is_shared` a organizações que compartilham ao menos um membro com a dona. Hoje preserva tudo (todas têm o mesmo owner) e barra terceiros. | ~1h | Agora |
| C — o que D1 dizia | Remover a perna. | minutos | Quebra a tela hoje |

**Recomendo A**, com **B como ponte** se houver qualquer previsão de onboarding antes de A ficar
pronta. Enquanto nenhuma das duas subir, vale a trava de processo: **não entra segundo cliente no
SaaS com este item aberto.**

- **Como saberei que terminou (para A ou B):** `provas/poc-c1-05-is-shared-cross-tenant.sql` mostra
  `0 / 0 / 0` para um usuário sem vínculo nenhum, **e** um membro de uma organização do grupo
  continua vendo os 119 fornecedores compartilhados na tela de Fornecedores.

**1.4 · `supabase/migrations/aplicar_20270918000004_revoke_public_rpcs_portal.sql`** — **C3-01** — ✅ **FEITO**
- **O que mudou:** `REVOKE EXECUTE ... FROM PUBLIC, anon` nas 8 funções, preservando
  `GRANT ... TO authenticated`. Só privilégio — nenhum corpo de função foi tocado, então o risco de
  alterar comportamento de quem já está logado é zero.
- **Verificado:** `provas/poc-c3-01-token-portal-anon.sql` agora falha com
  `42501: permission denied for function client_portal_generate_token`; consulta a `pg_proc` mostra
  `anon=false / authenticated=true` nas 8.

**1.4b · `supabase/migrations/aplicar_20270918000007_rpcs_portal_exigem_vinculo.sql`** *(novo, pendente)* — **C3-01 (defesa em profundidade)**
- **O que muda:** exigir vínculo com a organização **dentro** do corpo das 6 funções emissoras —
  `is_org_member(p_org_id)` mais a validação de que o titular (`p_client_id`, `p_broker_id`, …)
  pertence de fato a `p_org_id`. Sem isso, um membro autenticado da organização A ainda consegue
  emitir token de um cliente da organização B.
- **Por que ficou separado da 1.4:** exige reescrever o corpo das funções, e o `REVOKE` sozinho já
  eliminou o vetor anônimo — que era a parte crítica. Separar deixou o passo crítico sem risco.
- **A decidir antes de escrever:** `is_org_member` (qualquer membro gera link de portal) ou
  `is_org_manager` (só owner/admin)? Preciso mapear quem usa a tela de geração de link antes de
  apertar para manager e quebrar o fluxo de alguém.
- **Como sei que terminou:** membro da organização A recebe erro ao passar um `p_client_id` da B;
  gerar link pela tela de admin continua funcionando para quem já fazia isso.

**1.5 · `supabase/migrations/aplicar_20270918000005_portal_colaborador_por_token.sql`** *(novo)* — **C3-02 (ampliado)**
- **O que muda:** criar as variantes `fn_portal_*(p_token text)` das 7 funções de leitura, que
  derivam o `employee_id` de `portal_tokens` (validando `is_active` e `expires_at`) — mesmo desenho
  que `fn_portal_get_ged_documents(p_token)`, que já existe e é usado pelo Portal do Cliente. Depois,
  `REVOKE EXECUTE ... FROM PUBLIC, anon` nas 7 variantes antigas por `p_employee_id`.
- **Como sei que terminou:** `provas/poc-c3-02-portal-rpcs-anon.sql` passa a falhar por permissão
  em todas as 7; as novas `fn_portal_*(p_token)` devolvem os mesmos dados para um token válido e
  erro para token expirado/inativo.
- **⚠️ Acoplamento:** este item **quebra o Portal do Colaborador** até o item 3.6 subir. Aplicar os
  dois na mesma janela (ver **D2**).

---

### Fase 2 — P2: Edge Functions

**2.1 · `supabase/functions/_shared/auth.ts`** *(novo)*
- **O que muda:** helper único `exigirMembro(req, organizationId)` que valida o JWT com o cliente
  anon, consulta `organization_members` por `organization_id` + e-mail/uid e devolve o papel, ou
  lança 403. Extraído de `invite-member/index.ts:41-60`, que é o único ponto do sistema que já faz
  isso certo. Variante `exigirGestor(...)` para owner/admin.
- **Como sei que terminou:** o módulo existe, tem teste unitário e é importado pelos itens 2.3 a 2.7.

**2.2 · `supabase/functions/_shared/html.ts`** *(novo)*
- **O que muda:** `escapeHtml()` e `escapeAttr()` para uso na montagem de e-mail.
- **Como sei que terminou:** teste cobrindo `<`, `>`, `"`, `'`, `&` e uma `<a href>` injetada.

**2.3 · `supabase/functions/asaas-charge/index.ts`** — **C2-03, C3-05**
- **O que muda:** chamar `exigirMembro(req, organization_id)` logo após `getUser()`; restringir
  `body.email` da action `resend` aos endereços já cadastrados do cliente.
- **Como sei que terminou:** chamada com `organization_id` de outra org → 403; `resend` com e-mail
  fora do cadastro → 422; emissão e cancelamento legítimos continuam funcionando.

**2.4 · `supabase/functions/asaas-payment/index.ts`** — **C2-03**
- **O que muda:** mesmo helper, mesma posição.
- **Como sei que terminou:** `quote`, `pay` e `cancel` com `organization_id` alheio → 403; fluxo
  legítimo de pagamento de boleto inalterado.

**2.5 · `supabase/functions/sign-contract/index.ts`** — **C2-03, C3-03**
- **O que muda:** (a) `exigirMembro`; (b) antes de cada `update`, carregar a linha alvo
  (`contract_document_versions` / `contract_addendums` / `contracts` / `commercial_deals`) e conferir
  o `organization_id`; (c) na action `status`, localizar primeiro a linha local que tem aquele
  `signature_token` dentro da organização do chamador; (d) mover a action `webhook` para uma função
  própria autenticada por segredo compartilhado com o ZapSign.
- **Como sei que terminou:** enviar `contractId` de outra org → 403; `status` com token alheio →
  403; a rota de webhook não aceita mais JWT de usuário; envio e retorno de assinatura funcionam
  ponta a ponta com o ZapSign.

**2.6 · `supabase/functions/send-bi-report/index.ts`** — **C2-02**
- **O que muda:** `exigirMembro`; destinatários derivados de `bi_report_schedules` da organização em
  vez de virem do corpo; HTML montado no servidor; `scheduleId` filtrado por `organization_id`.
- **Como sei que terminou:** destinatário fora do agendamento → 400; `htmlBody` do corpo é ignorado;
  o envio agendado legítimo continua chegando com o mesmo layout.

**2.7 · `supabase/functions/sinapi-import/index.ts`** — **C2-01**
- **O que muda:** exigir papel privilegiado (o dado é global — usar superadmin, ou owner/admin de
  qualquer org conforme decisão) antes do `upsert` com `service_role`.
- **Como sei que terminou:** JWT de usuário comum → 403; owner/admin importa a competência
  normalmente; `sinapi_references` registra a competência ao fim do último lote.

**2.8 · `supabase/functions/asaas-webhook/index.ts`** — **C3-04**
- **O que muda:** inverter para fail-closed — se `ASAAS_WEBHOOK_TOKEN` estiver vazia, responder 503
  e não processar; comparação em tempo constante; remover o log das linhas 32-33 que imprime
  prefixo/sufixo do token.
- **Como sei que terminou:** sem a variável → 503 e nenhuma linha alterada; token errado → 401;
  webhook real do Asaas continua dando baixa; `grep` no arquivo não acha mais `mask(webhookToken)`.

**2.9 · `supabase/functions/labor-portal-ged-download/index.ts`** — **C3-02**
- **O que muda:** trocar o parâmetro `employeeId` por `token`, lendo `portal_tokens` e derivando o
  `employee_id` — mesmo desenho de `academy-portal-media/index.ts:25-35`.
- **Como sei que terminou:** requisição sem token → 401; token de um colaborador não baixa documento
  de outro; token expirado → 403; o Portal do Colaborador baixa os próprios documentos.

**2.10 · `supabase/functions/notify-broker-proposal/index.ts`** — **C3-06, C5-03**
- **O que muda:** exigir `Authorization: Bearer <service_role>` (padrão das funções de cron) ou
  sessão válida com associação; aplicar `escapeHtml` em `proposal.notes`, `buyer_name` e
  `broker_email`.
- **Como sei que terminou:** chamada sem credencial → 401; proposta com `<a href>` em `notes` chega
  ao e-mail como texto literal; o e-mail legítimo mantém o layout.

**2.11 · `supabase/functions/notify-opportunity-interest/index.ts`** — **C3-06, C5-03**
- **O que muda:** idem 2.10, para `opp.title`, `opp.subtitle`, `contact_name`, `contact_phone` e
  `message`; validar `contact_email` como e-mail antes de usá-lo em `href`; truncar `message`.
- **Como sei que terminou:** interesse com aspas e tag em `message` chega escapado; `contact_email`
  inválido não vira `href`; rate limiting por `(organizationId, interestId)` em vigor.

**2.12 · `supabase/functions/partner-portal-upload/index.ts`** — **C3-07**
- **O que muda:** no ramo `target === 'invoice'`, validar que `contractId` pertence ao workspace do
  token antes de montar o caminho; allowlist de content-type (`application/pdf` + imagens) em vez de
  confiar em `file.type`.
- **Como sei que terminou:** upload com `contractId` de outro workspace → 403; upload `text/html` →
  400; envio de NF pelo Portal do Parceiro continua funcionando.

---

### Fase 3 — P2: frontend (XSS e gate de papel)

**3.1 · `package.json`**
- **O que muda:** acrescentar `dompurify` e `@types/dompurify`.
- **Como sei que terminou:** `npm install` limpo; `npm run build` passa.

**3.2 · `utils/sanitizeHtml.ts`** *(novo)*
- **O que muda:** wrapper único do DOMPurify com allowlist de tags/atributos, proibindo event
  handlers e `javascript:` em `href`/`src`.
- **Como sei que terminou:** `__tests__/sanitizeHtml.test.ts` cobre `<img onerror>`, `<script>`,
  `<svg onload>` e `href="javascript:"`, e preserva negrito, lista e link `http`.

**3.3 · `components/academy/AcademyLessonPlayer.tsx:182`** — **C5-01**
- **O que muda:** passar `lesson.conteudo_html` pelo helper antes do `dangerouslySetInnerHTML`.
- **Como sei que terminou:** aula com `<img src=x onerror=alert(1)>` renderiza sem disparar;
  aula com HTML legítimo continua idêntica.

**3.4 · `components/ContractDetailView.tsx:892`** — **C5-02**
- **O que muda:** sanitizar `rendered` antes de `container.innerHTML = rendered`.
- **Como sei que terminou:** template com `<img onerror>` não dispara ao gerar o PDF; o PDF gerado a
  partir de template legítimo permanece visualmente idêntico ao atual.

**3.5 · `components/ContractTemplateManager.tsx:251` e `components/DunningModule.tsx:245`** — **C5-04**
- **O que muda:** mesmo helper nos dois previews.
- **Como sei que terminou:** `grep` por `dangerouslySetInnerHTML` no repositório não retorna nenhuma
  ocorrência que não passe por `sanitizeHtml` (exceto os dois `<style>` com constante).

**3.6 · `components/LaborPortal.tsx:78-124` e `services/atsService.ts`** — **C3-02 (frontend)**
- **O que muda:** trocar as 5 chamadas `portalRpc<...>('portal_get_*', employeeId)` pelas variantes
  `fn_portal_*(p_token)` criadas em 1.5; o portal passa a guardar o token do link em vez do
  `employeeId`.
- **Como sei que terminou:** o Portal do Colaborador abre por link com token e mostra folha, ponto,
  ausências, treinamentos e documentos; abrir com token expirado mostra mensagem de link inválido;
  não resta nenhuma chamada com `employeeId` cru.
- **⚠️ Sobe junto com 1.5** (ver **D2**).

**3.7 · `components/DatabaseExplorer.tsx:1621`** — **C2-01 (lado UI)**
- **O que muda:** esconder o botão de importação SINAPI para quem não tem papel privilegiado —
  coerência com o gate de servidor do item 2.7, não substituto dele.
- **Como sei que terminou:** usuário comum não vê o botão; owner/admin vê e importa.

---

### Fase 4 — P3: higiene e superfície residual

**4.1 · `supabase/migrations/aplicar_20270918000006_rls_anon_remanescentes.sql`** *(novo)* — **C1-03, C1-04**
- **O que muda:** `DROP` das policies `Allow anon all on opura_cno_areas` e
  `... on opura_cno_reductions`; reescrever as duas de `payment_types` com
  `is_org_member(organization_id)`, preservando linhas globais (`organization_id IS NULL`).
- **Como sei que terminou:** nenhuma policy com `roles={anon}` e `qual=true` nessas tabelas;
  usuário do tenant A não altera `payment_types` do tenant B; seeds globais seguem visíveis.

**4.2 · Bucket `documents` (Supabase Storage)** — **C3-07 (lado storage)**
- **O que muda:** definir `allowed_mime_types` e `file_size_limit`; avaliar torná-lo privado com URL
  assinada, no padrão já adotado para `opura-docs`.
- **Como sei que terminou:** `storage.buckets` mostra os dois campos preenchidos; upload de
  `text/html` recusado pelo próprio storage; anexos existentes continuam abrindo.

**4.3 · `check_suppliers.js:3-4`** — **C4-01**
- **O que muda:** trocar os literais por `process.env`, como nos demais scripts da raiz; ou mover
  para `_dev_scripts/` (já no `.gitignore`) e remover do índice do git.
- **Como sei que terminou:** `git grep 'sb_publishable_'` não retorna nada em código versionado.

**4.4 · `supabase/migrations/20260224000002_setup_billing_cron.sql` e `20261118000011_task_alert_sent_at.sql`** — **C4-02**
- **O que muda:** migration nova que reagenda os dois jobs lendo o segredo de
  `vault.decrypted_secrets` — padrão que `20260514000002_quality_sla_cron.sql:21` já usa —, sem
  fallback literal. Não editar as migrations antigas (já aplicadas).
- **Como sei que terminou:** `cron.job` mostra os dois jobs com o header vindo do Vault; uma execução
  manual retorna 200; nenhum literal `INTERNAL_SECRET_HERE` / `CONFIGURE_SERVICE_ROLE_KEY` no
  agendamento vigente.

**4.5 · `supabase/functions/process-billing-ruler/index.ts:9`** — **C4-03**
- **O que muda:** falhar explicitamente sem `FRONTEND_URL`, em vez de cair no project ref literal.
- **Como sei que terminou:** `grep` por `oxedkknreghxrgenyjiu` em `supabase/functions/` não retorna
  nada; a função continua respondendo ao cron.

---

### Fase 5 — P4: travas para nenhum destes voltar

**5.1 · `__tests__/rlsPolicies.test.ts`** *(novo)*
- **O que muda:** teste que consulta `pg_policies` e falha se existir policy com `qual='true'` para
  `anon`, ou policy com `OR is_shared` sem escopo, fora de uma lista `ANISTIADOS` fechada — mesmo
  desenho de catraca do `migrationsPrefixo.test.ts`.
- **Como sei que terminou:** roda no CI; falha se eu recriar qualquer uma das policies removidas.

**5.2 · `__tests__/secdefAcl.test.ts`** *(novo)*
- **O que muda:** teste que falha se alguma função `SECURITY DEFINER` do schema `public` tiver
  `EXECUTE` para `PUBLIC`/`anon` fora de uma allowlist explícita (as RPCs de portal por token e as
  funções públicas do marketplace).
- **Como sei que terminou:** roda no CI; falha ao criar RPC nova sem o `REVOKE`.

**5.3 · `__tests__/sanitizeHtml.test.ts` + `scripts/check-xss-sinks.sh`** *(novos)*
- **O que muda:** o script falha se aparecer `dangerouslySetInnerHTML` ou `.innerHTML =` sem passar
  por `sanitizeHtml`.
- **Como sei que terminou:** exit ≠ 0 ao adicionar um sink cru; exit 0 no estado corrigido.

**5.4 · `docs/security-audit/provas/` + `.github/workflows/ci.yml`**
- **O que muda:** as quatro provas viram teste de regressão documentado; o `README.md` de `provas/`
  passa a registrar o resultado esperado **depois** da correção (falha por RLS / permissão negada).
- **Como sei que terminou:** rodar as quatro provas devolve erro de permissão em todas.

**5.5 · `docs/planos/README.md` ou `CLAUDE.md`**
- **O que muda:** registrar a regra que faltava — *toda migration que cria função entra com
  `REVOKE EXECUTE ... FROM PUBLIC`*, e *toda perna de `OR` numa policy tem de ser lida como "isto
  sozinho basta para liberar a linha?"*. As duas causas-raiz dos achados críticos.
- **Como sei que terminou:** a regra está escrita e referenciada pelos testes 5.1 e 5.2.

---

## ✅ Janela de deploy executada — 2026-09-02

O usuário confirmou (*"a"*) que os 5 commits da frente paralela podiam ir ao ar. O bloqueio
anterior deixou de existir: a árvore foi commitada (o meu trabalho ficou isolado em `496abdb`,
27 arquivos, sem mistura) e a branch estava em sincronia com o remoto.

Sequência executada, na ordem do `RUNBOOK_DEPLOY.md`:

| # | Passo | Resultado |
|---|---|---|
| 1 | `npm run typecheck` + `npm run build` | limpos (build em 38s) |
| 2 | `supabase functions deploy labor-portal-ged-download` | publicada |
| 3 | `vercel deploy --prod --scope altairs-projects-aa74deda --yes` | `readyState: READY` |
| 4 | Validação do bundle publicado | HTTP 200; URL do Supabase presente; sem erro de env |
| 5 | `aplicar_20270918000010` (1.5b) | aplicada |
| 6 | `provas/poc-c3-02-portal-rpcs-anon.sql` | **passou a falhar** — `permission denied` nas 5 RPCs |
| 7 | `provas/regressao-c3-02-portal-por-token.sql` | token válido devolve dados; inválido dá `PORTAL_TOKEN_INVALIDO` |

Sobre a etapa 4: o checklist do runbook manda procurar mojibake, e minha primeira verificação
acusou. Era **falso positivo do meu próprio `grep`** — `grep -P` não funciona no locale deste
ambiente. Refeita por codepoint: `Inteligência` = U+00EA, `Gestão` = U+00E3, `Governança` = U+00E7,
`Organizações` = U+00E7 U+00F5, zero U+FFFD e zero sequências de mojibake. Encoding correto.

**C3-02 está fechado.** Era o último dos quatro achados críticos.

---

## Estado

Nada iniciado — este documento é o plano, aprovado ou não.

### Fase 0 — corrigir o relatório ✅ 2 de 2
- [x] 0.1 `achados.py` — escopo real de C3-01 (8 funções) e C3-02 (crítica); PDF regenerado com 4 críticos
- [x] 0.2 `provas/poc-c3-02-portal-rpcs-anon.sql` arquivada

### Fase 1 — P1, só SQL · **5 de 6** (só 1.3 em aberto, aguardando D1-bis)
- [x] 1.1 `aplicar_20270918000001` — organization_members INSERT · ataque bloqueado (42501), gestão de membros intacta (1/1/1)
- [x] 1.2 `aplicar_20270918000002` — invoices · anon de 829 → 0; 828/829 com organização; membro vê 810 da própria org e 0 de outras
- [ ] 1.3 is_shared — **BLOQUEADO, D1 precisa ser revisto** (ver Fase 1.3 acima)
- [x] 1.4 `aplicar_20270918000004` — REVOKE nas 8 RPCs · anon negado nas 8, authenticated preservado
- [ ] 1.4b `aplicar_20270918000007` — vínculo dentro das RPCs *(a decidir: member ou manager)*
- [x] 1.5a `aplicar_20270918000005` — 7 variantes `fn_colab_portal_*(p_token)` criadas
- [x] 1.5b `aplicar_20270918000010` — `REVOKE ... FROM anon` nas 7 por `p_employee_id` · **C3-02 FECHADO**

### Fase 2 — Edge Functions
- [ ] 2.1 `_shared/auth.ts` · [ ] 2.2 `_shared/html.ts`
- [ ] 2.3 asaas-charge · [ ] 2.4 asaas-payment · [ ] 2.5 sign-contract
- [ ] 2.6 send-bi-report · [ ] 2.7 sinapi-import · [ ] 2.8 asaas-webhook
- [x] 2.9 labor-portal-ged-download — **publicada** · [ ] 2.10 notify-broker-proposal
- [ ] 2.11 notify-opportunity-interest · [ ] 2.12 partner-portal-upload

### Fase 3 — frontend
- [ ] 3.1 package.json · [ ] 3.2 `utils/sanitizeHtml.ts`
- [ ] 3.3 AcademyLessonPlayer · [ ] 3.4 ContractDetailView
- [ ] 3.5 ContractTemplateManager + DunningModule
- [x] 3.6 LaborPortal + atsService — **publicado**
- [ ] 3.7 DatabaseExplorer

### Fase 4 — higiene ✅ 5 de 5
- [x] 4.1 `aplicar_20270918000006` — policies anon de `opura_cno_*` removidas; `payment_types` recortada por organização
- [x] 4.2 `aplicar_20270918000008` — bucket `documents` com 5 tipos permitidos e limite de 50 MiB (levantei antes o que havia: só PDF e PNG, máx. 11 MB — nada existente ficou fora)
- [x] 4.3 `check_suppliers.js` — credencial cravada trocada por `process.env`, com erro claro se faltar
- [x] 4.4 `aplicar_20270918000009` — **corrigiu uma falha ativa**, ver abaixo
- [x] 4.5 `process-billing-ruler/index.ts` — project ref removido do fallback de CORS *(código; sobe no próximo deploy)*

### Fase 5 — travas · 4 de 5
- [x] 5.1+5.2 `__tests__/segurancaMigrations.test.ts` — as duas travas planejadas viraram **uma** só: os três padrões (policy sem condição, policy anon com `true`, SECURITY DEFINER sem REVOKE) são detectáveis no mesmo lugar. Corte de histórico em `20270918000000`, sem BASELINE gigante. **Provada**: cria migration ruim → falha; remove → passa.
- [x] 5.4 `scripts/check-rls-postura.sh` — 6 verificações contra o banco remoto. Complementa o teste: o CI não tem credencial, e é no banco que o drift mora.
- [x] 5.5 `CLAUDE.md` › **REGRA OBRIGATÓRIA #7** — as duas perguntas que faltavam ("esta perna do OR sozinha basta?" e "quem mais pode executar?")
- [ ] 5.3 `sanitizeHtml.test.ts` + `check-xss-sinks.sh` — **depende da Fase 3**, bloqueada pelo deploy

---

## Achado operacional descoberto na Fase 4.4 (2026-09-02)

O achado C4-02 previu que os placeholders fariam os jobs "falharem em silêncio".
Ao aplicar a fase, a inspeção do banco mostrou que **já estava acontecendo**:

| Job | Estado encontrado |
|---|---|
| `task-alert-notifier` | URL literal `https://SEU_PROJECT_REF.supabase.co`, nunca substituída. `net._http_response`: **90 tentativas em 90 minutos, todas "Couldn't resolve host name"**. Rodava a cada minuto desde a migration `20261118000011`. **Nunca funcionou** — nenhum alerta de prazo de tarefa jamais saiu. |
| `daily-billing-ruler` | Responde **401** (2 execuções na janela). |

O que escondia isso: `cron.job_run_details` marcava tudo como **`succeeded`**,
porque pg_net é assíncrono e o cron só enfileira a chamada. O resultado HTTP real
só existe em `net._http_response`, que ninguém consultava. É o padrão
"erro engolido = número plausível".

**Depois da correção:** `task-alert-notifier` passou a responder **HTTP 200** (6
execuções em 6 minutos, todas 200). A verificação nº 6 do
`scripts/check-rls-postura.sh` existe para que isso não volte a passar despercebido.

⚠️ **Pendente, e é ação manual sua:** o `daily-billing-ruler` ainda responde 401.
Como o `task-alert-notifier` usa o mesmo segredo do Vault e responde 200, o token
está correto — a causa do 401 do billing está na própria function e precisa de
uma olhada à parte. Não investiguei a fundo para não sair do escopo desta fase.

---

## Verificação de ponta a ponta

Depois de cada fase, e obrigatoriamente ao fim:

```bash
cd orçacloud-saas
npm run ci                                              # typecheck + testes + build
npx vitest run __tests__/orgContextGuard.test.ts        # catraca existente
npx vitest run __tests__/migrationsPrefixo.test.ts      # prefixos das migrations novas
npx vitest run __tests__/rlsPolicies.test.ts            # catraca nova (5.1)
npx vitest run __tests__/secdefAcl.test.ts              # catraca nova (5.2)

# As quatro provas devem passar a FALHAR por permissão:
for p in docs/security-audit/provas/poc-*.sql; do
  npx supabase db query --linked -f "$p"
done
```

E, na interface (`/rodar-app`), confirmar que nenhum fluxo legítimo quebrou:

1. Criar organização nova → o criador aparece como `owner`.
2. Editar membros de uma organização como `admin` → salva.
3. Portal do Fornecedor: listar e enviar nota.
4. Portal do Colaborador por link com token: folha, ponto, ausências, documentos.
5. Portal do Cliente e do Corretor: gerar link pela tela de admin e abrir.
6. Emitir e cancelar cobrança no Asaas; gerar PDF de contrato a partir de template.
7. Academia: abrir aula do tipo TEXTO com HTML legítimo.

**Nenhuma fase pode ser reportada como concluída com item em aberto.** Se sobrar item, reportar
"Fase X: N de M" — REGRA OBRIGATÓRIA #6.

---

## Lote novo de achados — descoberto em 2026-09-02, pela correção de um bug meu

Ao ajustar o limiar do `scripts/check-rls-postura.sh` (ele usava `> 2` e engolia resultado de
uma linha só), a **verificação nº 2 passou a acusar 6 policies** que a auditoria original não
pegou. A causa é uma falha de método minha, e vale escrita:

> A varredura da auditoria buscou `cmd IN ('ALL','SELECT') AND qual='true'`. Em policy de
> **INSERT não existe `qual`** — a expressão vive em `with_check`. Ou seja: o filtro era cego
> para exatamente a categoria de policy que permite ESCRITA sem condição. Foi assim que o
> C1-01 quase escapou (ele só apareceu porque eu estava lendo `organization_members` por
> outro motivo).

As 6, com o que já verifiquei de estrutura:

| Tabela | Policy | Tem coluna de org? | Leitura também aberta? | Leitura inicial |
|---|---|---|---|---|
| `custom_databases` | `authenticated_write_custom_databases` (ALL) | não | **sim (2)** | leitura E escrita cross-tenant |
| `custom_items` | `authenticated_write_custom_items` (ALL) | não | **sim (2)** | idem |
| `broker_portal_chat_messages` | `broker_messages_insert` | não | sim (1) | conversa de corretor visível/gravável entre tenants |
| `rubrics` | `rubrics_insert_all` | não | sim (1) | rubricas de folha — pode ser catálogo global de propósito |
| `broker_portal_leads` | `broker_leads_insert` | **sim** | não | leitura escopada; dá para INJETAR lead em org alheia |
| `organizations` | `Authenticated users can create organizations` | — | não | criar a própria organização; provavelmente legítimo |

**Não corrigi nenhuma.** A lição do C1-05 (`is_shared`) foi justamente essa: recomendei remover
uma perna de policy sem antes checar se a funcionalidade estava viva, e estava. Antes de mexer,
cada uma precisa da mesma pergunta — *o app depende dessa visibilidade?* `rubrics` e
`custom_items` têm cara de catálogo compartilhado de propósito; `custom_databases` não.

**Próximo passo sugerido:** tratar como um C1-06 no relatório, com o mesmo rito — cruzar cada
tabela com os `services/` que a consultam, medir o impacto real (lembrando que hoje as 4
organizações são do mesmo cliente) e só então decidir entre escopar ou manter.

---

## Execução de 2026-09-02 (tarde) — lote novo + Fase 2 parcial

### Investigação do lote novo: das 6, só 2 eram achado

O rito de cruzar cada tabela com os `services/` mudou a leitura de metade da lista:

| Tabela | Veredito | Por quê |
|---|---|---|
| `organizations` | **não é achado** | O INSERT aberto é a criação self-service da PRÓPRIA organização. SELECT (`is_org_member(id)`), UPDATE (owner/admin) e DELETE (owner) já são escopados. |
| `broker_portal_chat_messages` | **corrigido** | `SELECT USING(true)` — qualquer autenticado lia toda conversa de corretor de todos os tenants. |
| `broker_portal_leads` | **corrigido** | `INSERT WITH CHECK(true)` — dava para injetar lead na carteira alheia (leitura já era escopada). |
| `custom_databases` | adiado | **Não têm coluna de tenant nenhuma.** Não é policy frouxa, é modelagem: são catálogos globais. Trocar para `is_org_member(...)` sem a coluna esconderia o dado de todo mundo. |
| `custom_items` | adiado | idem |
| `rubrics` | adiado | idem — e 2 das 33 são `is_clt_mandatory`, o que sugere catálogo nacional legítimo misturado com customização por empresa. |

`aplicar_20270918000011` corrigiu as duas do Portal do Corretor. Foi **risco zero**: as três
tabelas (`_leads`, `_chat_messages`, `_chat_channels`) estão vazias e nenhum serviço ou componente
as referencia — é uma feature de 2026-03 cujo consumidor nunca foi escrito. Melhor momento possível
para acertar a regra: antes de existir dado.

**As três adiadas juntam-se ao C1-05** — é o mesmo problema (catálogo sem dono), e a mesma
solução (dar coluna de tenant + decidir quem herda o que já existe). Vira um item só.

### Bônus: fechada a ressalva que a 20270208000002 deixou por escrito

Aquela migration preservou 4 policies `anon` e anotou, nas linhas 30-32, que duas delas
(`invoices` e `investor_opportunity_competitors`) usavam `qual=true` "sem escopo real →
possível superexposição; avaliar à parte". `invoices` virou o C1-02.
`aplicar_20270918000012` fecha a outra: a tabela guarda inteligência de mercado
(`price_per_m2`, `sales_velocity_pct`, `appreciation_pct`) e **tem** `organization_id` — o
recorte só nunca foi escrito. Segura: está vazia, todos os consumidores são telas internas
autenticadas, e a RPC `get_public_marketplace` não a referencia.

`sinapi_items` continua pública de propósito (catálogo de preços do governo, 15.867 itens).

### Fase 2 — 4 de 12

`supabase/functions/_shared/auth.ts` extrai o bloco de `invite-member/index.ts:41-60`, que era o
único ponto do sistema que fazia o ciclo completo. Aplicado em:

- **asaas-charge** — `exigirMembro` + C3-05 (o override de e-mail no `resend` agora só aceita
  endereço já cadastrado do cliente)
- **asaas-payment** — `exigirMembro` (aqui o efeito era dinheiro saindo)
- **send-bi-report** — `exigirMembro` + destinatários validados contra membros da organização e
  agendamentos dela; `scheduleId` filtrado por `organization_id`
- **sinapi-import** — `exigirGestorDeQualquerOrg` (o dado é global, não tem organização dona)

Publicadas e testadas ao vivo: as quatro devolvem **401 com a chave anon pura**, e o item
malicioso enviado ao `sinapi-import` **não entrou** (`sinapi_items where code='HACK'` = 0).

### ⚠️ Bug pré-existente encontrado no caminho: `bi_report_schedules` não existe

Ao validar destinatários, descobri que a tabela `bi_report_schedules` **não existe no banco** —
nem como tabela, nem como view (verificado em `pg_class`). A tabela real é `report_schedules`,
com `organization_id`, `recipients` (text[]) e `last_sent_at`.

Consequências, ambas fora do escopo de segurança:

1. O `UPDATE` de `last_sent_at` no `send-bi-report` **nunca funcionou** — o erro era descartado.
   Corrigi de passagem, já que estava editando a função.
2. **`services/biReportService.ts` está quebrado**: `listSchedules` consulta
   `bi_report_schedules` com um schema diferente do que existe (`org_id`, `hour_utc`,
   `include_dre`, `next_send_at`). `components/BIReportScheduler.tsx:59` chama esse método, então
   a tela do agendador de relatórios BI deve estar estourando `42P01` em produção.
   **Não corrigi** — decidir qual dos dois schemas é o canônico é decisão de produto, não de
   segurança.

---

## Fase 2 concluída (12/12) e Fase 3 concluída (7/7) — 2026-09-02

### Fase 2 — Edge Functions

Além das 4 já registradas acima:

- **`_shared/html.ts`** — `escapeHtml`, `escapeAttr`, `urlSegura`, `emailValido`, `truncar`.
  Duas funções separadas para texto e atributo de propósito: usar a de texto onde cabia a de
  atributo é o erro clássico.
- **asaas-webhook** — invertido para fail-closed (sem `ASAAS_WEBHOOK_TOKEN` → 503, nunca "passa
  direto"), comparação em tempo constante, e removido o log que imprimia prefixo/sufixo do
  segredo a cada requisição.
- **notify-broker-proposal / notify-opportunity-interest** — gate de `Bearer <service_role>`
  (mesmo das funções de cron) + escape em toda interpolação. `contact_email` só vira `mailto:`
  se passar por `emailValido`; `contact_phone` deixou de ser `<a href="tel:">`.
- **sign-contract** — `exigirMembro` + verificação de que o objeto alvo pertence à organização
  (as quatro tabelas têm `organization_id` direto); `action: 'status'` agora exige que o
  `signatureToken` corresponda a uma linha local da organização antes de consultar o ZapSign; e a
  `action: 'webhook'` saiu do bloco autenticado para função própria com gate de service_role.
- **partner-portal-upload** — `contractId` validado contra o workspace do token (via
  `contracts.supplier_id` × `partner_workspaces.supplier_id`) e allowlist de content-type,
  espelhando o `allowed_mime_types` do bucket.

### Fase 3 — XSS

- `dompurify@3.4.14` + `utils/sanitizeHtml.ts` (allowlist de tags/atributos, hook de
  `rel="noopener"`), aplicado nos 4 sinks.
- `__tests__/components/sanitizeHtml.test.tsx` — 14 testes, metade de ataque e metade de
  preservação.
- `scripts/check-xss-sinks.sh` — falha o build em sink novo sem `sanitizeHtml`. Provado nos dois
  sentidos (exit 1 com sink cru, exit 0 sem).
- `components/DatabaseExplorer.tsx` — gate de papel no botão de importação SINAPI, explicitamente
  documentado como usabilidade, não segurança (quem manda é o servidor).

### Três correções de rumo que os testes forçaram

1. **`ALLOWED_URI_REGEXP` quebrava tabela.** Eu havia configurado um regex de URL achando que
   restringia `href`/`src`. O DOMPurify aplica esse regex ao valor de **todo** atributo: `colspan="2"`
   e `border="1"` reprovavam e sumiam — todo template de contrato perderia a formatação, em
   silêncio. Quem pegou foi o teste de **preservação**, não o de ataque. Removido; o default do
   DOMPurify já bloqueia `javascript:`, `data:` em `href` e `vbscript:`.

2. **Meu teste de `data:` estava errado, não o código.** Eu afirmava que `data:` deveria sumir de
   `<img src>`. Não deve: o navegador carrega SVG por `<img>` em modo estático, sem executar
   script — e o DOMPurify libera `data:` só em `DATA_URI_TAGS`, nunca em `<a href>` (comprovado
   por teste). O teste foi reescrito para afirmar a propriedade real.

3. **`verify_jwt` resetado no redeploy.** O `asaas-webhook` era publicado com `verify_jwt: false`
   (correto — o Asaas manda `asaas-access-token`, não JWT). Meu `functions deploy` sem flag
   **resetou para true**, e o webhook real teria passado a ser recusado pela plataforma.
   Republicado com `--no-verify-jwt` e testado: POST anônimo agora recebe 401 da MINHA lógica
   ("Invalid webhook token"), não da plataforma. ⚠️ Fica a regra: **`asaas-webhook` e
   `task-alert-notifier` sempre com `--no-verify-jwt`.**

### Achados adicionais registrados (não corrigidos aqui)

- **`OrganizationRole` não tinha `'owner'`** — o papel de maior privilégio, com 3 linhas no banco,
  e o que `is_org_manager()` aprova junto de `admin`. Comparar `role === 'owner'` dava erro de
  compilação, o que empurra quem escreve um gate a checar só `'admin'` e **excluir os donos**.
  Corrigido em `types/users.ts` (o typecheck seguiu limpo, sem cascata). `'viewer'` continua no
  tipo mas não existe no banco.
- **`environmentMatchGlobs` do `vite.config.ts:131` é config morto no Vitest 4.** O que dá jsdom
  aos testes de componente é o docblock `// @vitest-environment jsdom` em cada arquivo. Não
  mexi — é config inócuo, mas engana quem for adicionar teste novo.
- **Dois testes de blueprint são instáveis.** Falham na suíte completa e passam isolados, com
  resultado diferente entre execuções. Confirmado com `git stash`: falham **também sem as minhas
  mudanças** (2 arquivos no baseline). São da outra frente; não investiguei.

### Situação do C3-06 (correção do relatório)

`npx supabase functions list` mostra que **`notify-opportunity-interest` NUNCA foi publicada**.
O relatório tratava as duas funções como equivalentes; na prática só a
`notify-broker-proposal` estava no ar. Em compensação, o mesmo comando desmentiu a memória do
projeto sobre `sign-contract` "nunca publicada": **ela está ACTIVE**, então o C3-03 era real e
vivo — e agora está corrigido.

---

## Fase 1.4b concluída — 2026-09-02

`aplicar_20270918000013` fecha a última correção de segurança pendente.

### Segunda correção de escopo do C3-01

Ao ler `pg_get_functiondef` das oito RPCs para escrever a guarda, descobri que **cinco já a
tinham**. O relatório afirmava que as oito emitiam token "sem verificar quem chama"; o certo é:

| Estado | Funções |
|---|---|
| **Sem guarda** (vetor anônimo real) | `client_portal_generate_token`, `broker_portal_generate_token`, `portal_generate_token` |
| Com guarda desde antes | `investor_*`, `partner_*` (generate + revoke), `supplier_*` (generate + revoke) |

As cinco já chamavam `<portal>_portal_can_manage_tokens(p_org_id)`, que exige
`role IN ('owner','admin')` e confere o titular. Como `anon` não tem `auth.uid()` nem
`auth.jwt()`, a guarda já as tornava inalcançáveis anonimamente — apesar da ACL aberta.

**O REVOKE da `aplicar_20270918000004` continua certo:** ACL aberta é defeito por si só, e era o
que separava as cinco corretas de uma linha de código. Mas o vetor anônimo real existia em três,
não em oito. A prova de conceito da auditoria explorou `client_portal_generate_token` — uma das
três de fato desprotegidas. Relatório e PDF corrigidos.

### Mudei de ideia sobre `is_org_member` × `is_org_manager`

No plano eu havia proposto `is_org_member`, para não arriscar quebrar quem gera link hoje. A
leitura das funções mudou a resposta: **o projeto já decidiu** que emitir credencial de portal é
operação de owner/admin — é o que `*_can_manage_tokens` faz nos outros cinco casos. Seguir o padrão
existente vale mais que a minha proposta original, e `is_org_manager()` é exatamente o mesmo
predicado, sem criar duas funções auxiliares quase idênticas.

### Compartilhamento preservado

A checagem de titular aceita cliente `is_shared` e colaborador com linha em `employee_org_shares`
(14 linhas) — os dois são compartilhamento deliberado entre organizações. Sem isso, esta migration
quebraria a emissão de link para eles.

### Verificado

`provas/regressao-1-4b-token-portal-por-papel.sql`, em transação abortada:

- gestor da organização → **emitiu** (sem regressão)
- membro comum da mesma organização → recusado (`not_allowed`)
- usuário sem vínculo nenhum → recusado (`not_allowed`)

E as três provas de ataque seguem falhando: `poc-c1-01` e `poc-c3-01` com `42501`, `poc-c3-02` com
`permission denied` nas cinco RPCs.

**Postura do banco: 5 das 6 verificações limpas.** A única aberta é o 401 do
`daily-billing-ruler`, que depende do segredo no Vault.

---

## C1-06 — catálogos passam a pertencer às organizações do grupo (2026-09-02)

### A decisão do dono, e o que ela exclui

> *"todas organizações significa que pertence a todas as organizações"*

Pertence às **quatro do grupo** — não a quem entrar depois. Isso descarta os dois caminhos que
o nome sugere:

- **`organization_id = NULL`** é "todo mundo". É o estado que se queria corrigir, e a REGRA #5
  já dizia: *"um NULL apareceria para todos os clientes do SaaS"*.
- **Replicar uma cópia por organização** (`forEachTargetOrg`) esbarra no schema:
  `rubrics` tem `PRIMARY KEY (code)` e `custom_items` tem `UNIQUE (code)`. A segunda cópia
  violaria a chave, e trocá-la arrastaria as 3 FKs que apontam para `rubrics(code)` —
  migração de PK em cima da folha de pagamento.

Sobra enumerar o pertencimento, que é como `employee_org_shares` (já existente) modela o mesmo
problema. E enumerar é obrigatório por outro motivo: **não há como o banco inferir "todas as
minhas organizações"** — um gatilho em `organizations` pegaria também a org do cliente #2,
porque ela também é um INSERT ali.

### Migrations

| Migration | O que faz |
|---|---|
| `...014` | `organization_id` em `custom_databases` e `rubrics`; tabelas `custom_database_org_shares` e `rubric_org_shares`; backfill de 4 vínculos por base e 124 por rubrica; policies de SELECT |
| `...015` | Remove as `FOR ALL USING(true)`; UPDATE/DELETE recortados |
| `...016` | `organization_id` nos 17 `custom_items` avulsos (legado pré-"bases") |
| `...017` | Trigger de herança + policies de INSERT escopadas, com a UI ajustada |

As 2 rubricas `is_clt_mandatory` ficam com `organization_id` NULL — seed do sistema, como as 38
categorias financeiras padrão. É o uso que a REGRA #5 reserva ao NULL.

### Mudança de UI que veio junto

`createDatabase` e `createRubric` passaram a exigir `organizationId`, resolvido com
`useOrgWriteTarget('single')` em `DatabaseManagerModal.tsx` e `LaborRubrics.tsx` — modo 'single'
porque catálogo tem UMA organização dona; o pertencimento às demais vive na tabela de vínculo,
não em cópias. `useLaborMutations.useSaveRubric` e `incentiveService.upsertIncentiveRubric`
repassam a organização na criação.

### Três erros meus que só os testes pegaram

1. **`FOR ALL USING(true)` anula a policy de leitura nova.** Depois da ...014 o teste mostrou
   todo mundo vendo tudo ainda. Policies permissivas são combinadas com **OR**: o que decide não é
   a mais restritiva, é a mais permissiva. Mesma armadilha do `OR is_shared` do C1-05, noutra
   roupagem.

2. **Minha exceção "para não quebrar nada" era o vazamento.** A policy de `custom_items` abria
   `database_id IS NULL` com o comentário *"item solto, legado: continua visível"* — e isso
   mantinha abertos **17 dos 24 itens**, a maioria da tabela. Lida isolada, a policy parecia
   razoável; quem pegou foi o teste que compara os três olhares.

3. **O teste acusou uma regressão que não existia.** `is_org_member` casa por
   `user_id = auth.uid()` quando `user_id` está preenchido (é o caso de todos), e só cai no e-mail
   quando é NULL. Meu JWT simulado só tinha `email`, então a função devolvia FALSE e o membro do
   grupo "não via nada". Faltava o `sub`.

E a trava `segurancaMigrations.test.ts` acusou a minha própria `...015`, que criava dois
`INSERT WITH CHECK (true)` "temporários". Estava certa: migration não deve conter um passo que abre
o buraco, mesmo que outra o feche depois — quem lê o histórico vê a abertura. Consolidei: o INSERT
nasce escopado na ...017.

### Verificado

`provas/regressao-catalogos-pertencem-as-orgs.sql`:

|  | bases | itens | rubricas |
|---|---|---|---|
| membro do grupo | 1 | 24 | 33 |
| autenticado sem vínculo | 0 | 0 | 2 |
| **cliente #2 simulado** | **0** | **0** | **2** |

Nada sumiu para quem é do grupo; o cliente #2 vê apenas o seed de CLT.
