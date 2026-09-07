# Meus Fornecedores — editar abre TELA, não drawer

## Pedido original

Sessão de 07/09/2026, mensagem literal do usuário:

> minha organizacao < meus fornecedores: da mesma maneira que foi implementado em minha organizacao < meus clientes, inves de abrir drawer ao clicar em editar, abrir tela

Referência explícita: o item 3 do plano
`docs/planos/2026-09-04-clientes-empreendimento-excel-tela-abas.md`
("Invés de abrir drawer, abrir tela"), que trocou `ClientModal.tsx` (`Sheet`) por
`ClientForm.tsx` (tela in-flow) com abas.

---

## Contexto (o que já existia)

- `components/SupplierModal.tsx` (733 linhas) — formulário em `Sheet` (drawer),
  com duas abas internas (`cadastro` / `bancario`) só na edição. Usado **apenas**
  pelo `SupplierList` (confirmado por grep em todo o repo), o que torna a
  conversão contida.
- `components/SupplierList.tsx` — lista, com **cinco** pontos que abriam o drawer:
  botão "Novo fornecedor", clique na linha da tabela, clique no card do grid,
  `ActionIconButton kind="edit"` do card e o botão do empty state.
- "Tela" neste app tem significado técnico fixo: **troca de conteúdo in-flow**
  (sidebar e abas do módulo continuam visíveis), nunca overlay — nem
  `fixed inset-0`, nem `Sheet`, nem `Modal`. Padrão de referência direto:
  `ClientForm.tsx`.
- `SupplierList` está dentro de `OrganizationList.tsx` (aba `suppliers`), que é
  Minha Organização › Fornecedores.

---

## Itens

### 1. `components/SupplierForm.tsx` (novo)
**O que muda:** cadastro de fornecedor como TELA, espelhando `ClientForm.tsx` —
cabeçalho com `ArrowLeft` + `<h1 className="text-2xl font-black">` com o nome do
fornecedor + trilha "Meus Fornecedores"; abas §19.1 no card branco; rodapé §25
com `SaveStatus`, "Voltar"/"Cancelar" e "Salvar alterações"/"Salvar fornecedor".

Três abas, na mesma divisão do cadastro de cliente:

| Aba | Conteúdo | Quando aparece |
|---|---|---|
| Dados gerais | código, razão social, apelido, contato, tipo/documento, categoria, organização + compartilhado, portais, consulta CNPJa e o bloco de dados oficiais | sempre |
| Dados bancários | `SupplierBankAccountsTab` | só na edição (depende de `supplier_id`) |
| Endereços e contatos | e-mail, telefone, rua, bairro, número, CEP/UF/cidade | sempre |

Decisões que mudam comportamento em relação ao `SupplierModal`:

- Os dois `alert()` de validação (organização dona ausente; e-mail obrigatório
  do corretor) viraram mensagem no rodapé + **salto para a aba do campo
  faltante** — mensagem nativa não diz onde está o problema e some sem rastro.
- `useUnsavedChanges` no lugar do `dirty`/`confirm` manual: a guarda de saída
  passa a ser a mesma de `ClientForm`.
- Organização ativa vem de `useOrgContext()` (REGRA #5), não de
  `useStore().activeOrganizationId` cru.
- As categorias passam a ser carregadas pela organização **escolhida no
  formulário**, não pela ativa no seletor global — com o topo em "Todas" a lista
  antes nunca carregava e o campo ficava só com os defaults.
- `SupplierBankAccountsTab` é `h-full`: envolvido em `h-[55vh] min-h-[360px]
  flex flex-col`, senão colapsa (memória "wrapper sem altura quebra h-full").

**Como sei que terminou:** ✅ a tela abre in-flow com sidebar visível, as três
abas presentes na edição e duas na criação, e nenhum overlay `fixed` ativo —
verificado no app real (Playwright, prints em `c:/tmp/pwtest/out-fornecedor`).

### 2. `components/SupplierList.tsx`
**O que muda:** `isModalOpen` + `editingSupplier` viram
`formState: {mode:'create'} | {mode:'edit', supplier} | null`, com
`handleOpenForm`/`handleCloseForm` guardando e restaurando o scroll do `<main>`
(§22). Os cinco pontos de abertura passam a chamar `handleOpenForm`. `handleAdd`
e `handleEdit` devolvem `boolean` (o formulário só marca "salvo" quando deu
certo) e **não fecham** nada — §25: quem fecha é o formulário, e só na criação.
O aviso de gravação virou `notificationBanner`, renderizado nas duas telas,
porque salvar em edição não volta para a lista.

**Como sei que terminou:** ✅ os cinco pontos abrem a tela; salvar em edição
permanece na tela com "Salvo"; criar fecha e volta para a lista com o scroll
onde estava.

### 3. `components/SupplierModal.tsx` (removido)
**O que muda:** apagado. Só o `SupplierList` o usava — mesmo caminho que o
`ClientModal` seguiu em 04/09.

**Como sei que terminou:** ✅ `grep -rn SupplierModal` não retorna nada além do
comentário de estilo em `SupplierBankAccountsTab.tsx`; `tsc --noEmit` limpo.

---

## Verificação

| Portão | Resultado |
|---|---|
| `npx tsc --noEmit` | ✅ limpo |
| `npx vite build` | ✅ built |
| `bash scripts/check-ui-standard.sh components/SupplierForm.tsx` | ✅ sem violação |
| `bash scripts/check-ui-standard.sh components/SupplierList.tsx` | ✅ sem violação |
| `bash scripts/check-org-selector-guard.sh` | ✅ 14/14 |
| App real (Playwright, login `agente-leitura`) | ✅ editar e criar abrem como tela, 0 erro de console/HTTP do módulo |

Na varredura do app só apareceram os 500 conhecidos e alheios da Central de
Controle (`fn_approval_pending_summary`, `fn_reconciliation_divergences`,
`57014 statement timeout`), documentados na skill `rodar-app`.
