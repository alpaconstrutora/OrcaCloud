# Treinamentos em Portais › Portal de Treinamentos, e "Nova atribuição" que não abria

## Pedido original

Sessão `61edd96c-0bd1-4786-b550-a4ff23a33593` · 16/10/2026, depois de explicar a diferença entre
"Meus Treinamentos" (área pessoal) e "Treinamentos" (gestão) no menu:

> 1. Mover treinamentos para Portais < Portal de Treinamento
> 2. Aba atribuicões, verificar se o botão nova atribuicao nao esta funcionando pois clico e nada acontece

## Diagnóstico do item 2 (lido no código antes de mexer)

`AcademyAssignmentsTab` abria o painel só com `{sheet && orgId && <AcademyAssignmentSheet …/>}`. Com o
topo em **"Todas as organizações"** (o contexto do print do usuário) `orgId` é `null`: o botão estava
ativo, o clique gravava o estado e o painel nunca aparecia — sem aviso. Editar uma atribuição tinha o
mesmo defeito.

## Decisões

| Data | Pergunta | Decisão |
|---|---|---|
| 16/10/2026 | Onde fica a gestão? | Dentro do dropdown **Portais**, como "Portal de Treinamentos" (rota `treinamentos` não muda; `labor-trainings` segue redirecionando). |
| 16/10/2026 | E quem gerencia treinamento sem administrar a organização? | O dropdown Portais só aparece para administrador/gestor de usuários. Quem tem a permissão de Treinamentos sem isso vê "Portal de Treinamentos" como item solto — senão perderia o acesso. |
| 16/10/2026 | "Nova atribuição" em "Todas" | Pergunta a organização (`useOrgWriteTarget('single')`, REGRA #5); editar usa a org do registro. O painel recebe só os treinamentos, colaboradores, cargos/funções, equipes e obras daquela organização. |

## Plano

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1 | `components/Layout.tsx` | item sai do Operacional; entra em Portais (e no menu compacto); item solto para quem não vê Portais; Portais abre sozinho com o portal ativo; busca rápida "Portal de Treinamentos" | navegador |
| 2 | `components/academy/AcademyAssignmentsTab.tsx` | `abrirPainel` com a org do registro ou a escolhida; opções recortadas pela org | navegador em "Todas": clique abre a escolha de organização e depois o painel |
| 3 | `components/AppRouter.tsx`, `components/training/TrainingsModule.tsx`, `components/LaborTrainings.tsx` | obras levam a organização (`orgId`) para o recorte | typecheck |

## Estado

- [x] 1 · 2 · 3 — tipos dos 6 arquivos tocados: 0 erros; `check-ui-standard` sem violação; testes do menu e da trava de org 27/27
- [x] Verificação no navegador (16/10/2026, `C:	mp\pwtest	reinamentos-em-portais\`, conta agente-leitura, nada salvo): em "Todas", "Nova atribuição" abre a escolha de organização e, escolhida a Alpa, o painel com os treinamentos dela; na Alpa, Portais abre sozinho com "Portal de Treinamentos" ativo; em "Todas" (sem administrar organização nesse contexto) o item aparece solto. O item saiu do Operacional. Sem erro de console nem 4xx/5xx.
- [ ] Publicação
