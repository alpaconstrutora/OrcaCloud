# RH › Colaboradores › Editar Colaborador — padding, Folha em tabela, foto 3x4, várias contas bancárias

## Pedido original (sessão 7f33b571, 07/10/2026 ~14:25)

> recursos humanos > colaboradores > Editar Colaborador:
> 1. em todas as abas os paddings laterais nao esta no padrào do app
> 2. aba folha de pagamento: Transformar em tabela e aplicar o padrão ui_ux_guia_unificado.md no toolbar de abas + botão de ajuste de colunas
> 3. aba geral, campo superior esquedo. criar campo para incluir foto 3x4 e exivbir a foto 3x4. veja print com uma referencia.
> 4. aba dados bancarios: atualmente sé é possivel cadastrar apenas uma conta bancário. permita cadastrar mais de uma e selecionar qual sera a principal.

Esclarecimento (mesma sessão): item 2 = **só a tabela + toolbar padrão** (busca + colunas/autofit), sem sub-abas; o "toolbar de abas" é a barra de abas do formulário, que passa a usar `TabsBar`.

## Context

O editar (`components/LaborEmployeeForm.tsx`, 1217 linhas) é uma sobreposição `absolute inset-0` com gutter próprio `px-6 md:px-10` + card interno `p-6 md:p-10`. No desktop, os campos ficam a 80px da borda, enquanto o padrão do app é 24px (gutter do `<main>`, §20.2). É o mesmo defeito que `ProjectModal.tsx:813-834` já corrigiu ("TELA, não sobreposição"). A aba Folha é uma lista de botões com tipografia fora do guia. Não existe foto, embora a coluna `employees.avatar_url` já exista e ninguém grave nela. Os dados bancários são 6 colunas soltas em `employees` (`banco_*`), lidas só pelo próprio formulário (nenhum serviço, RPC ou edge function as lê).

## Execução

