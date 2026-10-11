# Curvas de nível sem ferramenta externa — Copernicus 30 m + mapa em "Onde fica"

## Pedido original

Sessão `cb72b486-263a-49c9-83cc-fd291232608c`, 11/10/2026, manhã. A conversa começou
com dúvidas de uso (KML importado, mensagem "Pontos em latitude/longitude precisam da
georreferência do lote", "45 Placemark(s) sem Point ou sem altitude foram ignorados",
Contour Map Creator) e chegou a este pedido:

> é possivel gerar sem uso do google earth?
> pois no final das contas o que eu quero é gerar curvas de nivel. Se for possivel gerar tudo sem uso de ferramenta externa seria perfeito.
> analise qual seria a melhor solucao tecnicamente e sem custos com ferramentas externas

A análise propôs dois itens (Copernicus GLO-30 como fonte principal pela Edge Function,
removendo o DEM 90 m do Open-Meteo dos botões; e um mapa em "Onde fica" para desenhar
o lote/área de estudo). Resposta do usuário:

> sim

## O que o usuário mostrou (contexto)

- Um KML exportado do Contour Map Creator (`contours (1).kml`): 45 `LineString` com a
  cota no Z (863–896 m), cerca de 288 × 248 m, sem polígono — o importador lê só pontos
  e o 1º polígono, por isso "0 pontos lidos".
- O print do Contour Map Creator (curvas de 1 m sobre imagem de satélite).

## Medições que fundamentam as decisões (11/10/2026)

| Fonte | Medido | Conclusão |
|---|---|---|
| Copernicus GLO-30 (`copernicus-dem-30m.s3.amazonaws.com`) | `Range` → 206; **sem** `Access-Control-Allow-Origin` | Leitura por partes funciona; o navegador não lê direto → Edge Function |
| Estrutura do COG (S23 W047) | 3600×3600, blocos 1024×1024, float32, Deflate, preditor 3, PixelIsPoint, tiepoint (−47, −22), EPSG 4326; bloco ≈ 2,5 MB | O `utils/geo/tiff.ts` já decodifica exatamente isso |
| Nome do arquivo | `S23_00_W047_00` cobre lat −23…−22, lon −47…−46 (tiepoint = canto NW do 1º pixel) | nome = `floor(lat)`, `floor(lon)` |
| Terrarium (AWS, o do Contour Map Creator) | CORS `*`; cabeçalho `x-amz-meta-x-imagery-sources: srtm/S24W047.tif` | É SRTM — não acrescenta nada |
| OpenTopoData (SRTM, atual) | 200, sem CORS; plano público 1 req/s, 1000/dia | Fica como reserva |
| Open-Meteo GLO-90 (atual) | — | Licença da API: só uso não comercial (E-12) → sai dos botões |

## Decisões

| Tema | Decisão |
|---|---|
| Fonte principal | **Copernicus GLO-30** (DLR/Airbus, 2011–2015, EGM2008), licença livre inclusive comercial, com atribuição |
| Onde roda | Edge Function nova `topografia-copernicus` (a `topografia-elevacao` do SRTM fica intocada). Mesmo contrato: `POST { coordenadas }` → `{ elevation }` |
| Código da leitura | `utils/geo/cog.ts` (puro, testado no Vitest) empacotado por esbuild em `supabase/functions/topografia-copernicus/cog.bundle.mjs` — o padrão do `planta-api` (bundle COMMITADO, teste acusa bundle velho) |
| Decodificação | Reaproveita o `tiff.ts` (Deflate + preditor 3 já testados contra PIL): extrai `lerCabecalhoTiff` e `decodificarBloco`, sem mudar o comportamento do `lerTiff` |
| Interpolação | Bilinear entre os 4 centros de pixel (PixelIsPoint); vizinho fora do arquivo → lê do arquivo vizinho; arquivo inexistente (oceano) → `null` |
| Lotes por requisição | 2.000 coordenadas, sem respiro (não há limite de taxa); SRTM continua com 100 e 1,1 s — o respiro vira campo da fonte |
| Botões | Campo `oferecida` na fonte. Ficam: Pontos cotados · **Copernicus 30 m** · SRTM 30 m. DEM 90 m (Open-Meteo) e DEM do arquivo só aparecem quando já são a fonte ativa (versão antiga / arquivo) |
| DR-08 | Mantida (decisão do usuário em 12/09): lado menor < 3 células (90 m) é recusado |
| Mapa | Leaflet (já é dependência, padrão do `useMarketLeaflet`). Fundo **OpenStreetMap** (ruas) e **OpenTopoMap** (relevo sombreado + curvas, SRTM), ambos gratuitos com atribuição. **Sem imagem de satélite**: segue fora por licença (E-12, decisão de negócio — memória A3) |
| Busca | Coordenada colada ("-22,6153, -46,0426") vai direto; texto vira busca no Nominatim (OSM), um pedido por Enter (política de uso deles) |
| Desenho | Clique adiciona vértice; "Fechar" (≥ 3) ou modo Retângulo (2 cliques). Área, perímetro e lado menor ao vivo, com o aviso dos 90 m |
| Ao confirmar | Sem georreferência: a origem do desenho vira o CENTRO da caixa da área (rotação 0, o mapa é norte-para-cima); com georreferência, ela é mantida. O contorno vira divisas (mesmo caminho do "Lançar o lote do arquivo") numa operação só; a fonte passa a Copernicus se não houver pontos cotados; abre Dados do lote |
| Limite do kernel | ±1 km da origem (memória pós-A5): área com vértice além disso é recusada com a medida |
| Quando aparece | Só sem lote, ao lado de "Criar o lote digitando" (trocar contorno existente passa pela ferramenta Terreno — mesma regra do lançar do arquivo) |

