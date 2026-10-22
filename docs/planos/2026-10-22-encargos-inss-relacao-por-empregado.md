# RH › Encargos Sociais — abas "Encargos de INSS" e "Relação por Empregado"

## Pedido original

Sessão de 22/10/2026 (Claude Code, VS Code), manhã:

> recursos humanos > encargos sociais: verifique as abas encargos inss e relacao por empregado

Depois do relatório da verificação (itens 1–9 abaixo), às ~11h:

> corrigir tudo

## O que a verificação achou (22/10/2026, banco remoto, só leitura)

Folhas mensais FECHADAS: Alpa 04, 05, 06/2026 e Garden 05/2026. A aba INSS bate ao
centavo com os títulos de Tributos a Pagar (INSS, CPP, RAT, terceiros, FGTS) nas
quatro. A Relação por Empregado fecha (Salário + Out.Prov. − INSS − Out.Desc. =
líquido em todas as linhas).

| # | Aba | Defeito |
|---|---|---|
| 1 | INSS | "Todas as organizações": tela em branco (`if (!orgId) return` + `return null`) |
| 2 | INSS | Excedente, Ded.sal.mat.13, Deduções e a linha Contribuintes fixas em 0 no código |
| 3 | as duas | Colaborador com tudo zerado (Altair, Ricardo nas folhas da Alpa) aparece como linha |
| 4 | INSS | Só entra folha `mensal`; férias/rescisão/13º fechados ficariam fora, e o sync gera tributo para eles |
| 5 | Relação | `employees.registration_number` não existe (42703) → nomes saem como UUID, ordenação por UUID |
| 7 | Relação | "Todas": relatório vazio "0 empregado(s)" sem cabeçalho |
| 8 | Relação | Nome da obra no cabeçalho nunca aparece (`payroll_runs` não tem `worksite_id`) |
| 9 | Relação | `font-mono`/`font-black` em `<td>` — `check-ui-standard.sh` reprova |

## Itens

### 1. Lógica pura das duas relações — `utils/relacoesDaFolha.ts` (novo)
**Muda:** a classificação dos itens e os totais saem dos componentes para funções
puras, com a MESMA regra dos títulos (`utils/folhaFinanceiro.ts`): INSS = desconto de
código `INSS`, IRRF = desconto `IRRF`, FGTS = encargo `FGTS*`; base INSS × CPP / RAT×FAP /
terceiros. Rubrica por código com prioridade org da folha > global > outra (igual a
`carregarFolhaParaFinanceiro`). Colaborador sem nenhum valor fica fora da lista e é
contado à parte (item 3).
**Pronto quando:** `__tests__/relacoesDaFolha.test.ts` passa, incluindo o caso real da
Alpa 06/2026 (base 5.667,00 → CPP 1.133,40, RAT 170,01, terceiros 328,69).

### 2. Carga no service — `payrollService.carregarFolhasFechadasDoMes`
**Muda:** uma função lê, para UMA organização e competência: a org (nome, CNPJ), as
folhas FECHADAS do mês, resultados, itens (paginado), colaboradores (`name`,
`matricula`), rubricas e alíquotas (`getEncargosConfig`). Consultas em lote por
`payroll_run_id IN (...)`, não uma por folha. Erro de consulta vira exceção (antes o
erro do `registration_number` era engolido).
**Pronto quando:** typecheck limpo; as duas abas usam só essa função.

### 3. Aba Encargos de INSS — `components/LaborEncargosINSS.tsx`
**Muda:** KpiCard (§4) com Segurados, CPP, RAT×FAP, Terceiros e o total da guia;
tabela `StandardTable` (§6.10) com Matrícula, Nome, Base, Alíquota efetiva, INSS
descontado e linha de totais; sem as colunas sempre zeradas (item 2 da verificação);
entram todas as folhas fechadas do mês exceto adiantamento, e o cabeçalho diz quais
cálculos entraram (item 4). Em "Todas", um bloco por organização (cada uma tem a sua
guia) — nunca tela em branco (item 1).
**Pronto quando:** `check-ui-standard.sh` exit 0; Alpa 06/2026 mostra 495,69 /
1.133,40 / 170,01 / 328,69 / total 2.127,79; em "Todas" aparecem Alpa e Garden.

### 4. Aba Relação por Empregado — `components/LaborFolhaEmpregado.tsx`
**Muda:** nomes e matrícula reais (`matricula`, item 5); `StandardTable` com totais e
KpiCard (Proventos, Descontos, Líquido, FGTS) (item 9); sai o nome de obra que nunca
aparecia (item 8); "Todas" = um bloco por organização (item 7); zerados fora, com
contagem (item 3). Continua só folha mensal — é a relação do cálculo mensal.
**Pronto quando:** `check-ui-standard.sh` exit 0; Garden 05/2026 lista "Clovis Mariano
da Rosa" e "iago Marques" com líquido 1.680,99 e 2.751,40.

### 5. LaborEncargos repassa a lista de organizações
**Muda:** `LaborEncargos` passa `organizations` para as duas abas (usada só em "Todas").
**Pronto quando:** typecheck limpo.

### 6. Verificação
**Pronto quando:** `npx tsc --noEmit` sem erro, suíte de testes lida (não só o exit
code), `orgContextGuard.test.ts` verde, e as abas conferidas no navegador contra o banco.

## Fora do escopo (achado durante a verificação, registrado para decidir)

- As 2 folhas de **adiantamento** (em PROCESSANDO) têm item `INSS`. Se uma for fechada,
  o sync gera INSS/CPP/RAT/terceiros sobre a base dela, em dobro com a mensal. Não
  corrigido aqui: é o cálculo da folha, não estas abas.

## Andamento

- 22/10/2026 — plano escrito; itens 1–6 em execução na frente `encargos-inss-relacao`.
- 22/10/2026 — itens 1–5 feitos. `StandardTable` ganhou `totaisPorColuna` (linha de total
  alinhada às colunas; registrado no guia §6.10) e as duas abas ganharam um arquivo comum
  (`LaborEncargosRelacao.tsx`) e um hook (`useFolhasFechadasDoMes`).
  Item 6: `tsc` exit 0 (2ª tentativa; a 1ª caiu com SIGSEGV do Node, sem erro TS);
  `check-ui-standard.sh` exit 0 nos 4 arquivos de tela; `check-org-selector-guard.sh` exit 0;
  `relacoesDaFolha.test.ts` (12) e `components/LaborEncargosRelacoes.test.tsx` (6) verdes;
  suíte: 10.404 passaram + 34 ignorados + 329 pendentes + 2 falhas = 10.769 (conta fecha) — as 2
  falhas são `PainelVersoes.test.tsx` (Planta), que passa 26/26 isolado: carga da suíte, com
  queda do V8 no log. **Falta:** conferir no navegador (precisa da senha do usuário de leitura).
