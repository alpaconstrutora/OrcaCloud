# Qualidade SiAC — Fase 2: plano de implementação

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans, tarefa por tarefa. Passos com checkbox (`- [ ]`).

## Pedido original

> **25/11/2026** — "O próximo passo é o desenho da fase 2: iniciar"
>
> Sessão: `c3015bbd-c4c3-4c7d-9bca-95fa2943cdac` · desenho aprovado com "ok" em 26/11.

Decisões do usuário (tabela completa no desenho): ficha na tela da tarefa, permissão de **inspecionar**
separada da de **liberar**, celular depois ("sim"); abordagem A — checklist e inspeção da OE com os
portões consertados ("opção A"); SPE usa o sistema da qualidade da Alpa ("b"); só contam executores
treinados na revisão vigente ("sim").

**Goal:** OE de serviço controlado com ficha de verificação que trava de verdade (tela e banco),
"Aprovar inspeção" com quem/quando/revisão/executores congelados, NC com causa, ação corretiva,
foto e eficácia, e o painel da Qualidade contando aplicados com registro e em obra.

**Architecture:** os portões de checklist/NC/inspeção/executores viram UMA função SQL
(`oe_portoes`) usada pelo gatilho de `work_orders` e pelo `validateTransition` do app (sem regra
duplicada); "Aprovar/Reprovar inspeção" é uma RPC `SECURITY DEFINER` que confere a permissão e
grava o registro congelado; as telas do Controle Operacional ganham os campos; a Qualidade lê as
inspeções aprovadas para o painel.

**Tech Stack:** React + TypeScript + Vite, Supabase (Postgres/RLS/PostgREST), Vitest + Testing Library.

**Spec:** `docs/planos/2026-11-25-qualidade-siac-pbqph.md`, seção "## Fase 2 — desenho". Ler junto.

## Global Constraints

