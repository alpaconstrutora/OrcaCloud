# Conta de pagamento atende outras organizações

## Pedido original

> uma conta deve estar cadastrado a uma organizacao de fato.
> porem existe a possibildade de haver por exemplo pagamento de fornecedores de outra organizacao, nesta caso deve haver a possibilidade de o usuário cadastrar aquela conta para atender também outras organizacoes e todas as organizacoes
>
> Sessão: d4ba48e6 · 2026-09-15

Contexto que originou: no Extrato da conta "Banco Itaú 12263-9" (org "Altair Pereira
da Rosa", que tem só 3 centros de custo) um movimento estava gravado com o centro de
custo "022 Coronel Lambert 316" da **Alpa** — aparecia como UUID cru no select. A porta
de entrada era o fallback de `loadCostCenters` ("se a org não tem, lista os de todas"),
que também existia para plano de contas. 13 movimentos da Itaú apontam para CC da Alpa;
175 movimentos da Alpa (2019–2024) apontam para o "Administrativo" da org Altair.

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 2026-09-15 | Org sem plano de contas: lista vazia ou plano das outras orgs? | Nem um nem outro por padrão: a conta tem UMA org dona e, **se configurada**, atende outras (algumas ou todas). |

Decisões minhas (a confirmar na tela):
- "Atender" vale para as **dimensões de classificação** do extrato: centro de custo, plano
  de contas, obra, fornecedor/credor, cliente, colaborador. Regras e memória de
  classificação continuam por org dona da conta.
- Modelo: `payment_accounts.serves_all_organizations` (bool) + tabela
  `payment_account_organizations (payment_account_id, organization_id)`.
- "Todas" = todas as organizações de que o usuário logado é membro (`useStore().organizations`),
  resolvido no cliente — não é `NULL` nem lista vazia (REGRA #5 §3).
- Nos seletores, quando a lista junta mais de uma org, agrupa por organização (cabeçalho não
  selecionável) — já feito para plano de contas; estende-se a centro de custo e aos selects
  nativos da tabela (`<optgroup>`).
- Os fallbacks cruzados de `loadCostCenters` e `loadPlanoContas` **saem**: a lista é a da org
  dona + as atendidas, e só.

## Plano

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1 | `supabase/migrations/aplicar_20270921000022_payment_accounts_atende_organizacoes.sql` | coluna `serves_all_organizations` + tabela `payment_account_organizations` com RLS (SELECT membro da org atendida OU da dona; INSERT/DELETE gestor da dona), REVOKE anon | aplicada com `db query -f`; `information_schema` mostra coluna e tabela; `pg_policies` mostra as 3 policies; teste `segurancaMigrations` verde |
| 2 | `types/financial.ts` | `PaymentAccount` ganha `serves_all_organizations?` e `served_organization_ids?` | `tsc` |
| 3 | `services/financialRegistryService.ts` | `listPaymentAccounts` traz a coluna e o embed das orgs atendidas; `createPaymentAccount`/`updatePaymentAccount` gravam a coluna e sincronizam a tabela (apaga + insere) | teste unitário do "diff" de orgs atendidas; PATCH real pela tela |
| 4 | `components/FinancialRegistryManager.tsx` + `components/OrganizationList.tsx` | no drawer da conta (quando `showBankDetails`): bloco "Atende também" — Só esta organização / Organizações específicas (lista com caixas) / Todas as organizações; `OrganizationList` passa as orgs e grava | abrir Editar conta → escolher "específicas" → marcar uma → salvar → reabrir e ver marcada; `check-ui-standard` limpo |
| 5 | `components/BankReconciliation.tsx` | `orgsDaConta` = dona + atendidas (ou todas do store); loaders de fornecedor/cliente/colaborador/obra/CC/plano rodam por org e somam; **sem** fallback cruzado; `masterCostCenters`/`masterProjects`/`masterPlanoContas` guardam `organization_id` | conta sem "atende": listas só da dona; conta com "todas": listas somadas, agrupadas por org |
| 6 | `components/reconciliation/LazySelect.tsx` + `tabelasDaConciliacao.tsx` | `LazyOption.group?` → `<optgroup>`; opções de obra/CC/plano recebem o nome da org quando há mais de uma | select da célula mostra grupos por org |
| 7 | `components/CostCenterSelect.tsx` | agrupa por organização quando há mais de uma (mesmo que `PlanoContasSelect`) | drawer do lote mostra cabeçalhos por org |
| 8 | `components/reconciliation/tabelasDaConciliacao.tsx` | célula de CC/plano/obra com id que não está em nenhuma lista mostra "— outra organização —" com o UUID no `title`, não o UUID cru | célula da Itaú com CC da Alpa, sem "atende" configurado, mostra o rótulo |

## Estado

- [x] 1 migration — aplicada em 2026-09-15 (`db query -f`), 3 policies em `pg_policies`, grants de `authenticated` = SELECT/INSERT/DELETE, `anon` 401 na sonda HTTP
- [x] 2 tipos
- [x] 3 service — `servedOrganizationIds` + `syncServedOrganizations`; testes em `__tests__/contaAtendeOrganizacoes.test.ts`; PATCH da coluna nova = 204 e embed funcionando (sonda PostgREST)
- [x] 4 drawer da conta — bloco "Atende também" (3 modos empilhados + caixas por org); conferido no navegador
- [x] 5 Extrato — `orgsDaConta`, loaders por org somados, fallbacks cruzados removidos; conferido com conta simulada "todas": consultas por org, 22+3 CCs
- [x] 6 LazySelect com `<optgroup>` — conferido: "Alpa (22)" / "Garden Cambuhy SPE (3)"
- [x] 7 CostCenterSelect agrupado — cabeçalhos por org no drawer do lote; teste puro
- [x] 8 rótulo "— outra organização —" com UUID no `title`

Não verificado na tela (conta de leitura é Membro, não gestor — RLS barra a gravação):
salvar o "Atende também" de verdade. O caminho de escrita foi provado por sonda
(coluna conhecida pelo PostgREST; INSERT na tabela nova cai em 42501 de RLS, não em
PGRST204). Primeira gravação real fica para o usuário — se falhar, o toast do drawer mostra o erro.

Fora deste plano (registrado): membro só da org **atendida** ainda não vê a conta nem o
extrato dela (RLS de `payment_accounts`/`bank_transactions` é pela org dona); os 13 + 175
movimentos já cruzados continuam como estão até o usuário decidir o destino.

## Verificação

1. Minha Organização › Contas de Pagamento › Editar "Banco Itaú" → Atende também: Todas → Salvar.
2. Financeiro › Extrato Bancário › conta Banco Itaú → célula Centro de Custo lista os 3 da org
   Altair + os 22 da Alpa + 3 da SPE, agrupados por org; o movimento com "Coronel Lambert 316"
   mostra o nome.
3. Voltar para "Só esta organização" → as listas voltam aos 3; o movimento cruzado mostra
   "— outra organização —".
