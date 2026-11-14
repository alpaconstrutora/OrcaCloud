# Minha organização › Contas de Pagamento — "Agrupar" com ordem Crescente/Decrescente

## Pedido original
> Minha organização > Contas de Pagamento:
> Implementar filtro grupo + classificador do grupo + botão expandir / recolher
>
> Sessão: 13/11/2026

## Decisões tomadas
| Data | Pergunta | Resposta |
|---|---|---|
| 13/11/2026 | O que é "filtro grupo + classificador + expandir/recolher"? | O "Agrupar" do guia §6.12: seletor de campo, seletor Crescente/Decrescente da ordem dos GRUPOS e botão recolher/expandir todos — mesma leitura já aplicada em Centro de custo (24/10) e Usuários (12/11). Peças compartilhadas, sem controle próprio. |
| 13/11/2026 | Campos | Organização (só em "Todas") · Banco · Situação (Ativa → Inativa). Só o que a tabela mostra e com UM valor por linha: Organização é a coluna, Banco está em "Detalhes", Situação é o interruptor da coluna Ações. Nome/código ficam fora (um grupo por conta). Empresa não tem coluna na tabela (só no drawer) — fora. |
| 13/11/2026 | Plano de Contas (mesmo componente)? | Fora: é árvore por código, com expandir/recolher próprio. A prop `agrupar` liga só em Contas de Pagamento. |
| 13/11/2026 | Total no cabeçalho do grupo | Não: cadastro, sem dinheiro (`semTotal`). |

## Plano
| Item | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1 | `utils/contasPagamentoGrupos.ts` | função pura `agruparContasPagamento` + `OPCOES_AGRUPAR_CONTA` | `__tests__/contasPagamentoGrupos.test.ts` verde |
| 2 | `components/FinancialRegistryManager.tsx` | prop `agrupar`; `useAgrupamento` + `AgruparControles` depois do Filtro avançado; `LinhaDeGrupo semTotal` no `<tbody>`; expandir/recolher da árvore some ao agrupar | `__tests__/components/ContasPagamentoAgrupar.test.tsx` verde |
| 3 | `components/OrganizationList.tsx` | `agrupar={activeTab === 'accounts'}` | idem |
| 4 | `docs/ui_ux_guia_unificado.md` §6.12 | registrar a tela | texto |

## Estado
- [x] implementação (itens 1 a 4)
- [x] testes de função pura e de tela (44 verdes junto com `agruparLinhas`, `ContasPagamentoEmpresa`, `orgContextGuard`)
- [x] typecheck (`tsc --noEmit`, 0 `error TS`) + `check-ui-standard.sh` 0 violações nos 2 arquivos
- [ ] conferência na tela real (precisa de login; não feita)
- [ ] PR + CI
- [ ] publicação
