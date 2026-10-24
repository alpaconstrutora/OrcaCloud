# Conciliação › Pendentes — busca com várias palavras (fornecedor + código)

## Pedido original
> permita buscar por palavras por exemplo fornecedor e texto (Engergisa 153) fornecedor e codigo
>
> Sessão: a8e2ea08-5228-4f48-a778-da2044c30bf2 · 24/10/2026 (continuação de `2026-10-24-pendentes-busca-descricao.md`)

## Decisões tomadas
| Data | Pergunta | Resposta |
|---|---|---|
| 24/10/2026 | Como combinar as palavras? | **E**: cada palavra (separada por espaço) precisa aparecer em ALGUM dos textos da linha, em qualquer ordem e não necessariamente no mesmo campo — "energisa 153" = fornecedor (título/cliente-credor) + código (Nº de origem). Frase contínua continua achando (as palavras dela também aparecem). |
| 24/10/2026 | Onde vale? | As duas buscas da Pendentes. Lançamentos: textos crus + o que a coluna mostra (já da entrega anterior). Extrato: descrição normalizada e bruta, categoria e contraparte. A busca do Extrato é a mesma da aba Extrato (`bankSearch`), então vale lá também. |
| 24/10/2026 | Sem acento/“Engergisa” com erro de digitação? | Não: a comparação continua por trecho, sem tolerância a erro. Fora do pedido. |

## Plano
| Arquivo | O que muda | Como sei que terminou |
|---|---|---|
| `utils/buscaPendentes.ts` | `combinaComBusca` divide o termo em palavras e exige todas | `__tests__/buscaPendentes.test.ts` (10 casos) |
| `components/BankReconciliation.tsx` | busca do Extrato passa a usar `combinaComBusca` | tela real |

## Estado
- [x] util + testes 10/10; typecheck rc=0 (0 erros); `check-ui-standard.sh` 0 violações
- [x] tela real (login de leitura, só leitura, 0 escritas): Lançamentos "Energisa 1438" e "1438 Energisa" → 1 linha (fornecedor + Nº do boleto); palavra inexistente zera; 2ª palavra só estreita. Extrato "cambui" 100 → "cambui cartorio" 6 = "cartorio cambui" 6. Script `c:/tmp/pwtest/pend-busca-varias.js`
- [ ] PR + CI
