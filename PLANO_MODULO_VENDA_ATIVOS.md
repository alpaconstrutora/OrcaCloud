# PRD / Plano de Implementação — Módulo Comercial (Venda de Ativos)

> Cobre 2 gaps identificados numa auditoria do módulo Empreendimentos que, na verdade,
> pertencem ao domínio comercial: **tabela de preços versionada + reajuste em massa** e
> **simulação de venda (mix/cenários)**. Ancorado no schema e código real (verificado 2026-07-01).

---

## 1. Por que agora

Ao auditar o módulo Empreendimentos, dois itens foram inicialmente classificados como
"faltando" — mas pertencem ao Comercial (preço e ritmo de venda são atributos de
comercialização, não de incorporação):

1. **Tabela de preços + reajuste em massa** — hoje só existe edição unidade-a-unidade.
2. **Simulação de venda (mix de unidades)** — parcialmente coberto pelo motor hedônico
   existente, mas sem a peça de "cenário de absorção" (velocidade de venda).

A investigação revelou que a base já é maior do que parecia: **existe um simulador de curva
de absorção pronto, mas nunca conectado a nenhuma UI** (`pricingService.simulateAbsorption`),
e os campos `initial_price`/`table_price` já existem no banco desde 2026-03, mas hoje só
espelham `price` (sem histórico real). Este plano não começa do zero — conecta o que já foi
construído e completa o que falta.

---

## 2. Realidade do schema e código

### Existe e será reusado
- **Motor hedônico** — `pricingService.calculateUnitScore()` / `calculatePrices()`: distribui
  um VGV-alvo entre unidades por score (área × andar × posição × vista × orientação),
  já consumido por `PricingIntelligenceModal.tsx` no `SalesModule`.
- **Simulador de absorção (órfão)** — `pricingService.simulateAbsorption(totalUnits, months,
  velocity)`: curva logística de vendas mês a mês. **Função pura já escrita, mas não chamada
  por nenhum componente** — dead code pronto para ser ligado a uma tela.
- **Campos de preço em `commercial_properties`** — `price`, `initial_price`, `table_price`
  (migration `20260311200000_create_sales_dashboard_tables.sql`). Hoje as três colunas são
  sempre gravadas com o mesmo valor no save (`PropertyModal.tsx:1132-1135`) — não há
  distinção real entre "preço de tabela" e "preço negociado", nem histórico de quando a
  tabela mudou.
- **3 atributos de precificação por unidade** — `position_type`/`view_type`/`sun_orientation`
  (Empreendimentos → propagados ao Comercial na publicação, já implementado).
- **`ContractIndexManager`/`reajuste_index`** — módulo Contratos já tem motor de reajuste por
  índice (INCC/IPCA/CUB) aplicado a parcelas de contrato. Não cobre preço de tabela de unidade,
  mas o índice em si (tabela de índices + valores mensais) já existe e pode ser reusado.

### NÃO existe (criado por este plano)
- Entidade "Tabela de Preços" com versão + vigência (ex.: `commercial_price_tables` +
  `commercial_price_table_items`), permitindo ter "Tabela v3 vigente desde 01/07" e comparar
  com a anterior.
- Reajuste em massa (aplicar um índice/percentual a N unidades de um empreendimento de uma vez).
- Tela/hook que chame `simulateAbsorption` com dados reais (unidades disponíveis, velocidade
  observada) e mostre a curva de absorção projetada.
- Cenários comparáveis de venda (ex.: "80% em 18 meses" vs "50% em 24 meses") com impacto no
  fluxo de caixa — hoje `simulateAbsorption` calcula uma curva, mas não compara cenários lado
  a lado nem cruza com o financeiro.

---

## 3. Decisão de arquitetura central

**Preço de tabela vira uma entidade própria, versionada — `price` na `commercial_properties`
continua sendo o preço vigente (compatibilidade), mas passa a ser derivado da tabela ativa.**

```
commercial_price_tables
    id, organization_id, commercial_building_id (empreendimento no Comercial),
    version_label, effective_date, status (draft|active|superseded), notes, created_at

commercial_price_table_items
    id, price_table_id, property_id, price, created_at
```

