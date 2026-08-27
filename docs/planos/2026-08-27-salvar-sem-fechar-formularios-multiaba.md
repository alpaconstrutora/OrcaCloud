# Salvar sem fechar — formulários multi-aba

## Pedido original

> Recursos humanos < Colaboradores:
> Ao clicar no botão salvar a página fecha automaticamente, porem o usuário pode estar querendo salvar apenas aquela alteração pontual pois ainda existem muitas abas e ele pode querer fazer mais alterações. Então acabamos obrigando o usuário entrar novamente. Isto tem acontecido em vários módulos.
> Talvez um botão de sair ao lado de salvar ou outra sugestão. Quais as melhores praticas UI UX?

(sessão 2026-08-27)

---

## Status (2026-08-27)

**Todas as 5 etapas concluídas e verificadas mecanicamente** (`check-ui-standard.sh`, `tsc --noEmit`, `vitest run` — 86 arquivos/1663 testes passando, 0 falhas introduzidas):

- ✅ Etapa 0 — este arquivo criado em `docs/planos/`.
- ✅ Etapa 1 — `hooks/useUnsavedChanges.ts` (+ teste em `__tests__/useUnsavedChanges.test.tsx`), `components/ui/SaveStatus.tsx`, guarda de `components/ui/sheet.tsx` trocada de `window.confirm` para `useConfirm()`.
- ✅ Etapa 2 — `LaborEmployeeForm.tsx` + `LaborModule.tsx`: editar não fecha mais, `Voltar` com guarda, atalho Ctrl+S, toast de sucesso.
- ✅ Etapa 3 — propagado em `ProjectModal.tsx`/`hooks/useProjectOperations.ts` (dirty via diff `JSON.stringify`, form sem `setField` único), `SupplierModal.tsx`/`SupplierList.tsx`, `EmpreendimentoForm.tsx`/`EmpreendimentoModule.tsx`.
- ✅ Etapa 4 — §25 novo em `docs/ui_ux_guia_unificado.md` (+ linha nos dois checklists), `UI_PATTERNS.md` §6.4 com a exceção de edição longa.

**Fora do escopo desta rodada (dito explicitamente, não "resolvido no app inteiro"):** `ClientRequestsAdminModal.tsx`, `ContractModal.tsx`, `schedule/ConfigModal.tsx`, `fiscal/FiscalDocuments.tsx`, `inventory/StockItemImportModal.tsx`, `LaborPayroll.tsx`, `LaborValeRefeicao.tsx` — nenhum tocado. `DealModal.tsx`/`CompanyDetailPage.tsx` já eram conformes antes (usados como referência).

**Verificação em navegador (Playwright/`rodar-app`) — CONCLUÍDA em RH > Colaboradores**, 15/15 checagens passando contra a organização Alpa Construtora e Incorporadora (conta de leitura), num colaborador real ("Altair Pereira da Rosa"), com reversão completa dos dados ao final (checklist e observações voltaram ao estado original; colaborador de teste criado foi excluído):
- Editar → Salvar (Checklist): toast "Alterações salvas.", tela permanece aberta, botão volta a ficar desabilitado.
- Trocar de aba (Dados Bancários) sem fechar, editar de novo na mesma sessão.
- Alteração pendente + seta ← → diálogo "Sair sem salvar?" → "Continuar editando" preserva; segunda tentativa + "Sair e descartar" fecha sem ter salvo a pendência.
- Sem pendência, seta ← sai direto sem perguntar.
- Criação (Novo Colaborador): salvar ainda fecha o modal — comportamento não regrediu.
- Script em `c:/tmp/pwtest/verify-labor-form.cjs` (fora do repo, scratch de sessão).

**Não verificado em navegador** (só mecanicamente): Obras (`ProjectModal.tsx`), Fornecedores (`SupplierModal.tsx`) e Empreendimentos (`EmpreendimentoForm.tsx`) — a correção segue o mesmo padrão testado em Colaboradores, mas recomenda-se um passeio funcional nessas três telas antes de considerar a propagação 100% confirmada na prática.

