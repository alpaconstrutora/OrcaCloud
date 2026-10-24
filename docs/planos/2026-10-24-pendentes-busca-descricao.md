# Conciliação › Pendentes › Lançamentos — a busca acha o que a coluna Descrição mostra

## Pedido original
> na barra de pesquisa permitir buscar também ma coluna descrição
>
> Sessão: a8e2ea08-5228-4f48-a778-da2044c30bf2 · 24/10/2026 (logo após a entrega do "Agrupar" na Pendentes, PR #139)

## Diagnóstico (reproduzido na tela real antes de mexer)
- Pendentes › **Extrato**: a busca já cobria `description_normalized`/`description_raw`, categoria e contraparte; a tabela nem tem coluna Descrição. Nada a mudar.
- Pendentes › **Lançamentos**: a coluna Descrição mostra o título resolvido (`displayTitle` — nome do fornecedor no boleto), o "Nº" de origem e o rótulo do módulo ("Contrato Parcelado", "Gestão Comercial"), mas a busca comparava só `description`, `category` e `entity_name`. Buscar "Gestão Comercial" ou "Contrato Parcelado" (texto na tela) dava **0 linhas**.

## Decisões tomadas
| Data | Pergunta | Resposta |
|---|---|---|
| 24/10/2026 | Qual tabela? | Lançamentos (é a que tem a coluna Descrição); o Extrato já buscava a descrição. |
| 24/10/2026 | O que a busca passa a comparar? | O texto cru (`description`, categoria, cliente/credor) **e** o que a coluna mostra: `displayTitle`, `displayPartyName`, `txCode`, rótulo da origem. Regra em `utils/buscaPendentes.ts`. |
| 24/10/2026 | Muda a ordem ou os outros filtros? | Não: a busca vira um segundo `useMemo` sobre a lista já filtrada e ordenada (precisa de funções declaradas mais abaixo no componente). |

## Plano
| Arquivo | O que muda | Como sei que terminou |
|---|---|---|
| `utils/buscaPendentes.ts` (novo) | `combinaComBusca(termo, textos)` | `__tests__/buscaPendentes.test.ts` verde |
| `components/BankReconciliation.tsx` | `internalSemBusca` (filtros + ordem) e `sortedInternalTransactions` (busca sobre o que a coluna mostra) | typecheck; tela real |

## Estado
- [x] util + teste (6 casos)
- [x] `BankReconciliation.tsx`
- [x] typecheck rc=0 (0 erros), `check-ui-standard.sh` 0 violações
- [x] tela real (login de leitura, Sicredi 55883-5, só leitura): "Gestão Comercial" 0→100 linhas, "Contrato Parcelado" 0→89; "COFINS" e "Parcela 36/36" iguais ao antes; "zzzxxx" 0. Script `c:/tmp/pwtest/pend-busca-sonda2.js`
- [ ] PR + CI
