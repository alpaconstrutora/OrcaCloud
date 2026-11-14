# Contratos de Serviço › aba Análise (aos moldes de Venda de Ativos › Análise)

## Pedido original

> `Comercial > Contratos de Serviço: implementar aba análise aos moldes do comercial > venda de ativos. > aba análise`
>
> (seguido de `continue`)
>
> Sessão: 8293d677-5f3e-4948-a651-ae0624a308b3 · 13/11/2026

Referência: Comercial › Venda de Ativos › Análise — plano
`2026-10-27-vendas-aba-analise.md` (lib pura `lib/salesAnalysis.ts`, painel
`components/sales/SalesAnalysisOverview.tsx`, cromo comum `components/analysis/chartKit.tsx`).

## O que o banco mostrou antes de decidir (13/11/2026)

| Medida | Valor |
|---|---|
| Contratos `domain='SERVICOS'` | **1** — nº 001 "Construção Igreja Divino", status **Minuta**, R$ 466.622,84, `billing_mode=MEDICAO`, com cliente e obra, sem empreendimento |
| Medições desse contrato | 0 (no banco inteiro: 1 medição, `Pendente`, de outro domínio) |
| Aditivos | 0 |
| Parcelas em `vw_receivables` | 1 — o valor cheio, `PENDING`, vencimento 30/07/2026 (vencida há > 90 dias) |

Consequência: a aba nasce sobre quase nenhum dado. Os números e as regras são
travados por teste com dados sintéticos; a tela é conferida com o único contrato real.

## Decisões tomadas

| Data | Decisão | Por quê |
|---|---|---|
| 13/11 | **Contratado = Aprovado, Assinado, Ativo, Suspenso, Concluído, Encerrado.** Rascunho, Minuta, Revisão e Enviado = "em negociação". Cancelado fica fora das duas. Status desconhecido = "em negociação" (não infla a carteira). | Resposta do usuário: "Aprovado em diante (Recomendado)". |
| 13/11 | **Recorte por cliente** (seletor no topo + tabela "Por cliente"). Contrato sem cliente vai ao balde "Sem cliente". | Resposta do usuário: "Por cliente (Recomendado)". Contrato de serviço é emitido para um cliente. |
| 13/11 | **Linha do tempo de vigência no lugar do espelho**: uma barra por contrato (início → fim) pintada pela situação, com o % medido dentro, marca de "hoje" e destaque de quem vence em 90 dias. Clique abre o contrato. | Resposta do usuário: "Linha do tempo (Recomendado)". Serviço não tem unidade para pintar. |
| 13/11 | **Duas leituras: Comercial \| Financeiro**, como em Vendas. Comercial = carteira contratada, em negociação, vencendo em 90 dias, variação por aditivo/reajuste. Financeiro = medido, a receber, vencido > 90 dias, saldo a faturar. | Mesmo desenho aprovado em Vendas (27/10). |
| 13/11 | Valor do contrato = `current_value`, senão `original_value`. Variação = vigente − original (aditivos + reajustes), dos contratados. | `current_value` é o valor vigente (pós-aditivo/reajuste). |
| 13/11 | **Medido** = Σ `total_value` das medições `Processada` ou `Paga` dos contratados. `Pendente`/`Em Análise` = "em aprovação". `Cancelada` fora. % medido = medido ÷ valor vigente dos contratados **faturados por medição/etapa** (contrato parcelado/recorrente não mede). | Medição só existe no modo de faturamento por medição. |
| 13/11 | **Cobrança** = parcelas de `vw_receivables` de todo contrato não cancelado do balde (mesmo `loadRaw` de Locações/Vendas, domínio `SERVICOS`). Saldo a faturar = vigente dos contratados − lançado deles (nunca negativo). | Parcela lançada é dinheiro a receber qualquer que seja o status do cabeçalho — o contrato real (Minuta) tem a sua. |
| 13/11 | Vigência: "vence em 90 dias" = contratado vigente (Aprovado/Assinado/Ativo/Suspenso) com fim entre hoje e +90 dias; "vigência vencida" = vigente com fim antes de hoje (aviso, não KPI). | A pergunta de quem renova contrato. |
| 13/11 | Cores da situação: contratado vigente `#2563eb` · em negociação `#d97706` · encerrado `#94a3b8` · cancelado `#cbd5e1` (o mesmo trio validado de Vendas, sem o verde, que lá era "disponível"). | Paleta já aprovada no validador (§28.4); legenda com números. |
| 13/11 | Abas "Contratos \| Análise" pelo `TabsBar` (§19.1), entre o título e os KPIs: a lista recebe `tabsSlot` (§19.3). Título muda por aba (§20). Link: `#/service-contracts?aba=analise&cli=…&leitura=…`. | Anatomia título → abas → KPIs. |

