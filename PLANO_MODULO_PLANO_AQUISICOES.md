# PRD — Módulo Plano de Aquisições (ÒPURA Procurement Planning)

> Versão reescrita e fatiada, ancorada no schema real do ÒPURA.
> Substitui o PRD-visão original. As decisões de corte/adiar já foram aprovadas.

---

## 0. Decisões já tomadas (não reabrir)

| Item original | Decisão |
|---|---|
| 6 — BIM como fonte | **Cortado** (projeto à parte) |
| 17 — Mapa geográfico / rotas | **Cortado** |
| 16 — Simulação de 3 cenários | **Adiado** (Fase 4) |
| 20 — IA Copilot conversacional | **Adiado** (Fase 4, sobre IA do BI) |
| 12 — Curva S com 4 séries | **v1 = 2 séries** (planejado × comprado) |
| 13 — Motor de risco 4 dimensões | **v1 = só risco de atraso** |
| Sobreposição com Suprimentos | **Plano NÃO reimplementa SC/cotação/pedido** — para na geração e dispara o fluxo existente |

---

## 1. Realidade do schema (o que muda o desenho)

Verificado no código em 2026-06-16:

### Existe e será reusado
- **Orçamento** — `projects.budget: BudgetEntry[]` (JSON). Cada `BudgetEntry` tem
  `sinapiItem` (com `code`, `description`, `unit`, `price`, **`composition: CompositionComponent[]`**),
  `quantity`, `phase`, `group`. → fonte de **o que / quanto comprar** (explosão de insumos).
- **Cronograma** — `ItemScheduleDetails` (`startDate`/`endDate`/`duration`, CPM com `totalFloat`/`isCritical`,
  `predecessors`) + `ItemDistribution` (período × percentual × valor) por item, chaveado por `BudgetEntry.id`.
  → fonte de **quando** (curva de necessidade temporal).
- **Pin de versão** — `project.basedOnBudgetSnapshot?: BudgetEntry[]` já implementa o pin
  planejamento↔orçamento. O Plano de Aquisições reusa o **mesmo** mecanismo.
- **Suprimentos** — `quotation_requests` → `purchase_orders` (`items` JSON, `project_id`, `supplier_id`,
  `delivery_date`, `status` `'Rascunho'|'Enviado'|...`, `cost_center`, `chart_of_accounts`).
- **Fornecedor** — `supplierService` / `supplier_categories`.
- **Job diário** — cron + geradores OE/AP já existentes (módulo Tarefas) → reusar para alertas.
- **Convenção de referência** — snapshots não-FK (`BudgetItemRef`, `PlanningItemRef` em
  `operational-control.ts`). O Plano segue o mesmo padrão.

### NÃO existe (gaps que o PRD original assumia)
1. **Almoxarifado / Estoque** — não há tabela de saldo/movimentação. ⇒ **conciliação com estoque sai da v1.**
   Entra como Fase 3, dependente da criação de um módulo de estoque (fora do escopo deste PRD).
2. **Solicitação de Compra (SC)** — não há entidade. O fluxo real é cotação → pedido.
   ⇒ a saída do Plano é **gerar uma `quotation_request`** (ou `purchase_order` em `'Rascunho'`).
3. **Lead time por fornecedor** — não existe cadastro. ⇒ a Fase 1 **cria** esse cadastro.

---

## 2. Fronteira do módulo (definição dura)

```
┌─────────────────────── PLANO DE AQUISIÇÕES (este módulo) ───────────────────────┐
│  Orçamento (insumos)  +  Cronograma (datas)  +  Lead time  =  itens de plano     │
│  → o que / quanto / quando comprar  → curva financeira  → risco de atraso        │
│  → CONSOLIDAÇÃO multi-obra                                                        │
└──────────────────────────────────┬───────────────────────────────────────────────┘
                                    │ gera (botão / job)
                                    ▼
        ┌──────────── SUPRIMENTOS (já existe — NÃO reimplementar) ────────────┐
        │ quotation_request → cotação → aprovação → purchase_order → entrega   │
        └──────────────────────────────────────────────────────────────────────┘
```

