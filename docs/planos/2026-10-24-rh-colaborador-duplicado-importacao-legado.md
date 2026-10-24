# RH › Colaborador duplicado na folha (Rogério) — remover a importação do "sistema legatário"

## Pedido original (24/10/2026, sessão 8b3a48d5)

> verifique por que ao calcular a folha aparecem o colaborador Rogerio da silva santos duplicado

(com print de Detalhes da Folha 01/06/2026 a 30/06/2026, Garden: duas linhas "Rogério da Silva Santos", uma
"role-servente" zerada e outra "Servente" com R$ 1.621,00.)

Decisões do usuário (mesma sessão, 24/10):
- duplicado: **"Excluir e passar rubricas"**;
- importação: **"Remover a importação"**;
- "Em que mês o Rogério passou a trabalhar pela Garden?" → **"Desde 15/08/2025"**.

## Diagnóstico (dado do banco)

Não era a folha mostrando a mesma pessoa duas vezes: eram **dois cadastros**.

| | id | criado | CPF | cargo | salário | empresa |
|---|---|---|---|---|---|---|
| verdadeiro | `cd183303…` | 25/03/2026 | sim | Servente | 1.767 | sim |
| duplicado | `55c517ea…` | **22/10/2026 19:44 UTC** | — | `role-servente` | 0 | — |

O duplicado trazia `notes = "Migrado do sistema legatário em 22/10/2026."`: foi criado por
`laborService.migrateLegacyWorkers`, botão "Importar Agora" do aviso "Migração de Dados Disponível" (RH), com a
**Garden** selecionada no topo. A rotina:
- lia `organizations.resources.workers` da org do topo — que **não é legado**: é a biblioteca de **Trabalhadores do
  Planejamento** (`ResourceManagement`, `FinancialSchedule`, alocação);
- pulava quem já existia **pelo nome, só dentro da org do topo**. O Rogério verdadeiro ainda estava na **Alpa**
  (todas as folhas dele até 02/10/2026 são da Alpa), então na Garden não "existia" e foi recriado;
- depois **esvaziava** `resources.workers` da org (apagou a biblioteca de trabalhadores da Garden).

Linha do tempo (UTC): 22/10 19:44 duplicado criado → 19:57 folha 09/2026 Garden com o duplicado → até 21:41 o
verdadeiro foi movido da Alpa para a Garden (21:41 já aparece na 06/2026 Garden) → 23/10 18:22 cadastro verdadeiro
salvo (ficou sem rubricas recorrentes; antes tinha ADIANTAMENTO, CONTRIBUIÇÃO ASSISTENCIAL, FGTS) → 18:42 duplicado
salvo com ADIANTAMENTO, AUXEDU, VA e admissão 15/08/2025, e a 06/2026 Garden recalculada com os dois.

Outro achado: em `LaborCosts.tsx`, o botão **"Adicionar Colaborador"** da tela vazia chamava `onMigrate` — a mesma
importação.

## Itens

1. [x] **Dados (24/10, autorizado: "Excluir e passar rubricas")** — script
   `docs/planos/2026-10-24-limpeza-rogerio-duplicado.sql` (transação com portão que desfaz se não bater): backup em
   `_bkp_rogerio_duplicado_20261024_employee` (1), `_results` (2) e `_rubricas` (3), RLS ligado e sem acesso para
   anon/authenticated — **NÃO apagar**; rubricas do duplicado (ADIANTAMENTO, AUXEDU, VA) copiadas para o verdadeiro;
   apagados os 2 `payroll_results` do duplicado (06 e 09/2026 Garden, PROCESSANDO, 0 itens), os 3 vínculos e o
   cadastro. Antes: varredura por TODAS as FKs para `employees` — só esses 5 registros apontavam para ele.
   Conferido depois: 1 Rogério (Garden) com ADIANTAMENTO, AUXEDU, VA.
2. [x] **`services/laborService.ts`** — sai `migrateLegacyWorkers` e `getLegacyWorkersCount`.
3. [x] **`hooks/useLaborQueries.ts`** — sai `useLegacyWorkersCount` e o `legacyCount` do módulo.
4. [x] **`components/LaborModule.tsx`** — sai o aviso "Migração de Dados Disponível" e `handleMigrate`.
5. [x] **`components/LaborCostDashboard.tsx`** — sai o card "Migração Recomendada".
6. [x] **`components/LaborCosts.tsx`** — sai o card "Colaboradores Legados"; "Adicionar Colaborador" passa a abrir o
   formulário de novo colaborador (`onNewEmployee`), em vez da importação.
   `__tests__/components/LaborCostsAdicionarColaborador.test.tsx` (verde; vermelho no código antigo).
7. [ ] PR + CI + publicação.

**Não feito, de propósito:** limpar `resources.workers` da Alpa (9 nomes) — é a biblioteca de Trabalhadores do
Planejamento, não sobra de migração (eu tinha proposto limpar, com a premissa errada; corrigido antes de executar).
A biblioteca da Garden, esvaziada pela importação em 22/10, não foi restaurada (não há cópia do conteúdo).

## Em aberto — decisão do usuário (folhas)

O Rogério trabalha pela Garden desde 15/08/2025, mas as folhas dele de 11/2025 a 09/2026 saíram pela **Alpa**
(04, 05 e 06/2026 FECHADAS). Hoje ele está em DUAS folhas de 06/2026 (Alpa FECHADA e Garden PROCESSANDO) e em duas
de 09/2026 (Alpa PROCESSANDO e Garden PROCESSANDO). Fechar as da Garden pagaria junho e setembro de novo.
Nada foi mexido nas folhas.