## Plano

| # | O que muda | Arquivos | Como sei que terminou |
|---|---|---|---|
| 1 | Lib pura: situação do contrato, baldes por cliente (partição), carteira, negociação, variação, medido, vigência, cobrança (aging/cronograma reaproveitados), linhas da linha do tempo, rodapé | `lib/serviceContractAnalysis.ts` | `__tests__/serviceContractAnalysis.test.ts` verde: linhas somam o total; regra "Aprovado em diante"; cancelado fora; `null` onde não há base; medido só de medição aprovada |
| 2 | `loadRaw` aceita `SERVICOS` e devolve as colunas extras (cliente, título, número, modo de faturamento); medições numa consulta | `services/rentalExecutiveService.ts`, `services/serviceContractAnalysisService.ts` | Locações/Vendas chamam igual; tsc 0 |
| 3 | Painel da análise + linha do tempo | `components/serviceContracts/ServiceContractsAnalysisOverview.tsx`, `components/serviceContracts/ServiceContractTimeline.tsx` | tela conferida |
| 4 | Ligação: abas, seletor de cliente + leitura, copiar link, tabela "Por cliente", exportar XLSX; `tabsSlot` na lista | `components/ServiceContractsModule.tsx`, `components/serviceContracts/ServiceContractsAnalysisTab.tsx`, `components/SupplyChainContractList.tsx` | tsc 0; `check-ui-standard.sh` limpo nos arquivos tocados |
| 5 | Conferência na tela (as duas leituras, recorte, link, celular) | — | prints no Chrome |

## Estado

- [x] 1 — `__tests__/serviceContractAnalysis.test.ts`: 16 testes verdes.
- [x] 2 — `loadRaw(org, null, { domain: 'SERVICOS' })` + colunas extras no select; Vendas/Locações seguem iguais (112 testes: lib nova, salesAnalysis, rentalExecutive, rentalAnalysisCharts, biConvergence, orgContextGuard).
- [x] 3 — painel e linha do tempo escritos; `check-ui-standard.sh` limpo.
- [x] 4 — tsc 0 erros; `vite build` ok; `check-ui-standard.sh` limpo nos 5 `.tsx` tocados; `check-system-projects` limpo; `check-project-classification` acusa só `utils/diaryPlanningLink.ts` (não tocado, já está assim em `main`).
- [x] 5 — conferido em 13/11 (dev server da frente, Chrome com janela em ALTAIR-PC, login feito pelo usuário, "Todas as organizações", dados reais): Comercial (R$ 0 contratado · R$ 466.623 em negociação · linha do tempo com parcela vencida · aviso de parcela em contrato em negociação), Financeiro (vencido > 90 dias R$ 466.623 em alerta, com "Cobrar em Contas a Receber"), detalhamento, aba Contratos (endereço volta a `#/service-contracts`), clique na barra abre o contrato, celular 390 px sem rolagem horizontal (390/390), 0 erro de console, nenhuma gravação.

### Achados na conferência (13/11)

| Achado | O que foi feito |
|---|---|
| Seletor dizia "Todos os clientes (1 contratos)" | Singular/plural corrigido |
| Faixa secundária (`KpiCard size="sm"` com sombra) mostra rótulo em caixa alta | Não mexido: é o comportamento do componente, idêntico em Venda de Ativos › Análise — pendente de decisão se o `KpiCard` deve seguir a regra de rótulo sem caixa alta (#348) |

## Pedido seguinte (13/11/2026)

> `Alinhe o componente à regra de rótulo sem caixa alta (#348). commite e publique`

| # | O que muda | Arquivos | Como sei que terminou |
|---|---|---|---|
| 6 | `KpiCard` (ramo comum, todos os tamanhos) perde `uppercase tracking-wide` no rótulo — vale para os ~130 arquivos que usam o card; guia §4 e §4.3 atualizados | `components/ui/KpiCard.tsx`, `docs/ui_ux_guia_unificado.md` | nenhum `uppercase` no componente; tsc 0; suíte/CI verde |
| 7 | Publicar | — | CI verde no SHA do PR; merge squash; `conferir-producao.sh` com texto da aba nova |
