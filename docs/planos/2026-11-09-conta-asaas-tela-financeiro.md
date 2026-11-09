# Financeiro › Conta Asaas — saldo, a receber, extrato e transferência para o banco

## Pedido original
> financeiro: crie ambiente para acesso a extratos e saldo do assas
> Sessão: e695b16a · 09/11/2026 ~22h

## Decisões tomadas com o usuário
| Data | Pergunta | Resposta |
|---|---|---|
| 09/11/2026 | Onde fica o "ambiente"? (tela própria / aba no Extrato Bancário / acesso externo) | Tela própria no menu Financeiro |
| 09/11/2026 | O que mostrar além de saldo e extrato? | Saldo + extrato, saldo a receber, histórico anterior a 17/10, transferir saldo para o banco |
| 09/11/2026 | Plano com as 4 decisões de desenho abaixo | Aprovado |

Decisões de desenho aprovadas com o plano:
1. Histórico anterior a `extrato_desde` (17/10) = **consulta ao vivo**, não grava em `bank_transactions`
   (gravar jogaria movimentos de antes da integração na fila da Conciliação).
2. Saldo após cada movimento gravado em `bank_transactions.saldo_apos` (a Asaas manda `balance`; era descartado).
3. Leitura = membro da org dona da conta; sincronizar e transferir = só gestor (owner/admin).
4. Transferência só para conta PRÓPRIA por PIX (destino = outra conta de pagamento ativa da mesma org com
   chave PIX; titular = CNPJ da empresa). Não consome tetos de pagamento a terceiros; valor ≤ saldo;
   chave do destino protegida por gatilho + auditoria + quarentena de 24 h.

## Contexto (origin/main bb9b7f56)
- Edge `asaas-conta` já importa `/financialTransactions` em `bank_transactions` (cron de hora em hora) e
  grava `payment_account_gateway.saldo/saldo_em`; o saldo só aparecia no drawer de cadastro da conta.
- Doc Asaas conferida em 09/11: `/finance/balance` (só `balance`); `/finance/payment/statistics`
  (`status` PENDING/RECEIVED/CONFIRMED/OVERDUE → `quantity/value/netValue`); `/financialTransactions`
  (item com `balance`); `POST /transfers` (`pixAddressKey` ou `bankAccount`) passa pela validação de saque.

## Plano

### PR 1 — Tela de leitura
| Arquivo | O que muda | Como sei que terminou |
|---|---|---|
| `supabase/migrations/aplicar_20271109400000_conta_asaas_saldo_apos.sql` | coluna `bank_transactions.saldo_apos` | aplicada; `information_schema.columns` mostra a coluna |
| `utils/asaasExtrato.ts` | `linhaDoExtrato` leva `saldo_apos`; `rotuloDoTipoAsaas`; `resumoAReceber` | testes em `__tests__/asaasExtrato.test.ts` |
| `supabase/functions/asaas-conta/index.ts` | ações `resumo` e `extrato_consulta` (membro); sincronizar preenche `saldo_apos` das linhas já importadas | linhas da conta Asaas em produção com `saldo_apos` preenchido |
| `services/asaasContaService.ts` | `resumo`, `extratoConsulta`, `listarExtrato`, `contasAsaas` | usado pela tela |
| `components/financeiro/ContaAsaasModule.tsx` | tela nova (KPIs, barra de escopo, StandardTable, exportar) | `check-ui-standard.sh` + tela aberta no navegador |
| `components/Layout.tsx`, `components/AppRouter.tsx` | item "Conta Asaas" em Financeiro › Tesouraria, busca global, rota | item aparece e abre a tela |
| `services/exportService.ts` | `generateExtratoAsaasExcel/PDF` | arquivo baixado abre com saldo por linha |

### PR 2 — Transferir saldo para conta própria
| Arquivo | O que muda | Como sei que terminou |
|---|---|---|
| migration `aplicar_20271109400100_conta_asaas_saque_proprio.sql` | `payment_accounts.pix_chave/pix_tipo` protegidos (gatilho+auditoria+quarentena); `supplier_payments.destino_payment_account_id`, `favorecido_origem='conta_propria'` | aplicada; não-gestor não altera a chave |
| `utils/asaasGovernanca.ts` | `bloqueiosDoSaqueProprio` | testes |
| `supabase/functions/asaas-payment/index.ts` | `saque_quote` / `saque_pay` sem título | 1º saque real de R$ 1,00 DONE |
| cadastro de conta + `ContaAsaasModule` | chave PIX da conta; Sheet "Transferir para o banco" | saque feito pela tela |

## Estado
- [ ] PR 1
- [ ] PR 2

## Verificação
- Vitest dos arquivos `asaas*`; `tsc` dos alterados; `check-ui-standard.sh`; `check-org-selector-guard.sh`;
  `orgContextGuard.test.ts`; `migrationsPrefixo.test` antes do merge.
- Produção: `saldo_apos` sem nulos na conta Asaas; saldo da última linha = `payment_account_gateway.saldo`
  quando não houve movimento depois.
- Navegador: Financeiro › Tesouraria › Conta Asaas com saldo, a receber, extrato com saldo por linha e
  título vinculado; período de junho mostra "Só consulta".
- Saque: R$ 1,00 para o Itaú da Alpa junto com o usuário → `asaas_saque_decisoes` APPROVED, DONE pelo
  webhook, transferência pareada na Conciliação.