## Plano

### Item 1 — Copernicus GLO-30 como fonte principal

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1.1 | `utils/geo/tiff.ts` | Extrai `lerCabecalhoTiff(bytes)` (IFD + tags, erro claro se a tag cai fora do trecho) e `decodificarBloco(...)`; `lerTiff` passa a usá-los | Testes de TIFF existentes verdes sem alteração |
| 1.2 | `utils/geo/cog.ts` (novo) | `nomeCopernicus(lat, lon)`, `AmostradorCopernicus` (cabeçalho e blocos por `Range`, cache por bloco, bilinear, vizinho entre arquivos, 404 → null) | `__tests__/geoCog.test.ts`: nome dos arquivos nos 4 quadrantes; COG sintético com valor analítico `f(lin, col)` dá a bilinear exata; borda entre arquivos; 404; trecho do PIL (`dem_f32_deflate_31983.tif`) lido por faixa = `lerTiff` |
| 1.3 | `scripts/build-topografia-copernicus.mjs` (novo) + `supabase/functions/topografia-copernicus/cog.bundle.mjs` | Bundle esbuild do `cog.ts` | Teste compara o bundle commitado com um gerado na hora |
| 1.4 | `supabase/functions/topografia-copernicus/index.ts` (novo) | JWT obrigatório (como a do SRTM), ≤ 2.000 coordenadas, validação, 502 em falha do provedor | Deploy; `curl` sem token = **401**; com token de usuário = cotas |
| 1.5 | `utils/blueprintElevacaoProvedores.ts` | Fonte `COPERNICUS_GLO30`; campos `oferecida` e `respiroEntreLotesMs`; Open-Meteo e DEM do arquivo `oferecida: false` | Testes de provedores/fase 8 atualizados; lote de 2.000 sem espera |
| 1.6 | `components/blueprint/PainelTopografia.tsx` | Botões filtrados por `oferecida` (ou fonte ativa) | Teste de painel: 3 botões; versão antiga com Open-Meteo ainda mostra o dela |
| 1.7 | `docs/spikes/topografia/medir-copernicus.mjs` (novo) | Prova com dado real: nossas cotas × Open-Meteo GLO-90 × SRTM nos pontos do terreno do usuário | Diferenças registradas aqui |

### Item 2 — Mapa em "Onde fica"

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 2.1 | `utils/blueprintMapaDoLote.ts` (novo, puro) | Lê coordenada colada; área/perímetro/lado menor geodésicos (plano tangente); `areaParaLote(vertices, geoAtual)` → georreferência + pontos em mm; recusa < 3 vértices, autointerseção e fora de ±1 km | `__tests__/blueprintMapaDoLote.test.ts` |
| 2.2 | `components/blueprint/PainelMapaDoLote.tsx` (novo) | Gaveta com mapa, busca, polígono/retângulo, medidas, confirmar | Teste de componente (Leaflet simulado) + prova no navegador |
| 2.3 | `components/blueprint/PainelTerreno.tsx` | Botão "Desenhar no mapa" ao lado de "Criar o lote digitando" | Teste/print |
| 2.4 | `components/blueprint/BlueprintEditor.tsx` | Gaveta `mapa-do-lote` no dock; `aplicarAreaDoMapa` = georreferência + divisas numa operação; fonte → Copernicus | Prova no navegador: desenhar → lote no lugar → Gerar curvas |

## Estado

