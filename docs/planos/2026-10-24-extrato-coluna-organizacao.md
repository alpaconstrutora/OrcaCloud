# Conciliação Bancária › Extrato — coluna Organização

## Pedido original
> incluir coluna organizacao em Extrato Bancário
>
> Sessão: a8e2ea08-5228-4f48-a778-da2044c30bf2 · 24/10/2026

## Decisões tomadas
| Data | Pergunta | Resposta |
|---|---|---|
| 24/10/2026 | Qual tabela? | A aba **Extrato** (título "Extrato Bancário"). A Pendentes › Extrato é outra tabela e não foi pedida. |
| 24/10/2026 | O que a coluna mostra? | O nome da organização dona do lançamento (`bank_transactions.organization_id`, que é a da conta — regra do `effectiveOrgId`), pelo mapa do store (`orgNameById`). Sem nome conhecido: "—". |
| 24/10/2026 | Visível por padrão? | Sim (o pedido é incluir); a engrenagem oculta. Para quem já tem preferência salva a coluna entra no fim (regra do `useTableColumns` para colunas novas) e se arrasta. |
| 24/10/2026 | Só a coluna? | Segue a convenção das demais colunas da tela: **ordenável** pelo cabeçalho, no **Filtro avançado** (texto, com lista das organizações do usuário) e como opção do **Agrupar** (guia §6.12 — as opções espelham as colunas). |

## Plano
| Arquivo | O que muda | Como sei que terminou |
|---|---|---|
| `components/reconciliation/tabelasDaConciliacao.tsx` | coluna `organization` (config, cabeçalho, largura, célula, filtro avançado, `organizationName` no ctx e nos resolvedores) | typecheck; tela real |
| `components/BankReconciliation.tsx` | `orgNameById` sobe para junto do store; ordenação, filtro, ctx e Agrupar | tela real |
| `utils/pendentesGrupos.ts` | campo `organizacao` do Agrupar da aba Extrato | `__tests__/pendentesGrupos.test.ts` (13 casos) |

## Estado
- [x] typecheck rc=0 (0 erros); `check-ui-standard.sh` 0 violações; testes 13/13
- [x] tela real (login de leitura, Sicredi 55883-5, só leitura, 0 escritas, 0 erros): cabeçalho "Organização" entre Plano de Contas e Data; todas as linhas com "Alpa Construtora e Incorporadora"; clique no cabeçalho ordena; Agrupar oferece "Organização" e agrupa pelo nome. Script `c:/tmp/pwtest/extrato-org.js`
- [ ] PR + CI

Limite: a conta usada só tem lançamentos de UMA organização, então a ordem entre organizações diferentes está provada no teste unitário, não na tela.
