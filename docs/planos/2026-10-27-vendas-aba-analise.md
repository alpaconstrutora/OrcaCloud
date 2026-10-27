# Venda de Ativos › aba Análise (espelho da Análise de Locações)

## Pedido original

> `/impeccable craft: implemente em comercial > Venda de Ativos, aba de analise da mesma forma que comercial > locacoes > aba análise`
>
> Sessão: 2f1c3425-a67f-492f-bdc2-4f559a297408 · 27/10/2026

Referência: Comercial › Gestão de Locações › Análise, no estado dos PRs #182
(números que batem, duas leituras) e #185 (espelho vivo) — planos
`2026-10-26-locacoes-analise-critica.md` e `2026-10-26-locacoes-analise-espelho-vivo.md`.

## O que o banco mostrou antes de decidir (27/10/2026)

| Medida | Valor |
|---|---|
| Negociações de venda por etapa | Aprovação 5 · Reserva 2 · Contrato 5 · Assinatura 2 · **Concluído 0** |
| Status da unidade nessas 14 negociações | todas `RESERVED` — a unidade só vira `SOLD` em Concluído |
| Unidades `SOLD` sem negociação ativa | 4 (cadastro antigo) |
| Contratos `domain='VENDAS'` | 6 Ativo + 1 Concluído (6 com `deal_id`) |
| Parcelas desses contratos em `vw_receivables` | 50: recebido R$ 300 mil · vencido R$ 2,56 mi · a vencer R$ 229 mil |

Consequência: com a regra dos cards atuais ("vendido" = etapa Concluído), o
VGV vendido de toda a carteira é R$ 0.

## Decisões tomadas

| Data | Decisão | Por quê |
|---|---|---|
| 27/10 | **Vendida = negociação em Contrato, Assinatura ou Concluído, ou unidade `SOLD`.** Proposta/Aprovação/Reserva (e unidade `RESERVED` sem negociação) = "reservada / em negociação". | Resposta do usuário: "Com contrato (Recomendado)". |
| 27/10 | **Duas leituras: Comercial \| Financeiro.** | Resposta do usuário: "Comercial \| Financeiro (Recomendado)". Comercial = time de vendas (estoque, velocidade, negociações abertas, desconto); Financeiro = diretoria (VGV vendido, a receber, atraso, VGV a vender). |
| 27/10 | A aba mora na visão mestre (sem edifício aberto), com o trilho "Imóveis \| Análise" — igual Locações. | Mesma anatomia; o recorte é o seletor de empreendimento. |
| 27/10 | VGV vendido vem das NEGOCIAÇÕES vendidas (`deal.value`); unidade `SOLD` sem negociação conta como vendida na contagem física e fica FORA do VGV, com aviso. | Inventar valor de venda pelo preço de tabela afirmaria um número que ninguém negociou. |
| 27/10 | VGV a vender = preço de tabela (`price`, senão `initial_price`) das unidades vendáveis não vendidas; VGV total = vendido + a vender. Permutadas saem da base vendável. | Mesma exclusão de permuta que os cards atuais já fazem. |
| 27/10 | Cobrança lê `contracts` `domain='VENDAS'` + `vw_receivables` pelo mesmo `loadRaw` de Locações, com `domain` como opção. | Uma consulta, muitos baldes — e o prefixo composto de `reference_id` já resolvido lá. |
| 27/10 | Cores de status (paleta validada): vendida `#2563eb` · reservada `#d97706` · disponível `#059669` · permutada `#94a3b8` · outros `#cbd5e1`. | Trio cromático PASS no validador (ΔE 7,9 protan — exige legenda com números, como em Locações). O vermelho do texto "Vendido" leria como alarme no gráfico. |
| 27/10 | Cromo dos gráficos e grade do espelho viram peças comuns (`components/analysis/`), usadas pelas duas abas. | Copiar 300 linhas de teclado/movimento do espelho criaria duas versões para divergir. |

## Plano

| # | O que muda | Arquivos | Como sei que terminou |
|---|---|---|---|
| 1 | Lib pura da análise de venda: baldes por empreendimento (partição), status derivado, VGV, negociações, velocidade, desconto, valor/m², cobrança, cronograma de recebimento, células do espelho, tipo de cliente, rodapé ponderado | `lib/salesAnalysis.ts` | `__tests__/salesAnalysis.test.ts` verde: linhas somam o total; rodapé sem busca = topo; regra "com contrato"; `SOLD` sem negociação fora do VGV; `null` onde não há base |
| 2 | `loadRaw` com `domain` | `services/rentalExecutiveService.ts` | Locações continua chamando sem opção (LOCACAO); venda passa `VENDAS` |
| 3 | Peças comuns: cromo de gráfico e grade do espelho; Locações passa a usá-las | `components/analysis/chartKit.tsx`, `components/analysis/UnitMirrorGrid.tsx`, `components/rentals/*` | Testes de `RentalUnitMirror` seguem verdes sem mudar |
| 4 | Painel e espelho da venda | `components/sales/SalesAnalysisOverview.tsx`, `components/sales/SalesUnitMirror.tsx` | Teste de componente do espelho de venda; tela conferida |
| 5 | Ligação no módulo: trilho Imóveis \| Análise, seletor de empreendimento + leitura, copiar link (`#/sales?aba=analise&emp=…&leitura=…`), tabelas Por empreendimento e Por tipo de cliente, exportar XLSX | `components/SalesModule.tsx` | tsc 0 erros; `check-ui-standard.sh` limpo nos arquivos tocados |
| 6 | Conferência na tela (as duas leituras, recorte, "Todos", celular) | — | Prints no Chrome |

## Estado

