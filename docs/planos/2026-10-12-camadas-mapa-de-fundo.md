# Mapa de fundo como camadas do Terreno (ruas e relevo)

## Pedido original

Sessão `cb72b486-263a-49c9-83cc-fd291232608c`, continuação do plano
`2026-10-11-curvas-de-nivel-sem-ferramenta-externa.md` (a gaveta "Desenhar o lote no
mapa", com os fundos Ruas e Relevo, já estava no ar).

11/10/2026:

> como exibir / ocultar um outro mapa?
> "O mapa tem dois fundos: Ruas (OpenStreetMap) e Relevo (OpenTopoMap, com sombreamento e curvas)."

> nao encontrei "Desenhar o lote no mapa",

(print: estudo já com lote e curvas — o botão "Mapa" do ribbon estava desligado porque a
gaveta só cria lote novo.)

12/10/2026 (com print do painel Camadas):

> nao seria melhor no painel lateral (veja print). camada terreno trazer as duas camadas (relevo e ruas),? avalie

A avaliação concordou e propôs o desenho abaixo. Resposta:

> antes de seguit com o desenho, outra sessao trabalhou nos mesmos arquivos. verifique antes para nao haver regressoes

Verificado em 12/10/2026 (`main` = `cb65a985`): 16 commits de outra sessão (Planta F1–F16) no
`BlueprintEditor.tsx`/`BlueprintCanvas.tsx`, nenhum nos trechos do mapa/Copernicus; os
marcadores publicados presentes; 322 testes (34 arquivos: mapa, Copernicus, topografia,
geo, camadas) + 11 do editor verdes no `main`; `conferir-producao.sh` acha "Desenhar o
lote no mapa", "topografia-copernicus" e "Copernicus 30 m" no bundle servido. Nenhuma
frente com alteração não publicada na Planta nas últimas 24 h.

## Decisões

| Tema | Decisão |
|---|---|
| Onde | Painel lateral › Camadas › **Terreno** ganha a seta de expandir, com **Mapa: ruas** e **Mapa: relevo** |
| Modelo | Estado PRÓPRIO (`blueprint:mapaDeFundo:v1`, por navegador como as camadas), não um `Camada` novo: as camadas são de PEÇAS (`classificarPecas`) e o grupo "TERRENO" tem o mesmo id da camada "TERRENO" — pôr subcamada exigiria renomear e mexeria em estado gravado e em módulo que outras frentes usam |
| Linha Terreno | Continua mandando no lote e na topografia, como hoje (contagem, olho, meio-tom, isolar) |
| Linhas do mapa | Olho (visível/oculto) e meio-tom (opacidade 45%); contagem "—"; sem Isolar (fundo não é disciplina) |
| Padrão | Ocultos: o mapa baixa imagem da internet e não deve ligar sozinho |
| Mostrar/Ocultar todas | "Ocultar todas" também esconde o mapa (ocultar tudo e o mapa ficar seria defeito); "Mostrar todas" não liga o mapa |
| Isolar | Não mexe no mapa (fundo, como a grade) |
| Sem "Onde fica" | Linhas desligadas dizendo o porquê |
| Desenho | Ladrilhos ao vivo (sem guardar nada), antes da planta de fundo e da grade; cada ladrilho posto pela composição pixel → lat/lon (Web Mercator) → mm (`geoParaLocal`, com o giro do norte) → tela (`paraTela`); `crossOrigin="anonymous"` (os dois servidores mandam `Access-Control-Allow-Origin: *`, medido) para o canvas não ficar contaminado |
| Zoom do ladrilho | O nível cuja resolução mais se aproxima do metro/pixel da tela, limitado ao nativo do servidor (OSM 19, OpenTopoMap 17 — acima, amplia); no máximo 64 ladrilhos por fonte (afasta o nível se passar) |
| Ruas + relevo juntos | Ruas embaixo, relevo por cima |
| Onde NÃO aparece | Corte, 3D, prancha, PDF, DXF — o `BlueprintCanvas` só é usado pelo editor |
| Atribuição | No canto do desenho enquanto houver mapa à vista |
| Satélite | Continua fora (E-12) |

## Plano

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1 | `utils/blueprintMapaDeFundo.ts` (novo, puro) | Fontes, zoom pela escala, ladrilhos da área visível, cantos do ladrilho, URL, estados e as regras do Ocultar todas | `__tests__/blueprintMapaDeFundo.test.ts` |
| 2 | `components/blueprint/BlueprintCanvas.tsx` | Prop `mapaDeFundo`; cache de imagens; desenho dos ladrilhos; atribuição | Prova no navegador: o lote desenhado cai sobre o lugar certo do mapa |
| 3 | `components/blueprint/PainelCamadas.tsx` | Terreno expande com as duas linhas do mapa | `__tests__/components/PainelCamadas*.test.tsx` |
| 4 | `components/blueprint/BlueprintEditor.tsx` | Estado persistido, liga painel e canvas | Teste do editor + prova no navegador |

## Estado

- [x] 1 `utils/blueprintMapaDeFundo.ts` + `__tests__/blueprintMapaDeFundo.test.ts` (12; oráculo Mercator = exemplo da wiki do OSM: Chicago 41,85/−87,65 no zoom 10 → 262/380; afim do ladrilho < 1 cm). A gaveta do mapa passou a ler URL/atribuição/zoom nativo daqui (fonte única)
- [x] 2 `BlueprintCanvas.tsx`: prop `mapaDeFundo`, cache de imagens (`crossOrigin` anônimo, teto 400), ladrilhos antes de tudo, atribuição no canto de CIMA (embaixo a barra de dicas a cobria — só o print mostrou)
- [x] 3 `PainelCamadas.tsx` + `__tests__/components/PainelCamadasMapa.test.tsx` (6)
- [x] 4 `BlueprintEditor.tsx`: `blueprint:mapaDeFundo:v1`, painel e canvas ligados
- [x] Suíte 8.739 = 8.705 + 34 pendentes + 0 falhos (conta fecha); `tsc` exit 0 sem erro; `check-ui-standard.sh` limpo nos 4 `.tsx`; `check-xss-sinks.sh` limpo; `vite build` ✓
- [x] Publicado `d698f34c`; `conferir-producao.sh "Mapa: relevo" "blueprint:mapaDeFundo:v1"` → o domínio serve `d698f34` com os dois textos; check-run `ci` = success
- [ ] Conferência do usuário no estudo real (Camadas › Terreno › expandir › Mapa: ruas/relevo)

## Portão de posição (12/10/2026)

`docs/spikes/mapa-de-fundo/conferir.mjs` (harness com o `BlueprintCanvas` de verdade, lote de
288 × 248 m no terreno do pedido): pontos onde o ladrilho ORIGINAL tem contraste (borda de
rodovia, rio, represa); cor do canvas no pixel onde o ponto deve cair × cor do ladrilho
baixado à parte. Ler o pixel do canvas prova também que ele não ficou contaminado (CORS).

| Cenário | Posição certa | Deslocada ±6 px |
|---|---|---|
| Ruas (zoom 18) | 80% | 44–54% |
| Relevo (zoom 17, ampliado) | 71% | 38–55% |
| Ruas com giro de 30° | 83% | 48–61% |

Prova de que o portão morde: deslocar o mapa 8 px no canvas → 42% / 26% / 42% e o portão
FALHA nos três. A olho: a AMG-1950 corta o lado oeste do lote, a represa fica no canto
SO e o córrego no NE — o mesmo arranjo do print do Contour Map Creator que o usuário mandou.
Na primeira rodada o portão media 81% certo × 77–86% deslocado: área quase toda de uma cor
(pasto), errar a posição dava a mesma cor — daí a seleção por contraste.

---

# Pedido posterior — 12/10/2026: a grade lavava o mapa

O usuário mandou o print do estudo real com Mapa: ruas e Mapa: relevo ligados (*"veja como
ficou"*). A avaliação: posição certa (rodovia, represa e rio onde devem estar; o topo das
curvas de 895 m no morro do OpenTopoMap), mas a grade de 5 m, cinza claro OPACO, virava um
quadriculado branco por cima das cores. Proposta: *com algum mapa à vista, a grade fica mais
clara e fina, sem sumir*. Resposta:

> sim

## Decisão

`estiloDaGrade(sobreMapa, passoTelaPx)` em `utils/blueprintMapaDeFundo.ts` (fonte única das
cores da grade; as constantes `COR_GRADE`/`COR_GRADE_FORTE` do canvas saíram): sem mapa, a
grade de sempre; sobre o mapa, ardósia translúcida (`rgba(15, 23, 42, 0.07)` / `0.16`) — a
grade ESCURECE de leve em vez de clarear — e as linhas finas só com célula ≥ 12 px.

## Estado

- [x] `estiloDaGrade` + 2 testes em `__tests__/blueprintMapaDeFundo.test.ts`
- [x] Portão de posição com a grade nova: a concordância na posição certa SUBIU
      (ruas 80→86%, relevo 71→76%, giro 83→90%) — a grade deixou de pintar o mapa;
      deslocado ±6 px continua ≤ 64%. Prints: só as linhas fortes, escuras e finas.
- [x] Suíte 8.741 = 8.707 + 34 pendentes + 0 falhos; `tsc` exit 0; `check-ui-standard.sh` e `check-xss-sinks.sh` limpos; build ✓
- [x] Publicado `4fd1c80e`; `conferir-producao.sh "rgba(15, 23, 42, 0.07)"` → o domínio serve `4fd1c80` com a cor nova; check-run `ci` = success

---

# Pedido posterior — 12/10/2026: o zoom travava ao afastar

Com print do estudo real (lote de 346 × 344 m, mapa ligado):

> pergunta: zoom - fica bloqueado em um limite?

Resposta: sim — o piso do canvas da planta era 0,002 px/mm (2 px/m), ~460 m numa tela de
~900 px. Proposta: baixar para 0,2 px/m (~4,5 km). Resposta:

> sim

## Decisão

`ESCALA_MINIMA = 0.0002` e `ESCALA_MAXIMA = 2` no `BlueprintCanvas.tsx`, uma constante para os
três lugares que repetiam o número (roda, botões/`limitar`, Enquadrar). O `useCanvasVista`
(outros canvas) não muda. A escada da grade vai a 50 m — 10 px nesse piso, então a grade
continua aparecendo.

## Estado

- [x] Constantes nos três lugares
- [x] `docs/spikes/mapa-de-fundo/afastar.mjs` (canvas real, roda do mouse até parar): **465 m →
      4.500 m**; mapa desenhado lá longe (nível 15), zero erro. Com o piso antigo de volta, o
      mesmo script para em **450 m** e FALHA — o portão mede a trava. O print afastado mostra
      o lote ao lado de Cambuí (MG), Lagoa do Mato e a AMG-1950, grade de 50 m discreta.
- [x] Suíte 8.758 = 8.724 + 34 pendentes + 0 falhos; `tsc` exit 0; `check-ui-standard.sh` limpo; build ✓
- [ ] Publicação e CI