Tudo é feito em uma frente nova: `bash scripts/nova-frente.sh rh-editar-colaborador`. Antes de editar, ler `docs/ui_ux_guia_unificado.md` inteiro (REGRA #1) e `UI_PATTERNS.md`.

### 1. Padding lateral (todas as abas)
**Arquivos:** `components/LaborEmployeeForm.tsx` (bloco `isEditing`, ~1142-1181), `components/LaborModule.tsx` (~677-686).
- O modo editar passa a seguir o modelo do `ProjectModal` edit e entra no fluxo do `<main>`, sem `absolute inset-0` e sem `px-*` na raiz. Cabeçalho: `pb-5 border-b`. Abas: `pt-4`. Corpo: card `bg-white rounded-[10px] border border-gray-100 shadow-sm p-6 space-y-6`. Rodapé: `border-t pt-4 mt-6`, com `SaveStatus` à esquerda.
- `LaborModule`: com o form aberto em edição, renderiza só o form, sem a lista por baixo, pelo mesmo motivo do ProjectModal: `absolute` dentro do `<main>` rolável ancorava no topo do conteúdo.
- Modal de **criação** (centrado): o corpo já é `p-6`, então só se confere.
- **Pronto quando:** medido no navegador (Playwright, skill `rodar-app`), a distância entre a borda do conteúdo e o primeiro campo é igual à das outras telas (gutter de 24px + `p-6` do card) em todas as 9 abas, e a lista não reaparece ao rolar.

### 2. Aba Folha de Pagamento → tabela
**Arquivo:** `LaborEmployeeForm.tsx` (~777-850 e `renderTabs` ~391-408).
- `renderTabs` passa a usar `components/ui/TabsBar.tsx` (§19.1), sem mudar o visual.
- A lista de botões vira `StandardTable` (§6.10), que já traz busca persistida, `ColumnConfigButton` e autofit (§5.1). Como a tabela fica dentro do card do formulário, usa `bare`/`dense` (§6.9).
  - Colunas: **Incluir** (switch 36×20, §7.1 / padrão de switch de tabela), **Código**, **Rubrica**, **Tipo** (provento/desconto), **INSS**, **FGTS**, **IRRF** (✓/—), **Cálculo** (`calculation_type`), **Categoria**.
  - Os dados são os mesmos de hoje: `listRubrics()` filtrado por `is_automatic && !is_clt_mandatory`. O estado continua sendo `recurringRubrics: string[]` + `markDirty()`. A gravação continua no RPC `update_employee_rubrics` (`payrollService.ts:722`), sem mudança no banco.
- O banner indigo e a nota âmbar perdem `font-black`/`uppercase`/`text-[9px]` e seguem o guia. O estado vazio vai no `emptyState` da tabela.
- **Pronto quando:** `bash scripts/check-ui-standard.sh components/LaborEmployeeForm.tsx` retorna exit 0; no navegador, marcar uma rubrica liga o "não salvo", salvar persiste, e reabrir o colaborador mostra o switch ligado; o botão de colunas esconde e mostra colunas e o autofit funciona.

### 3. Foto 3x4 (aba Geral, canto superior esquerdo)
**Arquivos:** novo `components/LaborEmployeePhoto.tsx` (nome segue a convenção `Labor*` da pasta), `LaborEmployeeForm.tsx` (seção Dados Pessoais ~438-497), `services/laborService.ts`.
- **Layout:** a seção Dados Pessoais vira `grid-cols-[auto_1fr]`. À esquerda fica um quadro 3x4 (`aspect-[3/4] w-32 rounded-[10px] border`) com `object-cover`. Vazio, mostra o ícone de câmera e "Foto 3x4". Ao passar o mouse aparecem "Trocar" e "Remover". À direita ficam os campos atuais (Nome, CPF, Telefone…), no espírito do print de referência.
- **Upload:** `laborService.uploadEmployeePhoto(orgId, file)` copia o modelo de `assetService.uploadImage` (`services/assetService.ts:163-205`). Valida com `validateImageFile` (`lib/mimeValidation.ts:99`) e grava no bucket `organization-assets` (o mesmo dos documentos do colaborador) em `labor-photos/{org_id}/{uuid}.{ext}`. Guarda o **path** em `employees.avatar_url`; um helper `employeePhotoUrl(v)` aceita path ou URL antiga.
- A gravação entra no fluxo do "Salvar" (marca dirty). Upload que não foi salvo é removido ao descartar ou trocar, como em `OpuraAssetsModule.tsx:1240-1267`. Remover a foto grava `null` e apaga o arquivo depois do save.
- Funciona também no modal de criação: o upload usa a org do formulário, não o id do colaborador.
- **Pronto quando:** no navegador, envio uma foto, salvo, recarrego, e a foto aparece em proporção 3x4 sem distorcer; arquivo não-imagem é recusado com mensagem; remover e salvar deixa `avatar_url` nulo (conferido por `db query`).

### 4. Várias contas bancárias + principal
**Arquivos:** migration `supabase/migrations/aplicar_20271007000020_employee_bank_accounts.sql`, novo `services/employeeBankAccountService.ts`, novo `components/LaborEmployeeBankAccounts.tsx`, regras puras em `utils/employeeBankAccounts.ts`, `LaborEmployeeForm.tsx` (~1045-1093), `__tests__/selectEstrelaSensivel.test.ts`.
- **Tabela `employee_bank_accounts`:** `id, employee_id → employees ON DELETE CASCADE, org_id`, mais `bank_code, bank_name, agency, account, account_type ('corrente'|'poupanca'|'pagamento'), pix_key, pix_key_type, holder_name, is_primary, active, created_at, updated_at`.
  - Índice único parcial: `(employee_id) WHERE is_primary AND active`, ou seja, uma principal por colaborador.
- **RLS:** **não** copiar a de `supplier_bank_accounts`, que tem `sba_anon_all` e `organization_id IS NULL OR …`. A policy é `TO authenticated USING/WITH CHECK (EXISTS (SELECT 1 FROM employees e WHERE e.id = employee_id))`, que herda a regra vigente de `employees` (`is_org_member(org_id) OR is_employee_shared_with_user(id)`, lida do banco hoje). Assim, quem vê a conta é exatamente quem já vê o colaborador e os `banco_*` atuais.
- **Gravação atômica:** RPC `save_employee_bank_accounts(p_employee_id uuid, p_accounts jsonb)`, `SECURITY INVOKER` (a RLS vale), faz upsert por id, apaga as que saíram da lista e garante exatamente 1 principal quando houver contas (a primeira, se nenhuma vier marcada). Leva `REVOKE EXECUTE … FROM PUBLIC, anon` e `GRANT … TO authenticated` (REGRA #7).
  - Por que um RPC e não o padrão do fornecedor: a troca de principal em `supplierBankAccountService.add` (`:62-77`) não é atômica.
- **Backfill:** cada colaborador com algum `banco_*` preenchido vira 1 conta `is_primary = true`. As colunas `banco_*` ficam (não são apagadas, para permitir rollback), o formulário deixa de escrevê-las, e um comentário na migration as marca como obsoletas.
- **UI:** uma lista de contas (§6.9 dentro do card), com o badge "Principal" e a ação "Tornar principal" na linha. "Adicionar conta" abre um formulário inline com os mesmos campos de hoje + titular + tipo da chave PIX. A lista vive no estado do form e é gravada no `handleSave` (o mesmo "Salvar" e o mesmo dirty de hoje; funciona também na criação, gravando depois de obter o `employee.id`). Excluir usa `useConfirm()` (§14).
- `selectEstrelaSensivel.test.ts`: adicionar `employee_bank_accounts: 'pix_key'`. O service usa `select` com colunas explícitas, nunca `*`.
- Aplicar a migration com `npx supabase db query --linked -f …`, **nunca** `db push`.
- **Pronto quando:**
  - `npx vitest run __tests__/segurancaMigrations.test.ts __tests__/selectEstrelaSensivel.test.ts` passa.
  - No banco, a contagem de contas do backfill bate com a de colaboradores que têm `banco_*` preenchido.
  - No navegador, cadastro 2 contas, troco a principal, salvo e recarrego: só 1 principal.
  - Teste unitário do service/normalização: nenhuma conta leva a 0 principais; várias marcadas levam a 1.

## Verificação final
1. Rodar `bash scripts/check-ui-standard.sh` em cada `.tsx` tocado e `npx vitest run __tests__/orgContextGuard.test.ts`.
2. `npm run typecheck`: ler o exit por grep (memória `feedback_tsc_exit_le_por_grep`), com o heap alto, porque o Node 24 cai.
3. Rodar a suíte inteira e ler a contagem.
4. Passeio no app real (skill `rodar-app`), percorrendo as 9 abas do Editar Colaborador: gutter, Folha, foto e contas. Repetir com o topo em "Todas" e em uma organização.
5. Ao reportar: listar os itens do CHECKLIST DE APLICAÇÃO do guia que foram conferidos (REGRA #1).
6. Publicar: `git push origin HEAD:main`, `bash scripts/publicar-producao.sh`, ler o check-run `ci`, e depois `bash scripts/fechar-frente.sh rh-editar-colaborador`.

## Andamento

- 07/10 — frente `rh-editar-colaborador` criada a partir de `8c52adc1`.
- 07/10 — código dos 4 itens escrito. Decisões tomadas no caminho:
  - item 1: além do gutter, a régua do §30 (títulos de seção `text-sm font-semibold` + `border-b pb-3`, grades `gap-x-6 gap-y-4`, seções a 32px) foi aplicada nas 9 abas — o guia manda aplicar ao tocar o formulário. O LaborModule esconde o módulo com `hidden` (não desmonta: lista volta com busca/rolagem/cache).
  - item 3: "Trocar"/"Remover" sempre visíveis abaixo do quadro (sem overlay de hover — não existe hover no toque).
  - item 4: sem coluna `active` (exclusão é exclusão); RPC sem tabela temporária.
- 07/10 — verificado:
  - `tsc --noEmit` completo: exit 0, 0 `error TS`.
  - `check-ui-standard.sh` exit 0 nos 4 `.tsx` tocados; `check-xss-sinks.sh` limpo.
  - testes: `employeeBankAccounts` (novo, 8), `selectEstrelaSensivel`, `segurancaMigrations`, `migrationsPrefixo`, `orgContextGuard`, `laborService` — passam.
  - migration testada no banco remoto com rollback forçado ANTES de aplicar: backfill 2; RPC mantém id existente, ignora linha em branco, principal = 1ª marcada (ou 1ª da lista); 2 principais barradas pelo índice; usuário de fora vê 0 e recebe 42501; ACL sem PUBLIC/anon.
  - migration APLICADA (`db query -f`): 2 contas, 2 principais = 2 colaboradores com `banco_*`; RLS on, 1 policy.
- 07/10 — suíte completa: 7660 passed + 34 skipped + 12 pending; os 12 são de `blueprintPlantaDaUnidade.test.ts` (worker do V8 caiu — `Check failed: has_exception()`), que roda sozinho 22/22 com e sem esta mudança (instabilidade conhecida do Node 24, não código). Conta fecha: 7706.
- 07/10 — passeio no app real (Playwright, dev server da frente, agente-leitura, contextos "Todas" e organização), SEM salvar:
  - item 1 ✅ card a 24px do `<main>` dos dois lados nas 9 abas, campos a 24–25px dentro do card (48px da borda, como o resto do app); lista escondida durante a edição e de volta ao sair; 0 erros de console/HTTP.
  - item 2 ✅ tabela com 9 colunas, 11 rubricas, engrenagem + autofit; ligar o switch acende "Alterações não salvas". Ajustes vindos do print: Código 110→190px com `truncate` (quebrava/encostava) e Categoria traduzida (o banco grava em inglês: thirteenth, vacation…).
  - item 3 ✅ foto 300×200 (paisagem) exibida 126×169, razão 0,747, `object-cover` (recorta, não estica); ao sair sem salvar o arquivo some do bucket (conferido: 0 objetos em `labor-photos/`).
  - item 4 ✅ adicionar conta + "Tornar principal" na tela; "Tornar principal" quebrava linha → coluna 110→150px + `whitespace-nowrap`. Gravação provada pelo PostgREST com a sessão do agente (RPC com a lista atual = no-op: 200, mesmo id); chave anon → 401 na RPC e na tabela.
- Não conferido na tela: o clique em "Salvar" com mudança real (não gravei dado de produção no passeio) — coberto pelo teste da RPC no banco e pela chamada no-op acima.
- Itens: **4 de 4** com código, verificação mecânica e tela.
- 07/10 — publicado: `b11c1cad` em main (typecheck 0 erro, `vite build` ✓ na 2ª tentativa — a 1ª caiu num pânico nativo do rollup em `node_modules/web-ifc`, instabilidade da máquina). `conferir-producao.sh "Contas bancárias e chaves PIX; a principal"` ✅ domínio serve b11c1ca; check-run `ci` = success.
