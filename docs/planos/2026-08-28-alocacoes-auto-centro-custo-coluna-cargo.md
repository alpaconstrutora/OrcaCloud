# Alocações da folha — alocação automática pelo centro de custo + coluna Cargo

## Pedido original

Sessão de 2026-08-28, mensagem literal do usuário:

> recursos humanos < Gestão de Folha de Pagamento < aba alocaoes:
> 1. Quando o centro de custo estiver vinculado a uma obra, faça alocação automática e caso o usuário queira alterar ele poderá
> 2.  Criar coluna cargo na tabela e remover cargo debaixo do nome do colaborador (coluna colaborador)

## Contexto

`cost_centers_v2.project_id` (migration `20270907000000_cost_centers_v2_project_link`)
já vincula centro de custo a obra — é editado em Minha Organização › Centro de
Custo. A aba Alocações não lia esse vínculo: a obra do colaborador era digitada
de novo, colaborador por colaborador, todo mês.

A escada de classificação da folha (rateio do mês → cadastro do colaborador →
ciclo de folha) já existia em `resolvePayrollShares`/`dimensaoEfetiva`. A
derivação da obra segue a MESMA escada — não inventa uma terceira.

## Itens

1. **`lib/payrollUIHelpers.ts` — `derivarAlocacaoPorCentroDeCusto`**
   O que muda: função pura que, do rateio contábil do mês (ou, na falta dele,
   do centro de custo do cadastro), devolve `{project_id, allocation_percent}[]`.
   Soma centros de custo que apontam para a mesma obra e corta no teto de 100%.
   Pronto quando: coberta por testes em `__tests__/payrollUIHelpers.test.ts`
   (rateio × cadastro, obra repetida, CC sem obra, teto, arredondamento). ✅

2. **`services/payrollService.ts` — `listCostCenters` + `insertAutoAllocations`**
   O que muda: `listCostCenters` passa a trazer `project_id`; novo
   `insertAutoAllocations` grava o lote em UMA query
   (`upsert` + `ignoreDuplicates` sobre `employee_allocations_unique_period`),
   nunca sobrescrevendo alocação existente.
   Pronto quando: `npx tsc --noEmit` limpo e a tela grava sem N+1. ✅

3. **`components/LaborAllocations.tsx` — aplicação automática**
   O que muda: ao carregar a competência, quem está **sem nenhuma alocação** e
   tem centro de custo com obra é alocado automaticamente; toast informa
   quantos. Travas: (a) só quem está sem alocação; (b) registro por competência
   em `laborAllocations:autoAplicado` para que apagar de propósito não
   ressuscite; (c) falha fica só na sessão (ref), não desliga o automático para
   sempre naquele navegador.
   Pronto quando: `__tests__/components/LaborAllocations.test.tsx` cobre
   aplicar / não tocar em quem já tem / CC sem obra / competência já aplicada. ✅

4. **`components/LaborAllocations.tsx` — painel lateral**
   O que muda: botão "Do centro de custo" (ao lado de "Mês anterior") preenche
   a alocação a partir do rateio EM EDIÇÃO; o empty state diz qual obra o
   centro de custo aponta. Preenche, não grava — o usuário confere e salva.
   Pronto quando: botão aparece só quando há obra derivada. ✅

5. **`components/LaborAllocations.tsx` — coluna Cargo**
   O que muda: coluna `cargo` (`employees.role`) ordenável entre Colaborador e
   Obras; a segunda linha ("Sem função") sai da célula do colaborador. Chaves de
   preferência viram `laborAllocationsColumns.v2` / `laborAllocationsColWidths.v2`
   para a coluna nascer na posição certa em vez de no fim da ordem salva.
   Pronto quando: `bash scripts/check-ui-standard.sh` limpo e o teste de
   componente prova que a célula do nome tem só o nome. ✅

## Verificação

- `npx vitest run` — 1766 testes, tudo verde (inclui os 10 novos).
- `npx tsc --noEmit -p .` — limpo.
- `bash scripts/check-ui-standard.sh components/LaborAllocations.tsx` — limpo.
- `bash scripts/check-system-projects.sh` / `check-project-classification.sh` — limpos.
- `npm run build` — ok.
- **Não verificado no navegador** (sem credenciais nesta sessão): resta conferir
  na tela real que existem centros de custo com obra vinculada e que o toast de
  alocação automática aparece na primeira abertura da competência.
