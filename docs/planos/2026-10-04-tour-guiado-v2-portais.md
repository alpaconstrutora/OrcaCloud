# Tour guiado v2 dos portais externos

**Data:** 2026-10-04 · **Status:** F4 a F7 publicadas; F8 pendente
**Antecede:** `docs/planos/2026-10-03-ajuda-portais-externos.md` (central de ajuda F1–F3)

## Pedido original (literal)

> Tour guiado (F3) funcionou mais ficou bem básico. faça plano para contemplar o restante

Escolhas do usuário (perguntas respondidas na sessão):
1. passos **dentro de cada aba**, apontando os elementos reais nos três portais;
2. **mini-tour "como usar esta tela"** ao abrir uma aba pela 1ª vez, revisível pelo "?";
3. **construtora cria/ordena passos próprios** no editor (âncora de uma lista,
   reordenar, pré-visualizar como o externo vê);
4. **"já viu" por pessoa no banco** (não repete em outro aparelho) +
   **acompanhamento** no app de quem concluiu/pulou;
5. **checklist simples "Primeiros passos"** no portal (marcado automaticamente,
   some ao completar).

## Contexto

O tour da F3 só realçava o cromo (sidebar, botões de aba, "?", conta), filtrava
os passos na largada (passo de outra aba nunca aparecia), usava `document` global
(não funcionava na prévia mobile, que desenha o portal num `<iframe>`), e o
clique fora encerrava o tour por engano. Na prévia do Parceiro (`userEmail=""`)
não havia tour nenhum.

## Fases (uma frente por fase, REGRA #8)

