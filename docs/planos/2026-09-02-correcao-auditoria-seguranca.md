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

Nomenclatura das migrations: prefixo a partir de `20270917000005` (o maior em uso hoje é
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

**1.1 · `supabase/migrations/aplicar_20270917000005_rls_organization_members_insert.sql`** *(novo)* — **C1-01**
- **O que muda:** `DROP POLICY "Authenticated users can create memberships"` e recriar como
  `WITH CHECK (is_org_manager(organization_id) OR is_superadmin())`.
  **Não é preciso criar RPC de auto-vínculo:** já verifiquei que `createOrganization` passa por
  `create_organization_v2`, que é `SECURITY DEFINER` e cujo `anon` não executa — a criação de
  organização continua funcionando sem tocar em nada.
- **Como sei que terminou:** `provas/poc-c1-01-escalada-owner.sql` passa a falhar no `INSERT` com
  violação de RLS (`42501`), em vez de chegar ao `RAISE EXCEPTION` final; criar organização nova
  pela UI continua deixando o criador como `owner`; editar membros como `admin` continua salvando.

**1.2 · `supabase/migrations/aplicar_20270917000006_rls_invoices_escopo_org.sql`** *(novo)* — **C1-02**
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
- [x] 1.1 `aplicar_20270917000005` — organization_members INSERT · ataque bloqueado (42501), gestão de membros intacta (1/1/1)
- [x] 1.2 `aplicar_20270917000006` — invoices · anon de 829 → 0; 828/829 com organização; membro vê 810 da própria org e 0 de outras
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

---

## Incluir organização nos catálogos — função + botão (2026-09-02)

Fecha a consequência operacional do C1-06: organização nova não herda catálogo.

**Por que não é gatilho automático.** Um `AFTER INSERT` em `organizations` não distingue "mais
uma empresa do grupo" de "outro cliente do SaaS" — as duas são um INSERT na mesma tabela. É
exatamente essa ausência de herança que impede o cliente #2 de herdar junto, então a inclusão
tem de ser um ato deliberado.

**`fn_incluir_org_nos_catalogos(p_org_id)`** — `aplicar_20270918000018`. Duas condições, e a
segunda é o que impede a porta dos fundos:

1. o chamador é owner/admin da organização de **destino**;
2. só entra o catálogo que o chamador **já enxerga** como membro da organização dona.

Sem a condição 2, o admin do cliente #2 chamaria a função para a própria organização e se
serviria do acervo do grupo. Com ela, a chamada até passa (ele é gestor da org dele) e **não leva
nada**.

Junto vai `fn_catalogos_da_org(p_org_id)`, que devolve o que a organização já tem — para a tela
poder dizer se falta algo.

**Botão** em `components/OrganizationList.tsx`, no menu de ações da linha: "Incluir nos catálogos
do grupo", com `useConfirm()` antes e o resultado ("N bases e M rubricas") depois.
`organizationService.incluirNosCatalogos` é a ponte. O gate de verdade é a RPC — o botão é
usabilidade.

**Verificado** (`provas/regressao-incluir-org-nos-catalogos.sql`, transação abortada):

| Cenário | Resultado |
|---|---|
| gestor do grupo → organização nova do grupo | 1 base, 31 rubricas incluídas |
| **cliente #2 → própria organização** | **0 e 0**; continua vendo 0 rubricas do grupo |
| usuário sem vínculo | `not_allowed` |

Um detalhe do teste que vale registrar: a primeira versão acusou "informe a organizacao" e parecia
regressão. Não era — os `SELECT` do bloco `DECLARE` já rodam sob RLS, e sem claims definidos ainda
não enxergam as organizações de teste, devolvendo NULL. Os ids passaram a ser capturados antes do
`SET LOCAL ROLE`.

---

## C1-05 fechado — `is_shared` passa a dizer COM QUEM (2026-09-02)

`aplicar_20270918000019`. Mesmo desenho já provado nos catálogos.

**O defeito.** Três policies terminavam em `OR is_shared` — um booleano **sem destino**. Diz que o
registro é compartilhado, não com quem. E `OR <booleano>` é verdadeiro sozinho: não era
"compartilhado com o grupo", era com todo usuário autenticado do SaaS. 127 cadastros: 119
fornecedores (49% da base), 7 clientes com CPF/CNPJ e endereço, 1 workspace.

**A correção.** `client_org_shares` e `supplier_org_shares` enumeram o destino; backfill de 4
vínculos por registro (28 e 476). `partner_workspaces` **não** ganhou tabela: tem `supplier_id` e
herda do fornecedor, que é como o `supplierService` já o materializa.

**O booleano `is_shared` fica.** É o que a UI liga/desliga e o que os serviços consultam
(`.or('organization_id.eq.X,is_shared.is.true')`). O que mudou é que agora existe a outra metade
da regra — por isso **nenhum serviço precisou mudar**: a consulta pede as compartilhadas e a RLS
devolve só as compartilhadas com quem perguntou.

**Trigger `fn_share_com_minhas_orgs`.** Ligar "compartilhado" na tela cria o destino, senão o
booleano viraria enfeite. O destino são as organizações **de quem marcou** — não "todas as que
existem". Um `CROSS JOIN organizations` num trigger incluiria a organização do cliente #2 assim que
ela existisse; assim, um cliente futuro que marque um fornecedor o compartilha com as organizações
**dele**.

**`fn_incluir_org_nos_catalogos` estendida** para cobrir os cadastros. Sem isso, uma organização
nova receberia os catálogos mas não os clientes e fornecedores compartilhados — meia inclusão, que
é pior que nenhuma porque parece completa.

### Verificado

|  | clientes | fornecedores | workspaces |
|---|---|---|---|
| membro do grupo | 38 | 229 | 7 |
| autenticado sem vínculo | **0** | **0** | **0** |
| cliente #2 simulado | **0** | **0** | **0** |

Antes da correção, as duas últimas linhas liam 7 / 119 / 1. E os vínculos cobrem as quatro
organizações igualmente (7 clientes e 119 fornecedores para cada).

`fn_incluir_org_nos_catalogos` continua sem ser porta dos fundos: gestor do grupo leva
1 base + 31 rubricas + 7 clientes + 119 fornecedores; **cliente #2 chamando para a própria
organização leva 0 em tudo**; sem vínculo recebe `not_allowed`.

### Um detalhe de idempotência

A migration falhou na segunda execução com `policy "clients_select" already exists`: eu só tinha
`DROP` do nome ANTIGO. Acrescentei o `DROP` dos nomes novos — migration aplicada à mão precisa
poder rodar duas vezes, porque em algum momento ela vai.

---

## Notas duplicadas e a trava de idempotência (2026-09-02)

Começou como "de quem é a nota órfã de R$ 10.405,33?" e terminou noutro lugar.

### Não era nota perdida, era duplicata

O `file_path` da órfã apontava para a pasta da Alpa, e as `notes` traziam
`[boleto:0357e115-…]` — um boleto **já ligado a outra linha**, com o mesmo arquivo e o mesmo
valor, criada **2 segundos depois**. A varredura por `file_path` repetido achou mais três pares:

| Arquivo | Fica (tem boleto) | Apagada | Intervalo |
|---|---|---|---|
| `161107-…-095-TIT-001.pdf` | `dae7bc66` · paid | `8a707d4b` | 1,2 s |
| `171222-…-045-TIT-002.pdf` | `6b478bc1` · paid | `dd6b3944` | 2,0 s |
| `180110-…-107-TIT-004.PDF` | `bf966c5c` | `22e4cd87` | 1,7 s |
| `documento_2492313_…pdf` | `011b911e` | `ade09c24` | 2 dias |

Os três primeiros são clique duplo. O quarto tem 2 dias de intervalo mas divide o **mesmo
`file_path`** — e o caminho carrega um `Date.now()`, então reenvio geraria caminho novo: também é
linha duplicada.

**Três das quatro apareciam em Contas a Pagar** (R$ 77,96, R$ 98,00 e R$ 52,10). Só a `dd6b3944`
estava invisível, e apenas porque a correção do C1-02 a deixou sem organização — o que, por
acaso, foi o fio que levou ao defeito.

### A causa

`services/boletoService.ts › aprovarECriarInvoice`:

```ts
let invoiceId = boletoRow.invoice_id;
if (!invoiceId) { /* INSERT invoices */ }
```

Read-then-write clássico: duas chamadas leem `null`, ambas passam pelo `if`, ambas inserem.

### O que foi feito — `aplicar_20270918000020` + código

1. **Exclusão das 4** (autorizada), com duas guardas na migration: aborta se alguma tiver ganhado
   boleto desde a análise, e aborta se alguma não tiver gêmea (apagar perderia o documento).
   Verificado antes: só `boletos.invoice_id` referencia `invoices` e nenhuma das 4 tinha boleto;
   busca por texto em `internal_transactions.reference_id` e observações deu 0. O arquivo no
   Storage é compartilhado com a linha que fica — não foi tocado. **830 → 826.**
2. **Índice único parcial** `uq_invoices_file_path` — um arquivo, uma nota.
3. **Idempotência no serviço**: procura a nota por `file_path` antes de inserir, e trata `23505`
   como "a outra chamada venceu a corrida", recuperando a linha vencedora. O índice sozinho
   trocaria a duplicata por um erro cru na cara do usuário; o clique duplo tem de **convergir**.

### Um falso alarme meu, registrado

Ao varrer `internal_transactions` por duplicatas, agrupei por
`(source_system, organization_id, reference_id)` e "achei" 2 grupos NFE com 2 linhas cada. **Não
são duplicatas**: cada par é um `DEBIT` + um `CREDIT` com o mesmo `reference_id` — partida dobrada,
o desenho correto do módulo fiscal. O caminho do boleto teve **0 duplicatas** ali.

Fica a nota: qualquer varredura futura de duplicidade em `internal_transactions` precisa incluir
`direction` no agrupamento, senão acusa a contabilidade de estar errada.

### Latente, não corrigido

O mesmo padrão read-then-write existe logo abaixo, para `internal_transactions`
(`if (!txExistente) { insert }`). Não produziu duplicata até hoje, e a trava equivalente exigiria
um índice que respeite a partida dobrada — por `(source_system, reference_id, direction)`, não só
pelos três primeiros campos. Fica registrado em vez de corrigido às pressas.

---

## `bi_report_schedules` — a tabela que constava como criada e não existia (2026-09-02)

A pergunta que eu tinha deixado em aberto (`bi_report_schedules` × `report_schedules`, qual é o
schema canônico) **estava mal posta**. Não são dois schemas da mesma coisa — são duas
funcionalidades distintas:

| | BI Executivo | Financeiro |
|---|---|---|
| Tela | `BIReportScheduler` (dentro de `BIDashboard`) | `FinancialIntelligence` |
| Serviço | `biReportService` | `reportScheduleService` |
| Tabela | `bi_report_schedules` | `report_schedules` |
| Edge Function | `send-bi-report` | `financial-report-notifier` |
| Existia no banco? | **não** | sim |

### O drift, com nome e sobrenome

A migration `20260603000000_bi_report_schedules.sql` **está registrada em
`supabase_migrations.schema_migrations` como aplicada** — e a tabela não existe. O registro diz que
rodou; o banco diz que não.

É exatamente o drift que o `CLAUDE.md` avisa, agora com um caso concreto — e a razão de a auditoria
ter lido a postura do banco remoto em vez das migrations. Se eu tivesse auditado pelo repositório,
teria concluído que a tabela existia e estava protegida.

Consequência visível: `BIDashboard.tsx:479` renderiza o agendador, que chama `listSchedules` e
estoura `42P01` em produção.

### Um erro meu, corrigido

Ao endurecer o `send-bi-report` na Fase 2, encontrei a referência a `bi_report_schedules`,
constatei que a tabela não existia e **supus que fosse nome errado** — apontei a function para
`report_schedules`. Errado: apontei a função do BI para a tabela do Financeiro.

Sem efeito prático (a outra tem 0 linhas, e a validação de destinatários também aceita membros da
organização, então o envio legítimo passava), mas a referência estava errada. Devolvida — inclusive
a coluna, porque esta tabela usa `org_id` e não `organization_id`.

### `aplicar_20270918000021`

Cria a tabela que deveria existir. Migration NOVA, não reaplicação da de junho: migration já
registrada não se reexecuta nem se reescreve — mudar o texto de algo marcado como aplicado só cria
dúvida sobre o que o banco tem.

Duas diferenças em relação ao original, pelo crivo da REGRA #7:

1. a policy ganhou `TO authenticated` (o original omitia e caía em PUBLIC — inofensivo, porque a
   expressão é `is_org_member(org_id)`, mas fora do padrão);
2. `calc_next_send_at` ganhou o `REVOKE ... FROM PUBLIC, anon`. É SECURITY INVOKER e só faz
   aritmética de data, então a exposição seria inofensiva — mas é justamente a exceção "essa aqui
   é inocente" que deixa a próxima passar.

Também troquei `IMMUTABLE` por `STABLE`: o original declarava imutável uma função cujo parâmetro
tem `NOW()` como default.

### Verificado

- `select` exato do `biReportService.listSchedules` roda sem `42703` — todas as 15 colunas existem
- 1 policy, recortada por organização; nenhuma sem condição
- `calc_next_send_at` não é executável por `anon`
- cron `hourly-bi-report-check` ativo (UPDATE puro, sem `net.http_post` — não depende de segredo,
  não tem como cair no 401 silencioso do C4-02)

---

## C4-02 (continuação) — o diagnóstico dos 401 desmontou o que eu tinha dito

Data: 2026-09-02, fim da sessão. Motivado por "Atualize o status": a verificação 6 do
`check-rls-postura.sh` continuava ❌ e eu tinha atribuído isso a "o segredo do Vault está errado,
o dono precisa colar a chave". **Estava errado em três pontos.**

### O que os erros diziam de verdade

`net._http_response` trazia dois códigos DIFERENTES, ambos do gateway do Supabase — não da minha
lógica:

```
UNAUTHORIZED_INVALID_JWT_FORMAT   (3×, 22:00)
UNAUTHORIZED_NO_AUTH_HEADER       (3×, 22:00)
```

Seis 401 = exatamente as 3 execuções de `daily-billing-ruler` + as 3 de `dunning-notifier-hourly`.
Cada job com um código distinto, ou seja, duas causas distintas — e nenhuma delas era "a chave
está desatualizada".

### Causa 1 — `verify_jwt` contra chave que não é JWT

| função | `verify_jwt` | resultado |
|---|---|---|
| `task-alert-notifier` | false | 200 |
| `process-billing-ruler` | **true** | 401 `INVALID_JWT_FORMAT` |
| `dunning-notifier` | **true** | 401 |

O projeto usa o formato novo de chave (`sb_secret_…` / `sb_publishable_…`), que **não é um JWT**.
Com `verify_jwt: true`, o gateway rejeita antes de a função rodar — a função nem vê a requisição, e
por isso o gate interno dela (comparação com `SUPABASE_SERVICE_ROLE_KEY`) nunca era exercido.
É o mesmo flag que já tinha me pegado no `asaas-webhook`. Corrigido com deploy `--no-verify-jwt`
nas duas.

### Causa 2 — quatro jobs, quatro fontes de credencial, três inexistentes

| job | lia de | existia? |
|---|---|---|
| `daily-billing-ruler` | vault `billing_cron_token` | sim, mas era o texto `<cole_aqui…>` |
| `task-alert-notifier` | vault `billing_cron_token` | idem |
| `dunning-notifier-hourly` | vault `service_role_key` | **não** → header NULL → `NO_AUTH_HEADER` |
| `fiscal-fallback-polling` | GUC `app.service_role_key` | **não** → erro de SQL |

O `fiscal-fallback-polling` é o achado mais grave desta rodada: **90 falhas / 0 sucessos em 3 horas**,
morrendo em `unrecognized configuration parameter "app.supabase_url"` a cada 2 minutos. É o fallback
que o CLAUDE.md descreve como a rede de segurança da ingestão de NF-e (jobs órfãos, retries). A rede
nunca esteve lá — e nada no sistema reclamava.

`aplicar_20270918000022` unifica os quatro em `public.fn_cron_service_key()`, que **levanta exceção
legível** quando o segredo falta em vez de devolver NULL. NULL concatenado vira header ausente, e
header ausente vira 401 sem pista de origem: foi exatamente assim que o `dunning-notifier` ficou
quebrado sem aparecer em lugar nenhum.

REGRA #7, pergunta 2, no caso extremo: a função devolve a service_role_key em texto puro, então o
REVOKE inclui `authenticated` — não só PUBLIC e anon.

### Causa 3 — e esta eu criei

Ao investigar por que o `task-alert-notifier` respondia 200 com um Vault que só tinha placeholder,
sondei o endpoint direto:

```
Bearer lixo-invalido-123   -> 200
(sem header nenhum)        -> 200
```

**O bundle publicado era anterior ao gate.** A migration `...000009` reagendou o cron, mas a função
nunca foi redeployada — o código com o `if (!authHeader …) return 401` estava só no repositório.
Com `verify_jwt: false`, o resultado era um endpoint **aberto na internet** que dispara e-mail via
Resend e lê tarefas com service_role.

Pior: eu tinha acabado de rodar `--no-verify-jwt` em outras duas funções pela Causa 1. Sondei as
quatro na hora — `process-billing-ruler`, `dunning-notifier`, `fiscal-nfe-processor` e
`asaas-webhook` respondem 401 sem auth, os gates delas estão publicados. Só a `task-alert-notifier`
estava aberta. Redeployada e reconferida: 401 sem header, 401 com token inválido.

**Lição:** `--no-verify-jwt` transfere a autorização inteira para o código da função. Só é seguro
depois de PROVAR, com uma requisição sem header, que o gate está no bundle publicado — não no
arquivo local.

E a razão de eu ter tratado 200 como sinal de saúde: 200 dizia que a requisição chegou, não que
alguém a autorizou.

### Ponto cego da verificação 6, corrigido

A 6 lê `net._http_response`. Job que estoura no SQL nunca escreve lá — logo, os 90 fracassos do
fiscal davam ✅. Além disso a 5 procurava placeholder no TEXTO do job, mas o placeholder tinha
migrado para dentro do Vault.

- **5** passa a olhar também o valor no Vault e GUC `app.*` inexistente
- **7** (nova) lê `cron.job_run_details` — falha antes de sair do banco

Com as duas, o mesmo diagnóstico que levou meia hora vira uma linha de saída.

### Estado ao fim

`billing_cron_token` (placeholder, já sem nenhum job lendo) removido do Vault. As três verificações
ainda ❌ têm agora **uma única causa e uma única ação manual**:

> criar no Vault o segredo **`service_role_key`** com o valor de
> Dashboard › Project Settings › API › `service_role`.

Ação do dono — não peço nem manipulo essa chave. Feito isso, 5, 6 e 7 fecham juntas.

---

## C4-02 (fim) — segredo dedicado, e um achado novo no caminho

Data: 2026-09-03. Depois de o dono colar a service_role key no Vault, metade dos jobs passou a
funcionar e a outra metade continuou em 401. O motivo é estrutural, não de configuração:

| caminho | o que exige | a chave legada (`eyJ…`) | a nova (`sb_secret_…`) |
|---|---|---|---|
| gateway com `verify_jwt: true` | um JWT | ✅ | ❌ `INVALID_JWT_FORMAT` |
| gate interno vs `SUPABASE_SERVICE_ROLE_KEY` | a chave que o runtime injeta | ❌ | ✅ |

Nenhum valor único satisfaz os dois. Com a legada no Vault, o `fiscal-nfe-processor`
(verify_jwt true, sem gate) devolveu `{"processed":7}` e o `task-alert-notifier` (verify_jwt false,
com gate) devolveu `{"error":"Unauthorized"}` — na mesma rodada, com o mesmo header.

### O achado que apareceu ao investigar isso

Se o `fiscal-nfe-processor` aceitava a chave legada só por ela ser um JWT válido do projeto, então
**qualquer** chave válida do projeto entrava. Inclusive a anon, que é pública. Sonda:

```
Bearer <publishable key do .env>  ->  200
```

`verify_jwt: true` não é autorização — o gateway confere que o token é uma chave do projeto, não
que quem chamou tem direito. A function não tinha gate nenhum no código, aceita `body.record` e
processa com service_role: dava para injetar job forjado no pipeline de NF-e com o que qualquer
visitante extrai do bundle. Mesma família do C3, achado depois do relatório.

### Solução: `CRON_SECRET`

Segredo de 64 hex que eu gerei, em dois lugares com o mesmo valor: `supabase secrets set` nas
functions e `vault.create_secret(…, 'cron_secret')` no banco. Ninguém precisou me passar chave
nenhuma. Três ganhos de uma vez:

- **acaba o impasse de formato** — segredo próprio não tem formato a respeitar;
- **a service_role key sai do header** — ela ignora toda a RLS e não precisava trafegar a cada minuto;
- **a service_role key sai do Vault** — nada mais a lê; credencial guardada "por via das dúvidas" é
  superfície de ataque parada.

`chamadaDeCron()` em `_shared/auth.ts`, com duas defesas que não são zelo:

1. **comprimento mínimo de 32.** Sem isso, `CRON_SECRET` ausente faz `esperado` virar `''` e a
   comparação aceita o header literal `"Bearer "` — a falha de configuração vira permissão. É o
   mesmo formato do defeito da `task-alert-notifier`.
2. **comparação em tempo constante**, já que é um segredo simétrico comparado a cada requisição.

O `WebHookOrca` do Dashboard também foi trocado: ele carregava o token **literal dentro do argumento
do trigger**, legível em `pg_get_triggerdef` por qualquer um que leia o catálogo. Virou
`fn_dispara_fiscal_processor()`, que busca no Vault na hora. A trigger engole erro de disparo de
propósito — a alternativa seria impedir upload de NF-e — e isso só é aceitável porque agora existe
rede embaixo: o `fiscal-fallback-polling`, que até ontem tinha 0 sucessos.

### Verificado

```
                          sem-header   anon(publishable)
task-alert-notifier          401             401
process-billing-ruler        401             401
dunning-notifier             401             401
fiscal-nfe-processor         401             401
```

Pelo caminho do cron, 8 de 8 respostas em 200 desde 01:28. Último 401 às 01:27 — janela de
transição entre o deploy das functions e a migration. INSERT em `processing_jobs` dentro de
transação revertida: trigger dispara sem derrubar o INSERT.

### O que ficou de trava

- **REGRA #7 ganhou a pergunta 3** — "esta function é protegida por código ou só pelo gateway?",
  com as duas metades: `verify_jwt: true` não autoriza, e `--no-verify-jwt` só é seguro depois de
  provar por sonda que o gate está no *bundle publicado*. O arquivo local não é evidência.
- **`check-rls-postura.sh` foi para 8 verificações.** As 5–8 nasceram deste caso e cada uma cobre o
  ponto cego da anterior: 5 placeholder (comando, Vault ou GUC), 6 resposta HTTP real, 7 job que
  falha antes de sair do banco, 8 sonda HTTP com a chave pública. A 8 é a única que enxerga um
  defeito que não está no banco.

### Nada pendente do dono

A ação manual que eu tinha pedido deixou de existir: o segredo é gerado e distribuído por mim.

---

## Estado real dos 22 achados (conferido no código em 2026-09-03)

O checklist das Fases 2, 3 e 5 acima ficou **desatualizado**: as caixas seguiram desmarcadas depois
de o trabalho ter sido feito e publicado. Vale este levantamento, não aquelas caixas.

| Fase | Estado conferido |
|---|---|
| 0, 1, 4 | fechadas |
| 2 — Edge Functions | 12 de 12 no código. `asaas-webhook`, `notify-*`, `partner-portal-upload` e `labor-portal-ged-download` não usam `_shared/auth.ts` porque autenticam por token/service_role, não por sessão de usuário — gate próprio, conferido |
| 3 — XSS | `sanitizeHtml.ts` aplicado nos 4 sinks; `DatabaseExplorer` era gate de papel (`owner`/`admin`), não sanitização |
| 5 — travas | 5 de 5, com a correção abaixo |

Publicação: todas em 2026-09-02, exceto **`notify-opportunity-interest`, que nunca foi publicada** —
o código corrigido está no repositório, e não há endpoint no ar. C3-06/C5-03 para ela são teóricos
enquanto não subir.

### A lacuna que este levantamento achou

`scripts/check-xss-sinks.sh` passava, mas **não estava no CI** — só rodava se alguém lembrasse. É
exatamente a causa que o CLAUDE.md registra para a REGRA #5 ter voltado: *"o script de verificação
nunca rodava no CI — dependia de alguém lembrar. Essa é a razão real de o bug ter voltado."*
Repetir isso na trava de XSS seria repetir o erro com outro nome. Entrou como passo do
`.github/workflows/ci.yml`.

`segurancaMigrations.test.ts` e `orgContextGuard.test.ts` já rodavam: são arquivos de teste e caem
no `vitest run`.

---

## Itens 1, 2 e 3 do levantamento (2026-09-03)

### 1 · Erro engolido em `boletoService.ts`

`insert` em `internal_transactions` com o `error` descartado. O banco tem índice único
`(organization_id, reference_id, entry_type)`, então clique duplo na aprovação dá 23505 — e aí
`txNova` ficava null, o `if` pulava a submissão à alçada, e o update no fim marcava o boleto como
`aprovado` assim mesmo. **Boleto aprovado sem título no razão e fora da fila de aprovação, sem erro
em lugar nenhum.**

Mesmo tratamento que a nota fiscal já tinha algumas linhas acima: captura o erro, trata 23505
relendo a linha vencedora, e não ressubmete à alçada (quem ganhou a corrida já submeteu).

### 2 · `vite.config.ts` — `environmentMatchGlobs`

Opção **removida no Vitest 4**, que é a versão em uso. Não fazia nada; o jsdom vem do docblock
`// @vitest-environment jsdom` nos próprios arquivos. Config que descreve mecanismo inexistente
custa mais que config ausente. Removida — 2262 testes seguem passando, o que confirma que ela já
não tinha efeito.

### 3 · `notify-opportunity-interest` — publicar revelou um erro meu

O pedido era só publicar. Ao conferir quem chamava, achei que **o gate que eu mesmo tinha escrito na
Fase 2 estava errado**, com um comentário afirmando o contrário do que o código fazia:

> "Estas funções são chamadas por serviço/trigger, nunca pelo navegador."

São três chamadas, todas do navegador, duas anônimas:

| chamador | contexto |
|---|---|
| `investorPortalService.ts:273` | autenticado |
| `investorPortalTokenService.ts:154` | portal por token — anônimo |
| `publicMarketplaceService.ts:80` | marketplace público — anônimo |

Como a function nunca foi publicada, o engano nunca quebrou nada. Publicar como estava faria as três
darem 401 — e as três invocam com `.catch(() => {})`. Ninguém receberia notificação de interesse e
nenhuma tela diria isso.

Afrouxar o gate devolveria o C3-06 inteiro (spam com conteúdo de formulário público; `verify_jwt` não
ajuda, é satisfeito pela chave anon). A saída foi mover o disparo para o banco: os três caminhos
terminam no mesmo INSERT em `opportunity_interests` — direto, via `fn_investor_portal_submit_interest`
ou via `submit_public_interest` — então **uma trigger cobre os três**, e passa a cobrir também
qualquer origem futura, que o caminho do navegador nunca cobriria.

`aplicar_20270918000024` + gate trocado para `chamadaDeCron` + as três invocações removidas.

### Verificado

```
de fora:   sem-header 401 · chave anon 401
do banco:  404 {"error":"Oportunidade não encontrada"}   ← passou o gate e executou
```

O 404 é a prova boa: ids fictícios de propósito, para exercitar o gate sem mandar e-mail a ninguém.
INSERT em `opportunity_interests` dentro de transação revertida: trigger dispara sem derrubar o
INSERT. `tsc --noEmit` limpo, 2262 testes passando, `check-xss-sinks.sh` limpo.

⚠️ A verificação 6 do `check-rls-postura.sh` vai acusar esse 404 pela próxima hora — é a minha
sonda, não um cron quebrado. Sai sozinha da janela.

### Uma lição que vale além destes três

Os itens 1 e 3 são o mesmo defeito em roupas diferentes: **resultado de operação descartado**
(`const { data } = await …`, `.catch(() => {})`). Nos dois casos o sistema seguia em frente
exibindo um estado plausível. O item 3 ainda acrescenta que **comentário não é verificação** — o meu
afirmava "nunca pelo navegador" sobre um código com três chamadas do navegador, e passou por
revisão minha assim.

---

## Item 4 · `select('*')` — catraca, não campanha (2026-09-03)

*Pedido: "1 e 2" — revisar os call sites sensíveis e travar os novos, em vez da varredura completa.*

### Por que a varredura foi descartada

205 ocorrências em 59 arquivos, 139 tabelas. O número engana: **a RLS deste projeto recorta LINHA,
não COLUNA**. `select('*')` entrega colunas a quem já podia ler aquela linha — é excesso de dado, não
travessia de tenant. Trocar os 205 exige saber quais campos cada consumidor usa; errar produz
`undefined` em runtime que teste nenhum pega. Muito risco, ganho de segurança quase nulo.

Cruzando as 139 tabelas contra as que têm coluna sensível (token, CPF, salário, chave PIX): **5 call
sites**.

### Os cinco, revisados um a um

| call site | veredito |
|---|---|
| `commercialService.ts:776` — `commercial_deals` | **defeito.** `deleteDeal` usa `organization_id` e `property_id` e trazia a linha inteira, `signature_token` incluso. Estreitado. |
| `brokerPortalService.ts:30` — `broker_portal_tokens` | legítimo: admin buscando o token de UM corretor para montar o link. O token é o payload. |
| `contractLaborQuestionnaireService.ts:21` — `contract_labor_questionnaires` | legítimo: `q_salario_fixo` é uma RESPOSTA do questionário, o conteúdo do registro. |
| `proService.ts:232` — `pro_config` | legítimo: `.eq(user_id, userId)`, o usuário lendo a própria configuração. |
| `orgGovernanceService.ts:68` — `org_roles` | mantido, **com pergunta em aberto**: devolve faixa salarial do CARGO. Quem pode ver isso é decisão de produto — se a resposta for "só RH", o corte é de permissão, não de coluna. |

Ou seja: 1 de 205 era defeito. É a evidência de que a varredura teria sido trabalho quase todo
desperdiçado.

### A trava — `__tests__/selectEstrelaSensivel.test.ts`

Roda no `vitest run`, logo já entra no CI. Duas asserções:

1. **`select('*')` novo** em qualquer das 34 tabelas com credencial, documento pessoal ou remuneração
   quebra o build, dizendo qual coluna torna a tabela sensível;
2. **exceção órfã** também quebra — exceção que sobrevive ao código que a justificava é ruído, e
   ruído em lista de segurança é o que faz a próxima pessoa parar de ler a lista.

A lista de tabelas é escrita à mão de propósito: o CI não tem credencial do banco e não deve ter.
Foi gerada do schema real e revisada — saiu `master_banks.pix_enabled`, booleano de capacidade, não
segredo. Tabela nova com coluna sensível exige acréscimo manual, e é esse acréscimo que força alguém
a olhar.

As 4 exceções carregam o motivo por escrito, na própria lista. Não é lista de itens tolerados; é
lista de decisões revisadas.

**Provada**: arquivo temporário com `.from('employees').select('*')` → falha apontando
`services/__trava_temp.ts:3 — select('*') em 'employees' (sensível por: banco_pix, base_salary, cpf)`;
removido o arquivo → 2 de 2 passando.

### Sobra

Os ~200 `select('*')` restantes ficam como dívida oportunista: estreitar quando já se estiver mexendo
no arquivo. Nenhum deles toca coluna sensível.

---

## Faixa salarial de cargo — "só RH" (2026-09-03)

*Pergunta que ficou em aberto no item 4; resposta do dono: **"Só RH"**.*

### O que estava acontecendo

`org_roles` guardava `salario_minimo`/`salario_maximo`, e a policy de SELECT da tabela é
`check_user_belongs_to_company` — **sem recorte de papel**. Qualquer colaborador da empresa lia a
faixa de todos os cargos, inclusive os acima dele, em qualquer tela que liste cargos.

### Por que a correção foi no schema, e não na tela

**A RLS do Postgres recorta LINHA, não COLUNA.** Enquanto as duas colunas estivessem numa linha que
o colaborador pode ler, esconder no frontend não esconderia nada: o valor continuaria vindo no JSON
do PostgREST, visível no DevTools.

Privilégio de coluna (`REVOKE SELECT (col)`) também não serve: admin e colaborador são o **mesmo
papel de banco** (`authenticated`) — a distinção mora na policy, não no papel.

Sobra o caminho canônico: **coluna sensível vira linha em tabela própria**, e aí a RLS volta a poder
fazer seu trabalho. Mesmo movimento das `*_org_shares` do C1-05.

`aplicar_20270918000025` cria `org_role_salary_bands` (policy `check_user_is_admin_of_company`, uma
perna só), move as 10 faixas, e **só então** derruba as colunas — com contagem origem × destino antes
do DROP, que não volta atrás.

### O detalhe que quase virou bug

A tela do não-admin não recebe a faixa, então o formulário dele devolve `null` nos dois campos. Se a
permissão fosse checada no service, esse `null` **apagaria a faixa de quem pode vê-la**. Como quem
decide é a policy, a tentativa dele simplesmente não encontra linha para alterar. Por isso o
`saveRole` registra a falha da gravação da faixa e não interrompe: o cargo já foi salvo, e derrubar a
operação puniria o não-admin por uma edição que ele nem sabia estar fazendo.

### Verificado

`docs/security-audit/provas/regressao-org-roles-faixa-salarial.sql`:

```
                     | cargos | faixas
  admin da empresa   | 1      | 1
  colaborador comum  | 1      | 0
```

O colaborador continua vendo os cargos — o que mudou é só a faixa. `tsc` limpo, 2264 testes.

### E a trava perdeu uma exceção

`selectEstrelaSensivel.test.ts` tinha `org_roles` na lista de tabelas sensíveis e uma exceção com a
ressalva "decisão de produto em aberto". A resposta não cabia numa exceção: `org_roles` saiu da lista
(não tem mais nada sensível) e entrou `org_role_salary_bands`. **A exceção deixou de existir junto
com o motivo dela** — que é exatamente o que a segunda asserção da trava cobra.

---

## ⚠️ Eu quebrei produção, e a lição não é sobre a correção — é sobre a sequência

Data: 2026-09-03, logo depois da ...000025.

### O que aconteceu

Apliquei a remoção das colunas de faixa salarial no banco às 23:17. Fui conferir o estado do Vercel e
achei o que não esperava: os deploys recentes da branch são todos **Preview**. A última **Produção**
é de **19:04** — anterior a todos os oito commits desta leva.

Esse frontend ainda manda `salario_minimo`/`salario_maximo` no payload do `saveRole`. Testado com
requisição real contra o PostgREST:

```
PGRST204 — Could not find the 'salario_minimo' column of 'org_roles' in the schema cache
```

**Criar e editar cargo estava falhando em produção**, e ficou assim das 23:17 até eu corrigir.

A correção em si estava certa. O erro foi de **sequência**: migration e deploy são um par, e aplicar
só a metade que eu controlo não é meio caminho andado — é quebra. E o detalhe que me pegou:
*preview não é produção*. "A branch já foi para o Vercel" e "está no ar" são coisas diferentes.

### A correção da correção — `aplicar_20270918000026`

Devolve as duas colunas como **casca**: existem para o payload antigo não estourar, mas ficam sempre
nulas. Uma trigger BEFORE encaminha o que for escrito para `org_role_salary_bands` (onde a RLS de
admin continua valendo) e zera o campo antes de gravar.

`SECURITY INVOKER` de propósito: se fosse DEFINER, a trigger viraria caminho lateral para qualquer
colaborador gravar faixa salarial — o oposto do que a ...000025 foi fazer.

E o ramo que protege o dado: **se os dois campos vierem NULL, não faz nada.** A tela do não-admin não
recebe a faixa, então o form dele manda NULL a cada save. Um DELETE aqui apagaria a faixa de quem
pode vê-la, a cada save de colaborador comum.

### Verificado

```
escreveu 7777 pelo payload antigo
  org_roles.salario_minimo (casca) = NULL   ← não vaza
  org_role_salary_bands            = 7777   ← roteou
depois de um save com NULL (não-admin)
  org_role_salary_bands            = 7777   ← não apagou
```

`PATCH` com o payload antigo: **HTTP 204** (antes, 400/PGRST204). Precisou de
`NOTIFY pgrst, 'reload schema'` — o PostgREST cacheia o schema, e sem isso a coluna recém-criada
continua invisível por alguns minutos.

### Revisão das outras migrations desta leva contra o frontend de 19:04

| migration | efeito no frontend velho |
|---|---|
| ...020 invoices índice único | clique duplo mostra erro em vez de duplicar em silêncio — pior UX, melhor dado |
| ...021 bi_report_schedules | só melhora (a tela parava de estourar 42P01) |
| ...022 / ...023 cron e segredo | servidor puro, sem efeito |
| ...024 notify por trigger | a chamada antiga toma 401 e é engolida pelo `.catch`; a trigger notifica. Sem quebra |
| ...025 faixa salarial | **quebrava** — corrigida pela ...000026 |

### O que fica

Antes de aplicar migration que **remove ou renomeia** coluna: conferir qual commit está em
**produção**, não qual foi empurrado. Se produção for anterior ao frontend correspondente, a
migration precisa de casca de compatibilidade — ou espera o deploy. Adicionar coluna e criar tabela
são seguros; remover não é.

### Quando o frontend novo subir

As duas colunas-casca e a `trg_org_roles_faixa_compat` podem cair. **Não caem sozinhas de
propósito** — some com elas só depois de confirmar que produção roda o `listRoles` que lê
`org_role_salary_bands`. Que é exatamente a conferência que faltou aqui.

---

## Merge com main e publicação final (2026-09-03)

### O incidente, em uma linha

Publiquei a branch em produção sem conferir que ela estava **59 commits atrás de main**. Não somei o
trabalho da outra frente — substituí. Ficaram fora do ar: quantitativo em planilha, editar pedido em
abas, condomínios no Portal do Cliente, GED com ~570 linhas a mais.

Revertido com `vercel rollback`, que **exige `--scope altairs-projects-aa74deda`** — sem isso falha
com "Deployment belongs to a different team", que não descreve o problema.

### Os dois conflitos

**`utils/blueprintKernel/quantities.ts`** — não era conflito de conteúdo. As duas versões são
idênticas depois de remover `` (LF na branch, CRLF na main); o `+913/-913` era o sinal. Fiquei com
a da main para não voltar a conflitar.

**`components/SupplyChainOrderForm.tsx`** — as duas frentes implementaram a mesma tela em paralelo, e
a da main está mais adiante (botão de regerar, motivo de travamento do número). Antes de escolher,
conferi que **nenhum commit meu tocou o arquivo**: os dois da branch são o mesmo trabalho duplicado.
Fiquei com a versão da main inteira — misturar duas implementações da mesma coisa seria pior que
qualquer uma das duas.

### Colisão de prefixo de migration

As duas frentes usaram `20270918000001` e `000002`. Renumerei **as minhas** para
`20270917000005`/`000006` — slots livres que ordenam antes de toda a minha série, preservando a ordem
de replay (a de `invoices` precisa vir antes da `...020`). Referências atualizadas no plano e nas
migrations que as citavam.

Renumerei as minhas, e não as da outra frente, pelo mesmo motivo de tudo aqui: mexer no que é dos
outros sem combinar foi exatamente o que deu errado hoje.

### Publicação

`vercel deploy --prod` depois de um rollback **não assume o domínio sozinho** — o projeto fica preso
na versão revertida. Precisou de `vercel promote`.

Verificado no que o site entrega, não no painel:

| | |
|---|---|
| meu · faixa salarial pela tabela restrita | presente |
| meu · chamada desperdiçada ao notify | removida |
| main · GED | 179.372 bytes (a da main sozinha tinha 167.491 — cresceu com a minha sanitização) |
| site | HTTP 200 |

Divergência: **0 commits da main faltando**. `tsc` limpo, 2278 testes, build limpo do zero.

### A casca de compatibilidade ainda fica

`org_roles.salario_minimo/maximo` como casca sempre-nula e a `trg_org_roles_faixa_compat` continuam.
O frontend novo está no ar, mas quem tem o app aberto segue com o pacote antigo em cache (PWA) por um
tempo — tirar a casca agora quebraria essas sessões. Some depois, sem pressa.
