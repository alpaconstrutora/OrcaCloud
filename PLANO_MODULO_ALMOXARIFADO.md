# PRD — Módulo Almoxarifado / Estoque (ÒPURA Inventory)

> Pré-requisito da Fase 3 do [Plano de Aquisições](PLANO_MODULO_PLANO_AQUISICOES.md):
> é quem fornece **saldo** e **reservas** para a posição líquida.
> Ancorado no schema real (verificado 2026-06-16).

---

## 1. Por que agora

O Plano de Aquisições precisa de "posição líquida = saldo + em_trânsito + já_pedido − reservado".
`em_trânsito`/`já_pedido` saem de `purchase_orders`; **`saldo` e `reservado` não existem em lugar
nenhum** — não há módulo de estoque. Este módulo cria essa fonte de verdade.

Hoje o material é apenas um custo (`work_orders.actual_material_cost`, "adicionado manualmente");
não há rastreio de quantidade, saldo, perda ou transferência. Resultado: o problema clássico que o
PRD de aquisições descreve (falta de material, estoque excessivo, compra emergencial) não tem como
ser medido.

---

## 2. Realidade do schema

### Existe e será reusado (alimentadores)
- **Entrada** — `purchase_receipts` + `purchase_receipt_items`
  (`orderItemCode`, `description`, `unit`, `quantityOrdered`, `quantityReceived`, `issue`).
  → cada recebimento vira **movimento de entrada** no estoque.
- **Saída/consumo** — Ordens de Execução (`work_orders`, módulo Controle Operacional).
  Hoje gravam só `actual_material_cost` (número). → passam a baixar estoque por quantidade.
- **Catálogo de insumo** — `BudgetEntry.sinapiItem` (`code`, `description`, `unit`, `composition`).
  Snapshot não-FK, igual ao padrão do orçamento/planejamento.
- **Pedido em trânsito** — `purchase_orders.status` (`Enviado`/`Recebido`/...), `delivery_date`.
- **Multi-obra** — `projects`; **multi-tenant** — `organization_id` + RLS (obrigatório).

### NÃO existe (será criado por este módulo)
- `warehouses`, `stock_movements`, `stock_balances`, `stock_reservations`,
  `stock_transfers`, `stock_counts` (inventário).

---

## 3. Arquitetura: razão (ledger) + saldo (cache)

**Fonte de verdade = `stock_movements` (livro-razão imutável).**
`stock_balances` é cache derivado (saldo por almoxarifado × insumo), atualizado por trigger a cada
movimento. Nunca editar saldo direto; só lançar movimento. Isso dá rastreabilidade total e
auditoria (ARQUITETURA/REGRAS_DE_OURO da casa).

```
purchase_receipt ─┐
work_order ───────┤
transfer ─────────┼──> stock_movements (entrada/saída/transf/ajuste)  ──trigger──> stock_balances
inventory_count ──┘                                                                     │
                                                                              reservations (separado)
                              posição_líquida = stock_balances − reservations  ──> Plano de Aquisições
```

---

## 4. Entidades

```sql
-- Almoxarifado (por obra, ou central da org)
create table warehouses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  project_id uuid references projects(id),     -- null = central
  name text not null,
  type text not null default 'site',            -- site | central | virtual
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Livro-razão (fonte de verdade — imutável)
create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  warehouse_id uuid not null references warehouses(id),

  -- snapshot do insumo (NÃO FK)
  input_code text,
  input_description text not null,
  input_unit text not null,

  type text not null,            -- in | out | transfer_in | transfer_out | adjust
  quantity numeric not null,     -- sempre positivo; sinal vem do type
  unit_cost numeric,             -- custo na entrada (p/ custo médio)

  -- rastreio de origem (qual deles estiver preenchido)
  receipt_id uuid references purchase_receipts(id),
  work_order_id uuid references work_orders(id),
  transfer_id uuid references stock_transfers(id),
  count_id uuid references stock_counts(id),

  moved_at date not null default current_date,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now()
);

-- Saldo (cache derivado — mantido por trigger)
create table stock_balances (
  organization_id uuid not null references organizations(id),
  warehouse_id uuid not null references warehouses(id),
  input_code text not null,
  input_description text not null,
  input_unit text not null,
  quantity numeric not null default 0,
  avg_unit_cost numeric not null default 0,     -- custo médio ponderado
  updated_at timestamptz not null default now(),
  primary key (warehouse_id, input_code)
);

-- Reserva (a parcela "reservado" da posição líquida)
create table stock_reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  warehouse_id uuid not null references warehouses(id),
  input_code text not null,
  quantity numeric not null,
  work_order_id uuid references work_orders(id),
  status text not null default 'active',         -- active | consumed | cancelled
  created_at timestamptz not null default now()
);

-- Transferência entre almoxarifados (gera 2 movimentos)
create table stock_transfers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  from_warehouse_id uuid not null references warehouses(id),
  to_warehouse_id uuid not null references warehouses(id),
  status text not null default 'in_transit',     -- in_transit | received | cancelled
  shipped_at date, received_at date,
  notes text,
  created_at timestamptz not null default now()
);

-- Inventário físico (contagem → ajuste)
create table stock_counts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  warehouse_id uuid not null references warehouses(id),
  status text not null default 'open',           -- open | closed
  counted_at date, notes text,
  created_at timestamptz not null default now()
);
-- (+ stock_count_items: input_code, system_qty, counted_qty, diff)
```