| Fase | Entrega | Banco |
|---|---|---|
| **F4** | Motor v2 + modelo geral/por aba + mini-tour por aba + Parceiro com âncoras de conteúdo | não |
| **F5** | Fornecedor e Corretor com âncoras de conteúdo; teste de âncoras por lista de arquivos | não |
| **F6** | Editor: "Novo passo" com âncora do catálogo, Tour (Geral/aba), setas de ordem, "Pré-visualizar tour" | colunas `anchor`, `tour_id` + `portal_help_org_json` |
| **F7** | "Já viu" por pessoa (`portal_tour_progress` + RPCs) + aba Acompanhamento | tabela + RPCs (REGRA #7) |
| **F8** | Checklist "Primeiros passos" (eventos, cartão no Dashboard/Overview/Analytics) | CHECK `kind` += `checklist` |

Detalhe de cada fase no plano aprovado da sessão (resumo aqui ao fechar cada uma).

## F4 — o que entrou

- **Modelo** (`utils/portalHelpDefaults.ts`): `TourStep` ganha `tour` (`'geral'` ou
  id da aba) e `quando?` (pré-requisito em texto). `TOURS[portal] = { geral,
  porAba }`; `TOUR_STEPS` continua existindo como o tour geral (compat).
  `mergePortalHelp` devolve `tours` (geral sempre; aba só com passo visível);
  `todosOsPassos`, `tourLabel`. Chaves antigas mantidas (sobrescritas já gravadas
  valem); novas `<portal>.tour.<geral|aba>.<slug>`.
- **Motor** (`components/portal/PortalTour.tsx`): resolve o passo quando chega
  nele; passo de outra aba chama `onNavigate(section)` uma vez e espera a aba
  montar; sem elemento: com `quando` aparece centralizado com "Disponível
  quando…", sem `quando` é pulado em silêncio (ex.: `conta` no celular);
  procura no `ownerDocument` (funciona no iframe da prévia); clique fora não
  encerra; pontos de progresso; ao terminar volta para a aba de origem;
  `onFinish(motivo, passoAlcancado)` (F7 grava o passo).
- **PortalHelp**: `initialSection` → `currentSection` (vivo), `onNavigate`,
  `forcarTour`, `modoPrevia`. Estado `tourAtivo` (qual tour). Mini-tour na
  primeira troca para uma aba com passos, depois do tour do portal visto; nunca
  emendado no fim de outro tour. "Rever o tour desta tela (<aba>)" e "Rever o
  tour do portal" no painel; na prévia aparecem mesmo sem identidade e nada é
  gravado. Marca do mini-tour: `portalHelp:tour:<portal>:<id>:<aba>`.
- **Portais**: os três passam `currentSection`, `onNavigate` (fecha
  detalhe/simulador antes de trocar) e `modoPrevia`. Parceiro ganhou âncoras de
  conteúdo (dashboard, conversas, documentos, contratos, financeiro,
  solicitações). Corretor: abas do modo app ancoradas (`menu`, `aba-*`) para a
  prévia do gestor. `PortalKit`: `PortalCard` e `KpiStrip` repassam atributos.
- **Editor**: aba Tour lista também os mini-tours ("2º · Como usar: Documentos").
- **Testes**: `PortalTour.test.tsx` (reescrito), `PortalHelpTour.test.tsx`
  (mini-tour, rever, prévia), `portalTourAnchors.test.ts` (lista de arquivos por
  portal, todos os tours, sem âncora/chave repetida), `portalHelpDefaults.test.ts`.

## F5 — o que entrou

- **Fornecedor**: tour do portal com 9 passos (Cotações → lista, Pedidos →
  lista, Nota Fiscal, "Mais seções" só no celular, Ajuda, Conta) e mini-tours
  de Estatísticas, Lances, Cotações, Pedidos, Nota Fiscal e Financeiro, com
  âncoras nos `components/supplier/portal/*` (PortalKit já repassa atributos;
  teste `PortalKitAtributos.test.tsx`).
- **Corretor**: tour do portal (Estoque → mapa, Propostas → lista, Leads,
  Ajuda, Conta) e mini-tours de Analytics, Estoque, Empreendimentos,
  Propostas, Leads, Comissões, Materiais e Chat. `PropertyUnitMap` (compartilhado
  com o admin) não foi tocado: a âncora é um `<div>` em volta, no BrokerPortal.
- **Regressão do F4 corrigida**: as rotas públicas do Fornecedor e do Corretor
  montam o portal com `portalToken` **e** `isPreview` (histórico: só esconde o
  cromo de admin). `modoPrevia={isPreview}` tratava o link real como prévia do
  gestor — sem tour automático e sem marca. Agora `modoPrevia = isPreview &&
  !portalToken`. Testes: `SupplierPortalAjuda.test.tsx` (montado como a rota
  pública) e `portalTourPreviaVsLink.test.ts` (contrato no fonte do Corretor).
- **Motor**: passos de cromo (sem aba) que não existem na tela atual — `ajuda`
  e `conta` no celular do Fornecedor — deixam de contar: o último passo
  visível já mostra "Concluir".
- **Volta para a aba de origem** saiu do motor e foi para o `PortalHelp`, que
  acompanha a aba atual até o tour navegar pela primeira vez. Motivo: o
  Corretor nasce numa aba e o próprio portal corrige para a primeira liberada;
  o tour voltava para a aba de antes da correção, o portal corrigia de novo e
  essa correção disparava o mini-tour como se fosse um clique.
- Teste de âncoras lê a lista de arquivos dos três portais.

## F6 — o que entrou

- **Banco** (`aplicar_20271004000030_portal_help_tour_passos.sql`, aplicada em
  04/10/2026 antes do deploy): colunas `anchor` e `tour_id` em
  `portal_help_items`; CHECK `portal_help_items_tour_proprio_ck` (passo de tour
  sem `default_key` exige `anchor`); `portal_help_org_json` devolve as duas
  colunas (REVOKE de PUBLIC/anon/authenticated repetido). Ensaio em ROLLBACK:
  passo próprio com âncora entra, sem âncora 23514, corretor 42501, núcleo
  anon 42501, casca anon devolve `anchor`/`tour_id`.
- **Modelo**: `mergePortalHelp` junta passos padrão, sobrescritas e passos
  próprios por tour; posição padrão `(i+1)*10`, sobrescrita com `sort_order > 0`
  reposiciona; mover não "personaliza" (origem só muda se texto/visibilidade
  mudar). `ancorasDoTour(portal)`: catálogo de elementos (âncoras dos passos
  padrão + botão de cada aba), único lugar de onde sai a âncora de um passo
  próprio.
- **Editor** (Configurações › Ajuda dos Portais › Tour guiado): seletor de tour
  (do portal ou "Como usar: <aba>", inclusive abas sem passo padrão), colunas
  Posição e Elemento, setas ↑/↓ (só com uma organização no topo — a ordem é da
  organização; em "Todas" o botão diz por quê), "Novo passo" com Tour e
  Elemento da tela (filtrado pela aba do tour), excluir passo próprio,
  restaurar padrão (texto e posição).
- **Pré-visualizar tour**: escolhe parceiro/fornecedor/corretor da organização
  e o tour; abre o portal em prévia já com o tour (`forcarTour` nos três
  portais). Parceiro em tela cheia (como a prévia que já existia no Portal do
  Parceiro); Fornecedor e Corretor no celular (`MobilePreviewFrame`). Nada é
  gravado (`modoPrevia`).
- Testes: `portalHelpDefaults.test.ts` (passo próprio, posição, catálogo),
  `PortalHelpSettings.test.tsx` (tour, setas, novo passo, pré-visualizar).

## F7 — o que entrou

Pedido literal: "implementar f7 e f8".

- **Banco** (`aplicar_20271004000080_portal_tour_progresso.sql`, aplicada e
  ensaiada em ROLLBACK com 15 sondas): tabela `portal_tour_progress` — estado
  por identidade × tour (upsert, `times` conta as vezes). Identidade do link =
  **id da empresa do link** (workspace/fornecedor/corretor), nunca o token: nada
  secreto na tabela e gerar link novo não faz o tour voltar. Logado = e-mail do
  JWT. Escrita só por `portal_tour_mark` (link válido, ou e-mail com acesso
  àquela organização; `tour_id` validado); leitura do externo pelo campo `seen`
  das cascas e do `portal_help_get_mine`; leitura do gestor por
  `portal_tour_stats` (só owner/admin, "quem" resolvido pelo nome). Núcleos
  `portal_link_identidade`, `portal_help_orgs_of`, `portal_tour_seen_json` sem
  grant.
- **Portal**: a ajuda é lida já na montagem (é ela que traz o `seen`); o tour
  do primeiro acesso decide depois dessa leitura — visto = marca do aparelho OU
  do banco. Ao terminar grava no aparelho e no banco (com o passo alcançado);
  prévia não grava; tour que nem apareceu (nenhum elemento na tela) não vai
  para o banco, para "pulou" no acompanhamento querer dizer que a pessoa pulou.
- **Editor**: 4º botão "Acompanhamento" — quem, acesso (link = empresa / e-mail),
  tour, situação (Concluiu/Pulou/Viu em texto colorido), passo, vezes, última
  vez; em "Todas" junta as organizações em que o usuário é gestor e diz quantas
  ficaram de fora.
