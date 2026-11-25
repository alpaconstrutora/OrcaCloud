# Qualidade SiAC — Fase 1: plano de implementação

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans, tarefa por tarefa. Passos com checkbox (`- [ ]`).

## Pedido original

> **25/11/2026 13:56** — [anexo: `Regimento-Geral-do-SIAC-Atualizado-Portaria-577-de-marco-de-2021-Revisado.pdf`] "avalie"
>
> **25/11/2026 14:00** — "seguir com plano dessas frentes por fase"
>
> **25/11/2026 (pós-publicação)** — "12. ... Corrigir" (o item do AppRouter, transcrito como chegou). Para a
> lista "ficou para depois", a decisão foi: corrigir já as duas que são defeito da fase 1 (arquivar item;
> nomes na lista de Treinados); a pergunta do VENCIDO fica para a fase 2. Ver "Ajustes pós-publicação (25/11)".
>
> Sessão: `c3015bbd-c4c3-4c7d-9bca-95fa2943cdac`

Decisões do usuário (a tabela completa está no desenho): "vamos de C"; "separar as duas coisas"
(procedimento no GED, treinamento no Treinamentos); "os dois" (equipe própria e empreiteira);
desenho aprovado com "ok" em 25/11.

**Goal:** módulo Qualidade com a lista de serviços e materiais controlados da organização, o
procedimento (GED) e o treinamento (Treinamentos) de cada item, a exceção por obra e a conta
"quanto falta para o nível B/A".

**Architecture:** 4 tabelas novas `quality_*` com RLS por conjunto + 1 RPC `SECURITY INVOKER`
para o treinamento em roda; regras de conta em funções puras (`utils/qualidadeSiac.ts`); um
service; um módulo em `components/qualidade/` montado igual ao Riscos (view própria,
permissão própria, padrão herdado de Obras).

**Tech Stack:** React + TypeScript + Vite, Supabase (Postgres/RLS/PostgREST), Vitest + Testing Library.

**Spec:** `docs/planos/2026-11-25-qualidade-siac-pbqph.md` (seção "Fase 1 — desenho"). Ler junto.

## Global Constraints

