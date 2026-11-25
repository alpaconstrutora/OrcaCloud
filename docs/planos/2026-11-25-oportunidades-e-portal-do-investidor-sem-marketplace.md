# Oportunidades × Portal do Investidor: um lugar para cada coisa, sem marketplace — 25/11/2026

> REGRA #6. Uma frente por fase, a partir do `origin/main`. Merge é meu, push em `main` é o deploy (REGRA #8).
> **Status: aprovado em 25/11** ("Aprovado  e apagar a coluna também"). Em execução, fase a fase.

## Pedido (literal)

1ª mensagem:
> acho que existe uma profusao de coisas duplicadas entre Portal do Investidor, Marketplace público e oportunidades. Analise

Resposta à análise (25/11):
> 1. Oportunidades = o único lugar para gerir oportunidades: criar, editar, publicar e interesses até virar sócio. Sem as 11 abas do investidor. Resposata: De acordo
> 2. Portal do Investidor = gerir investidores e o que cada um vê (abas, link, comunicados, carteira). Oportunidade ali só para ver, sem editar. Resposata: De acordo
> 3"Ver" do gestor = a mesma tela do portal, mais uma faixa só do gestor (interesses e aviso de versão desatualizada). Um detalhe só para app e portal.
> Área do Investidor: sair do menu ou ir direto para Portais › Portal do Investidor.
> […]
> Minha sugestão é exlcluir marketplace e termos apenas Oportunidades  e Portal do Investidor

Leitura: itens 1 e 2 aprovados; itens 3 e 5 (Área do Investidor) citados sem objeção, entram; o item 4 (duas
entradas de interesse) cai, porque sem marketplace sobra uma só: o portal.

## Fatos conferidos (origin/main e banco, 25/11)

- `#/opportunities`, `#/investor-portal` (depois de escolher o investidor) e `#/investor-area` montam o MESMO
  `components/InvestorDashboard.tsx`; gestor (`isAdmin`) vê as 11 abas (`TABS`). `AppRouter.tsx` case
  `'investor-area' | 'holdings' | 'opportunities'`; `InvestorModule.tsx` → `InvestorList` → `InvestorDashboard`.
- A lista de oportunidades é da organização (`investorPortalService.listOpportunities(orgId, !isAdmin)`), não do
  investidor — e dentro de cada investidor o gestor cria/edita/publica (`OpportunitiesTab` com `isAdmin`).
- Três detalhes: `investor/OpportunityDetail.tsx` (app; lê pela sessão: `imovibService.versaoPublicada`),
  `investor/portal/PortalOportunidadeDetalhe.tsx` (portal; lê pelo token: `getVersaoPublicadaByToken`,
  `getObraDaOportunidadeByToken`, `PortalAcompanhamento` → `getAcompanhamentoByToken`) e
  `public/PublicOpportunityDetail.tsx` (marketplace).
- Três formulários de interesse: app (`investorPortalService.addInterest`, sem trava para o gestor), portal
  (`submitInterestByToken`, com investidor e valor) e marketplace (`submit_public_interest`, anônimo).
- Dois lugares de interesses: `InterestsPanel` (estágios + "Tornar sócio") e a aba Interesses do
  `OpportunityDetail` (funil só leitura).
- O investidor real nunca usa o detalhe do app: o login por e-mail abre a casca do link
  (`App.tsx`, `InvestorPortalTokenGate`). Só a conta interna reservada (`profileService.ts`, `reservedMapping`)
  entra no app como INVESTIDOR.
- Marketplace: rota `/m/<slug>` (`App.tsx`), `components/public/*`, `services/publicMarketplaceService.ts`,
  `utils/enderecoDoMarketplace.ts`, seção "Marketplace público" em `OrganizationPage.tsx`, chave
  "Também no marketplace público" + aviso em `OpportunityForm.tsx`, coluna `investor_opportunities.no_marketplace`,
  RPCs `get_public_marketplace` e `submit_public_interest`. No banco, `organizations.slug` só é lido por
  `get_public_marketplace`.
- Banco: 1 investidor, 1 link ativo, 1 oportunidade (publicada e no marketplace), 0 interesses, 3 organizações com
  `slug` (garden-cambuhy, alpa, alpa-empreendimentos). Nada para migrar.

## Fases

