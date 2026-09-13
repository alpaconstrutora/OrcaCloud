# Gestão de Ativos → manutenção gera título no Contas a Pagar

## Pedido original

Sessão 2e718847, 2026-09-13, depois de corrigir os rótulos da aba Centro de Custo
em ÒPURA · Relatórios:

> por que o centro de custo ativos - manutencoes nao aparece? ainda tem bug

> Gestão de Ativos < aba ativos patromoniais

Pergunta feita ("Quando o custo de uma manutenção de ativo deve virar título no
Contas a Pagar?") e resposta escolhida: **"Já ao criar a ordem com custo"** —
gera o título pendente na criação (custo estimado) e ajusta ao concluir.

## Diagnóstico

- Centro `020 Ativos › 021 Manutenção` existe na Alpa. A manutenção "Troca de
  rolamentos" (R$ 360, corretiva, concluída 12/09) aponta para ele.
- Nenhuma linha de `internal_transactions` no banco inteiro referencia esse centro.
  `opura_asset_maintenances` era a única tabela a usá-lo.
- `assetService.createMaintenance/updateMaintenance` só escrevem em
  `opura_asset_maintenances`. Sem trigger, sem chamada ao financeiro. O centro de
  custo escolhido na manutenção era só etiqueta; o custo nunca virava lançamento —
  logo não entrava em Contas a Pagar, DRE nem ÒPURA · Relatórios (que lê apenas
  `vw_fact_financial_tx` ← `internal_transactions`).

Não é bug do Relatórios: é integração que não existia. Folha (`LABOR`),
Contratos (`CONTRACT_*`) e Pró-labore já geram título com `cost_center_id` e
`reference_id` próprio; Ativos passa a fazer o mesmo.

## Desenho

Um título por manutenção, `source_system = 'ASSET_MAINTENANCE'`,
`reference_id = asset-maintenance-<id da manutenção>`, upsert em
`(organization_id, reference_id, entry_type)` (índice `internal_transactions_org_ref_key`).

| Evento na manutenção | Efeito no título |
|---|---|
| criar/editar com `cost > 0` e status ≠ cancelada | upsert DEBIT PENDING/PREVISTO, `amount = cost`, datas = `executed_date ?? scheduled_date`, `cost_center_id` da manutenção, `project_id` = obra atual do ativo |
| concluir | mesmo upsert (custo final, data de execução) |
| custo zerado ou status cancelada | título vira `CANCELLED / CANCELADO` (se existir) |
| excluir a manutenção | idem cancelar |
| título já `CONCILIATED` (pago) | não é tocado — o pagamento manda |

Falha na ponte **não é engolida**: a manutenção já foi salva, então o erro sobe com
mensagem "Ordem salva, mas o lançamento financeiro falhou: … — edite e salve de
novo para gerar o título" (salvar de novo refaz o upsert).

## Itens

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1 | `utils/assetMaintenanceFinance.ts` (novo) | função pura `buildMaintenanceTitle(maint, asset)` → linha do título ou `null`; `maintenanceTitleReference(id)` | testado em 2 |
| 2 | `__tests__/assetMaintenanceFinance.test.ts` (novo) | casos: custo 0, cancelada, agendada, concluída (usa executed_date), sem centro, descrição | `npx vitest run __tests__/assetMaintenanceFinance.test.ts` verde |
| 3 | `services/assetService.ts` | `syncMaintenanceFinance()` chamada em create/update/delete; pula título pago; cancela quando some | typecheck verde; criar ordem com custo na tela gera linha em Contas a Pagar |
| 4 | `supabase/migrations/aplicar_20270919000030_asset_maintenance_backfill_financeiro.sql` | backfill: título para manutenções existentes com custo > 0, não canceladas e sem título | aplicada via `db query -f`; "Troca de rolamentos" aparece em ÒPURA · Relatórios › Centro de Custo como `Ativos › Manutenção` |

## Estado

- [x] 1, 2, 3, 4 — ver commit desta frente.
- Provado no banco: após o backfill, `fn_opura_pivot`-equivalente para a Alpa/2026
  lista `Ativos › Manutenção` com 1 lançamento / R$ 360 previsto.
