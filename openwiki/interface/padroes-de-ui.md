---
type: interface
title: Padrões de interface
description: Onde mora o padrão visual e de interação do app e como ele é aplicado — o guia unificado de UI (docs/ui_ux_guia_unificado.md) com telas de referência, a decisão painel lateral × modal × página do UI_PATTERNS.md, as primitivas compartilhadas em components/ui (StandardTable, Sheet, Modal, useConfirm, toast, seletores em drawer) e as verificações mecânicas.
tags: [ui, design-system, components, tables, sheet, modal, tailwind, conventions]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-29T16:11:22.971Z
sources:
  - id: openwiki-source-5d748f475a81a1e6cc916bc1
    resource: repo://components/ui/StandardTable.tsx
  - id: openwiki-source-c6d6e281ff8db72824b4c9b2
    resource: repo://docs/ui_ux_guia_unificado.md
  - id: openwiki-source-805fedb3d438b57cad16ac52
    resource: repo://hooks/useToast.ts
  - id: openwiki-source-6b2bab08fd92a77e4d88ed51
    resource: repo://index.css
  - id: openwiki-source-d9195e1bcbd3e73b3e6c3d03
    resource: repo://scripts/check-ui-standard.sh
  - id: openwiki-source-313699d7a0a1d799042758dc
    resource: repo://UI_PATTERNS.md
generated: { by: "claude-code", at: "2026-10-29T16:11:22.971Z" }
---

# Padrões de interface

O padrão de UI não é um design system empacotado: é um **guia longo com
snippets reais** mais um conjunto de **primitivas** em `components/ui/`. Tela
nova copia a tela de referência e usa as primitivas; tela existente converge
para elas.

| Documento | Responde |
|---|---|
| `docs/ui_ux_guia_unificado.md` (~3.700 linhas, §1–§33) | como desenhar tabela, KPI, toolbar, badge, ações, toasts, formulário, gráfico, drawer… |
| `UI_PATTERNS.md` | painel lateral, modal ou página? |
| `GUIA_TABLE_UTILS.md` | `useTableColumns`, `ColumnConfigButton`, `SortableHeader` |
| `DESIGN.md` | identidade visual específica do **Portal do Colaborador** (paleta, tipografia), não do app inteiro |

## Regra obrigatória de aplicação (CLAUDE.md, REGRA #1)

Qualquer edição que toque tabela, KPI, toolbar, busca, badge de status, coluna
de ações, confirmação, toast ou **célula com campo editável inline** segue um
protocolo:

1. ler o guia inteiro antes de editar;
2. rodar `bash scripts/check-ui-standard.sh <arquivo>.tsx` nos arquivos tocados;
3. ao reportar, listar os itens do *CHECKLIST DE APLICAÇÃO* verificados
   (incluindo o de campos inline) e dizer explicitamente o que não se aplica;
4. padrão visual que o guia não cobre → **atualizar o guia** com seção nova, não
   inventar estilo ad hoc.

Pedido de "auditar 100%" usa o *CHECKLIST DE AUDITORIA COMPLETA* do guia:
veredito + evidência (`arquivo:linha`) para cada seção, sem amostragem.

A regra nasceu de auditorias que pararam na estrutura (thead, cards, busca) e
não desceram às células: selects inline com `font-bold uppercase` passaram
despercebidos.

## Telas de referência

O guia nomeia a fonte da verdade: **`components/BankReconciliation.tsx`, aba
Extrato** (título → abas → KPIs → botões de escopo → toolbar acoplada à
tabela). Complementam `ClientList.tsx`, `SupplierList.tsx` (régua desaninhada,
redimensionar, Shift+clique, cabeçalho fixo) e `SupplyChainOrderList.tsx`. A
instrução é copiar o snippet e adaptar só os dados.

## Anatomia de uma tela de lista

```
Título + subtítulo (§20)
Abas do módulo (§19.1)
KPI cards (§4)
Botões de escopo (§5.3)
┌ toolbar acoplada (busca persistida, filtros, colunas) ┐  §5.2
│ tabela (thead branco sentence case, ordenável, sticky)│  §6
│ linhas (px-6, border-r, ações por ActionIconButton)   │  §7, §9
└ rodapé de paginação (opcional)                         ┘  §6.7
```

Alguns pontos fixos do guia que mais aparecem em revisão:

- **Escala compacta única** (§16): containers `rounded-[10px]`, controles
  `rounded-[6px]`, altura `h-9`. A escala antiga (`rounded-[2.5rem]`) é
  deprecated; não misturar na mesma tela.
- **Busca persistida** (§3): `usePersistedState(chave, padrão)` de
  `components/ui/TableUtils.tsx`, não `useState`.
- **Célula sem `font-bold`/`font-black`/`font-mono`** (§7), inclusive em selects
  dentro de `<td>` (§7.1).