- REGRAS OBRIGATÓRIAS de `CLAUDE.md` (#1 UI, #2/#3 obra, #4 Sheet, #5 org do topo, #6 plano vivo, #7 migration, #8 frente/deploy).
- Banco: **nunca** `supabase db push`; aplicar com `npx supabase db query --linked -f <arquivo>`; função nova com `REVOKE EXECUTE … FROM PUBLIC, anon` + `GRANT … TO authenticated` **literal**; `SECURITY DEFINER` confere autorização dentro; tabela nova com RLS por `minhas_orgs_membro()` e `REVOKE TRUNCATE, REFERENCES, TRIGGER … FROM authenticated`.
- Permissões novas: `canInspectQualitySystem` (responder a ficha de OE de serviço controlado) e `canReleaseQualitySystem` (aprovar a inspeção de OE de serviço controlado). Dono/admin (`organization_members.role IN ('owner','admin')`) e `is_superadmin()`: ligadas. Demais membros: **false explícito** no padrão. Conferidas na organização **dona do SGQ** da OE.
- Rótulo do botão: **"Aprovar inspeção"** (o "Liberar OE" que existe, planejada → liberada, não muda).
- "Cumprido" de um item do checklist = `response_status = 'conforme'`, ou `'nao_aplicavel'` com `notes` não vazio. Sem resposta, `parcial` e `nao_conforme` = não cumprido.
- Obra em andamento = `projects.settings->>'obraStatus' = 'Em andamento'`.
- Treinado na revisão = mesma regra da fase 1 (`utils/qualidadeSiac.ts` `treinamentoVigente`): registro aprovado no curso do serviço com dia posterior ao da versão ativa do procedimento, ou mesmo dia com `created_at` ≥ a versão. **Validade (pendência da fase 1, decidida no desenho):** o `status` `VENCIDO` sozinho não tira o treinado; só deixa de contar se `employee_trainings.data_validade` existe e é anterior à data da conta (no SQL e no TS — `contarTreinados` da fase 1 passa a respeitar isso).
- UI: campos h-9, rótulo sem caixa alta, botão desligado diz o motivo em `title` alcançável (`ActionIconButton` desligado esconde o title), nada abaixo de tabela, `Sheet` para editar.

## Review Focus

1. **OE de obra da SPE com usuário que é só da SPE:** a OE abre e funciona; o serviço controlado (da Alpa) aparece como "serviço controlado do sistema da qualidade" sem nome, nada da Alpa vaza (Task 4).
2. **Reinspeção com NC ainda aberta:** responder "conforme" no item reprovado guarda a resposta anterior no histórico **com** o `nc_id`, e o portão continua bloqueado enquanto a NC estiver aberta (Tasks 1–2).
3. **Revisão nova do procedimento depois da aprovação:** o registro da inspeção mantém "treinado: sim" da época e o serviço continua em "aplicados com registro" (Task 2 congela, Task 8 lê o congelado).
4. **Arrastar a OE no Kanban para "aprovada" ou "reprovada":** não escapa da RPC — o banco recusa e a tela mostra o motivo (Task 5).
5. **OE comum (sem serviço controlado) com item obrigatório "não aplicável" sem observação:** fica bloqueada com mensagem clara; com observação, passa (Tasks 2 e 5).

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/aplicar_20271126100000_qualidade_fase2_estrutura.sql` (novo) | colunas, tabelas de histórico, FKs, CHECKs, gatilhos de mesma org/cópia/histórico, RLS |
| `supabase/migrations/aplicar_20271126110000_qualidade_fase2_regras.sql` (novo) | `_qualidade_pode`, `_qualidade_sgq_da_org`, `_qualidade_treinado_na_revisao`, `oe_portoes`, gatilhos de status/resposta/validação, RPC `quality_aprovar_inspecao` |
| `types/operational-control.ts` | tipos novos/corrigidos |
| `services/workOrderService.ts` | `validateTransition` usa `oe_portoes`; `aprovarInspecao`; NC via service |
| `services/qualidadeSiacService.ts`, `utils/qualidadeSiac.ts`, `utils/permissaoQualidadeSiac.ts` | SGQ, serviços da OE, sugestão, contagem do painel, permissões novas |
| `components/OperacionalForm.tsx` | campo "Serviço controlado" + sugestão + aplica a ficha modelo |
| `components/OperacionalChecklist.tsx`, `components/OperacionalDetail.tsx`, `components/OperacionalKanban.tsx` | ficha com critério/método, N/A com observação, Aprovar/Reprovar inspeção |
| `components/OperacionalNC.tsx` | causa, ação corretiva, foto, eficácia, histórico |
| `components/OperacionalTemplateManager.tsx` | critério/método; desativar item com resposta |
| `components/qualidade/*`, `types/users.ts`, `components/OrganizationUsers.tsx` | ficha modelo no Sheet do serviço, SGQ da organização, painel com números, permissões |

---

### Task 1: Migration de estrutura

**Files:** Create `supabase/migrations/aplicar_20271126100000_qualidade_fase2_estrutura.sql` · Test: `__tests__/segurancaMigrations.test.ts`, `__tests__/migrationsPrefixo.test.ts`

**Interfaces — Produces (banco):**
- `quality_settings.sgq_organization_id uuid` → `organizations` (SET NULL); gatilho BEFORE INSERT/UPDATE: valor não nulo tem de estar em `minhas_orgs_membro()` e ser diferente de `organization_id` (senão 42501/22023).
- `quality_controlled_items.checklist_template_id uuid` → `oe_checklist_templates` (SET NULL); o gatilho de mesma org da fase 1 passa a conferir também `oe_checklist_templates.org_id = organization_id`.
- `oe_checklist_items.criterio text`, `metodo text`, `ativo boolean NOT NULL DEFAULT true`.
- `work_orders.controlled_item_id uuid` → `quality_controlled_items` (SET NULL); gatilho BEFORE INSERT/UPDATE OF controlled_item_id: o item pertence a `coalesce(sgq_organization_id da org da OE, org da OE)` (42501).
- `oe_checklist_responses`: `respondido_por uuid DEFAULT auth.uid()`, `respondido_em timestamptz`, cópia `item_descricao text`, `item_criterio text`, `item_metodo text`, `procedimento_revisao text`, `procedimento_versao_id uuid`; gatilho BEFORE INSERT/UPDATE preenche a cópia a partir do item e do procedimento do serviço controlado da OE, e `respondido_por/em` quando `response_status` muda.
- FK `oe_checklist_responses_item_id_fkey` recriada com **ON DELETE RESTRICT**.
- `oe_checklist_response_history` (id, response_id, work_order_id, item_id, response_status, notes, nc_id, evidence_id, respondido_por, respondido_em, copia jsonb, created_at) — gatilho AFTER UPDATE em `oe_checklist_responses` grava o OLD quando `response_status`, `notes`, `nc_id` ou `evidence_id` mudam. RLS SELECT pela OE (mesmo padrão de `checklist_responses_access`); sem INSERT/UPDATE/DELETE para `authenticated` (só o gatilho, `SECURITY DEFINER` com REVOKE).
- `work_order_validations`: `liberado_por uuid`, `liberado_em timestamptz`, `executores jsonb` (`[{employee_id, nome, treinado}]`), `procedimento_revisao text`, `procedimento_versao_id uuid`.
- `non_conformances`: `causa text`, `eficacia text CHECK (eficacia IN ('pendente','eficaz','nao_eficaz'))`, `eficacia_em timestamptz`, `eficacia_por uuid`, `controlled_item_id uuid` (preenchido por gatilho a partir da OE); `CHECK (status <> 'closed' OR (btrim(coalesce(causa,'')) <> '' AND btrim(coalesce(corrective_action,'')) <> ''))` **NOT VALID** (0 NCs encerradas hoje — conferir antes); `non_conformance_history` (id, nc_id, status, causa, corrective_action, eficacia, alterado_por DEFAULT auth.uid(), created_at) com gatilho AFTER UPDATE e RLS igual à da NC (só leitura).
- Policy de `quality_project_exclusions` (fase 1): aceita obra cuja org é a do item **ou** cuja org aponta para a org do item como SGQ.

- [ ] **Step 1:** conferir prefixo livre (`ls supabase/migrations | sed 's/^aplicar_//' | cut -c1-14 | grep 20271126100000` vazio) e `SELECT count(*) FROM non_conformances WHERE status='closed'` = 0.
- [ ] **Step 2:** escrever a migration idempotente (`SET lock_timeout='3s'`, `IF NOT EXISTS`, `DROP … IF EXISTS` antes de recriar).
- [ ] **Step 3:** `npx vitest run __tests__/segurancaMigrations.test.ts __tests__/migrationsPrefixo.test.ts` → PASS.
- [ ] **Step 4:** aplicar com `db query -f` duas vezes (idempotente) → sem erro.
- [ ] **Step 5: prova com sessão real** (um script `BEGIN … ROLLBACK`, casos numa tabela temporária, um `SELECT` final): OE da SPE Garden aceita `controlled_item_id` da Alpa só depois de `quality_settings` da SPE apontar para a Alpa; item de terceira org → 42501; apagar item de modelo com resposta → erro de FK; atualizar a resposta grava 1 linha no histórico com o `nc_id` antigo; a resposta nova traz a cópia do critério; encerrar NC sem causa → 23514. Nada fica no banco.
- [ ] **Step 6: Commit** `feat(qualidade): estrutura da fase 2 (FVS, histórico, NC, SGQ da SPE)`

### Task 2: Migration de regras (portões, permissões, aprovação)

**Files:** Create `supabase/migrations/aplicar_20271126110000_qualidade_fase2_regras.sql` · Test: os mesmos de migration

**Interfaces — Consumes:** Task 1. **Produces (banco):**
- `_qualidade_sgq_da_org(p_org uuid) RETURNS uuid` — `coalesce(sgq_organization_id, p_org)`.
- `_qualidade_pode(p_org uuid, p_chave text) RETURNS boolean` — `SECURITY DEFINER`, `search_path = public, pg_temp`: `is_superadmin()` ou membro de `p_org` (por `auth.uid()`) com `role IN ('owner','admin')` ou `permissions ->> p_chave = 'true'`. Modelo: `_diretoria_pode` (`aplicar_20271117980000_diretoria_ceo.sql`).
- `_qualidade_treinado_na_revisao(p_employee uuid, p_course uuid, p_versao_em timestamptz) RETURNS boolean` — regra dos Global Constraints.
- `oe_portoes(p_work_order_id uuid, p_novo_status text) RETURNS text[]` — `SECURITY INVOKER`; mensagens em português, uma por problema:
  - `released`: itens ativos `pre_start` obrigatórios não cumpridos → "N itens obrigatórios do checklist antes de iniciar não cumpridos".
  - `pending_inspection`: itens ativos `pre_completion` obrigatórios não cumpridos; NC `open`/`in_treatment` da OE; OE controlada sem `collaborator_ids` → "Informe quem executou o serviço controlado".
  - `approved`: não existe `work_order_validations` `inspection`/`approved` criada depois da última entrada `pending_inspection` em `work_order_status_log`.
- Gatilho `BEFORE UPDATE OF status ON work_orders`: se `oe_portoes(NEW.id, NEW.status)` não é vazio → `RAISE EXCEPTION` com as mensagens juntadas por "; " (ERRCODE `P0001`). `unblock` (volta de `blocked`) não passa por portão.
- Gatilho `BEFORE INSERT OR UPDATE ON oe_checklist_responses`: OE controlada exige `_qualidade_pode(_qualidade_sgq_da_org(org da OE), 'canInspectQualitySystem')` (42501 "Sem permissão para inspecionar serviço controlado").
- Gatilho `BEFORE INSERT OR UPDATE ON work_order_validations`: `type='inspection'` e `status IN ('approved','rejected')` em OE controlada exige `canReleaseQualitySystem` na org do SGQ e só é aceito vindo da RPC (variável de sessão `set_config('qualidade.via_rpc','on',true)` lida pelo gatilho).
- `quality_aprovar_inspecao(p_work_order_id uuid, p_aprovar boolean, p_notas text) RETURNS uuid` — `SECURITY DEFINER`; confere: membro da org da OE; OE em `pending_inspection`; se controlada, `canReleaseQualitySystem` na org do SGQ. Insere a validação (`approved`/`rejected`, `liberado_por = auth.uid()`, `liberado_em = now()`, `notes`, e — se controlada — `executores` com `_qualidade_treinado_na_revisao` de cada `collaborator_ids` na versão ativa do procedimento do serviço, `procedimento_revisao`, `procedimento_versao_id`); muda o status para `approved`/`rejected` e grava `work_order_status_log`. Reprovar exige `p_notas` não vazio. Devolve o id da validação.
- REVOKE/GRANT literal em todas as funções.

- [ ] **Step 1:** escrever a migration (prefixo conferido como na Task 1).
- [ ] **Step 2:** testes de migration → PASS; aplicar 2× → sem erro.
- [ ] **Step 3: prova com sessão real** (`BEGIN … ROLLBACK`, um `SELECT` final) — membro sem as chaves e um dono: `UPDATE work_orders SET status='pending_inspection'` com item obrigatório sem resposta → recusado com a mensagem; N/A sem `notes` → recusado, com `notes` → passa; NC aberta → recusado; OE controlada sem `collaborator_ids` → recusado; insert direto de validação aprovada → recusado; RPC por membro sem `canReleaseQualitySystem` → 42501; RPC pelo dono → validação com `executores` (um treinado na revisão, um não) e OE em `approved`; `UPDATE … SET status='approved'` sem validação nova → recusado; resposta de OE controlada por membro sem `canInspectQualitySystem` → 42501.
- [ ] **Step 4: Commit** `feat(qualidade): portões no banco, permissões e Aprovar inspeção`

### Task 3: Tipos, service e regras puras

**Files:** Modify `types/operational-control.ts`, `services/workOrderService.ts`, `services/qualidadeSiacService.ts`, `utils/qualidadeSiac.ts`, `utils/permissaoQualidadeSiac.ts`, `types/users.ts`, `components/OrganizationUsers.tsx` · Test: `__tests__/workOrderServicePortoes.test.ts` (novo), `__tests__/qualidadeSiacRegras.test.ts`, `__tests__/qualidadeSiacService.test.ts`, `__tests__/permissaoQualidadeSiac.test.ts`

**Interfaces — Produces:**
- Tipos: `OeChecklistResponse` ganha `responseStatus`, `ncId`, `respondidoPor`, `respondidoEm`, `itemCriterio`, `itemMetodo`; `OeChecklistItem` ganha `severity`, `category`, `criterio`, `metodo`, `ativo`; `WorkOrder.controlledItemId: string | null`; `NonConformance` ganha `causa`, `eficacia`, `eficaciaEm`, `controlledItemId`; `WorkOrderValidation` ganha `liberadoPor`, `liberadoEm`, `executores: Array<{ employee_id: string; nome: string; treinado: boolean }>`, `procedimentoRevisao`.
- `workOrderService.validateTransition` passa a juntar suas checagens próprias (equipe, responsável, datas, custo, predecessora, % executado) com `supabase.rpc('oe_portoes', …)`; **remove** as checagens de checklist/NC/inspeção locais (fonte única no banco).
- `workOrderService.aprovarInspecao(workOrderId: string, aprovar: boolean, notas: string): Promise<string>` → RPC.
- `workOrderService.encerrarNC(ncId: string, input: { causa: string; acaoCorretiva: string; evidenciaId?: string }): Promise<void>`, `registrarEficacia(ncId: string, eficaz: boolean): Promise<void>` (não eficaz → `status='open'`, `eficacia='nao_eficaz'`, `closed_at=null`), `listarHistoricoNC(ncId)`, `listarHistoricoResposta(responseId)`.
- `qualidadeSiacService.sgqDaOrganizacao(orgId: string): Promise<string>`, `definirSgq(orgId: string, sgqOrgId: string | null): Promise<void>`, `servicosParaOE(orgDaOE: string, projectId: string): Promise<ItemControlado[]>` (ativos do SGQ, sem exclusão da obra), `inspecoesAprovadas(sgqOrgId: string): Promise<InspecaoAprovada[]>` (OEs controladas de todas as orgs que apontam para o SGQ + a própria, com `obraStatus`).
- `utils/qualidadeSiac.ts`: `sugerirServico(codigos: { orcamento?: string | null; planejamento?: string | null }, itens: ItemControlado[]): ItemControlado | null`; `contarAplicados(inspecoes: InspecaoAprovada[], itens: ItemControlado[]): { aplicados: number; emObra: number; porItem: Record<string, { treinados: number; executores: number }> }` — aplicado = ao menos 1 inspeção aprovada com **todos** os `executores` treinados; em obra = a mesma com `obraStatus === 'Em andamento'`; `porItem` = a inspeção aprovada **mais recente** do item.
- `utils/permissaoQualidadeSiac.ts`: `podeInspecionarQualidade({ permissoes, papel, acessoTotal })`, `podeLiberarQualidade({ … })` (dono/admin/acesso total ligados; senão a chave); `MOTIVO_SEM_INSPECAO`, `MOTIVO_SEM_LIBERACAO`. Chaves em `types/users.ts`; padrão `false` explícito e dono/admin `true` em `OrganizationUsers.tsx`; linhas novas em `DETAILED_PERMISSIONS` ("Qualidade — inspecionar serviço controlado", "Qualidade — aprovar inspeção").

- [ ] **Step 1: testes que falham:** `validateTransition` chama `rpc('oe_portoes')` e junta as mensagens; `sugerirServico` acha pelo código do orçamento e pelo do planejamento, e `null` sem código; `contarAplicados` com 2 inspeções do mesmo serviço (uma com executor não treinado, outra toda treinada em obra "Em andamento") → `aplicados 1, emObra 1`, `porItem` da mais recente; com obra "Concluída" → `emObra 0`; permissões: membro sem chave não inspeciona nem libera, dono sim, chave `true` sim.
- [ ] **Step 2:** rodar → FAIL. **Step 3:** implementar. **Step 4:** → PASS; `npm run typecheck` (grep `error TS` = 0).
- [ ] **Step 5: Commit** `feat(qualidade): tipos, service e regras da fase 2`

### Task 4: Formulário da OE — serviço controlado

**Files:** Modify `components/OperacionalForm.tsx` · Test: `__tests__/components/OperacionalFormServicoControlado.test.tsx` (novo)

**Interfaces — Consumes:** `qualidadeSiacService.servicosParaOE`, `sugerirServico`, `podeInspecionarQualidade`.
- Campo "Serviço controlado" (opcional) com a lista de `servicosParaOE(orgDaOE, projectId)`; ao escolher item de orçamento (`sinapiCode`) ou atividade de planejamento (código do item de orçamento do projeto de planejamento), pré-seleciona `sugerirServico` com o texto "sugerido pelo código do item". Escolher aplica `checklist_template_id` do serviço (se a OE já tem respostas, pergunta antes — `useConfirm`, não `window.confirm`). Quando o serviço não é legível (usuário só da SPE), mostra "Serviço controlado do sistema da qualidade" sem nome e não deixa trocar. Executores: o multiselect de colaboradores ganha o aviso "obrigatório para mandar para inspeção" quando há serviço controlado.

- [ ] **Step 1: testes que falham:** escolher item de orçamento com código ligado → campo sugerido; salvar grava `controlled_item_id` e `checklist_template_id`; OE com respostas + troca → confirmação; serviço ilegível → texto sem nome, campo desligado com motivo.
- [ ] **Step 2–4:** FAIL → implementar → PASS; `check-ui-standard.sh components/OperacionalForm.tsx` → 0.
- [ ] **Step 5: Commit** `feat(qualidade): serviço controlado no formulário da OE`

### Task 5: Ficha e Aprovar inspeção

**Files:** Modify `components/OperacionalChecklist.tsx`, `components/OperacionalDetail.tsx`, `components/OperacionalKanban.tsx` · Test: `__tests__/components/OperacionalChecklistFicha.test.tsx`, `__tests__/components/OperacionalDetailInspecao.test.tsx` (novos)

- Checklist: mostra `criterio` e `metodo` sob a descrição; esconde itens `ativo=false` sem resposta; "Não aplicável" em item obrigatório abre campo de observação obrigatório e grava `notes`; deixa de zerar `nc_id` à toa (a troca de resposta já vai para o histórico pelo banco); botão "Histórico" do item abre `Sheet` com `listarHistoricoResposta`; OE controlada sem `canInspectQualitySystem` → respostas desligadas com `MOTIVO_SEM_INSPECAO`; erro do banco (42501/P0001) vira toast com a mensagem.
- Detail: em `pending_inspection`, os botões "Aprovar"/"Reprovar" viram **"Aprovar inspeção"** e **"Reprovar inspeção"** e chamam `workOrderService.aprovarInspecao` (reprovar pede motivo no `TransitionModal`); OE controlada sem `canReleaseQualitySystem` → desligados com `MOTIVO_SEM_LIBERACAO`; bloco "Inspeção" mostra a última validação (quem, quando, revisão, executores com treinado sim/não).
- Kanban: soltar em `approved`/`rejected` abre o Detail na aba de inspeção em vez de chamar `transition` (o banco recusaria).

- [ ] **Step 1: testes que falham:** N/A obrigatório sem observação não grava; com observação grava `notes`; sem permissão de inspecionar → botões desligados com motivo; "Aprovar inspeção" chama `aprovarInspecao(id, true, '')`; reprovar sem motivo não chama; sem permissão de liberar → desligado com motivo; Kanban em `approved` não chama `transition`.
- [ ] **Step 2–4:** FAIL → implementar → PASS; `check-ui-standard.sh` nos 3 → 0.
- [ ] **Step 5: Commit** `feat(qualidade): ficha de verificação e Aprovar inspeção`

### Task 6: Não conformidade com causa, ação corretiva e eficácia

**Files:** Modify `components/OperacionalNC.tsx` · Test: `__tests__/components/OperacionalNCEficacia.test.tsx` (novo)

- Criar continua igual (+ causa opcional na criação). "Encerrar NC" abre `Sheet`: causa e ação corretiva obrigatórias, foto da correção opcional (mesmo upload do checklist, bucket `operational-evidence`, grava `resolution_evidence_id`) → `encerrarNC`. NC encerrada mostra "Verificar eficácia": Eficaz / Não eficaz (pede motivo) → `registrarEficacia`; não eficaz reabre. "Histórico" lista `listarHistoricoNC`.

- [ ] **Step 1: testes que falham:** encerrar sem causa/ação não chama `encerrarNC`; com ambas chama com os valores; não eficaz → `registrarEficacia(id, false)` e a NC volta a "Aberta"; histórico aparece.
- [ ] **Step 2–4:** FAIL → implementar → PASS; `check-ui-standard.sh` → 0.
- [ ] **Step 5: Commit** `feat(qualidade): NC com causa, ação corretiva e eficácia`

### Task 7: Editor de modelos — critério, método e desativar

**Files:** Modify `components/OperacionalTemplateManager.tsx` · Test: `__tests__/components/OperacionalTemplateManagerFicha.test.tsx` (novo)

- Prop nova opcional `somenteTemplateId?: string` (mostra só esse modelo — usada pela Qualidade). Item ganha "Critério de aceitação" e "Método de verificação". Excluir item que tem resposta (erro de FK 23503) → oferece "Desativar" (`ativo=false`) em vez de falhar calado; item desativado aparece riscado com "Reativar". Excluir modelo com respostas → mensagem clara.

- [ ] **Step 1: testes que falham:** salvar item grava `criterio`/`metodo`; excluir com erro 23503 → oferece desativar e grava `ativo=false`; `somenteTemplateId` mostra só um.
- [ ] **Step 2–4:** FAIL → implementar → PASS; `check-ui-standard.sh` → 0.
- [ ] **Step 5: Commit** `feat(qualidade): ficha modelo com critério, método e desativar`

### Task 8: Qualidade — ficha modelo, SGQ e painel com números

**Files:** Modify `components/qualidade/ItemControladoSheet.tsx`, `components/qualidade/PainelDoNivel.tsx`, `components/qualidade/QualidadeModule.tsx`, `components/qualidade/ListaControlada.tsx` · Test: os testes de componente da Qualidade

- Sheet do serviço: seção "Ficha de verificação" — "Criar ficha" (cria `oe_checklist_templates` com o nome do serviço na org do item e grava `checklist_template_id`) ou "Editar ficha" (abre `OperacionalTemplateManager somenteTemplateId=…` num `Sheet`).
- Módulo: com o topo numa org cujo SGQ é outra, faixa "Esta organização usa o sistema da qualidade de <org>" e a lista/painel não aparecem (nada a editar aqui); configuração "Sistema da qualidade desta organização" (`definirSgq`) para quem pode editar.
- Painel: "aplicados com registro: N (meta M)" e "em obra em andamento: N (meta M)" com `contarAplicados` (materiais seguem "começa na fase 3"). Linha do serviço: coluna "Executores treinados" com `x de y` da inspeção aprovada mais recente, "—" sem inspeção.

- [ ] **Step 1: testes que falham:** criar ficha grava `checklist_template_id`; topo na SPE → faixa e sem lista; painel com 1 inspeção toda treinada em obra "Em andamento" → "aplicados com registro: 1 (meta 5)" e "em obra em andamento: 1 (meta 3)" (25 serviços, nível B); linha "1 de 2" quando um executor não estava treinado.
- [ ] **Step 2–4:** FAIL → implementar → PASS; `check-ui-standard.sh` nos alterados → 0; `orgContextGuard` verde.
- [ ] **Step 5: Commit** `feat(qualidade): ficha modelo, SGQ da SPE e painel com números`

### Task 9: Verificação na tela e publicação

- [ ] **Step 1:** testes de todos os arquivos tocados + guards (`orgContextGuard`, `segurancaMigrations`, `migrationsPrefixo`) + `npm run typecheck` → verdes.
- [ ] **Step 2: Tela (app local da frente, login do usuário, Playwright com `reload()` real)** — os critérios 1 a 8 e 4b/4c do desenho, com uma OE de teste numa obra "Em andamento" da Alpa e outra numa obra da SPE Garden (depois de apontar a SPE para a Alpa), anotando o resultado de cada um neste arquivo.
- [ ] **Step 3:** limpar o que o teste criou, com o usuário dizendo o que fica.
- [ ] **Step 4:** PR, **todos** os jobs verdes (ler a lista), merge, `conferir-producao.sh "Aprovar inspeção"`.
- [ ] **Step 5:** atualizar "Estado" aqui e no desenho; fechar a frente.

## Estado

- [x] Task 1 — `0f576eb2d`, `11137aa70`, `e260da5a4`, `c5d885df3` (migration …100000 aplicada em produção)
- [x] Task 2 — `d527568cd`, `028604792` (migration …110000 aplicada)
- [x] Task 3 — `4a7380cd2`
- [x] Task 4 — `2095caea2`
- [x] Task 5 — `08f0c1ff5`, `68b4c1660`
- [x] Task 6 — `11a9c3afe`, `baa28cb4b` (migration nova …120000, motivo da eficácia — aplicada pelo usuário em 26/11)
- [x] Task 7 — `d900e08a4`
- [x] Task 8 — `4d5633eb5`, `95353856d`
- [x] Revisão da branch inteira + onda de correção — `eecd427cc` (migration nova …130000 — aplicada pelo usuário em 26/11; prova 29/29)
- [ ] Task 9 — Steps 1–3 feitos (abaixo); Step 4 (PR/CI/merge) e Step 5 pendentes

### Decisões tomadas durante a execução (26/11)

- Migrations novas além do plano: **…120000** (`non_conformances.eficacia_motivo` + histórico da NC com descrição e motivo — o motivo do "não eficaz" não pode reescrever a descrição) e **…130000** (ficha obrigatória na OE controlada; permissões conferidas na organização DONA DO SERVIÇO controlado; desfazer o SGQ exige dono/admin do SGQ atual). As quatro migrations recusam reaplicação fora de ordem (guarda no topo; reaplicar = 100000 → 110000 → 120000 → 130000 com `SET qualidade.reaplicar_fase2_na_ordem='on'` na mesma sessão).
- Registro imutável: resposta, NC, validação e log de status de OE controlada não se apagam nem se movem; o serviço não se solta de OE com registro; histórico com autor gravado pelo banco.
- "Aprovar/Reprovar inspeção" pela RPC para toda OE (permissão só na controlada); Kanban em Aprovada/Reprovada abre a aba Inspeção.
- Acesso total da Qualidade na tela = e-mail de superadmin (o grupo DESENVOLVEDOR não conta — igual ao banco).
- Trocar a ficha de OE controlada fica travado (a ficha vem do serviço); editor da ficha abre como painel irmão do painel do item.

### Verificação na tela — 26/11, app local da frente, sessão do usuário, Chrome sem janela (com janela a página cai nesta máquina)

Preparo (funções do próprio app): procedimento enviado pela tela e aprovado no GED, curso criado pela tela, 2 executores treinados hoje; "Liberar OE" exige equipe e não há nenhuma equipe cadastrada → planejada → liberada → em execução direto no banco (que só confere a ficha de pré-início).

| Critério | Resultado |
|---|---|
| ficha | ✅ "Criar ficha" pela tela; editor gravou 2 itens pré-conclusão obrigatórios com critério/método |
| form | ✅ OE-0001 na Casa de Oração: 27 serviços listados; escolher o serviço aplicou a ficha e travou o modelo com o motivo; aviso "obrigatório para mandar para inspeção"; gravou serviço, ficha e executores |
| 1 | ✅ pedir inspeção com 2 itens sem resposta: "2 itens obrigatórios … não cumpridos", Confirmar desligado; UPDATE direto → P0001 com a mesma mensagem |
| 2 | ✅ "Não conforme" abriu NC; pedir inspeção: "1 item … · 1 não conformidade em aberto"; encerrar NC sem causa no banco → 23514; na tela, Encerrar desligado sem causa |
| 5 | ✅ encerrar com causa/ação → não eficaz com motivo (reabre) → encerrar → eficaz; histórico da NC com as 4 mudanças e o motivo na coluna própria |
| 4c | ✅ reinspeção: a resposta "não conforme" anterior ficou no histórico com o vínculo da NC e autor; excluir item com resposta → explica e oferece "Desativar" → `ativo=false` |
| 4 | ✅ "Aprovar inspeção" → OE aprovada; validação com quem, quando, versão do procedimento e executores (2, treinado: sim); painel "aplicados com registro: 1 (meta 6) · em obra em andamento: 1 (meta 3)"; linha "2 de 2" |
| 4b | ✅ topo na Garden: SGQ → Alpa pela tela (confirmação), faixa "usa o sistema da qualidade de Alpa…"; formulário de OE da Garden lista os serviços da Alpa |
| 6 | ✅ OE comum (sem serviço) aprovada pelo "Aprovar inspeção", sem executores congelados |
| 3 | ✅ só pela prova do banco (29/29 e anteriores): não há segundo usuário sem a permissão para conferir na tela |
| 7 | ⚠️ sugestão pelo código não conferida na tela: 18 de 19 obras sem orçamento com código; coberto por teste de componente |
| 8 | local: 16 arquivos / 266 testes; CI do PR pendente |

Visto e não explicado: 2 respostas 406 no console durante a criação/aprovação (não se repetiram ao reabrir as mesmas telas) — não conferi a origem.

Limpeza (26/11, combinada com o usuário): dados de teste apagados (2 OEs com registros e históricos — travas desligadas só dentro da transação e conferidas religadas —, ficha, curso, treinamentos, procedimento e arquivo do GED, avisos); **mantida** a Garden SPE apontando para o SGQ da Alpa.
