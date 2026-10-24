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
7. [x] PR + CI + publicação — PR #121, `ci` 29m36s, Vercel e Preview Comments verdes; mesclado por squash em
   24/10/2026 (`33e29320`); `conferir-producao.sh` provou o domínio servindo 33e2932; CI do main verde; frente
   fechada e branch apagada.

**Não feito, de propósito:** limpar `resources.workers` da Alpa (9 nomes) — é a biblioteca de Trabalhadores do
Planejamento, não sobra de migração (eu tinha proposto limpar, com a premissa errada; corrigido antes de executar).
A biblioteca da Garden, esvaziada pela importação em 22/10, não foi restaurada (não há cópia do conteúdo).

## Folhas na organização correta (24/10/2026, mesma sessão)

Pedidos (literais, nesta ordem):

> Se o Rogerio faz parte da organizacao garden. Por que ele aparece no ALPA>

> Deve funcionar assim: a folha é gerada apenas em uma organização. Apenas na organizacao que ele é registrado. O que nao significa que ele nao possa ter os custos alocados (aba alocacoes ) em outra organizacao

> corrigir todas as folhas! Se for necesssario relanço manualmente novamente! Importante é corrigir as folhas nas organizacoes corretas

E depois: "Reabro e reprocesso assim mesmo? **sim**" (Garden 05/2026 fechada) · "**reprocesse agora**" (Alpa 06/2026) ·
fechar Alpa 06 e Garden 05 de novo: "1. **sim** 2. **sim**" · corrigir o Reprocessar e o aviso nativo: "**sim**".

**Por que ele aparecia na Alpa:** compartilhamentos do Rogério com Alpa Construtora e ALPA Empreendimentos (criados
em lote em 17/06/2026, sem autor) + até 11/10/2026 a folha incluía os compartilhados; as folhas da Alpa de 04 e
05/2026 são anteriores aos compartilhamentos, então nessa época ele estava REGISTRADO na Alpa (sem histórico em
`employees` para provar as trocas). Depois de 11/10 a geração já respeitava a regra, mas o **Reprocessar** só tirava
desligado/não admitido — quem era de outra org ficava.

**Auditoria:** só o Rogério tinha resultado em folha de org ≠ a dele: 11 folhas da Alpa (11/2025 a 09/2026), todas
com a folha correspondente na Garden; títulos dessas folhas da Alpa: nenhum pago.

1. [x] **Dados** — `docs/planos/2026-10-24-folhas-rogerio-alpa-para-garden.sql` (transação + portão): backup
   `_bkp_folha_rogerio_alpa_20261024_results` (11) / `_items` (53) / `_events` (20) — **NÃO apagar**; 19 eventos
   manuais levados para a folha da Garden do mesmo mês/tipo; o Auxílio Educação de 06/2026 da Alpa ficou só no
   backup (a Garden já tinha o dela); itens e resultados dele tirados da Alpa. Depois: 0 resultados fora da org.
2. [x] **Reprocessadas pelo Chrome do usuário** (Garden, em processamento): 11/2025 R$ 1.621,00 · 01 R$ 1.621,00 ·
   02 e 03 R$ 1.976,50 · 04 R$ 2.215,00 · 05 adiantamento R$ 648,40 · 06 R$ 2.176,50 · 07 R$ 1.621,00 · 08 R$ 1.757,27
   (dissídio proporcional) · 09 R$ 1.967,00 (proventos do Rogério). Efeito da regra de datas (confirmada em 22/10):
   o Clovis (admissão 17/04/2026) saiu da Garden de 11/2025 a 03/2026; 04 e adiantamento 05 dele sem mudança.
3. [x] **Garden 05/2026** (estava FECHADA): reaberta, reprocessada — Rogério R$ 2.195,75, Clovis sem mudança, Iago
   (admissão 01/11/2026) saiu — e fechada de novo: 7 títulos pendentes R$ 6.188,11 + 1 conciliado R$ 648,40
   (adiantamento de maio do Rogério, já pago pela Garden).
4. [x] **Alpa** — 04 e 05/2026 (FECHADAS): "Re-sincronizar financeiro" → 04: 14 → 8 títulos, R$ 8.417,52 →
   R$ 5.534,93; 05: R$ 7.742,79 → R$ 5.534,93 (1 cancelado preservado). 06/2026 (estava reaberta): reprocessada e
   fechada; 38 títulos R$ 8.860,56 = soma dos totais que a re-sincronização devolveu (os R$ 7.752,46 de antes eram
   de um cálculo de 22/10, anterior ao último recálculo).
5. [x] **`services/payrollEngine.ts`** — ao reprocessar, sai também quem tem resultado na folha mas é registrado em
   outra org (`listResultsByRun` × colaboradores da org); afastado da própria org continua.
   `__tests__/payrollEngine.desligado.test.ts`: caso novo (vermelho antes, verde depois) + os 13 existentes.
6. [x] **`components/LaborPayroll.tsx` + `components/ui/confirm.tsx`** — "Re-sincronizar financeiro" terminava com
   `alert()` nativo, que travou a aba do Chrome durante a correção: agora `confirm({ hideCancel: true })` (aviso na
   tela, só OK) e o erro vai para o toast. `__tests__/components/ConfirmAviso.test.tsx`.
7. [x] PR + CI + publicação — PR #125, `ci` 29m58s verde; squash `0c6a53e0` em 24/10/2026;
   `conferir-producao.sh "Financeiro re-sincronizado"` provou o domínio servindo 0c6a53e; CI do main verde.

**Em aberto (usuário):** as rubricas recorrentes do Rogério hoje são Adiantamento, Auxílio Educação e VA (vieram do
cadastro duplicado editado em 23/10); até 23/10 o cadastro dele tinha também a **Contribuição Assistencial** — se ela
vale, recolocar e reprocessar. Os compartilhamentos com as duas Alpas continuam (não afetam mais a folha).
