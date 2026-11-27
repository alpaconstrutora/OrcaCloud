# Módulos disponíveis por organização

## Pedido original

Sessão de 27/11/2026, ~16h40:

> minha organização > Organizações:
> Criar painel para gerenciamento de módulos disponiveis em cada organização.
> justificativa: Quando usuário estiver acessando o opura pela organização de condomínio por exemplo, os módulos engenharia não deve estar disponivel para ela. Pois se trata de assunto que ele não deve ter acesso.
> hoje isso pode ser feito por usuário, selecionado o que ele pode ler e editar.
> gostaria de fazer o mesmo em nível de organização.
> continue

## Como funciona hoje (lido em origin/main 6a9c0bba3)

- O menu, a Central e a busca rápida usam `modulosPermitidos` (`utils/modulosPermitidos.ts`). O guard de
  rota do `AppRouter` usa `isModuleAllowed`, que chama `permitidoNaOrg`.
- Por usuário, quem decide é a permissão do membro (`canViewBudget`, `canViewLabor`…). Em seguida vem a
  matriz do cargo (`settings.module_visibility`). Admin vê tudo, e acesso total ou DESENVOLVEDOR também.
- Não existe hoje uma chave que a ORGANIZAÇÃO desligue para todos os membros.

## Decisões

1. **Onde:** a ficha da organização (Minha Organização › Organizações › abrir a org) ganha a aba
   **Módulos**, com um interruptor por módulo do menu.
2. **Onde fica gravado:** em `organizations.settings.modulos_da_organizacao`, no formato `{ chave: false }`.
   Chave ausente quer dizer ligado. Nenhuma organização muda até alguém desligar um módulo, e o banco não
   recebe migration.
3. **Quem é afetado:** todo mundo que entra na organização pelo seletor do topo, inclusive admin, owner,
   acesso total e DESENVOLVEDOR. O módulo não existe para aquela organização. Em "Todas as organizações" a
   regra continua a união (#468): o módulo aparece se estiver ligado e permitido em pelo menos uma org.
   Acesso total em "Todas" continua vendo tudo.
4. **Dependência:** Riscos, Qualidade (SiAC) e Pós-Obra ficam dentro da seção Engenharia do menu.
   Desligar Engenharia desliga os três.
5. **Camada:** é a mesma da permissão por usuário. Vale no menu (desktop e celular), na Central, na busca
   rápida e no guard de rota. Os dados de cada organização já são isolados pela RLS.
6. **Quem pode alterar:** owner ou admin da organização, que é o que a RLS de `organizations` permite
   gravar. Os demais veem a aba só para leitura, e o motivo aparece no interruptor e no botão.
7. **Gravação estreita:** a aba grava só `settings.modulos_da_organizacao`, sobre o `settings` lido do
   banco na hora. A aba Organização passa a salvar o `settings` atual com o regime editado, e não mais a
   cópia de quando a ficha abriu. Antes, ela apagaria os módulos gravados depois disso.

## Itens

| # | O que muda | Como sei que terminou |
|---|---|---|
| 1 | `utils/modulosPermitidos.ts`: catálogo `MODULOS_DA_ORGANIZACAO`, `moduloLigadoNaOrg` e o filtro aplicado em `modulosPermitidos` (todos os retornos) e em `permitidoNaOrg` | teste: org com `obras:false` desliga obras/riscos/qualidade_siac para membro, admin e acesso total; em "Todas" a união respeita a org |
| 2 | `components/Layout.tsx`: tirar o `\|\| isDev` dos itens de módulo (o `mod` já vem todo ligado para o dev) e o atalho de dev da busca | `grep "mod\.[a-z_]* *\|\| isDev"` vazio; teste de módulos verde |
| 3 | `components/AppRouter.tsx`: o guard recusa uma tela de módulo desligado na org (inclusive para o dev), e o Financeiro passa a ter guard pela org | teste do guard e `orgContextGuard` verdes |
| 4 | `services/organizationService.ts`: `salvarModulosDaOrganizacao` (lê o `settings` atual e grava só a chave) | teste de serviço com supabase simulado |
| 5 | `components/OrganizationModulos.tsx` + aba "Módulos" em `OrganizationDetail` (dirty, salvar sem fechar, sair pede confirmação) | teste de componente; `check-ui-standard.sh` limpo |
| 6 | `OrganizationPage`: salvar envia o `settings` atual com o regime editado | teste: salvar o regime mantém `modulos_da_organizacao` |
| 7 | Conferência na tela real: desligar Engenharia numa org de condomínio e ver o menu sem Engenharia | print ou relato do usuário |

## Andamento

- 27/11: plano escrito; itens 1–6 em implementação na frente `modulos-por-organizacao`.
- 27/11: itens 1–6 feitos — 6 de 7. Provas: `modulosDaOrganizacao` (16), `organizationServiceModulos` (2),
  `OrganizationModulos` (4) e `OrganizationPageSettingsAtual` (1; falha com a correção desfeita), mais 13
  arquivos de teste vizinhos (Layout, ficha, Usuários, Diretoria, plano B, `orgContextGuard`): 17 arquivos e 112
  testes verdes. `tsc` sem erro. `check-ui-standard.sh` limpo nos 5 `.tsx` tocados e `check-org-selector-guard.sh`
  verde. Também entraram no guard, só pela org, telas que hoje não têm guard: Engenharia (Diário,
  Relatórios, Ferragem…), Comercial (Contratos de Serviço, CRM) e Incorporação (Planta, Oportunidades, IFC).
  **Item 7 em aberto:** conferir na tela real, logado.
