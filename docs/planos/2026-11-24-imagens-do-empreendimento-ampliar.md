# Imagens do empreendimento ampliam ao clicar

## Pedido original (24/11/2026, sessão e7b82365)
> dar zoom (expadir) as Imagens do empreendimento quando clicado nelas.
> tanto em oportunidades como no portais > portal do investidor (visão do investidor > opoetunidades

(Com print da apresentação do Garden 01: topo "TIR 19.0%", Ficha técnica, "Imagens do empreendimento" com as plantas.)

## Fatos conferidos
- As duas telas usam o MESMO componente: `components/investor/ApresentacaoDaOportunidade.tsx`
  (gestor: `OpportunityDetail` › Detalhes; investidor: `portal/PortalOportunidadeDetalhe` › Apresentação).
  As imagens eram `<figure>` sem clique.
- O app não tinha visualizador genérico; `espelho3d/DecoradoDaUnidade` tem o molde (setas, ← →, miniaturas) mas é
  amarrado ao selo de imagem ilustrativa do decorado.
- A "TIR 19.0%" do topo vem de `fmtPct` de `utils/format.ts`, já corrigido no PR #687 (no ar). A lista do gestor
  (`OpportunitiesTab`) ainda tinha 6 `toFixed(1)}%` próprios.

## Itens
| # | O que muda | Pronto quando |
|---|---|---|
| 1 | `components/ui/VisualizadorDeImagens.tsx`: diálogo grande (até 1200px, imagem inteira com object-contain), ← → e setas, Esc/✕ fecha, "2 de 5", miniaturas, "Tamanho real" abre o arquivo numa aba nova. | Teste de componente |
| 2 | `ApresentacaoDaOportunidade`: cada imagem vira botão "Ampliar …" (cursor de zoom, lupa no hover) que abre o visualizador nela. | `__tests__/components/ImagensDoEmpreendimentoAmpliar.test.tsx` |
| 3 | `OpportunitiesTab`: ROI/TIR pelo `fmtPct` pt-BR (19,0%). | `OportunidadesNumerosDaVersao.test.tsx` esperando vírgula |

## Estado
Itens 1–3 feitos no código (frente `imagens-empreendimento-zoom`): tsc 0 erros; `check-ui-standard` limpo nos 3 `.tsx`;
13 arquivos / 89 testes de oportunidade/investidor/Guard verdes.