- REGRAS OBRIGATÓRIAS de `CLAUDE.md` (#1 UI, #2/#3 obra, #4 Sheet, #5 org do topo, #6 plano vivo, #7 migration, #8 frente/deploy).
- Org: `const { orgId } = useOrgContext()`; `null` = "Todas" e **nunca** bloqueia leitura; service aplica `.eq('organization_id', orgId)` só se houver org.
- Obras: `useStore().projects` (já só `OBRA`, sem projeto de sistema). Nenhum `=== 'OBRA'` nem `'Gestão Comercial'` literal.
- RLS: `organization_id IN (SELECT public.minhas_orgs_membro())`; `REVOKE TRUNCATE, REFERENCES, TRIGGER ... FROM authenticated`; função nova com `REVOKE EXECUTE ... FROM PUBLIC, anon` + `GRANT ... TO authenticated`.
- Banco: **nunca** `supabase db push`; aplicar com `npx supabase db query --linked -f <arquivo>`.
- GED: `approval_status` em **minúsculo** (`'rascunho'|'pendente'|'aprovado'|'rejeitado'`); categoria do procedimento = `'engenharia'`.
- Textos de tela: "começa na fase 2" (serviços) / "começa na fase 3" (materiais) no lugar de número; treinados **sem fração**: `8 (5 próprios, 3 empreit.)`.
- Chave de módulo `quality` / `canViewQuality` / view `quality` são do Pós-Obra — **não usar**. Novas: view `qualidade-siac`, módulo `qualidade_siac`, permissões `canViewQualitySystem` / `canEditQualitySystem`.
- UI: `Sheet` de `components/ui/sheet`, `StandardTable` de `components/ui/StandardTable` (estado vazio = prop `empty`), campos h-9, rótulo sem caixa alta, botão desligado com `title` do motivo, nada abaixo da tabela (painel vai acima).

## Review Focus

1. **Arredondamento com float**: N=25, nível B → `25·0,4 = 10,000000000000002` vira 11 com `Math.ceil` ingênuo; o esperado é 10. Conta em inteiros (Task 2).
2. **Mesma pessoa treinada em duas revisões** conta uma vez, como vigente; e duas presenças na mesma revisão também contam uma (Task 2).
3. **Pessoa de empreiteira já cadastrada com o mesmo CPF** na org: a RPC reaproveita a ficha, não duplica (Task 1).
4. **Procedimento sem versão ativa ou apagado do GED** (`active_version_id` nulo; FK virou `NULL`): linha mostra "sem procedimento", sem quebrar (Task 2).
5. **Topo em "Todas" com 2 orgs**: a carga replica nas duas sem duplicar; o painel mostra uma linha por org; registrar treinamento usa a org do item sem perguntar (Tasks 3 e 5).

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/aplicar_20271125600000_qualidade_siac_base.sql` (novo) | tabelas, RLS, trigger de mesma org, RPC do treinamento em obra |
| `types/qualidadeSiac.ts` (novo) | tipos do módulo |
| `utils/qualidadeSiac.ts` (novo) | listas fixas (Anexo 4, sugestão de materiais) e contas puras |
| `services/qualidadeSiacService.ts` (novo) | acesso ao banco |
| `utils/permissaoQualidadeSiac.ts` (novo) | ver/editar, copiado de `utils/permissaoRiscos.ts` |
| `types/users.ts`, `components/OrganizationUsers.tsx`, `utils/modulosPermitidos.ts`, `components/AppRouter.tsx`, `components/Layout.tsx` | fiação do módulo, nos mesmos pontos do Riscos |
| `components/qualidade/QualidadeModule.tsx` (novo) | casca: abas, nível alvo, painel, `orgTargetModal` |
| `components/qualidade/PainelDoNivel.tsx` (novo) | "quanto falta" por org |
| `components/qualidade/ListaControlada.tsx` (novo) | tabela Serviços/Materiais + carga inicial |
| `components/qualidade/ItemControladoSheet.tsx` (novo) | editar item: procedimento, curso, códigos, situação, treinados |
| `components/qualidade/RegistrarTreinamentoSheet.tsx` (novo) | presença em roda (próprios + empreiteira) |
| `components/qualidade/PorObra.tsx` (novo) | exceções por obra |

---

### Task 1: Migration — tabelas, RLS, RPC

**Files:**
- Create: `supabase/migrations/aplicar_20271125600000_qualidade_siac_base.sql`
- Test: `__tests__/segurancaMigrations.test.ts`, `__tests__/migrationsPrefixo.test.ts` (existentes)

**Interfaces:**
- Produces (banco):
  - `quality_settings(organization_id uuid PK → organizations ON DELETE CASCADE, nivel_alvo text NOT NULL DEFAULT 'B' CHECK (nivel_alvo IN ('B','A')), updated_at)`.
  - `quality_controlled_items(id uuid PK, organization_id uuid NOT NULL → organizations CASCADE, tipo text CHECK IN ('SERVICO','MATERIAL'), nome text NOT NULL CHECK btrim<>'', etapa text, origem text NOT NULL CHECK IN ('ANEXO4','PROPRIO','CLIENTE','FAD_DATEC'), anexo4_numero int CHECK 1..27, chave_padrao text, substitui_item_id uuid → self SET NULL, situacao text NOT NULL DEFAULT 'ATIVO' CHECK IN ('ATIVO','DISPENSADO','ARQUIVADO'), justificativa text, procedure_document_id uuid → opura_documents SET NULL, training_course_id uuid → training_courses SET NULL, ordem int NOT NULL DEFAULT 0, created_at, updated_at, created_by uuid DEFAULT auth.uid())`; `CHECK (situacao <> 'DISPENSADO' OR btrim(coalesce(justificativa,'')) <> '')`; `UNIQUE (organization_id, chave_padrao)` (não parcial — NULLs não colidem, e o PostgREST precisa de constraint não parcial para `onConflict`).
  - `quality_controlled_item_codes(item_id uuid → items CASCADE, item_code text CHECK btrim<>'', PRIMARY KEY (item_id, item_code))`.
  - `quality_project_exclusions(project_id uuid → projects CASCADE, item_id uuid → items CASCADE, motivo text NOT NULL CHECK btrim<>'', created_at, created_by, PRIMARY KEY (project_id, item_id))`.
  - Trigger `BEFORE INSERT OR UPDATE` em `quality_controlled_items`: `procedure_document_id`, `training_course_id` e `substitui_item_id` (quando não nulos) pertencem à mesma org do item (`opura_documents.organization_id`, `training_courses.org_id`); senão `RAISE ... ERRCODE '42501'`.
  - Policies (SELECT/INSERT/UPDATE/DELETE): settings e items por `organization_id IN (SELECT public.minhas_orgs_membro())`; codes por `item_id IN (SELECT id FROM quality_controlled_items)`; exclusions por `EXISTS (SELECT 1 FROM quality_controlled_items i JOIN projects p ON p.id = project_id WHERE i.id = item_id AND p.organization_id = i.organization_id)`.
  - `public.quality_registrar_treinamento_em_obra(p_org uuid, p_course_id uuid, p_data date, p_instrutor text, p_local text, p_employee_ids uuid[], p_novos_terceiros jsonb) RETURNS integer` — `LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp`. Valida: `p_org IN (SELECT minhas_orgs_membro())`; curso da org; cada `p_employee_ids` da org; cada elemento de `p_novos_terceiros` = `{ "nome": text obrigatório, "cpf": text?, "empreiteira": text? }`. Terceiro com `cpf` que já existe em `employees` da org → reaproveita o id; senão insere `employees(org_id, name, cpf, role 'Terceirizado', contract_type 'EMPREITEIRO', status 'ATIVO', hire_date CURRENT_DATE, base_salary 0, academy_externo TRUE, notes 'Pessoal de empreiteira cadastrado pelo registro de treinamento em obra' || ' — ' || empreiteira)`. Para cada pessoa (distintas): insere `employee_trainings(org_id, employee_id, course_id, data_realizacao p_data, instrutor, local, carga_horaria do curso, aprovado TRUE, status 'ATIVO', origem 'MANUAL')`. Retorna o número de registros. Tudo numa transação.
  - `updated_at` por trigger nas duas tabelas que têm a coluna; `REVOKE TRUNCATE, REFERENCES, TRIGGER` nas 4 tabelas; `REVOKE EXECUTE ... FROM PUBLIC, anon` + `GRANT EXECUTE ... TO authenticated` na RPC e nas funções de trigger.

- [ ] **Step 1:** conferir que o prefixo é livre: `ls supabase/migrations | grep 20271125600000` → vazio (se outra frente usou, subir para o próximo livre e renomear).
- [ ] **Step 2:** escrever a migration com `SET lock_timeout = '3s'` no topo, idempotente (`IF NOT EXISTS`, `DROP POLICY IF EXISTS` antes de `CREATE POLICY`).
- [ ] **Step 3:** `npx vitest run __tests__/segurancaMigrations.test.ts __tests__/migrationsPrefixo.test.ts` → PASS.
- [ ] **Step 4:** aplicar: `npx supabase db query --linked -f supabase/migrations/aplicar_20271125600000_qualidade_siac_base.sql` → sem erro. Rodar de novo → sem erro (idempotente).
- [ ] **Step 5: provar com sessão real, numa transação que termina em `ROLLBACK`** (arquivo de rascunho no scratchpad, não versionado), com `SET LOCAL role authenticated` e `set_config('request.jwt.claims', '{"sub":"<uid de membro da Alpa>","role":"authenticated"}', true)`:
  - insert de item `DISPENSADO` sem justificativa → erro `23514`;
  - insert de item com `organization_id` de org da qual o uid não é membro → erro de RLS;
  - `procedure_document_id` de documento de outra org → erro `42501`;
  - RPC com 1 colaborador próprio + `[{"nome":"Teste Empreiteira","cpf":"00000000191","empreiteira":"X"}]` → retorna 2; chamar de novo com o mesmo CPF → retorna 2 e `count(*) FROM employees WHERE cpf='00000000191' AND org_id=<alpa>` = 1;
  - repetir o `SELECT` das 4 tabelas com o uid de um usuário de OUTRA org → 0 linhas.
  Esperado: tudo como descrito; `ROLLBACK` no fim (nada fica no banco).
- [ ] **Step 6: Commit** — `git add supabase/migrations/aplicar_20271125600000_qualidade_siac_base.sql && git commit -m "feat(qualidade): tabelas, RLS e RPC do treinamento em obra"`

### Task 2: Regras puras (listas fixas e contas)

**Files:**
- Create: `types/qualidadeSiac.ts`, `utils/qualidadeSiac.ts`
- Test: `__tests__/qualidadeSiacRegras.test.ts`

**Interfaces:**
- Produces (`types/qualidadeSiac.ts`):
  - `type TipoItemControlado = 'SERVICO' | 'MATERIAL'`; `type OrigemItem = 'ANEXO4' | 'PROPRIO' | 'CLIENTE' | 'FAD_DATEC'`; `type SituacaoItem = 'ATIVO' | 'DISPENSADO' | 'ARQUIVADO'`; `type NivelSiac = 'B' | 'A'`.
  - `interface ItemControlado { id; organization_id; tipo; nome; etapa: string | null; origem; anexo4_numero: number | null; chave_padrao: string | null; substitui_item_id: string | null; situacao; justificativa: string | null; procedure_document_id: string | null; training_course_id: string | null; ordem: number; codigos: string[] }`.
  - `interface ProcedimentoResumo { id: string; nome: string; revisao: string | null; approval_status: string; versao_ativa_em: string | null }`.
  - `interface RegistroTreinamento { employee_id: string; data_realizacao: string; aprovado: boolean; externo: boolean }` (`externo` = `academy_externo || contract_type === 'EMPREITEIRO'`).
  - `interface MetaDoNivel { comProcedimento: number; aplicadosComRegistro: number; emObraEmAndamento: number }`.
- Produces (`utils/qualidadeSiac.ts`):
  - `ANEXO4_SERVICOS: ReadonlyArray<{ numero: number; etapa: string; nome: string; chave: string }>` — os 27 da tabela do desenho, texto literal, `chave` = `'ANEXO4-01'`…`'ANEXO4-27'`; etapas: "Serviços preliminares", "Fundações", "Estrutura", "Vedações verticais", "Vedações horizontais", "Esquadrias", "Pintura", "Sistemas prediais".
  - `SUGESTAO_MATERIAIS: ReadonlyArray<{ nome: string; chave: string }>` — os 24 da seção "Chamadas minhas" do desenho, `chave` = `'MAT-01'`…`'MAT-24'`.
  - `MINIMO_MATERIAIS = 20`.
  - `metaDoNivel(n: number, tipo: TipoItemControlado, nivel: NivelSiac): MetaDoNivel` — percentual inteiro (SERVICO B=40, MATERIAL B=50, A=100); `Math.ceil((n * pct) / 100)`, `Math.ceil((n * pct) / 200)`, `Math.ceil((n * pct) / 400)` — **só inteiros no numerador** (Review Focus 1).
  - `procedimentoConta(p: ProcedimentoResumo | null): boolean` — `p !== null && p.versao_ativa_em !== null && p.approval_status === 'aprovado'`.
  - `rotuloDoProcedimento(p: ProcedimentoResumo | null): string` — `null` ou sem versão ativa → `'sem procedimento'`; senão `` `${p.nome} rev.${p.revisao ?? '—'} ${p.approval_status}` ``.
  - `contarTreinados(registros: RegistroTreinamento[], versaoAtivaEm: string | null): { proprios: number; empreiteira: number; revisaoAnterior: number }` — só `aprovado`; pessoas distintas; vigente = `data_realizacao >= versaoAtivaEm.slice(0,10)`; quem tem registro vigente não entra em `revisaoAnterior`; `versaoAtivaEm === null` → todos em `revisaoAnterior`.
  - `rotuloDosTreinados(c): string` — `'—'` se 0 vigentes; senão `` `${p+e} (${p} próprios, ${e} empreit.)` ``.

- [ ] **Step 1: Write the failing test** `__tests__/qualidadeSiacRegras.test.ts`:
  - `ANEXO4_SERVICOS.length === 27`, números 1..27 sem buraco, `[5].nome === 'concretagem de peça estrutural'` (índice do nº 6), 8 etapas distintas; `SUGESTAO_MATERIAIS.length === 24` e chaves únicas.
  - `metaDoNivel(27,'SERVICO','B')` → `{11,6,3}`; `(25,'SERVICO','B')` → `{10,5,3}`; `(27,'SERVICO','A')` → `{27,14,7}`; `(20,'MATERIAL','B')` → `{10,5,3}`; `(20,'MATERIAL','A')` → `{20,10,5}`; `(0,'SERVICO','B')` → `{0,0,0}`.
  - `procedimentoConta` falso para `null`, para `approval_status:'rascunho'`, para `'aprovado'` com `versao_ativa_em:null`; verdadeiro para `'aprovado'` com data.
  - `rotuloDoProcedimento(null) === 'sem procedimento'`.
  - `contarTreinados`: versão em `'2026-11-20T10:00:00Z'`; registros: A próprio 2026-11-21, A próprio 2026-11-22 (duplicado), B empreiteira 2026-11-20, C próprio 2026-10-01, D próprio 2026-10-01 + D próprio 2026-11-25, E `aprovado:false` 2026-11-25 → `{ proprios: 2, empreiteira: 1, revisaoAnterior: 1 }` (A, D vigentes; B vigente no mesmo dia; C anterior; E fora).
  - `rotuloDosTreinados({proprios:5, empreiteira:3, revisaoAnterior:0}) === '8 (5 próprios, 3 empreit.)'`; com zero vigentes → `'—'`.
- [ ] **Step 2:** `npx vitest run __tests__/qualidadeSiacRegras.test.ts` → FAIL (módulo inexistente).
- [ ] **Step 3:** implementar os tipos e as funções acima.
- [ ] **Step 4:** mesmo comando → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(qualidade): listas do Anexo 4 e contas do nível"`

### Task 3: Service

**Files:**
- Create: `services/qualidadeSiacService.ts`
- Test: `__tests__/qualidadeSiacService.test.ts` (mock de `../lib/supabase` com cadeia que registra chamadas, como `__tests__/blueprintNbr12721Service.test.ts`)

**Interfaces:**
- Consumes: tipos e listas da Task 2.
- Produces `export const qualidadeSiacService = {`
  - `listarItens(organizationId?: string | null): Promise<ItemControlado[]>` — `quality_controlled_items` com `codigos:quality_controlled_item_codes(item_code)` achatado; `order('tipo').order('ordem')`; `.eq` só com org.
  - `carregarAnexo4(organizationId: string): Promise<number>` — upsert das 27 linhas (`tipo 'SERVICO'`, `origem 'ANEXO4'`, `anexo4_numero`, `chave_padrao`, `etapa`, `ordem = numero`) com `{ onConflict: 'organization_id,chave_padrao', ignoreDuplicates: true }`; retorna quantas entraram.
  - `carregarSugestaoMateriais(organizationId: string): Promise<number>` — idem com `SUGESTAO_MATERIAIS` (`tipo 'MATERIAL'`, `origem 'PROPRIO'`).
  - `criarItem(organizationId: string, input: Pick<ItemControlado,'tipo'|'nome'|'etapa'|'origem'>): Promise<ItemControlado>`.
  - `atualizarItem(id: string, patch: Partial<Pick<ItemControlado,'nome'|'etapa'|'origem'|'substitui_item_id'|'situacao'|'justificativa'|'procedure_document_id'|'training_course_id'>>): Promise<void>`.
  - `definirCodigos(itemId: string, codigos: string[]): Promise<void>` — apaga os ausentes, insere os novos (trim, sem vazios, sem repetidos).
  - `listarNiveis(organizationId?: string | null): Promise<Record<string, NivelSiac>>` — org sem linha = `'B'` (quem chama completa).
  - `definirNivel(organizationId: string, nivel: NivelSiac): Promise<void>` — upsert por `organization_id`.
  - `resumirProcedimentos(documentIds: string[]): Promise<Record<string, ProcedimentoResumo>>` — `opura_documents` `select('id, nome, revisao, approval_status, active_version:opura_document_versions!fk_active_version(created_at)')` `.in('id', ids)`; lista vazia não consulta.
  - `listarTreinamentos(courseIds: string[]): Promise<Record<string, RegistroTreinamento[]>>` — `employee_trainings` `select('course_id, employee_id, data_realizacao, aprovado, employees(contract_type, academy_externo)')` `.in('course_id', ids)`, agrupado por curso; lista vazia não consulta.
  - `listarExclusoes(projectId: string): Promise<Array<{ item_id: string; motivo: string }>>`, `excluirDaObra(projectId: string, itemId: string, motivo: string): Promise<void>`, `reincluirNaObra(projectId: string, itemId: string): Promise<void>`.
  - `registrarTreinamentoEmObra(input: { organizationId: string; courseId: string; data: string; instrutor: string; local: string; employeeIds: string[]; novosTerceiros: Array<{ nome: string; cpf?: string; empreiteira?: string }> }): Promise<number>` — `supabase.rpc('quality_registrar_treinamento_em_obra', {...})`.
  - `}` — todo erro do supabase vira `throw new Error(error.message)`.

- [ ] **Step 1: Write the failing test:** `listarItens(null)` não chama `eq`; `listarItens('org-1')` chama `eq('organization_id','org-1')`; `carregarAnexo4('org-1')` chama `upsert` com 27 linhas e `{ onConflict: 'organization_id,chave_padrao', ignoreDuplicates: true }`; `resumirProcedimentos([])` e `listarTreinamentos([])` não chamam `from`; `definirCodigos('i1', [' 92873 ', '92873', ''])` grava só `['92873']`; `registrarTreinamentoEmObra` chama `rpc` com `p_org, p_course_id, p_data, p_instrutor, p_local, p_employee_ids, p_novos_terceiros`.
- [ ] **Step 2:** `npx vitest run __tests__/qualidadeSiacService.test.ts` → FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(qualidade): service do módulo"`

### Task 4: Permissão e fiação do módulo

**Files:**
- Create: `utils/permissaoQualidadeSiac.ts`
- Modify: `types/users.ts` (~415, junto de `canViewRisks`); `components/OrganizationUsers.tsx` (~219 default `canViewQualitySystem: true, canEditQualitySystem: false`; ~308 owner/admin `canEditQualitySystem: true`; ~445 linha `{ group: 'Operação de Obra', title: 'Qualidade (SiAC)', view: 'canViewQualitySystem', edit: 'canEditQualitySystem' }`; ~1149 herança de `canViewBudget`/`canEditBudget` igual à de Riscos); `utils/modulosPermitidos.ts` (import; linhas 40/44/48 igual a `riscos`; 89/105 `false`; 126-130 cálculo; 242 `MODULO_DO_ITEM_DE_BUSCA['qualidade-siac'] = 'qualidade_siac'`)
- Test: `__tests__/permissaoQualidadeSiac.test.ts`; acrescentar caso em `__tests__/modulosPermitidosTodasOrgs.test.ts`

**Interfaces:**
- Produces: `podeVerQualidadeSiac({ permissoes, matrizDoCargo, podeVerObras }): boolean`, `podeEditarQualidadeSiac({ permissoes, administrador, papel? }): boolean`, `MOTIVO_SEM_EDICAO_QUALIDADE: string` — mesma ordem de decisão de `utils/permissaoRiscos.ts`, trocando as chaves; `modulosPermitidos(...).qualidade_siac: boolean`.

- [ ] **Step 1: Write the failing test:** espelhar `__tests__/permissaoRiscos*` (se não houver, os casos: `canViewQualitySystem:false` explícito vence obras=true; sem chave herda `podeVerObras`; admin sempre edita; `papel:'viewer'` sem chave não edita) e, em `modulosPermitidosTodasOrgs`, `qualidade_siac` segue `obras` em "Todas".
- [ ] **Step 2:** rodar os dois arquivos → FAIL.
- [ ] **Step 3:** implementar e editar os pontos listados.
- [ ] **Step 4:** → PASS; `npx tsc --noEmit -p .` sem erro novo.
- [ ] **Step 5: Commit** — `git commit -m "feat(qualidade): permissão própria do módulo"`

### Task 5: Casca do módulo, painel do nível e lista controlada

**Files:**
- Create: `components/qualidade/QualidadeModule.tsx`, `components/qualidade/PainelDoNivel.tsx`, `components/qualidade/ListaControlada.tsx`
- Modify: `components/AppRouter.tsx` (lazy ~86; import ~77; `else if (activeView === 'qualidade-siac') allowed = isModuleAllowed('canViewQualitySystem', 'qualidade_siac', naOrg => naOrg('canViewBudget', 'obras'))` ~391; `case 'qualidade-siac'` ~1366 com `podeEditar` igual ao de Riscos); `components/Layout.tsx` (busca ~451 `{ id: 'qualidade-siac', label: 'Qualidade', group: 'Engenharia', icon: BadgeCheck }`; NavItem desktop ~949 e mobile ~1361 logo após Riscos, `(mod.qualidade_siac || isDev)`; `BadgeCheck` no import do lucide)
- Test: `__tests__/components/QualidadeModule.test.tsx` (`// @vitest-environment jsdom`; mocks como `__tests__/components/RiscosModule.test.tsx`)

**Interfaces:**
- Consumes: service (Task 3), regras (Task 2), `useOrgContext`/`useOrgWriteTarget`/`forEachTargetOrg`/`partialFailureNote` de `hooks/useOrgContext`.
- Produces: `QualidadeModule: React.FC<{ podeEditar: boolean }>` (default export); `PainelDoNivel` props `{ itens: ItemControlado[]; niveis: Record<string, NivelSiac>; procedimentos: Record<string, ProcedimentoResumo>; nomesDasOrgs: Record<string, string>; podeEditar: boolean; onNivel(orgId: string, nivel: NivelSiac): void }`; `ListaControlada` props `{ tipo: TipoItemControlado; itens; procedimentos; treinamentos: Record<string, RegistroTreinamento[]>; podeEditar; onCarregar(): void; onNovo(): void; onAbrir(item: ItemControlado): void }`.
- Carga: `listarItens(orgId)` e `listarNiveis(orgId)`; depois `resumirProcedimentos` dos `procedure_document_id` e `listarTreinamentos` dos `training_course_id` presentes; nomes das orgs de `useStore().organizations`; recarrega após cada gravação.
- Comportamento: abas `Lista controlada` / `Por obra`; dentro de Lista, sub-abas `Serviços` / `Materiais`. Painel ACIMA da tabela: por org (nome da org só quando há mais de uma), "Serviços (N) · procedimento aprovado X/meta · aplicados com registro — começa na fase 2 · em obra em andamento — começa na fase 2"; materiais idem com "fase 3" e, se N < 20, "abaixo do mínimo do Anexo 4: N de 20". Seletor do nível por org (desligado sem `podeEditar`, com motivo). Tabela: Nº, Nome, Etapa, Origem, Procedimento (`rotuloDoProcedimento`), Treinados (`rotuloDosTreinados`), Códigos (contagem); dispensados mostram a justificativa na coluna Procedimento. Estado vazio (`empty` do `StandardTable`): serviços → "Carregar a lista mínima do Anexo 4 (27 serviços)"; materiais → "Carregar sugestão de materiais (editável)". Carregar e Novo usam `resolveWriteOrg('all-allowed')` + `forEachTargetOrg`, toast com `partialFailureNote`.

- [ ] **Step 1: Write the failing test:** (a) lista vazia → botão "Carregar a lista mínima do Anexo 4 (27 serviços)"; clicar chama `carregarAnexo4` com a org do topo; (b) com 27 serviços ativos e nível B → texto `procedimento aprovado 0/11` e `começa na fase 2`, e nenhum texto no formato `\d+ de \d+` na coluna Treinados; (c) 19 materiais → `abaixo do mínimo do Anexo 4: 19 de 20`; (d) itens de 2 orgs → duas linhas no painel, cada uma com o nome da org; (e) `podeEditar:false` → botão de carga desligado com `title` = `MOTIVO_SEM_EDICAO_QUALIDADE`.
- [ ] **Step 2:** `npx vitest run __tests__/components/QualidadeModule.test.tsx` → FAIL.
- [ ] **Step 3:** implementar os 3 componentes e a fiação.
- [ ] **Step 4:** → PASS; `bash scripts/check-ui-standard.sh components/qualidade/QualidadeModule.tsx` (e os outros dois) → exit 0; `npx vitest run __tests__/orgContextGuard.test.ts` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(qualidade): módulo com painel do nível e lista controlada"`

### Task 6: Sheet do item

**Files:**
- Create: `components/qualidade/ItemControladoSheet.tsx`
- Modify: `components/qualidade/QualidadeModule.tsx` (abrir pelo `onAbrir` e pelo `onNovo`)
- Test: `__tests__/components/ItemControladoSheet.test.tsx`

**Interfaces:**
- Consumes: `DocumentPicker` (`components/ui/DocumentPicker`, `excludeIntegrated`, `organizationId` = org do item); `DatabasePickerModal` (`components/DatabasePickerModal`, `multiple` + `onSelectMany` → `item.code`); `trainingsService.listTrainingCourses(orgId)` e `createTrainingCourse` (curso novo: `nome` = nome do item, `categoria 'QUALIDADE'`, `modalidade 'PRESENCIAL'`, `status 'ATIVO'`, `is_obrigatorio false`, `roles_obrigatorios []`, `carga_horaria 1`); `documentService.uploadNewDocument(docData, file)` com `categoria 'engenharia'` para "Enviar procedimento".
- Produces: `ItemControladoSheet` props `{ open: boolean; item: ItemControlado | null; tipoNovo: TipoItemControlado; itensDaOrg: ItemControlado[]; procedimento: ProcedimentoResumo | null; treinamentos: RegistroTreinamento[]; podeEditar: boolean; onClose(): void; onSaved(): void; onRegistrarTreinamento(item: ItemControlado): void }`.
- Comportamento: campos nome, etapa, origem, "substitui o item nº" (só itens `ANEXO4` da mesma org), situação; `DISPENSADO` exige justificativa (erro no campo antes de salvar); procedimento: escolher do GED / enviar arquivo / desvincular, mostra `rotuloDoProcedimento` e, se não aprovado, o aviso "só conta quando aprovado no GED"; treinamento: escolher curso da org / criar curso presencial; códigos: lista com remover + "Buscar na Base" (composição para serviço, insumo para material — rótulo muda pelo `tipo`); seção Treinados: nome, próprio/empreiteira, data, vigente ou revisão anterior + botão "Registrar treinamento em obra" (desligado sem curso, com motivo "Escolha o curso de treinamento primeiro"). `Sheet` com `dirty` para avisar alteração não salva.

- [ ] **Step 1: Write the failing test:** salvar `DISPENSADO` sem justificativa não chama `atualizarItem` e mostra erro no campo; escolher documento chama `atualizarItem(id, { procedure_document_id })`; documento `rascunho` mostra "só conta quando aprovado no GED"; selecionar 2 itens na Base chama `definirCodigos(id, [c1, c2])`; sem curso → "Registrar treinamento em obra" desligado com o motivo.
- [ ] **Step 2:** rodar → FAIL. **Step 3:** implementar. **Step 4:** → PASS; `check-ui-standard.sh` no arquivo → exit 0.
- [ ] **Step 5: Commit** — `git commit -m "feat(qualidade): editar item controlado"`

### Task 7: Registrar treinamento em obra

**Files:**
- Create: `components/qualidade/RegistrarTreinamentoSheet.tsx`
- Modify: `components/qualidade/QualidadeModule.tsx`
- Test: `__tests__/components/RegistrarTreinamentoSheet.test.tsx`

**Interfaces:**
- Consumes: `qualidadeSiacService.registrarTreinamentoEmObra`; colaboradores ativos da org do item via `laborService.listEmployees(orgId)` (a lista já inclui fichas de empreiteira); obras de `useStore().projects` da mesma org para o campo Local.
- Produces: props `{ open: boolean; item: ItemControlado; onClose(): void; onSaved(n: number): void }`.
- Comportamento: data (hoje por padrão), instrutor, local (obra, lista; texto gravado = nome da obra), presentes (multi-seleção com busca, marca "empreiteira" nas fichas externas), "+ Pessoa de empreiteira sem cadastro" (nome obrigatório, CPF e empreiteira opcionais). Org = `item.organization_id`, sem perguntar. Salvar desligado sem ninguém presente (motivo no botão). Toast "N registros de treinamento gravados".

- [ ] **Step 1: Write the failing test:** 2 colaboradores + 1 novo terceiro → `registrarTreinamentoEmObra` chamado com `organizationId = item.organization_id`, `employeeIds` dos 2 e `novosTerceiros: [{ nome, cpf, empreiteira }]`; terceiro sem nome não é enviado e mostra erro; sem presentes → salvar desligado com motivo.
- [ ] **Step 2:** → FAIL. **Step 3:** implementar. **Step 4:** → PASS; `check-ui-standard.sh` → exit 0.
- [ ] **Step 5: Commit** — `git commit -m "feat(qualidade): registrar treinamento em obra"`

### Task 8: Por obra

**Files:**
- Create: `components/qualidade/PorObra.tsx`
- Modify: `components/qualidade/QualidadeModule.tsx`
- Test: `__tests__/components/PorObra.test.tsx`

**Interfaces:**
- Consumes: `useStore().projects`; `listarExclusoes`, `excluirDaObra`, `reincluirNaObra`.
- Produces: props `{ itens: ItemControlado[]; podeEditar: boolean }`.
- Comportamento: seletor de obra (só as de `useStore().projects`, filtradas pela org do topo quando houver); tabela dos itens **ativos** da org da obra com coluna "Nesta obra": "aplica" ou "não se aplica — motivo"; marcar "não se aplica" abre campo de motivo obrigatório; "voltar a aplicar" remove a exceção.

- [ ] **Step 1: Write the failing test:** store com 1 obra + projeto de sistema → seletor mostra só a obra; marcar "não se aplica" sem motivo não chama `excluirDaObra`; com motivo chama `excluirDaObra(projectId, itemId, motivo)`; item `DISPENSADO` não aparece.
- [ ] **Step 2:** → FAIL. **Step 3:** implementar. **Step 4:** → PASS; `check-ui-standard.sh`, `check-project-classification.sh components/qualidade/PorObra.tsx`, `check-system-projects.sh components/qualidade/PorObra.tsx` → exit 0.
- [ ] **Step 5: Commit** — `git commit -m "feat(qualidade): lista controlada por obra"`

### Task 9: Verificação ponta a ponta e publicação

- [ ] **Step 1:** suíte leve dos arquivos novos + `npx vitest run __tests__/orgContextGuard.test.ts __tests__/segurancaMigrations.test.ts __tests__/migrationsPrefixo.test.ts` + `npx tsc --noEmit -p .` → tudo verde.
- [ ] **Step 2: Na tela (app local, login digitado pelo usuário)**, org Alpa, seguindo o "Critério de pronto da Fase 1" do desenho, itens 1 a 7 (inclui 3b), anotando o resultado de cada um neste arquivo. O item 3 exige **aprovar um documento no GED** (fluxo `submitForApproval` → `approveDocument`): é a primeira aprovação da história do GED (`opura_document_approvals` = 0); se falhar, parar e reportar — o conserto entra na fase 1.
- [ ] **Step 3:** limpar o que o teste criou em produção, com o usuário dizendo o que fica.
- [ ] **Step 4:** PR (`gh pr create`), esperar **todos** os jobs do CI verdes (conferir a lista, não o resumo), merge; `bash scripts/conferir-producao.sh "Carregar a lista mínima do Anexo 4"` → domínio servindo.
- [ ] **Step 5:** atualizar "Estado" no desenho e neste arquivo com os commits; fechar a frente (`bash scripts/fechar-frente.sh qualidade-siac`).

## Estado

- [x] Task 1 — `d75f99802`, `52adaede5` (migration aplicada em produção em 25/11)
- [x] Task 2 — `052606395`
- [x] Task 3 — `631a829d7`
- [x] Task 4 — `8e760f7cf`
- [x] Task 5 — `f9565d624`, `f0fb39f66`
- [x] Task 6 — `a8f3e96ca`, `5c421138f`
- [x] Task 7 — `746eaba45`
- [x] Task 8 — `3aabfa680`
- [x] Revisão da branch inteira + onda de correção — `2406b1d99`
- [ ] Task 9 — Steps 1 e 2 feitos (abaixo); Step 3 (limpeza) aguarda o usuário; Step 4 (PR/CI/merge) e Step 5 pendentes

### Decisões tomadas durante a execução (25/11)

- Painel mostra a **meta** ao lado de "começa na fase 2/3" (ex.: "meta 6 — começa na fase 2"): o critério 4 pedia 11/6/3 e a regra de cálculo pedia "nunca zero"; mostra o alvo sem inventar contagem.
- Em "Todas", o painel lista só as organizações que já têm lista ou nível (o usuário tem 10+ orgs; uma linha vazia por org poluiria).
- CPF de pessoa de empreiteira gravado como `000.000.000-00` e casado pelos dígitos com a ficha existente (o índice `idx_employees_cpf_unique` compara texto cru).
- A organização de um item é imutável depois de criado.
- Procedimento só conta se a aprovação no GED for posterior à versão ativa; documento arquivado no GED não conta.
- Vigência do treinamento: dia posterior ao da versão ativa, ou mesmo dia com o registro feito depois dela.
- Em "Todas", edita a Qualidade só quem pode editar em todas as suas organizações (Riscos/Treinamentos não mexidos).
- "Novo" cria só nome/etapa/origem (replica em "Todas"); procedimento, curso e códigos se ligam ao editar.

### Pendências conhecidas (não bloqueiam a fase 1)

- AppRouter decide "Todas" pelo `activeOrganizationId` cru: com **empresa** no topo, quem é viewer em outra org vê a Qualidade só leitura (mais restritivo; não abre gravação). Corrigir derivando o membro de `useOrgContext().orgId`. → ✅ corrigido em 25/11 (`ef28ef630`, ver "Ajustes pós-publicação").
- Funções antigas do Pós-Obra `quality_calculate_score`, `quality_emit_event`, `quality_lock_condition` executáveis por PUBLIC/anon (anteriores a esta frente).
- Item não pode ser arquivado/apagado pela tela (só dispensado); nomes da lista de Treinados não recarregam para pessoa nova; status VENCIDO do treinamento não é considerado — perguntar na fase 2. → ✅ arquivar corrigido (`dd38134fb`) e nomes corrigidos (`8222c276c`) em 25/11; VENCIDO segue para a fase 2.

### Verificação na tela — 25/11, app local da frente, login do usuário, org Alpa

| Critério | Resultado |
|---|---|
| 1 | ✅ "Carregar a lista mínima" → 27 serviços, nº 1–27, etapas do Anexo 4; banco: 27 ativos, 27 chaves distintas. (Depois de carregado o botão some; "não duplica" é garantido pelo UNIQUE + `ignoreDuplicates`.) |
| 2 | ✅ Dispensar sem justificativa → "Escreva por que o item foi dispensado." no campo; o banco também recusa (prova SQL da Task 1). |
| 3 | ✅ Procedimento enviado pela tela ficou `rascunho` e não contou (0/10); 1ª aprovação da história do GED (`submitForApproval` → `approveDocument`, chamados no navegador com a sessão do usuário) → "procedimento aprovado 1/10". |
| 3b | ✅ Treinamento de hoje (2 próprios + 1 empreiteira, que ganhou ficha sem e-mail) → "3 (2 próprios, 1 empreit.)"; revisão nova enviada → "Nenhum na revisão vigente · 3 treinado(s) em revisão anterior" e "nova revisão aguardando aprovação" (0/10); aprovar a revisão → 1/10. |
| 4 | ✅ 27 serviços: B "0/11 · meta 6 · meta 3"; A "0/27 · meta 14 · meta 7"; 2 dispensados (N=25) em B "0/10 · meta 5 · meta 3". |
| 5 | ✅ 24 materiais sem aviso; dispensando 5 → "abaixo do mínimo do Anexo 4: 19 de 20". |
| 6 | ✅ "Por obra": 14 obras da Alpa, só OBRA (a "Igreja Divino Espirito Santo" aparece 1×; orçamento/diário/planejamento e "Gestão Comercial" fora); 44 itens ativos (25+19), sem dispensados; exceção com motivo gravada e desfeita (banco: 0 exceções). |
| 7 | ✅ por SQL com sessão real (Task 1): outra org não lê nem grava. |
| 8 | ✅ local: 12 arquivos/129 testes, tsc 0, check-* 0. CI do PR: pendente. |

Não conferido na tela: "Buscar na Base" (códigos) e "Escolher do GED" — cobertos só por teste de componente.

### Ajustes pós-publicação (25/11)

Pedido: ver o 3º bloco de "Pedido original" (25/11, pós-publicação). Branch `feat/qualidade-ajustes`.

- [x] **A1 — Permissão de edição pela organização do `useOrgContext()` (REGRA #5 item 5).** O que muda: o
  `AppRouter` deixa de decidir pelo `activeOrganizationId` cru (com empresa no topo ele é `null` e virava
  "Todas", `every` sobre todas as orgs); o `QualidadeModule` decide pela MESMA org que mostra, com
  `podeEditarQualidadeSiacNoContexto` (`utils/permissaoQualidadeSiac.ts`): org resolvida → membro dela;
  "Todas" → `podeEditarQualidadeSiacEmTodas`; o `AppRouter` só passa `acessoTotal` (grupo DESENVOLVEDOR ou
  e-mail de acesso total). Por que dentro do módulo: o `currentMember`/`activeOrg` do `AppRouter` também
  servem o guard de rota e Riscos/Treinamentos (fora do escopo), e decidir onde a tela lê a org garante
  que permissão e lista nunca divergem. Pronto quando: empresa no topo (cru null, org A) + editora em A e
  visitante em B → edita; "Todas" com a mesma usuária → só leitura. ✅ `ef28ef630` —
  `__tests__/permissaoQualidadeSiac.test.ts` (6 novos) e `QualidadeModule.test.tsx` (e2, e3, e4).
- [x] **A2 — Nomes da lista de Treinados recarregam para pessoa nova.** O que muda: a busca no RH do Sheet
  do item segue o conjunto de `employee_id` sem nome conhecido (antes só a passagem sem→com registro) e soma
  ao que já conhece; quem o RH não devolve não faz a busca repetir. Pronto quando: 2º registro com pessoa
  nova → o nome aparece, e recarga com as mesmas pessoas não busca de novo. ✅ `8222c276c` —
  `ItemControladoSheet.test.tsx` (k).
- [x] **A3 — Arquivar item pela tela.** O que muda: o select de situação do item gravado sempre oferece
  Arquivado (com o aviso de onde ele some e como reativar); a lista esconde arquivados por padrão e mostra
  "Mostrar arquivados (N)" acima da tabela só com N > 0; arquivado aparece marcado "Arquivado" na coluna
  Procedimento e volta a Ativo pelo Sheet; tudo arquivado → o vazio manda mostrar os arquivados em vez de
  oferecer a carga. Sem apagar. Conferido (sem mudança): o N do painel e "Por obra" já só contam ATIVO.
  Pronto quando: arquivar → some da lista e do N; o botão mostra; reativar → volta. ✅ `dd38134fb` —
  `QualidadeModule.test.tsx` (j, j2, j3).
- Fora deste ajuste (decisão de 25/11): status VENCIDO do treinamento → fase 2.

Verificação local: 8 arquivos/100 testes verdes (`permissaoQualidadeSiac`, `modulosPermitidosTodasOrgs`,
`QualidadeModule`, `ItemControladoSheet`, `RegistrarTreinamentoSheet`, `PorObra`, `orgContextGuard`,
`RiscosModule`); `npm run typecheck` 0 erros; `check-ui-standard.sh` 0 nos 4 componentes tocados;
`check-org-selector-guard.sh` 0. Não conferido na tela (sem app aberto nesta frente).