Todas com **RLS por `organization_id`** desde a migration inicial.

---

## 5. Regras do motor

**Custo médio ponderado** (padrão construção): na entrada,
`avg = (saldo·avg + qtd·unit_cost) / (saldo + qtd)`. Saída a custo médio corrente.

**Entrada automática**: ao criar `purchase_receipt` com `status` Recebido/Parcial → para cada item
recebido, lançar movimento `in` no almoxarifado da obra do pedido, `unit_cost` = preço do item do PO.

**Saída automática**: ao consumir material numa OE → movimento `out`; baixa saldo; alimenta
`actual_material_cost` da OE pelo custo médio (substitui o lançamento 100% manual atual).
Mantém entrada manual como fallback.

**Reserva**: OE planejada pode reservar material (`stock_reservations` ativo). Consumo converte
reserva→saída.

**Transferência**: `transfer_out` na origem + `transfer_in` no destino (multi-obra → suporta a
consolidação de compras do Plano de Aquisições).

**Inventário**: contagem fecha gerando movimento `adjust` pela diferença.

**Saldo nunca negativo sem alerta**: saída que estoura saldo é permitida mas sinaliza
(retrocompatível com obra que lança consumo sem ter dado entrada).

---

## 6. Integração com o Plano de Aquisições

RPC `fn_net_position(org, project, input_code, date)`:
```
posição_líquida = stock_balances.quantity                       (deste módulo)
                + Σ purchase_orders em trânsito (Enviado, não recebido)   (suprimentos)
                − Σ stock_reservations ativas                    (deste módulo)
```
É exatamente o `net_required_qty` que a Fase 3 do Plano de Aquisições espera. Com este módulo no ar,
a Fase 3 deixa de ser "bloqueada por dependência inexistente".

---

## 7. Integração com Financeiro / Controladoria

Estoque é **ativo**: entrada não é despesa imediata; a despesa ocorre no **consumo** (saída).
Isto conversa com o regime de competência / WIP pendente no
[Módulo Controladoria](project_modulo_controladoria.md) (Fase 2). v1 do Almoxarifado **registra valor
de movimento** (entrada/saída a custo médio) para que a Controladoria leia depois; não tenta fazer a
contabilização agora.

---

## 8. Fatiamento (roadmap)

### Fase 1 — Núcleo de estoque
`warehouses` + `stock_movements` + `stock_balances` (trigger de saldo + custo médio) + RLS.
**Entrada automática a partir de `purchase_receipts`.** UI: saldo por almoxarifado, extrato de
movimentos, entrada/saída manual. Inventário básico (`stock_counts` → ajuste).

### Fase 2 — Consumo, reserva e transferência
Baixa de estoque pela OE (integra Controle Operacional, substitui custo manual).
`stock_reservations`. `stock_transfers` entre obras.

### Fase 3 — Posição líquida e ligação com Aquisições
`fn_net_position`; expõe saldo+reserva ao Plano de Aquisições (desbloqueia a Fase 3 de lá).
Curva de estoque, ponto de reposição, indicadores (giro, ruptura, excesso).

### Fase 4 — Inteligência
Sugestão de transferência inter-obra (sobra A → falta B) reusando a lógica de consolidação.
Alertas via cron+Tarefas (estoque mínimo, item parado, validade). Mapa de estoque (se/quando).

---

## 9. Indicadores (v1→v3)
Saldo por obra/insumo, valor total em estoque, itens abaixo do mínimo, ruptura (saldo zero com
necessidade), giro, perdas (ajustes negativos), idade do estoque.

---

## 10. Riscos
- **Concorrência de saldo**: atualizar `stock_balances` em trigger/transação para evitar corrida.
- **`composition` é JSON string** em `custom_items` (sem `nature`/`is_favorite`, erro 42703 conhecido):
  o catálogo de insumo deve parsear com cuidado.
- **Obra sem entrada formal**: muitas obras consomem sem registrar entrada — permitir saldo negativo
  com alerta, não travar.
- **Migração do custo manual da OE**: `actual_material_cost` existente não pode ser quebrado;
  baixa por estoque entra como complemento opt-in, não substituição forçada.
- **Multi-tenant**: RLS por org em todas as tabelas desde o dia 1.
```