Fluxo:
1. Usuário cria uma nova tabela (rascunho) a partir da tabela ativa (clona os preços atuais).
2. Edita em massa (reajuste por % ou índice) ou unidade a unidade.
3. Ativa a tabela → grava `price`/`table_price` em cada `commercial_properties` vinculada e marca
   a tabela anterior como `superseded`.
4. Histórico fica em `commercial_price_tables` — dá para comparar v2 vs v3 sem recalcular nada.

**Simulação de venda não precisa de tabela nova** — é client-side, consumindo unidades já
carregadas (`commercial_properties` do empreendimento) + `simulateAbsorption()`. Persistir só se
o usuário quiser salvar um cenário nomeado (`commercial_sales_scenarios`, opcional, Fase 2).

---

## 4. Fases

### Fase 1 — Tabela de Preços versionada + reajuste em massa *(3 sprints)*

**Objetivo:** substituir a edição unidade-a-unidade por um fluxo de tabela com histórico.

**Migrations:**
- `commercial_price_tables` + `commercial_price_table_items` (schema acima) + RLS por
  `organization_id`.
- Índice único: 1 tabela `active` por `commercial_building_id`.

**Service:** `commercialPriceTableService.ts`
- `createDraftFromActive(buildingId)` — clona preços atuais das unidades do prédio.
- `applyBulkAdjustment(tableId, { percent } | { indexId, referenceMonth })` — reajuste em massa
  reusando o motor de índices já existente em Contratos (`ContractIndexManager`).
- `activateTable(tableId)` — grava `price`/`table_price` em cada `commercial_properties`,
  marca tabela anterior `superseded`.
- `listTables(buildingId)`, `getTableItems(tableId)`.

**Tela:** `PriceTableManager.tsx` (dentro do Espelho de Vendas / SalesModule) — lista de
versões, botão "Nova versão", grid de edição em massa (% ou índice), preview de impacto total
(delta em R$ e %) antes de ativar.

**Critérios de aceite:**
- Ativar uma tabela atualiza `price` de todas as unidades do prédio numa transação.
- Histórico mostra quem/quando ativou cada versão.
- Reajuste por índice usa o mesmo motor de `ContractIndexManager` (não duplica lógica).

---

### Fase 2 — Simulação de Venda (conectar o `simulateAbsorption` órfão) *(2 sprints)*

**Objetivo:** dar uma UI ao simulador de absorção que já existe, e permitir comparar cenários.

**Migrations:** nenhuma para o cálculo (client-side). Opcional: `commercial_sales_scenarios`
(id, building_id, name, velocity, months, created_at) só se quiser salvar cenários nomeados —
avaliar se vale o esforço ou se cenário efêmero (sem persistir) já resolve.

**Service:** nenhum novo obrigatório — `pricingService.simulateAbsorption()` já existe;
adicionar `pricingService.compareScenarios(totalUnits, months, velocities: number[])` (roda o
simulador N vezes, uma por velocidade) para a comparação lado a lado.

**Tela:** `SalesSimulatorModal.tsx` — input de velocidade(s) de venda, gráfico de curva de
absorção (Recharts, padrão dos outros módulos) sobre o total de unidades disponíveis do
empreendimento; comparação de 2-3 cenários (velocidade baixa/média/alta) na mesma tela.

**Critérios de aceite:**
- Curva bate com `simulateAbsorption()` sem alteração na função (só consumo).
- Cenários usam o total real de unidades disponíveis do prédio (não hardcoded).

---

## 5. Fora de escopo deste plano

- Workflow de aprovação de desconto por alçada (gap relacionado, mas é controle de processo,
  não de precificação — merece PRD próprio se for adiante).
- Dashboard de Empreendimento (timeline de obra, saúde financeira) — não é escopo comercial.
- Reajuste automático por data (cron) — Fase 1 cobre reajuste manual disparado pelo usuário;
  automação fica para uma fase futura se houver demanda.

---

## 6. Resumo de esforço

| Fase | Esforço | Depende de |
|---|---|---|
| 1 — Tabela de Preços + reajuste em massa | 3 sprints | `ContractIndexManager` (reuso, já existe) |
| 2 — Simulação de Venda | 2 sprints | Fase 1 não é bloqueante — pode ir em paralelo |

Total: ~5 sprints. Fase 2 é a mais barata do projeto inteiro porque o cálculo já está escrito
— é praticamente só UI.