- **Cliente, fornecedor, centro de custo e plano de contas se escolhem em
  drawer** (§7.1.1): `ClientSelect`, `SupplierSelect`, `CostCenterSelect`,
  `PlanoContasSelect` (os dois últimos sobre `HierarchicalSelect`, accordion por
  grupo/organização) — nunca `<select>`.
- **Status não é pílula `rounded-full uppercase`** (§8).
- **Confirmação é `useConfirm()`**, nunca `window.confirm` (§14).
- **Atualizar estado local** após criar/editar/excluir, em vez de recarregar a
  tabela inteira (§22).
- **Salvar não fecha a edição** em formulários multi-aba (§25).
- **Valor de campo nunca em cinza-claro**, nem automático/só-leitura (§32):
  cinza é linguagem de placeholder.
- **Portais externos** têm vocabulário próprio com quatro desvios autorizados
  (§24) e não herdam o gutter do `Layout` (§20.2.1).

## Painel lateral, modal ou página (`UI_PATTERNS.md`)

> Painel lateral para 70–80% das interações. Modal central só para
> interrupções críticas. Página dedicada para fluxos longos.

| Ação | Primitiva |
|---|---|
| ver / editar / criar registro simples, gerenciar lista de configuração | `Sheet` |
| criar registro complexo, orçamento, contrato, DRE, configuração avançada | view dedicada |
| aprovar **um** item, excluir, alerta | `Modal` / `useConfirm` |
| revisar **fila** de aprovações | lista + `Sheet` |

Regras: drawer edita com autosave ou guarda `dirty`; largura mínima 420 px;
no celular o `Sheet` vira bottom sheet; **drawer aninhado é proibido**, exceto o
seletor de campo (que sai por portal em `document.body` e cuja tecla Esc fecha só
o painel do topo da pilha); modal destrutivo usa `dismissable={false}`.

## Primitivas em `components/ui/`

| Primitiva | Para quê |
|---|---|
| `StandardTable` | tabela padrão (§6.10): busca persistida, colunas visíveis, autofit sob comando, largura = soma das colunas, `SortableHeader`, sticky, loading/empty, paginação opt-in aplicada **depois** de busca e ordenação, `dense` para tabela dentro de `Sheet` |
| `TableUtils` | `useTableColumns`, `ColumnConfigButton`, `SortableHeader`, `usePersistedState`, `useResizableColumns` |
| `sheet.tsx` | painel lateral / bottom sheet com pilha de Esc |
| `modal.tsx` | modal central |
| `confirm.tsx` | `ConfirmProvider` + `useConfirm()` |
| `toast.tsx` + `hooks/useToast.ts` | `ToastProvider` global; `showToast` aparece sozinho |
| `ActionIconButton` | botão-ícone da coluna de ações (§9.2) |
| `KpiCard`, `KpiCardCompact` | KPIs (§4) |
| `FilterPopover`, `FilterUtils` | filtros rápidos e avançados (§5.4/§5.5) |
| `Agrupamento` | "Agrupar" linhas recolhíveis com total (§6.12) |
| `SegmentedProgress` | barra de progresso segmentada (§29) |
| `TabsBar`, `tabs.tsx`, `MenuDoRibbon`, `MenuDeVistas` | abas de módulo e ribbon do editor (§19) |
| `MoneyCentsInput`, `CreatableCombobox`, `DocumentPicker`, `ImageDropzone` | campos especializados |

`ConfirmProvider` e `ToastProvider` são montados uma vez no `index.tsx`.

### Toast: por que o hook mudou

`useToast` devolvia `{ localToast, showToast }` e não desenhava nada — quem
chamava `showToast` sem renderizar `localToast` jogava a mensagem fora. Eram 15
componentes e 95 chamadas mudas, e isso escondeu erros reais (o motor de
conciliação falhava calado). Hoje, com o provider na raiz, `showToast` publica
no provider e `localToast` vem sempre `null` (sem mensagem duplicada).

## Tema e modo escuro

`index.css` declara `@custom-variant dark (&:where(.dark, .dark *))`: a
variante `dark:` só vale dentro de um elemento com a classe `dark`, que nada no
app liga. Sem isso o Tailwind v4 gera `dark:` como
`@media (prefers-color-scheme: dark)` e a tela seguia o modo escuro do
**sistema operacional** — valores de campo saíam branco sobre branco para quem
usa Windows escuro (§33). O tema escuro real do app ("Escuro Total",
`midnight`) é escolhido no `Layout` e não depende de `dark:`.

## Verificação

`scripts/check-ui-standard.sh <arquivos>` sai com código ≠ 0 ao encontrar:
`font-bold`/`font-black`/`font-mono` em `<td>` (§7/§7.1), pílula
`rounded-full` + `uppercase` (§8), `confirm()` nativo (§14), busca em
`useState` em vez de `usePersistedState` (§3) e botão-ícone com a assinatura
antiga deprecada (§9.2). Exceções só as documentadas no próprio guia. Ver
[Testes e travas mecânicas](../testes/suite-e-travas.md).

O script cobre o que é detectável por texto; conformidade visual se confere
na tela de verdade.
