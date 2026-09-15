# Planta Inteligente — Quadro de cargas em tabela padrão (TabsBar + StandardTable)

## Pedido original (15/09/2026)

> transformar Quadro de cargas e NBR 5410 em tabela e aplicar o padrão ui_ux_guia_unificado.md no toolbar de abas + botão de ajuste de colunas

## Antes

`PainelEletrica` empilhava, num só rolo: aviso de sugeridas, botão de potência,
o cartão amber dos pontos soltos, um cartão por quadro (mini-tabela `table-fixed`
com uma linha de declarações + pré-dimensionamento em `colSpan` abaixo de cada
circuito, alimentador F6, rodapé "Novo circuito"), hipóteses, e a Conferência
NBR 5410 colada pelo editor. Sem busca, sem colunas configuráveis, sem autofit.

## Depois

`PainelEletrica` = **TabsBar** (§19.1) + **StandardTable** (§5.2 + §6.1.2),
como RH e Extrato ([[project_standardtable_tabsbar_componentes_canonicos]]):

| Aba | Conteúdo | Badge |
|---|---|---|
| Circuitos | UMA tabela para todos os quadros: Quadro (só com 2+ quadros) · Circuito (input) · Tensão · Ligação · DR · Disjuntor · Seção · Pontos · Carga · Pré-dimensionamento NBR 5410 · Ações (lixeira `ActionIconButton`). Toolbar acoplada: busca persistida, filtro "Todos os quadros", engrenagem, autofit. Linha de totais; rodapé amber com pontos sem potência e pontos fora de circuito ("ver a lista") | nº de circuitos |
| Pontos fora de circuito | a lista agrupada de antes (critério, potência, "Ligar a…", "Criar novo…") | nº de soltos (+ triângulo amber) |
| Quadros | um cartão por quadro: nome, contagens, "ver no desenho", `PainelQuadroAlimentador` (F6) | nº de quadros |
| Conferência NBR 5410 | `PainelConferenciaNbr`, agora passado pelo editor como `conferenciaSlot` | faltas + avisos |
| Hipóteses | `HipotesesDoPreDimensionamento` | — |

- **"Novo circuito"** é a ação primária §17 no slot da barra de abas; abre o
  `FormularioNovoCircuito` (nome sugerido pelo próximo número, seletor de quadro
  quando há mais de um). Desabilitado sem quadro. O rodapé por quadro sumiu.
- **Sem quadro**: as abas continuam (conferência de ambientes e pontos soltos
  não dependem de quadro); Circuitos e Quadros mostram o aviso "Nenhum quadro de
  distribuição ainda" com a lista dos pontos esperando circuito.
- Larguras iniciais somam ~1180 px com um quadro (útil 1230). ⚠️ Célula tem
  `px-6` (48 px): campo numérico precisa de 100 px de coluna para "220" não
  sair cortado — medido no app; a primeira tentativa (84) cortava.
- A tela no editor perdeu o cartão branco em volta: cada componente já traz o seu.
- `PainelQuadroAlimentador`: campo de tensão `w-12` → `w-16` ("220" saía cortado).

## Arquivos

| Arquivo | O quê |
|---|---|
| `components/blueprint/PainelEletrica.tsx` | reescrito em cima de `TabsBar` + `StandardTable`; props novas `conferenciaSlot`, `conferenciaPendencias`; exporta `AbaDoQuadroDeCargas` |
| `components/blueprint/BlueprintEditor.tsx` | tela quadro-de-cargas sem cartão; `PainelConferenciaNbr` vai por `conferenciaSlot` |
| `components/blueprint/PainelQuadroAlimentador.tsx` | `w-16` na tensão |
| `__tests__/components/PainelEletrica*.test.tsx`, `PainelQuadroSelecionado.test.tsx`, `BlueprintEditor.test.tsx` | helper `abrirAba`; textos ("crie um circuito em “Novo circuito”"); badge da aba e rodapé da tabela como prova da pendência |

## Verificação

- `npx tsc --noEmit` ✅ · `check-ui-standard.sh` em PainelEletrica, BlueprintEditor, PainelQuadroAlimentador ✅
- `npx vitest run` — 323 arquivos / 4233 testes ✅ · `npm run build` ✅
- App real (vite 3147, Playwright, escritas a `/rest/v1/**` abortadas — 18, 0 erros JS), estudo com 2 quadros e 16 circuitos: abas `Circuitos 16 · Pontos fora de circuito · Quadros 2 · Conferência NBR 5410 2 · Hipóteses`; 11 colunas; busca acoplada, engrenagem e autofit presentes; busca "TUG" → 7 linhas; autofit alarga para o conteúdo; "Novo circuito" abre o formulário com "C15" sugerido; menor fonte 12 px. Capturas `out-tabela/tab-0*.png`.