---

## Context

**O problema.** Em RH > Colaboradores, o formulário de edição tem **9 abas** (`geral, pessoal, documentos, endereco, organizacional, bancario, folha, salarios, checklist` — [LaborEmployeeForm.tsx:41-51](orçacloud-saas/components/LaborEmployeeForm.tsx#L41-L51)). Salvar qualquer coisa — até só marcar um item do Checklist — devolve o usuário para a lista. Quem estava conferindo o cadastro aba por aba precisa reabrir o colaborador a cada gravação.

**A causa mecânica.** O form não fecha a si mesmo: [`handleSave`](orçacloud-saas/components/LaborEmployeeForm.tsx#L293-L342) chama `onSaved(savedEmployee)`, e o pai [`LaborModule.handleEmployeeSaved`](orçacloud-saas/components/LaborModule.tsx#L274-L286) faz `setIsEmployeeFormOpen(false)`. Ou seja: o **pai decide sair** por uma ação que é do **filho**. Esse acoplamento é o mesmo em ProjectModal, SupplierModal e EmpreendimentoForm — daí o "isto tem acontecido em vários módulos".

**Um segundo risco, ainda não relatado.** A seta ← do cabeçalho ([:1089-1095](orçacloud-saas/components/LaborEmployeeForm.tsx#L1089-L1095)) e o botão "Cancelar" ([:371](orçacloud-saas/components/LaborEmployeeForm.tsx#L371)) chamam `onClose` direto: **descartam 9 abas de digitação sem perguntar nada**. Se salvar deixa de fechar, o usuário passa a permanecer mais tempo na tela com trabalho não gravado — corrigir um sem o outro troca um incômodo por uma perda de dados.

**Melhores práticas de UI/UX (resposta à pergunta).**

1. **Salvar ≠ sair.** Numa edição longa (multi-aba), "Salvar" é *checkpoint*, não *conclusão*. Fechar ao salvar só faz sentido em fluxo de **criação**, onde gravar é o fim da tarefa. É o que Notion, Linear, Jira e o Google Admin fazem.
2. **Um único botão primário.** "Salvar" + "Salvar e sair" lado a lado (a sua sugestão) resolve o problema, mas cria dois primários competindo: o usuário lê os dois a cada clique. A saída já tem lugar próprio — a seta ← do cabeçalho.
3. **Sair é ação explícita e protegida.** Com alterações pendentes, confirmar antes de descartar.
4. **Feedback no lugar do fechamento.** Se a tela não muda, o toast é a única prova de que gravou. Somado a um indicador "● Alterações não salvas" → "✓ Salvo".
5. **Preservar o contexto:** aba ativa, scroll e foco continuam onde estavam.

**Precedente interno — isto já foi decidido uma vez aqui.** [DealModal.tsx:1481-1496](orçacloud-saas/components/DealModal.tsx#L1481-L1496) faz exatamente isso, com o raciocínio no comentário: *"'Gerenciar Negociação' (registro já existente) permanece aberta... Só 'Nova Negociação Comercial' (criação) continua fechando"*. [CompanyDetailPage.tsx:352](orçacloud-saas/components/CompanyDetailPage.tsx#L352) idem. O trabalho aqui é **generalizar um padrão que já existe**, não inventar um.

**Decisões do usuário nesta sessão:** rodapé = Salvar permanece + saída pelo header · sair com pendências = confirmar antes de descartar · escopo = Colaboradores **+ propagar** nas demais telas multi-aba.

---

## Regra que passa a valer

| Situação | Ao salvar |
|---|---|
| **Criar** registro novo | grava → toast → **fecha** (a tarefa acabou) |
| **Editar** registro existente | grava → toast → **permanece**, na mesma aba, com o form limpo de pendências |
| Sair com alterações pendentes | `useConfirm()` — "Sair sem salvar?" |
| Sair sem pendências | sai direto, sem atrito |

Corolário de contrato: **`onSaved` do pai não fecha nada.** Ele só atualiza o estado local (§22 do guia). Quem fecha é o filho, chamando `onClose()` — e só na criação.

---

## Etapa 0 — Registrar o plano no repositório (REGRA #6)

Copiar este arquivo para **`docs/planos/2026-08-27-salvar-sem-fechar-formularios-multiaba.md`**, mantendo a seção `## Pedido original` literal acima. Atualizar esse arquivo (não este) conforme o trabalho andar.

*Pronto quando:* o arquivo existe em `docs/planos/` e está versionado.

---

## Etapa 1 — Primitivas compartilhadas

### 1a. `hooks/useUnsavedChanges.ts` *(novo)*

Evita reimplementar dirty-tracking em cada tela.

```ts
export function useUnsavedChanges() {
  const confirm = useConfirm();                       // components/ui/confirm.tsx
  const [dirty, setDirty] = React.useState(false);
  const markDirty = React.useCallback(() => setDirty(true), []);
  const markSaved = React.useCallback(() => setDirty(false), []);
  /** Envolve a saída: true = pode sair. */
  const confirmDiscard = React.useCallback(async () => {
    if (!dirty) return true;
    return confirm({
      title: 'Sair sem salvar?',
      message: 'Há alterações não salvas. Se sair agora, elas serão perdidas.',
      variant: 'warning',
      confirmLabel: 'Sair e descartar',
      cancelLabel: 'Continuar editando',
    });
  }, [dirty, confirm]);
  return { dirty, markDirty, markSaved, confirmDiscard };
}
```

Reusa `useConfirm()` (Promise-based, `ConfirmProvider` já montado no root). Texto copiado de [PropertyModal.tsx:64-80](orçacloud-saas/components/PropertyModal.tsx#L64-L80), que já acertou o tom.

*Pronto quando:* hook existe, tipado, e um teste em `__tests__/` cobre "sem dirty não pergunta / com dirty pergunta e respeita a resposta".

### 1b. `components/ui/SaveStatus.tsx` *(novo, ~15 linhas)*

Indicador à esquerda do rodapé, para o usuário saber se há pendência:

- `dirty` → `● Alterações não salvas` (`text-xs font-medium text-amber-600`)
- recém-salvo → `✓ Salvo` em verde, some em 3 s
- ocioso → nada

*Pronto quando:* renderiza os três estados; sem `font-black`/`uppercase` (§21 do guia).

### 1c. Corrigir a guarda do `Sheet` — dívida do §14

[sheet.tsx:33](orçacloud-saas/components/ui/sheet.tsx#L33) usa **`window.confirm()` nativo**, que o §14 do guia proíbe e que `scripts/check-ui-standard.sh` acusa. Trocar por `confirmDiscard` do hook 1a.

Ganho colateral: os 8 consumidores que já passam `dirty` — `ClientModal`, `SupplierModal`, `BrokerModal`, `InvestorModal`, `LaborDocumentModal`, `inventory/StockItemSheet`, `MyAccountSheet`, `OrganizationCreateSheet` — herdam o diálogo correto **sem alteração própria**.

*Pronto quando:* `bash scripts/check-ui-standard.sh components/ui/sheet.tsx` sai 0, e ESC + clique no backdrop de um Sheet sujo mostram o modal do app (não o do navegador).

---

## Etapa 2 — RH > Colaboradores (tela de origem)

### `components/LaborEmployeeForm.tsx`

1. **Dirty tracking.** [`setField`](orçacloud-saas/components/LaborEmployeeForm.tsx#L269) é o ponto único por onde toda edição passa — chamar `markDirty()` ali. Fazer o mesmo no setter de `recurringRubrics`. **Não** marcar em `onSalaryApplied` ([:812-821](orçacloud-saas/components/LaborEmployeeForm.tsx#L812-L821)): o histórico salarial já gravou direto no banco.
2. **`handleSave` — edição permanece.** Depois de `onSaved(savedEmployee)` ([:335](orçacloud-saas/components/LaborEmployeeForm.tsx#L335)):
   - `isEditing` → `markSaved()`, `notify('Alterações salvas.', 'success')`, **não** chamar `onClose()`. `activeTab` já é estado local, então a aba se preserva sozinha.
   - criação → `onSaved()` e então `onClose()` (mantém o comportamento atual).
   - Rehidratar o `form` com o registro devolvido pelo service, para refletir defaults do banco.
3. **`renderFooter`** ([:369-383](orçacloud-saas/components/LaborEmployeeForm.tsx#L369-L383)):
   - em edição: `Cancelar` → **`Voltar`**, passando por `confirmDiscard`; primário fica `Salvar alterações`, `disabled={saving || !dirty}`; `<SaveStatus />` à esquerda (`justify-between`).
   - em criação: rodapé inalterado (`Cancelar` / `Cadastrar Colaborador`).
4. **Seta ← do header** ([:1089-1095](orçacloud-saas/components/LaborEmployeeForm.tsx#L1089-L1095)) e **X do modal de criação** ([:1133](orçacloud-saas/components/LaborEmployeeForm.tsx#L1133)): passar por `confirmDiscard` em vez de `onClose` direto.
5. **Ctrl+S / Cmd+S** dispara `handleSave` enquanto a tela de edição está montada (`preventDefault`).
6. **Toast** ([`renderToast`](orçacloud-saas/components/LaborEmployeeForm.tsx#L1074-L1081)) já suporta `type: 'success'` (verde esmeralda, §13) — hoje só recebe erro. Passar a usar o sucesso.

### `components/LaborModule.tsx`

Em [`handleEmployeeSaved`](orçacloud-saas/components/LaborModule.tsx#L274-L286), **remover `setIsEmployeeFormOpen(false)` e `setEditingEmployee(null)`**. Preservar integralmente o `queryClient.setQueryData` (§22 — inclusive o ramo que remove o colaborador que trocou de organização). Passar a fechar apenas via a prop `onClose` já existente ([:687](orçacloud-saas/components/LaborModule.tsx#L687)).

⚠️ Se `editingEmployee` alimenta a prop `employee` e o form recalcula estado a partir dela, confirmar que a permanência não remonta o componente (perdendo a aba). Se remontar, manter `editingEmployee` sincronizado com o registro salvo e conferir a `key` do elemento.

*Pronto quando:* editar Checklist → Salvar → toast verde, tela continua na aba Checklist, lista por trás já atualizada; trocar para Bancário, mudar o PIX, Salvar de novo sem reabrir; ← sem alterações sai direto; ← com alterações pergunta.

---

## Etapa 3 — Propagar nas demais telas multi-aba

Mesmo padrão das Etapas 2. Uma tela por vez, cada uma verificada no navegador antes da seguinte.

| Tela | Filho | Pai que fecha hoje |
|---|---|---|
| Obras / Empreendimentos (3 abas, modo `edit` = tela cheia) | [ProjectModal.tsx:466](orçacloud-saas/components/ProjectModal.tsx#L466) `handleSubmit` → `onSubmit` do pai | [App.tsx:855](orçacloud-saas/App.tsx#L855) e [CriarObraDoEmpreendimento.tsx:97](orçacloud-saas/components/empreendimento/CriarObraDoEmpreendimento.tsx#L97) |
| Fornecedores (2 abas em edição) | [SupplierModal.tsx:205](orçacloud-saas/components/SupplierModal.tsx#L205) — **já tem `dirty`**, só falta não fechar | [SupplierList.tsx:730](orçacloud-saas/components/SupplierList.tsx#L730) |
| Empreendimentos | [empreendimento/EmpreendimentoForm.tsx:305](orçacloud-saas/components/empreendimento/EmpreendimentoForm.tsx#L305) `onSaved(saved)` | [EmpreendimentoModule.tsx:307 e :509](orçacloud-saas/components/empreendimento/EmpreendimentoModule.tsx#L307) |

**Já conformes — usar como referência, não alterar:** [DealModal.tsx:1481-1496](orçacloud-saas/components/DealModal.tsx#L1481-L1496) e [CompanyDetailPage.tsx:352](orçacloud-saas/components/CompanyDetailPage.tsx#L352).

**Nota de honestidade sobre cobertura.** O §22 do guia já registra uma "pendência de propagação" de um caso anterior, e o `CLAUDE.md` documenta duas vezes em que aplicar padrão por amostragem foi reportado como completo sem ser. Portanto: a tabela acima é o escopo **fechado** desta etapa. Ao terminar, listar tela por tela o que foi verificado e declarar explicitamente o que ficou de fora (ex.: `ClientRequestsAdminModal`, `schedule/ConfigModal`, `fiscal/FiscalDocuments`, `inventory/StockItemImportModal`, `LaborPayroll`, `LaborValeRefeicao`) — não dizer "propagado no app inteiro".

---

## Etapa 4 — Normatizar no guia

Nova seção **§25 — "Salvar não fecha a edição"** em `docs/ui_ux_guia_unificado.md`, com: a tabela da regra, o contrato `onSaved` ≠ fechar, o rodapé canônico (`SaveStatus` · `Voltar` · `Salvar alterações` desabilitado sem pendências), a guarda de saída via `useConfirm`, e o motivo registrado (esta sessão, RH > Colaboradores). Acrescentar a linha correspondente ao `CHECKLIST DE APLICAÇÃO` e ao `CHECKLIST DE AUDITORIA COMPLETA`, já que o §4 do guia exige atualizar o documento quando surge padrão novo.

Registrar em `UI_PATTERNS.md` §6.4 — hoje ele diz *"ação simples → fecha + toast"*, sem distinguir criação de edição multi-aba. É essa frase que legitima o comportamento atual; precisa ganhar a exceção.

*Pronto quando:* §25 existe, os dois checklists citam a regra, e §6.4 do `UI_PATTERNS.md` distingue criação de edição.

---

## Verificação

**Mecânica**
```bash
bash scripts/check-ui-standard.sh components/LaborEmployeeForm.tsx components/LaborModule.tsx components/ui/sheet.tsx components/ui/SaveStatus.tsx
npx vitest run                       # inclui __tests__/orgContextGuard.test.ts e o teste novo do hook
npm run build
```

**No navegador** — usar a skill `rodar-app` (login real; Playwright com `serviceWorkers: 'block'`, senão o PWA engole as rotas):

1. RH > Colaboradores > editar um colaborador real.
2. Aba **Checklist** → marcar um item → **Salvar alterações**. Esperado: toast verde, **a tela não fecha**, continua no Checklist, indicador vira `✓ Salvo`, o botão volta a ficar desabilitado.
3. Sem sair: aba **Bancário** → alterar PIX → Salvar. Indicador `● Alterações não salvas` aparece ao digitar e some ao gravar.
4. ← com alteração pendente → modal "Sair sem salvar?" → *Continuar editando* mantém tudo; *Sair e descartar* volta para a lista.
5. ← sem pendência → sai direto, sem perguntar.
6. Voltar à lista e confirmar que **as duas** gravações aparecem na linha (prova de que o §22 do `handleEmployeeSaved` continua íntegro sem o `setIsEmployeeFormOpen(false)`).
7. **Novo Colaborador** (modal de criação): salvar ainda **fecha** — não regredir esse fluxo.
8. Repetir 2–7 em Obras, Fornecedores e Empreendimentos na Etapa 3.
9. Conferir o carimbo de tempo do deploy antes de dar veredito sobre a versão publicada.

**Verificação real de dados:** após o passo 6, conferir no banco (usuário de leitura) que `employees` tem o checklist **e** o PIX gravados — a permanência na tela não pode mascarar uma segunda gravação que falhou em silêncio.
