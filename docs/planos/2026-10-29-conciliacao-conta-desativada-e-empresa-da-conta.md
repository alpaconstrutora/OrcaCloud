# Conciliação: conta desativada fora, e empresa da conta editável

## Pedido original

> Corrigir :
> 1. Asaas sandbox
> 2. Empresa da conta

Sessão `b2f16f10-ee9c-4bcb-8732-9dc7c18dfc92` · 29/10/2026. Os dois itens vêm da lista "Fora deste
plano" de `docs/planos/2026-10-28-conciliacao-dashboard-confianca.md`:

- "Conta 'Asaas Sandbox' aparece no dashboard de produção (e conta como 'não bate')."
- "'Sem empresa' sem link: nenhuma tela edita `payment_accounts.empresa_id`."

## O que foi medido (29/10)

| Conta | `is_active` | Empresa | Organização | Extrato | Lançamentos |
|---|---|---|---|---|---|
| Asaas Sandbox | **false** (desde 17/10; gateway `sandbox`, desligado) | — | Alpa Construtora | 6 | 0 |
| Asaas | true | **—** | Alpa Construtora | 6 | 3 |
| Banco Itaú | true | — | Altair Pereira da Rosa (**pessoa física**, sem empresa) | 7.757 | 41 |
| Sicredi | true | Alpa (matriz) | Alpa Construtora | 5.464 | 86 |
| Sicredi - Garden | true | Garden (matriz) | Garden Cambuhy SPE | 394 | 3 |

- Toda organização PJ tem exatamente 1 empresa (a matriz); a PF não tem nenhuma.
- `fn_reconciliation_dashboard`, `_consolidated`, `_divergences`, `_anomalies` e
  `fn_financial_close_checklist` não olham `payment_accounts.is_active` — por isso a conta
  desativada continua na Conciliação. O seletor de conta já a esconde (`listPaymentAccounts`).
- O formulário de Minha Organização › Contas de Pagamento não tem campo de empresa.

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 29/10/2026 | Conta desativada sai de onde? | **De toda a Conciliação** (Dashboard, Por empresa, Divergências, Anomalias, Fechamento). Nada é apagado; reativar traz de volta |
| 29/10/2026 | Empresa da conta | **Campo "Empresa" no cadastro + preencher a Asaas com a matriz da Alpa agora** |
| 29/10/2026 | Itaú (organização pessoa física) na tabela "Por empresa" | **Nome da pessoa** ("Altair Pereira da Rosa (pessoa física)"); "Sem empresa" só para conta de PJ não ligada |

## Plano

Migration `aplicar_20271029960000_conciliacao_conta_desativada_e_empresa.sql` (cada função
copiada da definição vigente, conferida com `pg_get_functiondef` em 29/10).

| # | O que muda | Como sei que terminou |
|---|---|---|
| 1.1 | `fn_reconciliation_dashboard` e `_consolidated`: só conta com `is_active IS NOT FALSE` | Consulta como desenvolvedor@ em "Todas": "Asaas Sandbox" fora das contas do dashboard e do "Por empresa" |
| 1.2 | `fn_reconciliation_divergences`, `_anomalies`, `fn_financial_close_checklist`: extrato de conta desativada fora (lançamentos internos não mudam) | Mesma consulta: contagens de divergências/anomalias medidas antes e depois |
| 1.3 | Trava `__tests__/conciliacaoContaDesativada.test.ts`: as 5 funções vigentes filtram conta desativada | Verde; sem a migration reprova os 6 casos (conferido) |
| 2.1 | "Por empresa": conta sem empresa agrupada pela organização — "<nome> (pessoa física)" quando a org não tem empresa; "Sem empresa" + `sem_empresa = true` quando tem | Consulta: "Altair Pereira da Rosa (pessoa física)"; "Sem empresa" some depois do 2.2 |
| 2.2 | Backfill: conta ativa sem empresa numa org com 1 empresa recebe essa empresa (só a "Asaas" → Alpa) | Consulta: Asaas = Alpa Construtora e Incorporadora |
| 2.3 | Campo "Empresa" em Minha Organização › Contas de Pagamento (`FinancialRegistryManager` `empresaOptions`): empresas da organização da conta; vem com a matriz quando há uma só (nunca troca uma escolhida); pessoa física → texto explicando; em "Todas", trocar a org troca a sugestão; grava `empresa_id` | `ContasPagamentoEmpresa.test.tsx` (5) |
| 2.4 | Dashboard › Por empresa: "Sem empresa" ganha "Ligar à empresa em Contas de Pagamento" (Minha Organização › Contas) | Teste no `ReconciliationDashboardSaldoBanco.test.tsx` |

"Antes" (29/10, "Todas", desenvolvedor@): contas do dashboard = Asaas, **Asaas Sandbox**, Banco Itaú,
Sicredi, Sicredi - Garden; Por empresa = **Sem empresa (3)** | Garden (1) | Alpa (1); divergências
`bank_without_internal` 5.170 · `value_mismatch` 947 · `internal_without_bank` 963; anomalias 27
duplicidades; empresa das contas: Asaas —, Asaas Sandbox —, Itaú —.

## Estado

Migration **aplicada pelo usuário** em 29/10 (o modo automático barrou a minha). "Depois", mesma
consulta: contas do dashboard = Asaas, Banco Itaú, Sicredi, Sicredi - Garden (**sem a Sandbox**);
Por empresa = **Altair Pereira da Rosa (pessoa física) (1)** | Garden (1) | **Alpa (2)**; empresa da
**Asaas = Alpa Construtora e Incorporadora**; as 5 funções com o filtro (`pg_get_functiondef`).
Divergências (5.170 / 947 / 963) e anomalias (27) não mudaram — e é o certo: os 6 movimentos da
Sandbox já eram `IGNORED` e de menos de R$ 100.

- [x] 1. Conta desativada fora da Conciliação — 1.1 a 1.3
- [x] 2. Empresa da conta — 2.1 a 2.4. PR #252 (`abbc629`). Conferido em produção (29/10): Asaas abre com "Empresa = Alpa Construtora e Incorporadora" (rótulo ligado); Itaú mostra "não tem empresa cadastrada (pessoa física)" sem select; Dashboard › Por empresa = Altair (pessoa física) · Garden · Alpa (2)

### Achado na conferência em produção (PR #252, 29/10)

O Dashboard ficou certo (4 contas; "1 de 4 contas"; "Altair Pereira da Rosa (pessoa física)"), mas a
"Asaas Sandbox" seguia como opção na gaveta "Importar extrato" — e, pela mesma consulta, no seletor
de conta das abas Extrato/Pendentes/Central: `loadAccounts` (`BankReconciliation.tsx`) não filtrava
`is_active`. Corrigido (PR seguinte): a consulta deixa de fora conta desativada, e a conta escolhida
que saiu da lista cai na primeira (antes a tela seguia carregando o extrato dela).

Publicado no PR #256 (`e0d2bc2`) e conferido em produção: nenhuma ocorrência de "Asaas Sandbox" no
Dashboard nem na aba Extrato; o seletor lista Asaas, Banco Itaú, Sicredi, Sicredi - Garden.

**Plano concluído: 2 de 2.**