O Plano **planeja e cronometra**. Suprimentos **executa**. Um único dono por dado.

---

## 3. Entidade central

Tabela nova `procurement_plan_items`, multi-tenant (RLS por `organization_id`), seguindo o
padrão de snapshot não-FK do orçamento/planejamento.

```sql
create table procurement_plan_items (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations(id),
  project_id          uuid not null references projects(id),

  -- pin de versão (espelha basedOnBudgetSnapshot)
  budget_version      int  not null,          -- versão do orçamento que gerou a linha
  is_stale            boolean not null default false,  -- true quando o orçamento versiona

  -- snapshot do insumo (NÃO FK — orçamento é JSON)
  input_code          text,                   -- código SINAPI/próprio do insumo
  input_description   text not null,
  input_unit          text not null,
  source_budget_item_id text,                 -- BudgetEntry.id de origem (rastreio)

  -- necessidade
  required_qty        numeric not null,       -- explosão composition × quantity
  need_date           date,                   -- da curva (ItemDistribution); null = sem cronograma

  -- timing de compra
  lead_time_days      int,                    -- aplicado (do cadastro de lead time)
  suggested_buy_date  date,                   -- need_date − lead_time_days
  suggested_supplier_id uuid references suppliers(id),

  -- financeiro
  estimated_unit_cost numeric,                -- sinapiItem.price do insumo
  estimated_total     numeric,                -- required_qty × estimated_unit_cost

  -- estoque (Fase 3 — null até existir módulo de estoque)
  stock_available_qty numeric,
  net_required_qty    numeric,                -- required − posição líquida

  -- workflow do item de plano
  status              text not null default 'planned',
    -- planned | approved | requisitioned | quoted | ordered | cancelled | stale
  generated_quotation_id uuid references quotation_requests(id),
  generated_order_id     uuid references purchase_orders(id),

  -- consolidação
  consolidation_group_id uuid,                -- agrupa linhas multi-obra do mesmo insumo/período

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index on procurement_plan_items (organization_id, project_id);
create index on procurement_plan_items (organization_id, suggested_buy_date);
create index on procurement_plan_items (consolidation_group_id);
```

Cadastro de lead time (Fase 1):
```sql
create table supplier_lead_times (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  supplier_id uuid not null references suppliers(id),
  category_id  uuid references supplier_categories(id),  -- ou input_code para granularidade
  input_code   text,
  lead_time_days int not null,
  unique (organization_id, supplier_id, coalesce(category_id::text, input_code))
);
```

---

## 4. O motor (coração do módulo)

```
para cada projeto com orçamento + cronograma:
  1. EXPLODIR insumos:  para cada BudgetEntry → composition[] × quantity → {insumo, qty}
                        somar por insumo (várias composições usam o mesmo insumo)
  2. DISTRIBUIR no tempo: aplicar ItemDistribution do item (período × %) à qty do insumo
                        → curva de necessidade {insumo, período, qty, need_date}
  3. CONCILIAR estoque (Fase 3): net_required = required − posição_líquida
                        (posição = saldo + em_trânsito + já_pedido − reservado)
  4. APLICAR lead time:  suggested_buy_date = need_date − lead_time_days(fornecedor/insumo)
  5. PRECIFICAR:         estimated_total = required_qty × estimated_unit_cost
  6. GERAR linhas procurement_plan_items
```

**Itens sem cronograma** (decisão aprovada): `need_date = null`, `status = planned`,
exibidos num backlog "Sem data de necessidade" — não entram no calendário nem na curva financeira
até receberem data.

**Conversão de unidade** (decisão aprovada): o orçamento e a compra podem divergir
(m³ × saco; un × caixa). v1 mantém a unidade do insumo do orçamento e registra `input_unit`;
um fator de conversão fornecedor→compra entra na Fase 2 junto da geração de cotação.

---

## 5. Versionamento (não ignorar)

