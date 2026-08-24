# Alocações vira aba da Folha, em formato de tabela padrão

> Etapa 3 da frente aberta em 2026-08-23. Etapas anteriores:
> `2026-08-23-folha-centro-custo-plano-contas.md` (commit `9a5b9fc`) e
> `2026-08-23-rateio-contabil-por-colaborador.md` (commit `9ee2c92`).

## Pedido original

Sessão de 2026-08-23, transcrito na íntegra:

```
1. transformar a  página alocaoes em uma aba da página Gestão de Folha de Pagamento.
2. Apos comncluido item 1, transformar em tabela e aplicar o padrão ui_ux_guia_unificado.md + botão de ajuste automático de largura de colunas
```

### Decisões do usuário (perguntadas na mesma sessão)

1. **Menu lateral**: o item "Alocações" **sai** — a tela passa a ser alcançável
   só por dentro da Folha.
2. **Forma da tabela**: uma linha por **colaborador**; o detalhe (obras, rateio,
   lançamento) abre em painel lateral.
3. **Bloco "Lançar Custos Reais no Financeiro"**: **simplificar** — os 3 grupos
   de dropdown de Centro de Custo/Plano (salvos em `localStorage`) somem, e o
   lançamento passa a usar o rateio contábil persistido da etapa 2.
4. **Filtro de tipo de folha** (Todas/Mensal/Férias/13º/Rescisão): deixa de ser
   barra de abas e vira `<select>` na toolbar, para não ter duas réguas de aba
   idênticas empilhadas.

## Contexto

Alocação por obra e rateio contábil existem para alimentar o fechamento da
folha, mas viviam em dois itens distantes do menu. E `LaborAllocations.tsx` era
a tela mais antiga do módulo: 1392 linhas em master-detail (cards à esquerda,
painel gigante à direita), na escala visual antiga (`rounded-3xl`,
`font-black uppercase`), sem tabela, sem colunas configuráveis, sem
redimensionamento — fora de praticamente todas as seções do
`docs/ui_ux_guia_unificado.md`.

## Itens

### Fase A — a aba

1. **`components/LaborPayroll.tsx`** — dono de duas abas (`ciclos` |
   `alocacoes`), barra §19.1, título/subtítulo por aba (§20), filtro de tipo
   convertido em `<select>` na toolbar. A barra some no drill-down do ciclo.
   **Pronto quando**: alternar a aba troca título e conteúdo.
2. **`components/LaborModule.tsx`** — `labor-allocations` passa a mapear para a
   aba `payroll` com `initialTab='alocacoes'`; `TAB_TO_SECTION['payroll']`
   declarado à mão (duas seções apontando para a mesma aba tornam o inverso
   ambíguo); `'all'` convertido de volta para `null` ao repassar o orgId de
   leitura. **Pronto quando**: quem tinha a view antiga salva cai na aba certa.
3. **`components/Layout.tsx`** — remover o `DropdownItem` de Alocações. O `case`
   do `AppRouter` **fica**, senão quem está na view salva vê tela em branco.

### Fase B — a tabela

4. **`components/LaborAllocations.tsx`** — uma linha por colaborador
   (Colaborador · Obras · % alocado · Rateio contábil · Custo da folha · Ações),
   com `useTableColumns` + `useResizableColumns` + `ColumnConfigButton` +
   **botão de autofit** (§6.1.2, pedido explícito), espaçador antes de Ações
   (§6.1.1), sticky header, `px-6`/`border-r`/`py-2.5`, KPIs, toolbar acoplada,
   escala compacta. Modelo: `PayrollRunList.tsx`.
   **Pronto quando**: `check-ui-standard.sh` limpo e a tabela ordena, esconde
   coluna, redimensiona e faz autofit.
5. **Painel lateral** (`components/ui/sheet.tsx`) com alocação por obra, rateio
   contábil, holerites e o botão de lançar. Tabelas internas em `px-3`/`px-4`
   (§6.9). **Pronto quando**: salvar atualiza a linha sem recarregar a lista (§22).
6. **`services/payrollService.ts`** — `listAllocationsForEmployees` e
   `listClosedResultsForEmployees` (uma query cada, em vez do N+1 por
   colaborador); `listCostSplitsForEmployees` já existia e é reusado.
7. **Simplificação do lançamento** — `syncEmployeeToFinance` perde os 6
   parâmetros de nome de CC/Plano; a classificação vem de
   `resolvePayrollShares` (rateio → colaborador → ciclo) e os nomes de
   `nomeDaFatia`. Chamador único (`LaborAllocations`), então o corte é contido.
   **Pronto quando**: lançar pelo painel gera as linhas classificadas pelo
   rateio, conferido em Contas a Pagar com Origem = "Folha".

## Verificação

```bash
bash scripts/check-ui-standard.sh components/LaborAllocations.tsx components/LaborPayroll.tsx
npx tsc --noEmit -p .
npx vitest run
```

## Estado — 2026-08-23 (implementação)

**Itens 1 a 7: código escrito.** `LaborAllocations.tsx` saiu de 1392 para ~700
linhas (a tabela + o painel), sem perder nenhuma função.

- `npx tsc --noEmit -p .` → limpo.
- `npx vitest run` → 1597 passam, 24 pulados, 0 falhas.
- `check-ui-standard.sh` → limpo em `LaborAllocations`, `LaborPayroll` e
  `LaborModule`. `PayrollRunList` acusa a linha 323 (`<h3>` do empty state) —
  **falso positivo conhecido**: o comentário da linha 92 contém `<td>` e liga a
  máquina de estados do awk até o primeiro `</td>` real.

### Decisões tomadas durante a implementação

- **O spinner de tela inteira de `LaborPayroll` foi removido**, não só
  condicionado: ele escondia título e abas enquanto as folhas carregavam e
  travava quem queria ir direto para Alocações. `PayrollRunList` já tem o seu
  (§11).
- **Coluna "% alocado" usa cor como informação** (cinza = sem alocação, âmbar =
  abaixo de 100, rosa = acima, verde = exatos 100): é o que faz a exceção
  saltar numa varredura da lista, que era o motivo de virar tabela.
- **Prop `organizations` saiu de `LaborAllocations`** — não era usada nem antes.
- **Sem `useConfirm`**: remover linha de alocação ou de rateio no painel é
  edição local, só persiste no "Salvar". Não há ação destrutiva imediata a
  confirmar (§14 não se aplica).

### Falta

Conferência na tela (não feita aqui) — ver a seção de verificação do plano em
`~/.claude/plans/` e o roteiro no fim desta sessão.
