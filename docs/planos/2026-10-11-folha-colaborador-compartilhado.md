# Folha de colaborador compartilhado com outra organização

## Pedido original

> existe um bug entre um usuário que mesmo estanto cadastrado para todas as organizações, não consegue editar gerar a folha de pagamento em recursos humanos, de um funcionario que esta cadastrado em organizacao principal difente do usuário.
> nota: este usuário é um fornecedor

Sessão: 9d5a9eda-b806-44d0-8512-a7e101769ce2 · 11/10/2026

### Pedido posterior — 11/10/2026 (mudou o rumo)

> a folha deve ser gerada na organizacao do colaborador e nao do usuário

E, respondendo a "quem pode fechar o ciclo da Garden":

> Esse e um caso especifico que nao deve ser tratado como geral.
> contratei um fornecedor para ser assistente administrativo e cuidar da folha de pagamento

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

| 11/10/2026 | Folhas já geradas com colaborador de outra org | **Corrigir as abertas agora**; fechadas não mudam |
| 11/10/2026 | Quem fecha o ciclo da Garden | "caso específico… assistente administrativo que cuida da folha" → ele vira **membro da Garden**; a ampliação por compartilhamento é desfeita |
| 11/10/2026 | Executar o plano de acesso + dados + código | **Sim, tudo** |

~~Consequência: o fornecedor **continua** membro só da Alpa. Ele trabalha a folha dos
compartilhados no ciclo da Alpa; não abre ciclo na Garden (`payroll_runs` não muda).~~
**Superado pelo pedido posterior:** a folha é da org do colaborador, e o assistente é membro da Garden.

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

### Fase 2 — folha na org do colaborador (pedido posterior)

4. **`services/payrollEngine.ts`** — `runPayroll(orgId)` calcula só colaboradores com
   `org_id = orgId` (o compartilhado vai para a folha da org dele).
   *Pronto quando:* `__tests__/payrollEngine.orgDoColaborador.test.ts` passa.
5. **`aplicar_20271011000800_folha_acesso_assistente_desfaz_compartilhamento.sql`** —
   `alpaconstrutora@gmail.com` membro da Garden (permissões copiadas da Alpa); as 8
   policies voltam a "membro da org"; `can_access_employee` sem o ramo do
   compartilhamento; trava das 2 RPCs mantida; `employee_shared_in_home_org` removida.
   *Pronto quando:* assistente lança evento e cria ciclo na Garden; conta sem vínculo
   leva 42501 na RPC.
6. **`aplicar_20271011000900_folha_abertas_para_org_do_colaborador.sql`** — folhas
   abertas: duplicata apagada, resto movido (criando ciclo se faltar); destino fechado
   não mexe; aborta se a origem tiver lançamento financeiro; reversão em
   `folha_org_colaborador_reversao_20261011` (**não apagar**).
   *Pronto quando:* MOVIDO=3, MOVIDO_CICLO_NOVO=4 (3 ciclos novos), DUPLICATA=8, e só
   os 8 casos de 04 e 06/2026 seguem cruzados.

## Estado

- [x] Item 1 — aplicado em produção em 11/10/2026 (ensaio com rollback antes; depois
  verificado de novo no banco publicado)
- [x] Item 2 — teste 4/4
- [x] Item 3
- [x] Publicado — `317ab127` em 11/10/2026; domínio conferido servindo o commit, CI verde
- [x] Item 4 — teste 1/1
- [x] Item 5 — aplicado em produção 11/10/2026; verificado no banco publicado
- [x] Item 6 — aplicado em produção 11/10/2026: results 69→61, items 241→217, events 34
  (inalterado), runs 19→22; ações MOVIDO=3, MOVIDO_CICLO_NOVO=4, DUPLICATA=8
- [x] Fase 2 publicada — `1200cf50`; domínio servindo `81e54a8` (contém), CI verde
- [ ] **Decisão manual pendente:** 04/2026 (Rogério, Altair, Claudinei, Ricardo na folha
  aberta da Garden, que tem R$ 3.815,81 em lançamentos financeiros pendentes) e
  06/2026 (os mesmos 4 na folha aberta da Garden). Nos dois meses a folha da Alpa
  está FECHADA; corrigir exige mexer em folha fechada.

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

- ~~**Folha em dobro possível:** quem é membro da org de origem **e** da que recebeu o
  colaborador, ao gerar o lote em "Todas", abre ciclo nas duas, e o compartilhado entra
  nas duas (`listEmployees(orgId)` inclui os compartilhados). Pré-existente; os dados de
  hoje mostram a folha deles só na Alpa. Decidir qual org paga o compartilhado é
  pergunta de produto.~~ Resolvido pela Fase 2.
- **Centro de Custo da alocação do compartilhado:** `LaborAllocations` grava o rateio
  com a org do colaborador (Garden), mas o catálogo de CC carregado é o da org da tela.
- Os ciclos de 08 e 09/2026 da Alpa estão parados em `PROCESSANDO`.
