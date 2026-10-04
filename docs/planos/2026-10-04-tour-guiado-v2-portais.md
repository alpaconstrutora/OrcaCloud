# Tour guiado v2 dos portais externos

**Data:** 2026-10-04 · **Status:** F4 e F5 publicadas; F6–F8 pendentes
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