Mesmo problema já resolvido em planejamento↔orçamento. Regras:
- cada linha guarda `budget_version`;
- quando o orçamento versiona, marcar `is_stale = true` nas linhas da versão antiga e exibir
  **banner de rebase** ("nova versão do orçamento — recalcular plano");
- rebase regenera o motor preservando linhas já `requisitioned`/`ordered` (não recompra o que já foi).

---

## 6. Geração / integração com Suprimentos

Saída do Plano (botão manual **e** job):
- agrupa linhas `approved` por fornecedor/projeto/janela → cria **`quotation_request`**
  (ou `purchase_order` em `'Rascunho'` quando fornecedor já definido);
- grava `generated_quotation_id`/`generated_order_id` na linha e move `status` para
  `requisitioned`/`ordered`;
- dali em diante o ciclo é 100% do módulo de Suprimentos existente (não duplicar).

Aprovação do plano (decisão aprovada): reusar **aprovação multinível dos Contratos** —
o plano (ou um lote dele) exige aprovação antes de virar cotação/pedido.

---

## 7. Consolidação multi-obra

Agregação por `input_code` + janela de compra entre projetos da org →
`consolidation_group_id`. Avaliar reuso da engine **FFD/DP do módulo estrutural** para
sugestão de lote ótimo (mesma natureza: agrupar para reduzir custo/desperdício).
Saída: "compra consolidada de N un de X" abrangendo as obras A/B/C.

---

## 8. Job automático (reuso)

Reusar **cron diário + geradores** do módulo Tarefas. O job:
- recalcula `suggested_buy_date` e `is_stale`;
- emite **tarefas/alertas** "comprar X até dd/mm" para itens com `suggested_buy_date` próxima;
- não cria SC sozinho na v1 (geração permanece com aprovação humana).

---

## 9. Fatiamento (roadmap)

### Fase 1 — Motor de necessidade (o valor real)
- `procurement_plan_items` + `supplier_lead_times` + RLS.
- Explosão de insumos do orçamento + curva de necessidade do cronograma + lead time → `suggested_buy_date`.
- Pin `budget_version` desde o dia 1.
- UI: lista + **calendário de compras** + **plano financeiro mensal** (item 11).
- Backlog "sem data de necessidade".

### Fase 2 — Geração + integração Suprimentos + curva S
- Botão "gerar cotação/pedido" → `quotation_request`/`purchase_order` Rascunho.
- Aprovação multinível (reuso Contratos).
- Conversão de unidade compra↔orçamento.
- **Curva S 2 séries** (planejado × comprado).
- **Risco de atraso** (suggested_buy_date < hoje, ou lead time não cabe na folga do cronograma).
- Banner de rebase de versão.

### Fase 3 — Consolidação + estoque
- Consolidação multi-obra (`consolidation_group_id`, avaliar FFD/DP).
- **Dependência externa**: requer módulo de Almoxarifado/Estoque (não existe hoje) para
  `posição líquida`. Sem ele, `net_required = required`.
- Job de alertas via Tarefas.

### Fase 4 — Inteligência
- Simulação de cenários (antecipar × sob demanda × híbrido).
- IA Copilot de suprimentos (sobre a IA narrativa do BI).
- Curva S 4 séries; motor de risco multidimensional (financeiro/logístico/mercado).

---

## 10. Indicadores (v1 — subconjunto do item 19)

`% itens planejados`, `% itens com cotação/pedido gerado`, `desembolso previsto × realizado`,
`itens em atraso de compra`, `lead time médio por fornecedor`.
Demais indicadores (economia gerada, performance de fornecedor) entram com Fases 2–3.

---

## 11. Riscos de implementação

- **Explosão de insumos**: `composition` em `custom_items` é JSON *string* e não tem
  `nature`/`is_favorite` (erro 42703 conhecido). Parsear com cuidado; não assumir colunas.
- **Estoque ausente**: não prometer conciliação real antes do módulo de estoque existir.
- **Itens sem cronograma**: garantir que o plano financeiro não conte itens sem `need_date`.
- **Multi-tenant**: RLS por `organization_id` em todas as tabelas novas desde a migration inicial.
```
