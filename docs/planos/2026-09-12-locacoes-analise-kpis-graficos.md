# Locações › Análise — KPIs que faltavam, design e gráficos

## Pedido original

> **Sessão de 2026-09-12** (mensagem literal do usuário):
>
> comercial < locações < Gestão de Locações < aba Análise: avalie os kpis que faltam e melhore o design, inclua graficos bonitos

---

## Estado antes desta entrega

A aba Análise (`components/RentalsModule.tsx`, visão mestre, `activeTab === 'analysis'`)
tinha: seletor de empreendimento (§5.3) → 8 KPIs executivos → avisos → botão
"Ver detalhamento" → 3 grades de KPIs recolhidas (carteira, vacância, rentabilidade)
→ 1 gráfico de barras (receita mensal por empreendimento, série única) → tabela
"Por empreendimento" → tabela "Por tipo de cliente".

Todos os números já saíam de UM objeto, `RentalAnalysisScope`
(`lib/rentalByEmpreendimento.ts`), e a regra "**`null` é não medido, nunca zero**"
já valia. O que faltava não era dado novo no banco — era **conta** sobre dado que já
estava carregado, e forma visual para o que uma média esconde.

### Avaliação dos KPIs que faltavam

| Pergunta que a aba não respondia | Por que o KPI existente não basta | O que entrou |
|---|---|---|
| **Quando** os contratos vencem? | WALE é uma média: 2 anos pode ser metade da receita vencendo em março | Cronograma de vencimento (12 meses, gráfico) + "vencem em 30/90/365 dias" + "vencidos e em vigor" + "sem data de término" |
| Como a carteira está **composta**? | Ocupação física dá a taxa; não diz se o resto está disponível, reservado ou em obra | Composição por status (donut com a ocupação no centro) |
| Quão **velho** é o que está em aberto? | "Vencido > 90 dias" é a ponta; a inadimplência nasce em 1–30 | Aging em 5 faixas (gráfico) + vencido/em aberto/recebido |
| Quanto **custa** a vacância em R$? | Ocupação financeira dá o %; falta o valor mensal na mesa | Receita perdida por vacância (potencial − contratada) |
| Qual o **aluguel médio** por contrato? | Receita total não diz o ticket | Aluguel médio por contrato (receita ÷ negócios fechados) |
| Quanto **rende** líquido sobre o patrimônio? | Yield era só bruto e mensal; NOI existia sem cap rate por recorte | Cap rate por balde (NOI anualizado ÷ patrimônio) + yield bruto **anual** com o mensal de legenda |
| Quantos contratos estão **vigentes**? | `contractsConsidered` contava todos (inclusive encerrados) | Contratos vigentes, com o total de legenda |
| Quanto foi **lançado** e qual a taxa de arrecadação? | Só "recebidos" aparecia | Aluguéis lançados + taxa de arrecadação (recebido ÷ lançado) |

Três das lacunas apontadas pela auditoria de 06/08 continuam **fora** de propósito, por
não terem primitiva: funil de locação (lead → visita → proposta), custo de preparação
de unidade e histórico de reajuste. Ver `docs/planos/2026-08-06-kpis-locacao-primitivas.md`.

### Design

- Os 8 KPIs do topo ganharam `sub` **só onde acrescenta** (§4.1): "X de Y unidades",
  "R$ contratado de R$ potencial", "R$ ao ano", "N contratos na média", "N de M vencidos
  no ano". Sem legenda redundante.
- Detalhamento passa a ter **rótulo de grupo** (§21) por bloco — Carteira e patrimônio ·
  Receita e cobrança · Vencimento dos contratos vigentes · Vacância · Rentabilidade —
  em vez de três grades sem nome.
- Os quatro gráficos leem como um sistema: hairline sólida, marcas finas com ponta
  arredondada, rótulo direto só na ponta e em cor de texto, legenda HTML quando há 2+
  séries, estado vazio próprio quando o recorte não tem base. Registrado como **§28**
  em `docs/ui_ux_guia_unificado.md`.
- Paletas validadas com `dataviz/scripts/validate_palette.js` (daltonismo + contraste):
  status `#9333ea/#059669/#d97706` (ΔE adjacente 7,9 — na faixa que exige codificação
  secundária, atendida pela legenda com números); aging rampa vermelha
  `#f87171 → #7f1d1d` (monótona, um matiz, ponta clara 2,77:1). A série de contexto
  cinza `#94a3b8` do comparativo é **deliberadamente** recessiva ("ênfase": um matiz +
  cinza), fora da régua de série categórica.

---

## Itens

### 0. Este arquivo — `docs/planos/2026-09-12-locacoes-analise-kpis-graficos.md`

**Pronto quando:** existe, versionado, com o pedido literal. — [x]

