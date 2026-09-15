# Planta Inteligente — Quadro de cargas e Diagrama unifilar em TELA própria

## Pedido original (15/09/2026)

> quadro de cargas e unifilar em drawer ficou muito ruim visualizacao. vamos criar uma tela nova para cada um

## Diagnóstico

Os dois relatórios abriam num `Sheet size="2xl"` (672 px). O quadro de cargas é
uma tabela larga (circuito × tensão × ligação × DR × pré-dimensionamento × seção
× disjuntor × pontos × carga) e o unifilar é um desenho que só cresce para o
lado (um ramal por circuito num barramento único) — os dois brigavam com a
largura do drawer: a tabela dobrava linhas, o SVG rolava e os textos ficaram em
9 px para caber.

## Decisão

Cada um vira uma **tela em fluxo** dentro da área do editor — cabeçalho com
botão Voltar (`ArrowLeft`, `p-2.5 bg-white border border-gray-200
rounded-[6px]`), trilha `nome do estudo · Planta Inteligente · Instalações`,
`<h1 className="text-2xl font-black">`, subtítulo, e o conteúdo num cartão
branco `max-w-7xl`. Sidebar e casca do app continuam visíveis. **Nunca**
`fixed inset-0`, **nunca** Sheet, **nunca** `size="full"` (memória
`feedback_nunca_tela_cheia_para_paineis`).

O editor **fica montado e escondido** (`hidden` no raiz, que o preflight do
Tailwind v4 aplica com `!important`) — zoom, seleção, histórico e ferramenta
ativa sobrevivem ao ir e voltar. "Ver"/"selecionar" a partir da tela fecha a
tela e seleciona no desenho, porque é lá que se vê o ponto.

"Projeto executivo (ART)" continua em drawer — formulário curto, cabe.

## Arquivos

| Arquivo | O quê |
|---|---|
| `components/blueprint/BlueprintEditor.tsx` | `telaAberta: 'quadro-de-cargas' \| 'unifilar' \| null` + `alternarTela`; os dois botões do ribbon (Instalações › Elétrica) acendem/abrem a tela; `RELATORIOS_EM_DRAWER` perde os dois ids; o JSX de `PainelEletrica` + `PainelConferenciaNbr` e o de `PainelUnifilar` saem do `Sheet` e vão para as telas (`data-tela="…"`); raiz do editor recebe `hidden={telaAberta != null}` |
| `components/blueprint/PainelUnifilar.tsx` | `PX_POR_MM` 3,4 → 4,4 (a escala baixa era o preço do drawer) |
| `__tests__/components/BlueprintEditor.test.tsx` | os 3 testes de quadro/unifilar passam a exigir `heading` nível 1, ausência de `dialog` e de `region relatório`, toolbar fora da árvore acessível enquanto a tela está aberta, e Voltar devolvendo o editor com o botão do ribbon apagado |

## Verificação

- `npx tsc --noEmit` ✅ · `bash scripts/check-ui-standard.sh components/blueprint/BlueprintEditor.tsx` ✅
- `npx vitest run` — 322 arquivos / 4220 testes ✅ · `npm run build` ✅
- App real (vite 3147, Playwright, POST/PATCH/PUT/DELETE a `/rest/v1/**` abortados — 18 bloqueadas, 0 erros JS): Quadro de cargas → `h1` "Quadro de cargas e NBR 5410", **fora de `[role=dialog]`**, nenhum ancestral `position: fixed`, sidebar visível, toolbar escondida, menor fonte 12 px, miolo 1280 px; Voltar → toolbar de volta e rodapé (zoom) igual ao de antes. Unifilar → idem, dois QDCs lado a lado sem rolagem. Capturas `tela-01-quadro.png`, `tela-02-unifilar.png`, `tela-03-editor-de-volta.png`.
