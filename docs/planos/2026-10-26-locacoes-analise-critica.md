# Locações › aba Análise — correções da crítica de design (26/10/2026)

## Pedido original

> `/impeccable critique: comercial < Gestão de Locações < aba analise`
>
> Sessão: 058a6341-a06e-4d8f-b216-f8e5d365cca4 · 26/10/2026

Depois do relatório (nota 19/40, 4 problemas P1 e 1 P2), as respostas às
perguntas da crítica foram:

| Pergunta | Resposta |
|---|---|
| Por onde começar? | "Números que batem (Recomendado)" |
| Para quem é a aba? | "Duas leituras separadas" (Operação \| Investimento) |
| Quanto fazer agora? | "Tudo (P1 + P2 + menores)" |

E, diante da ordem de 8 passos proposta, o usuário respondeu: **"sim"**.

Snapshot da crítica: `.impeccable/critique/2026-10-26T18-23-06Z__components-rentalsmodule-tsx.md`
(no checkout de integração).

## Decisões tomadas

| Data | Decisão | Por quê |
|---|---|---|
| 26/10 | Rodapé da tabela passa de média **simples** para **ponderada** | O commit `456c9c55` registra só "média" pedida; a simples dava a um prédio de 1 unidade o peso de um de 12 e contradizia o KPI (31,9% × 34,3%). Com todas as linhas visíveis, ponderada = topo. |
| 26/10 | Uma só "receita potencial" (`financial.potential`); `referenceMonthlyRevenue` sai do escopo | KPI mostrava R$ 61.613 e o rodapé R$ 61.152 para a mesma pergunta. A chave da coluna fica `referenceMonthlyRevenue` só para não perder largura/visibilidade gravadas pelo usuário. |
| 26/10 | Vacância conta só unidades locáveis (folhas carregadas) | Banco, 26/10: as 42 "unidades vagas" eram 32 unidades + 6 edifícios + 4 imóveis `visible_in_sales=false`. |
| 26/10 | NOI sem despesa apropriada = "—" | Com despesa R$ 0 a margem saía 100% — boa notícia falsa. |
| 26/10 | Divisão das duas leituras: "Aprovo como está" | Pergunta ao usuário (tabela "Duas leituras" abaixo). |
| 26/10 | Destaque dos indicadores principais: "Variante nova no guia" | REGRA #1 item 4 — seção nova em `docs/ui_ux_guia_unificado.md` antes do uso. |
| 26/10 | Limiar do "Vencido há mais de 90 dias": "Qualquer valor acima de zero" fica vermelho | Resposta do usuário; zero = neutro. |

## Plano

| # | Passo | Arquivos | Como sei que terminou |
|---|---|---|---|
| 1 | Números que batem (P1-a) | `lib/rentalByEmpreendimento.ts`, `components/RentalsModule.tsx`, `components/rentals/RentalAnalysisOverview.tsx` | Testes novos em `__tests__/rentalByEmpreendimento.test.ts` (vacância só de folha; potencial único; amostra de valor/m²; rodapé ponderado = topo); na tela, rodapé "Total da carteira" igual aos KPIs |
| 2 | NOI honesto e termos (P1-b + menores) | mesmos | KPI "NOI no ano" com "—" sem despesa; % e anos com vírgula; "Alugadas / unidades"; "Aluguel médio por locação"; um só "Ver todos os empreendimentos"; seletor sem balde vazio |
| 3 | Desenho das duas leituras (Operação \| Investimento) | este plano | Seção "Duas leituras" escrita e aprovada pelo usuário |
| 4 | Estados e acessibilidade (P1-c, P1-d) | `RentalsModule.tsx`, `components/ui/TableUtils.tsx`, `RentalAnalysisOverview.tsx` | Carregando/erro/ok distintos; `th` com botão e `aria-sort`; linha acessível por teclado; caption; `aria-label` nos gráficos |
| 5 | Aplicar as duas leituras (P2 layout) | `RentalAnalysisOverview.tsx` | 3–4 KPIs-herói por leitura, cor por limiar, coluna do nome fixa |
| 6 | Legibilidade (P2 tipografia) | idem | Avisos ≥ 12 px em cinza ≥ 4,5:1 |
| 7 | Exportar XLSX e recorte na URL | `RentalsModule.tsx` | Botão exporta a tabela; URL com `?emp=` reabre o recorte |
| 8 | Passada final | — | Tela conferida nas duas leituras e em largura de celular |

## Duas leituras (passo 3 — proposta, aguardando aprovação)

Um seletor segmentado **Operação | Investimento** ao lado do seletor de
empreendimento, persistido como o recorte. Os dados são os mesmos
(`RentalAnalysisScope`), só muda o que sobe para a primeira dobra.

| | Operação (quem administra a locação) | Investimento (diretoria) |
|---|---|---|
| 4 indicadores principais | Ocupação física · Vencido > 90 dias · Vencem em 90 dias · Vacância média | Receita mensal (contratada de potencial) · NOI no ano · WALE · Yield bruto anual |
| Faixa secundária | Receita mensal · Ocupação financeira · Taxa de renovação | Valor patrimonial · Receita perdida por vacância · Cap rate · Taxa de renovação |
| Gráficos | Vencimentos (12 meses) · Aluguéis em aberto por atraso · Composição das unidades | Receita por empreendimento · Composição das unidades · Vencimentos |
| Colunas padrão da tabela | Alugadas/unidades · Ocupação física · Vacância · Vencido > 90 dias · Receita mensal | Receita mensal · Receita potencial · Ocupação financeira · NOI no ano · WALE · Valor médio/m² |
| Ação de cada número | Vencido → Contas a Receber · Vencem → aba Renovações · Vacância → Imóveis disponíveis | Receita perdida → Imóveis disponíveis · NOI "sem despesa" → Contas a Pagar |

Cor: indicador neutro (`gray`) por padrão; vermelho/âmbar só por limiar
(ex.: vencido > 90 dias acima de 5% do lançado = vermelho). Hoje cada um dos 8
cards tem uma cor fixa que não indica estado.

⚠️ Conflito com a REGRA #1: o `KpiCard` é padrão global (§4 do guia) com
valor `text-sm`. Um indicador principal maior pede uma variante nova — pela
regra, isso entra no guia como seção nova antes de ser usado.

## Estado

- [x] 1 — lib + tela (tsc 0 erros; 183 testes de locação verdes; `check-ui-standard` limpo). Conferência visual: pendente de login no app local.
- [x] 2 — idem (sem o link direto para o Financeiro: o aviso nomeia o caminho "Financeiro › Contas a Pagar").
- [ ] 3
- [ ] 4
- [ ] 5
- [ ] 6
- [ ] 7
- [ ] 8

## Verificação

`npx vitest run __tests__/rentalByEmpreendimento.test.ts` e, na tela, Comercial ›
Gestão de Locações › Análise em "Todas as organizações": rodapé "Total da
carteira" com as mesmas ocupações e a mesma receita potencial dos KPIs.