### 1. `lib/rentalAnalysisCharts.ts` (novo, puro)

**O que muda:** três funções sem I/O — `unitStatusBreakdown`, `leaseExpirySchedule`,
`receivablesAging`. As faixas de atraso são as **mesmas** de `collectionSnapshot`.
**Pronto quando:** `npx vitest run __tests__/rentalAnalysisCharts.test.ts` passa: cada
unidade/contrato/parcela cai em um balde só; a soma fecha; `over90` bate com
`collectionSnapshot().overdue90`; `expired` bate com `wale().expiredStillActive`;
12 meses consecutivos com rótulo pt-BR; mês sem vencimento existe com zero. — [x] 9 testes

### 2. `lib/rentalByEmpreendimento.ts`

**O que muda:** `RentalAnalysisScope` ganha `unitStatus`, `dealsCount`, `leaseExpiry`,
`aging`, `executive.activeContracts`, `noi.capRate`; entrada ganha `noiMonthsInWindow`.
WALE e cronograma leem a **mesma** projeção de contrato.
**Pronto quando:** `__tests__/rentalByEmpreendimento.test.ts` prova que cada série nova
soma o total por balde, concorda com o KPI vizinho, e fica `null` sem insumo. — [x] 6 testes novos, 23 no arquivo

### 3. `components/rentals/RentalAnalysisOverview.tsx` (novo)

**O que muda:** KPIs + gráficos + detalhamento da aba saem do `RentalsModule` (3.250
linhas) para um componente que só **lê** o `scope`. Não faz conta que possa divergir da
tabela. Quatro gráficos Recharts: receita por empreendimento (2 séries, clique recorta),
vencimento 12 meses, composição por status (donut), aging.
**Pronto quando:** `bash scripts/check-ui-standard.sh` sem violação; `tsc --noEmit`
limpo; tela conferida no navegador. — [x] script e tsc; navegador: ver Verificação

### 4. `components/RentalsModule.tsx`

**O que muda:** o bloco de ~170 linhas da aba vira `<RentalAnalysisOverview …/>`;
`noiMonthsInWindow` passa ao agrupador; imports de Recharts e 3 ícones órfãos saem.
Seletor, tabelas "Por empreendimento" e "Por tipo de cliente" **não mudam**.
**Pronto quando:** `check-ui-standard.sh` não acusa nada novo (as 3 linhas que acusa
são as do card de grade legado, idênticas a `origin/main`). — [x]

### 5. `docs/ui_ux_guia_unificado.md` — §28 Gráficos

**O que muda:** seção nova com o vocabulário de gráfico (cromo, marcas, rótulo, legenda,
paleta validada, estado vazio), porque o guia não cobria e a REGRA #1 manda registrar
em vez de inventar ad hoc. — [x]

---

## Verificação

1. `npx vitest run __tests__/rentalAnalysisCharts.test.ts __tests__/rentalByEmpreendimento.test.ts __tests__/rentalExecutive.test.ts __tests__/rentalNoi.test.ts __tests__/rentalVacancy.test.ts __tests__/rentalPortfolio.test.ts __tests__/orgContextGuard.test.ts __tests__/segurancaMigrations.test.ts` — 124 passando.
2. `bash scripts/check-ui-standard.sh components/rentals/RentalAnalysisOverview.tsx` — limpo.
3. `bash scripts/check-system-projects.sh` / `check-project-classification.sh` nos arquivos novos — limpos.
4. `npm run build` (tsc + vite) — ver estado abaixo.
5. **Navegador** (Playwright, preview build, SW bloqueado) — ver estado abaixo.

## Estado

- [x] Itens 0–5 codificados; testes e checadores passando.
- [x] Build de produção (`npm run build`, tsc + vite) — OK.
- [x] Conferência visual — **harness com a largura útil real do app** (casca com
  sidebar de 260px + `<main p-6>` = 1292px, a mesma medida do `Layout`), Playwright
  headless, dado sintético via `groupRentalAnalysis`. Quatro cenários (Todos;
  Todos + detalhamento; um empreendimento; "não medido"), clique na barra do
  comparativo recorta a aba, tooltip do cronograma, viewport 1280. Zero erros/avisos
  de console. Três defeitos achados e corrigidos só por olhar o print: tick "R$ 10
  mil" quebrando em duas linhas, "R$ 37.408/m…" truncado no rodapé, rótulos de mês
  colidindo a 1280 (ano só no primeiro mês e em janeiro), e ticks 0/950/1900 que o
  formatador arredondava para "3 mil" (agora `niceTicks`).
  **Não conferido contra o banco real** — a aba exige login e o usuário de leitura
  não tem senha guardada; os números da carteira real continuam vindo do mesmo
  `groupRentalAnalysis` de antes, só com campos a mais.
- [ ] Push em `main`
