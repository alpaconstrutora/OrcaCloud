# Minha organização › Usuários › "Todos os usuários": "Gerenciar" abria uma lista sem a pessoa

## Pedido original
> avalie algum que ficou confuso:
> quando entro em minha organizacao > usuários: temos a tela de Todos os usuários com a lista de todos os usuários. No coluna açoes clico no botão gerenciar e inves de abrir a tela de gerenciamento do respectivo usuário aparece uma nova lista com aba membros. o que significa essa aba membros?
>
> Sessão: 21223933-8ef7-470f-8d04-de0e7ec13d09 · 12/11/2026 — resposta à proposta: "sim"

## Diagnóstico
O botão só gravava qual organização gerenciar (`setManagingOrgId`) e trocava para a aba Usuários, que então mostra a lista de membros DA ORGANIZAÇÃO (abas Membros / Cargos Customizados / Visibilidade de Módulos). A pessoa clicada não era passada; a tela não dizia de qual organização era a lista; não havia como voltar.

## Decisões tomadas
| Data | Pergunta | Resposta |
|---|---|---|
| 12/11/2026 | O que o botão deve fazer? | Abrir a edição da pessoa clicada. O rótulo vira "Editar" (já não é "gerenciar a organização"). |
| 12/11/2026 | De qual organização é a lista? | O título passa a dizer: "Usuários · <organização>". Só quando se chegou por "Todos os usuários" (nenhuma organização no topo) — com uma organização no topo o contexto já está visível (§18). |
| 12/11/2026 | Como voltar? | Seta ao lado do título (§23.1), só nesse mesmo caso; volta a "Todos os usuários". |
| 12/11/2026 | A edição reabre ao reentrar na aba? | Não: o pedido é consumido (`onAbriuMembro`) e, dentro do componente, só dispara uma vez por pessoa. |

## Plano
| Item | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1 | `components/OrganizationUsers.tsx` | props `orgName`, `onBack`, `abrirMembroId`, `onAbriuMembro`; abre a edição ao montar; título e seta | `__tests__/components/OrganizationUsersAbrirMembro.test.tsx` |
| 2 | `components/OrganizationList.tsx` | `managingMemberId`; botão "Editar" passa a pessoa; passa as props novas só em "Todas" | tela real |

## Estado
- [x] implementação
- [x] testes (4) + `tsc` exit 0 + `check-ui-standard.sh` + `orgContextGuard`
- [x] conferência na tela real (login de leitura, só leitura, `c:/tmp/pwtest/usuarios-editar.js`): abre a edição de bruna.pereira em Condomínio Bella Vista, título "Usuários · Condomínio Bella Vista", seta volta, sair/voltar à aba não reabre, 0 escritas, 0 erros de página
- [ ] PR + CI
- [ ] publicação