Pedido interrompido às ~10h a pedido do usuário (*"aguarde outra sessao finalizar pois estao
trabalhando no mesmo arquivo"*); retomado com *"continuar"* depois de trazer `main`
(`a63e0331`) para a frente.

- [x] 1.1 `tiff.ts`: `lerCabecalhoTiff` + `decodificarBloco` + `linhasDoBloco`; os 139 testes de geo/TIFF passaram sem alteração
- [x] 1.2 `utils/geo/cog.ts` + `__tests__/geoCog.test.ts` (11). Prova de que o teste morde: tirar o ½ pixel → 5 falhas; desligar o vizinho norte-sul → 1 falha
- [x] 1.3 `scripts/build-topografia-copernicus.mjs` + `cog.bundle.mjs` + `__tests__/topografiaCopernicusBundle.test.ts`
- [x] 1.4 `topografia-copernicus` publicada (`npx supabase functions deploy`). De fora: sem header **401** (gateway); com a chave anon **401 "Token inválido"** (código); OPTIONS 200. Prova com usuário logado: pelo app, depois de publicar
- [x] 1.5 `COPERNICUS_GLO30`, `oferecida`, `respiroEntreLotesMs` + `__tests__/topografiaCopernicusFonte.test.ts` (5)
- [x] 1.6 Botões por `oferecida` + `__tests__/components/PainelTopografiaCopernicus.test.tsx` (3)
- [x] 1.7 `docs/spikes/topografia/medir-copernicus.mjs` com o `contours (1).kml` do usuário (ver Medições abaixo)
- [x] 2.1 `utils/blueprintMapaDoLote.ts` + `__tests__/blueprintMapaDoLote.test.ts` (20)
- [x] 2.2 `PainelMapaDoLote.tsx` + `__tests__/components/PainelMapaDoLote.test.tsx` (10) + harness com Leaflet real `docs/spikes/mapa-do-lote/` (portão abaixo)
- [x] 2.3 `PainelTerreno.tsx`: "Desenhar no mapa" ao lado de "Criar o lote digitando"
- [x] 2.4 `BlueprintEditor.tsx`: gaveta `mapa-do-lote`, botão "Mapa" no ribbon do Terreno (desligado com lote, dizendo o porquê), lançamento = `SetGeorreferencia` + `AddBoundary` num lote, fonte → Copernicus; teste novo no `BlueprintEditor.test.tsx`
- [x] Suíte inteira: 8.472 = 8.438 passados + 34 pendentes + 0 falhos (conta fecha, sem "Unhandled"); `tsc` exit 0 sem erro; `check-ui-standard.sh` limpo nos 4 `.tsx`; `check-xss-sinks.sh` limpo; `check-origem-do-deploy.sh` 0; `vite build` ✓ (Leaflet em pedaço próprio, 150 kB)
- [x] Publicado: `f85272dc` em `main`; `conferir-producao.sh "Desenhar o lote no mapa" "topografia-copernicus"` → o domínio serve `f85272d` com os dois textos; check-run `ci` = success
- [ ] Prova no app em produção com usuário logado: desenhar no mapa → Gerar curvas com Copernicus (a Edge Function só foi provada nas recusas 401; a resposta 200 com cotas depende de um JWT de usuário — o leitor em si foi provado com o dado real pelo bundle idêntico)

## Medições (11/10/2026)

**Leitura real do Copernicus** (`medir-copernicus.mjs`, 15 pontos das curvas do `contours (1).kml`):

| Comparação | Média | \|máx\| |
|---|---|---|
| GLO-30 (nosso) × SRTM (OpenTopoData) | −3,17 m | 7,07 m |
| GLO-30 (nosso) × GLO-90 (Open-Meteo) | −7,17 m | 17,55 m |

- O SRTM do OpenTopoData bate EXATAMENTE com as cotas das curvas do Contour Map Creator
  (863, 865, 867…) — o site usa SRTM.
- O Open-Meteo devolve degraus de 90 m sem interpolar (892 em 5 pontos seguidos) — daí os 17 m.
- 2 pedidos `Range`, 1,42 MB, 2,9 s (rede) para os 15 pontos.
- **Georreferência da leitura conferida por deslocamento** (294 pontos das curvas): sem
  deslocamento o desvio-padrão contra o SRTM é 1,91 m; qualquer deslocamento de 1 pixel
  (±30 m) leva a 3,59 m ou mais. A diferença média de −2,8 m é sistemática entre os
  satélites (época, radar, geoide EGM2008 × EGM96), não erro de posição.

**Harness do mapa** (`fotografar.mjs`, Leaflet e fundos reais): coordenada colada leva o mapa
ao zoom 18; 4 cliques a ±110/±90 px → 11.976 m², lado menor 98,7 m, `serveCopernicus`;
vértices entregues a 0,26–0,32 m da conversão Web Mercator dos pixels (resíduo das
constantes aproximadas do próprio script); Relevo carrega ladrilhos; zero erro de console.
Achado só no navegador: trocar para Relevo (OpenTopoMap vai só até o zoom 17) fazia o mapa
recuar sozinho — corrigido com `maxNativeZoom` (o Leaflet amplia o ladrilho do 17).

## Verificação de ponta a ponta

Estudo descartável → Dados do lote → "Desenhar no mapa" → colar `-22,6153, -46,0426` →
desenhar a área do terreno do usuário (~288 × 248 m) → Usar esta área → Curvas de nível
já em Copernicus 30 m → Equidistância 1 m → Gerar curvas → comparar faixa de cotas com o
`contours (1).kml` (863–896 m).
