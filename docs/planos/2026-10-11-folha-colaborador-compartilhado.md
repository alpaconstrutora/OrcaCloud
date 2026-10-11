# Folha de colaborador compartilhado com outra organização

## Pedido original

> existe um bug entre um usuário que mesmo estanto cadastrado para todas as organizações, não consegue editar gerar a folha de pagamento em recursos humanos, de um funcionario que esta cadastrado em organizacao principal difente do usuário.
> nota: este usuário é um fornecedor

Sessão: 9d5a9eda-b806-44d0-8512-a7e101769ce2 · 11/10/2026

## Diagnóstico (medido no banco, não inferido)

- Usuário: `alpaconstrutora@gmail.com` (fornecedor Sebastião Eugênio, `partner_users`).
  Em `organization_members` ele é membro de **1** organização só (Alpa Construtora e
  Incorporadora) — não das 4.
- Colaboradores: Iago Marques e Clovis Mariano da Rosa são da Garden Cambuhy SPE e
  compartilhados com a Alpa (`employee_org_shares`). Os ciclos de 08 e 09/2026 da Alpa
  já os incluem.
- O compartilhamento abria só `employees` (`is_employee_shared_with_user`). As tabelas
  em volta exigiam ser membro da org **de origem**.
- Reprodução como o fornecedor (papel `authenticated` + JWT dele, transação desfeita):
  `ve_ficha=2 ve_eventos=0 ve_rubr_auto_clovis=0 ve_aloc_clovis=0
  insert_evento_org_colab=42501 criar_ciclo_garden=42501`. Existiam 3 eventos,
  1 rubrica automática e 1 alocação.
- Consequências na tela:
  - lançar/editar evento → 42501 (`PayrollEventModal` grava com o `org_id` do colaborador);
  - "Todas" → `runBulkPayroll` tentava abrir ciclo na Garden → 42501 → lote abortado;
  - reprocessar o ciclo da Alpa → recalculava **sem** o evento/rubrica/alocação
    invisíveis — valor errado, sem erro.
- Achado lateral (REGRA #7, pergunta 2): `update_employee_rubrics` e
  `upsert_employee_allocations` eram `SECURITY DEFINER` sem autorização dentro —
  qualquer conta autenticada regravava rubricas/alocações de colaborador de qualquer org.

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 11/10/2026 | Correção estrutural (compartilhamento cobre a folha) × só incluir o fornecedor como membro da Garden × as duas | **Estrutural** |

Consequência: o fornecedor **continua** membro só da Alpa. Ele trabalha a folha dos
compartilhados no ciclo da Alpa; não abre ciclo na Garden (`payroll_runs` não muda).

## Plano

1. **`supabase/migrations/aplicar_20271011000300_folha_colaborador_compartilhado.sql`**
   — helpers `can_access_employee` e `employee_shared_in_home_org`; policies de
   `payroll_events`, `employee_automatic_rubrics`, `employee_cost_splits`, `absences`,
   `vacation_balance`, `employee_salary_history` (ramo: compartilhado **e** linha da org
   dona do colaborador), `employee_allocations`, `time_entries` (`can_access_employee`);
   autorização dentro das 2 RPCs; REVOKE de PUBLIC/anon nas 4 funções.
   *Pronto quando:* aplicada em produção e a verificação abaixo dá os valores esperados.
2. **`services/payrollEngine.ts`** — `runBulkPayroll` recebe `writableOrgIds` e só abre
   ciclo nessas orgs; sem nenhuma, erro explicando o motivo.
   *Pronto quando:* `__tests__/payrollEngine.bulk.test.ts` passa.
3. **`components/LaborPayroll.tsx`** — passa `useWritableOrganizations()` para o lote e
   mostra a mensagem do lote sem org gravável.
   *Pronto quando:* typecheck limpo e teste do item 2 passa.

## Estado

- [x] Item 1 — aplicado em produção em 11/10/2026 (ensaio com rollback antes; depois
  verificado de novo no banco publicado)
- [x] Item 2 — teste 4/4
- [x] Item 3
- [ ] Publicado (push em `main`)

## Verificação

Como o fornecedor, no banco publicado (transação desfeita, 0 linhas persistidas):

| Checagem | Antes | Depois |
|---|---|---|
| vê os 3 eventos de Iago/Clovis | 0 | 3 |
| vê rubrica automática do Clovis | 0 | 1 |
| vê alocação do Clovis | 0 | 1 |
| lança evento do Iago no ciclo da Alpa | 42501 | OK |
| roda `update_employee_rubrics` do Clovis | — | OK |
| lança evento do Iago com `org_id` de uma 3ª org | — | 42501 |
| cria ciclo na Garden | 42501 | 42501 (de propósito) |
| conta sem vínculo chama as 2 RPCs no Iago | passava | 42501 |
| conta sem vínculo vê eventos/ponto | — | 0 / 0 |

Admin (UID real), contagem nas 8 tabelas antes × depois da migration: idêntica
(34 / 5 / 9 / 0 / 3 / 3 / 13 / 2).

## Fora do escopo (anotado, não feito)

- **Folha em dobro possível:** quem é membro da org de origem **e** da que recebeu o
  colaborador, ao gerar o lote em "Todas", abre ciclo nas duas, e o compartilhado entra
  nas duas (`listEmployees(orgId)` inclui os compartilhados). Pré-existente; os dados de
  hoje mostram a folha deles só na Alpa. Decidir qual org paga o compartilhado é
  pergunta de produto.
- **Centro de Custo da alocação do compartilhado:** `LaborAllocations` grava o rateio
  com a org do colaborador (Garden), mas o catálogo de CC carregado é o da org da tela.
- Os ciclos de 08 e 09/2026 da Alpa estão parados em `PROCESSANDO`.