| # | O que muda | Pronto quando |
|---|---|---|
| **F1 — Sai o marketplace** | Saem a rota `/m/<slug>`, `components/public/PublicMarketplaceView.tsx` e `PublicOpportunityDetail.tsx`, `publicMarketplaceService.ts`, `utils/enderecoDoMarketplace.ts`, a seção "Marketplace público" da Organização, a chave e o aviso no formulário da oportunidade, o tratamento do erro de endereço repetido (`useProjectOperations.ts`), `no_marketplace` no tipo/lista de campos e os testes do marketplace. Migration: `DROP FUNCTION get_public_marketplace`, `DROP FUNCTION submit_public_interest`, `DROP COLUMN investor_opportunities.no_marketplace` (reversão guardada). (`notify-opportunity-interest` só cita o marketplace num comentário: não muda.) Sai também a exceção das 2 funções em `scripts/check-rls-postura.sh`. **`organizations.slug` também sai** (`DROP COLUMN`; decisão do usuário na aprovação: "apagar a coluna também"). Antes do DROP, os 3 valores ficam anotados aqui e na reversão. | `git grep -i marketplace` = 0 fora de docs/migrations e do Inteligência de Mercado; `/m/garden-cambuhy` cai na tela de entrada; prova SQL: as 2 funções e as 2 colunas não existem; tsc e suíte verdes |
| **F2 — Oportunidades sozinha** | `#/opportunities` deixa de montar o `InvestorDashboard`: nova tela fina que monta só a gestão (`OpportunitiesTab` + aba Interesses), com a org do topo (REGRA #5, como hoje). | Incorporação › Oportunidades mostra só Oportunidades/Interesses, sem a barra das 11 abas; criar/editar/publicar como hoje |
| **F3 — Portal do Investidor só lê oportunidade** | No `InvestorDashboard` do gestor (Portais › Portal do Investidor › investidor), a aba Oportunidades fica só para ver: sem Nova, Editar, Publicar, Excluir e sem a aba Interesses; um atalho "Gerir em Incorporação › Oportunidades". | Teste de componente: com investidor escolhido não há botão de criar/editar/publicar |
| **F4 — Um detalhe só** | O "Ver" do gestor passa a ser o `PortalOportunidadeDetalhe` (Apresentação · Acompanhamento · Viabilidade · Documentos). Ele ganha leitura pela sessão quando não há token (versão, obra, acompanhamento, documentos — o gestor já lê essas tabelas pela RLS) e, só para o gestor, uma faixa no topo: aviso de versão desatualizada (`imovibVersaoDesatualizada`, que hoje está no `OpportunityDetail`), nº de interesses com atalho para a aba Interesses, e a gestão dos Documentos (adicionar/tirar/atualizar, como hoje). Sai `OpportunityDetail.tsx` com o formulário de interesse do app e o funil duplicado. O simulador fica onde o investidor o vê: a aba Simulador do portal. | Teste: o mesmo componente com token (investidor) e sem token (gestor), a faixa só no gestor; nenhum "Manifestar interesse" no app; `check-ui-standard.sh` limpo |
| **F5 — Área do Investidor** | Sai do menu lateral (`Layout.tsx`, bloco Portais); a rota `#/investor-area` abre Portais › Portal do Investidor. | Menu sem "Área do Investidor"; link antigo cai no Portal do Investidor |

Ordem: F1 → F2 → F3 → F4 → F5 (F1 primeiro porque tira código que F4 nem precisaria tocar; F5 é pequena e pode ir
junto da F2).

## Andamento

- **F1** — código em PR; ordem de publicação: **primeiro o código** (que deixa de pedir `no_marketplace`), conferido
  em produção, **depois** a migration `aplicar_20271125200000_sem_marketplace.sql` — ao contrário, a lista de
  oportunidades em produção pediria uma coluna que não existe (42703). Reversão: `scripts/rollback-sem-marketplace.sql`
  (as 2 funções como estavam, as 2 colunas com os valores de antes: `garden-cambuhy`, `alpa`,
  `alpa-empreendimentos`; Garden 01 com `no_marketplace = true`).

## Fora, de propósito

- A conta interna reservada que entra no app como INVESTIDOR (menu Investimentos): continua vendo o painel do
  investidor; depois da F4 o "Ver" dela é o mesmo detalhe do portal, sem formulário de interesse.
- Nomes cruzados no portal ("Documentos" do painel × "Documentos" da oportunidade; "Relatórios" × "Documentos"
  no menu do grupo investidor): achado da análise, fica para depois se você quiser.

## Verificação (cada fase)

- tsc, suíte das áreas tocadas (`investor*`, `Portal*`, `Oportunidade*`, `DataRoomPanel*`,
  `investorPortalEstudo`), `check-ui-standard.sh` nos `.tsx` tocados.
- Migration só com o seu OK (`db query -f`, nunca `db push`), prefixo conferido contra o `origin/main` do momento.
- Tela em produção pelo Chrome: Oportunidades (gestor), Portal do Investidor › investidor › Oportunidades (só
  leitura), "Ver" com a faixa do gestor, e o link do investidor (mesma tela, sem a faixa).