- [x] 1 — `__tests__/salesAnalysis.test.ts`: 16 testes verdes.
- [x] 2 — `loadRaw(org, null, { domain: 'VENDAS' })`; Locações segue sem a opção.
- [x] 3 — `components/analysis/chartKit.tsx` e `UnitMirrorGrid.tsx`; os 47 testes de Locações (lib, partição, espelho com teclado) seguem verdes sem mudar uma linha; a tela de Locações foi conferida igual.
- [x] 4 — `__tests__/components/SalesUnitMirror.test.tsx`: 6 testes verdes.
- [x] 5 — tsc 0 erros; `check-ui-standard.sh` limpo nos 7 `.tsx` tocados; `check-system-projects`, `check-project-classification`, `orgContextGuard`, `check-xss-sinks` limpos; `vite build` ok.
- [x] 6 — conferido no Chrome (dev server da frente, dados reais, "Todas as organizações"): Comercial e Financeiro em "Todos"; recorte Bella Vista com torres e cartão de detalhe; link `?aba=analise&emp=…&leitura=…` mantido em dia; celular 390 px sem rolagem horizontal; console sem erro.

### Achados na conferência (27/10)

| Achado | O que foi feito |
|---|---|
| "Sem empreendimento" (um contrato de venda sem negociação: parcelas, nenhum VGV) aparecia como linha vazia no gráfico de VGV | Gráfico só com baldes que têm VGV; a tabela mantém o balde, para a soma fechar |
| "Copiar link" encostava na borda a 390 px | A linha dos botões quebra |
| Link de "Todos" (sem `emp=`) abria o recorte salvo no navegador — **herdado de Locações** | Link sem `emp` = Todos, nas DUAS telas |

## Pedido seguinte (27/10/2026)

Pergunta: *"Quer que eu passe a regra 'com contrato' para esses cards [da aba Imóveis] e para a aba Resultados também?"* — resposta do usuário: **"sim"**.

| # | O que muda | Arquivos | Como sei que terminou |
|---|---|---|---|
| 7 | Classificador único de unidade (`saleUnitClassifier`) exportado pela lib; Análise, Imóveis e Resultados usam ele | `lib/salesAnalysis.ts` | 16 testes da lib seguem verdes |
| 8 | Cards da aba Imóveis = `groupSalesAnalysis` (mestre: carteira inteira; edifício: as unidades dele) | `components/SalesModule.tsx` | Na tela: mestre 11/42 · R$ 3.255.000 · 26,2% — igual à Análise; Bella Vista 7/8 · 87,5% — igual à linha dela |
| 9 | Aba Resultados: vendidas/abertas por `saleDealStage`, unidades pelas folhas + classificador, `commercial_deal_units` carregado sempre, unidade oculta (`visible_in_sales=false`) fora | `services/salesDashboardService.ts`, `components/SalesDashboard.tsx` | Na tela, Bella Vista: VGV vendido R$ 3.255.000; Estoque 7/8 (antes 7/9 — contava a unidade oculta) |
| 10 | `biConvergence.test.ts`: a regra antiga fica nomeada como a do BI; bloco novo trava a regra das telas | `__tests__/biConvergence.test.ts` | verde |

- [x] 7 · [x] 8 · [x] 9 · [x] 10 — tsc 0 erros; 41 testes da lib + convergência verdes; `check-ui-standard` limpo em `SalesModule`/`SalesDashboard`.

## Pedido seguinte (27/10/2026) — BI

Pergunta: *"Quer que eu alinhe o BI à mesma regra?"* — resposta do usuário: **"sim"**.

Levantamento no BANCO (não no repositório): só `vw_fact_deal` e `vw_bi_commercial` contam venda por
COMPLETED; `fn_bi_executive`/`fn_bi_trend` leem `is_vgv`/`in_conversao_base` da view e seguem sem
mudança. `fn_comissao_corretor_sincronizar` e `warranty_unit_directory` também citam COMPLETED, mas
não são VGV (comissão e garantia) — fora.

Medido ANTES (27/10): `vw_bi_commercial.vgv_fechado` = R$ 17.739 com 9 "fechados" — eram **locações**
concluídas (a view não filtrava tipo); `vw_fact_deal` com `is_vgv` = 0 vendas.

| # | O que muda | Arquivos | Como sei que terminou |
|---|---|---|---|
| 11 | Views com a regra "com contrato" (locação segue fechando em Concluído; conversão só de venda; `security_invoker` repetido) | `supabase/migrations/aplicar_20271027500000_bi_vgv_vendida_com_contrato.sql` | Depois de aplicada: `is_vgv` = 7 vendas / R$ 3.255.000; `vgv_fechado` sem locação; `reloptions` ainda `security_invoker=on` |

- [ ] 11 — arquivo pronto, `migrationsPrefixo` + `segurancaMigrations` verdes; **aplicação no banco bloqueada pelo modo automático** — aguardando o usuário aplicar ou liberar.

### Pendente de decisão do usuário

- ~~Card "Volume em Vendas" de `CommercialModule.tsx`~~ — usuário: **"sim"**; passou a `saleDealStage`. ⚠️ Mas o `CommercialModule.tsx` **não é importado por nenhum arquivo** (nem pelo `AppRouter`): a tela não aparece no app, é código morto. Candidato a remoção — perguntar.
- ~~BI ainda conta só Concluído~~ — item 11 acima. Registro original: `vw_fact_deal.is_vgv`, as views executivas (`20260708000002`) e as RPCs de convergência (`20260710000003`) — além do card "Volume em Vendas" de `CommercialModule.tsx:403`. Com a regra nova nas telas de Venda de Ativos, esses números divergem (BI R$ 0 × telas R$ 3,26 mi). Mudar view SQL = migration — perguntar antes.
