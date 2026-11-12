# Minha organização › Usuários › Membros — "Agrupar" com ordem Crescente/Decrescente

## Pedido original
> minha organizacao > usuários: implementar filtro agrupar com botão de classificacao do filtro
>
> Sessão: 21223933-8ef7-470f-8d04-de0e7ec13d09 · 12/11/2026

## Decisões tomadas
| Data | Pergunta | Resposta |
|---|---|---|
| 12/11/2026 | "Botão de classificação do filtro" = ? | O seletor Crescente/Decrescente da ordem dos GRUPOS (guia §6.12), que acompanha o "Agrupar" em toda tela (mesma leitura de Centro de custo, 24/10). Não é "Ordenar por" (§6.4): as linhas dentro do grupo seguem a coluna do cabeçalho. |
| 12/11/2026 | Peças | As compartilhadas do §6.12 (`useAgrupamento`, `AgruparControles`, `LinhaDeGrupo`, `agruparLinhas`) — nada de seletor/botão próprio. O design apresentado no chat (botão de seta, grupos fixos) foi trocado por elas ao descobrir o padrão: o guia que li no checkout de integração estava atrasado. Consequência visível: a ordem é um `<select>` e os grupos recolhem. |
| 12/11/2026 | Campos | Função · Cargo · Entrou em (mês). Chave = o MESMO texto da célula. Nome e e-mail ficam fora (um grupo por pessoa). Departamento e cargo funcional (impresso na assinatura) não têm coluna na tabela — fora. |
| 12/11/2026 | Ordem de "Função" | Hierarquia (Proprietário → Admin → Membro → Visitante), não alfabética; Decrescente inverte. `owner` não tem opção no select da coluna, então ganha o rótulo "Proprietário" só no grupo. |
| 12/11/2026 | Qual tabela? | As duas que a aba Usuários mostra: Membros (topo numa organização) e "Todos os usuários" (topo em "Todas"). Descoberto na tela real: em "Todas" o Agrupar não existia na tabela que o usuário veria. |
| 12/11/2026 | Total no cabeçalho do grupo | Não: é cadastro, sem dinheiro (`semTotal`). |

## Plano
| Item | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1 | `utils/membrosGrupos.ts` | função pura `agruparMembros` + `OPCOES_AGRUPAR_MEMBRO` | `__tests__/membrosGrupos.test.ts` verde |
| 2 | `components/OrganizationUsers.tsx` | `useAgrupamento` (`organizationUsersMembersGroupBy`) + `AgruparControles` na toolbar, depois da busca; `LinhaDeGrupo semTotal` no `<tbody>` | `__tests__/components/OrganizationUsersAgrupar.test.tsx` verde |
| 3 | `components/OrganizationList.tsx` | com o topo em "Todas" a aba Usuários mostra a tabela "Todos os usuários" (não a de Membros): mesmo `useAgrupamento` (`organizationListAllUsersGroupBy`), campos Organização e Função; coluna Função passa a mostrar o rótulo | `agruparUsuariosConsolidados` testada + tela real em "Todas" |
| 4 | `docs/ui_ux_guia_unificado.md` §6.12 | registrar as duas tabelas | texto |

## Estado
- [x] implementação (itens 1 a 3)
- [x] testes de função pura e de tela
- [x] typecheck (`tsc --noEmit` exit 0, 0 `error TS`) + `check-ui-standard.sh` 0 violações + `orgContextGuard` 14/14
- [x] conferência na tela real (login de leitura; `c:/tmp/pwtest/usuarios-agrupar.js` e `usuarios-agrupar-todas.js`): Membros (Função, Cargo, Entrou em) e Todos os usuários (Organização, Função) — Crescente/Decrescente, soma das contagens = nº de linhas, "Sem …" no fim, recolher/expandir todos, viewport 1100 px sem rolagem lateral, 0 escritas, 0 erros de página
- [ ] PR + CI
- [ ] publicação

## Verificação
1. `npx vitest run __tests__/membrosGrupos.test.ts __tests__/components/OrganizationUsersAgrupar.test.tsx __tests__/components/OrganizationUsersPermissaoClique.test.tsx`
2. `bash scripts/check-ui-standard.sh components/OrganizationUsers.tsx`
3. Tela real: Minha organização › Usuários agrupa por Função, Cargo e Entrou em; Decrescente inverte; "Sem …" no fim; recolher/expandir; 0 escritas.
