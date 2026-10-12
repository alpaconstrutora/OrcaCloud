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

---

# Pedido posterior — 12/10/2026: a Cota do terreno vem do próprio DEM

O usuário gerou as curvas com o Copernicus 30 m em produção (a prova logada que faltava) e
mandou as duas mensagens que apareceram:

> somente essa mensagem: No corte e no 3D, o zero do desenho está na cota média (873,91 m). Para ancorar de verdade, informe a Cota do terreno em "Onde fica".
>
> A grade (15,0 m) é mais densa que a fonte (30 m): o desenho fica mais suave, mas a precisão continua a da fonte.

As duas são avisos (a geração funcionou). Proposta: o app acabou de medir a altitude da
origem — preencher a Cota do terreno sozinho, sem nunca sobrescrever a digitada. Resposta:

> sim

## Decisão

- `cotaNaOrigem(grade)` (puro, `utils/blueprintTopografia.ts`): a altitude bilinear no (0, 0) da grade, ao centímetro.
- O hook recebe `onCotaDaOrigem`; depois de gravar a versão, com fonte REMOTA (altitude absoluta — pontos cotados do topógrafo podem ser relativos), "Onde fica" informado e `elevacaoM` vazia: lê a grade na origem; origem fora da grade → pergunta ao DEM só aquele ponto; falhou → fica vazia, como antes.
- O editor relê o modelo ATUAL antes de gravar (nunca por cima do que foi digitado nesse meio-tempo), grava com `SetGeorreferencia` (Ctrl+Z desfaz) e avisa com o valor e a fonte. O aviso do painel some sozinho (`cotaDeOrigemInformada`).

## Estado

- [x] `cotaNaOrigem` + hook + editor
- [x] `__tests__/components/useBlueprintTopografiaCotaDaOrigem.test.tsx` (4: preenche 875,00 na origem; não mexe na digitada; não preenche com pontos cotados; origem fora da grade pergunta só aquele ponto). Prova de que morde: tirar a condição da cota vazia → "não mexe na digitada" falha
- [x] Suíte 8.762 = 8.728 + 34 pendentes + 0 falhos; `tsc` exit 0; `check-ui-standard.sh` e `check-xss-sinks.sh` limpos; build ✓ (a 1ª rodada caiu com exit 139, a queda intermitente do Node; a repetição passou)
- [x] Publicado `6ae8c289`; `ci` = success; `conferir-producao.sh "Cota do terreno preenchida com"` → o domínio serve o `main` (já com uma frente posterior, `3a66646`) com o texto novo
- [ ] Conferência do usuário: gerar de novo (com a Cota do terreno vazia) e ver o aviso sumir e a cota aparecer em "Onde fica"

---

# Pedido posterior — 12/10/2026: o 3D cortava a imagem e não mostrava o relevo

Com print do 3D (um plano bege, cortado):

> a vizualizacao 3d tem bug
> 1. a imagem esta sendo cortada.
> 2. as curvas de nivel nao esta sendo mostradas no 3d

Depois de pedir o teste do botão Centralizar, com mais dois prints:

> a) clique em botão ↺ (Centralizar) e gere a imagem do print. e a medida de dou zoom out o desenho comeca a ser cortado.
> b) veja se o print é esse o caso

## Diagnóstico (reproduzido antes de corrigir)

Harness `docs/spikes/terreno-grande-3d/` (o `Blueprint3DViewer` de verdade, lote de 346 × 344 m,
relevo 860–900 m, cota zero 887,94 m):

- Com o Terreno do 3D LIGADO, o enquadramento e o relevo saem certos, com 887,94 e com a média —
  a cota preenchida pelo DEM não é a causa.
- No editor, os PADRÕES são Terreno do 3D **desligado** (`blueprint:vista3dTerreno` = false) e
  Envelope **ligado**. Com `?semTerreno=1&envelope=1` o harness dá EXATAMENTE o print do usuário:
  a caixa bege do envelope (lote × 2,8 m, sem gabarito) vista de dentro.
- Causa 1: `enquadramentoDoModelo` não via o envelope (vem de fora do modelo, como o relevo). Estudo
  só com lote → caixa = a cena VAZIA (20 m na origem) → câmera dentro do envelope de 346 m e
  `far` curto → corte reto ao afastar. É o defeito "família esquecida no enquadramento" de novo.
- Causa 2: o relevo não aparecia porque o Terreno do 3D estava desligado.
- "Curvas no 3D": o 3D nunca desenhou as LINHAS das curvas; só a superfície (malha) do relevo.

## Decisão

- `enquadramentoDoModelo(model, mostrarTerreno, relevo, envelope)`: o envelope entra na caixa.
- O hook recebe `onVersaoGerada`; o editor liga o Terreno do 3D ao gerar uma versão (quem acabou de
  gerar relevo quer vê-lo). Desligar continua sendo escolha do usuário.
- As LINHAS das curvas no 3D ficam como proposta, para o usuário decidir.

## Estado

- [x] Envelope no enquadramento + 3 testes em `__tests__/blueprint3dEnquadramento.test.ts`
- [x] `onVersaoGerada` + teste no `useBlueprintTopografiaCotaDaOrigem.test.tsx` (chamado uma vez após gravar; erro não chama)
- [x] Harness depois: o envelope inteiro no quadro; afastar com a roda não corta; com Terreno ligado, relevo + envelope
- [x] Suíte 8.766 = 8.732 + 34 pendentes + 0 falhos; `tsc` exit 0; `check-ui-standard.sh` (editor e viewer) e `check-xss-sinks.sh` limpos; build ✓
- [x] Publicado `b1c623ac`; `ci` = success; o domínio serviu `b1c623a` (o `main` já tinha 7 commits de outras frentes depois)
- [x] Decisão do usuário: desenhar as linhas das curvas sobre o relevo no 3D — *"SIM"* (ver o pedido seguinte)

---

# Pedido posterior — 12/10/2026: as linhas das curvas no 3D

> As linhas das curvas de nível no 3D: o 3D mostra o relevo como superfície, mas nunca desenhou as linhas das curvas por cima dele. Quer que eu implemente? SIM

## Decisão

- `curvasDeNivel3d` (`utils/blueprintTopografia3dExtras.ts`, puro): as curvas da versão em
  `LineSegments`, UM por cor/tipo (não um por curva), na convenção do 3D; mestra opaca, as
  demais a 60 %. Cor = a da planta (`#b45309`) ou o arco-íris quando "Curvas coloridas pela
  cota" está ligado. Mesma chave da planta: Exibir › Curvas de nível; e, como todo extra do
  relevo, só com o Terreno do 3D ligado e a camada Terreno à vista.
- `amostradorDaMalha` (`utils/blueprintTopografia.ts`): a altura EXATA da malha do 3D (mesma
  decimação, mesma diagonal). Cada trecho é subdividido a ⅛ da célula e assenta nela (+ 8 cm):
  dentro de uma célula a malha são dois planos que podem passar acima da reta da curva (no
  teste da célula torcida: 20 no centro contra 17,5 da bilinear).
- No editor, as curvas entram num memo DEPOIS de `corDaCota` (o memo dos extras vem antes dela
  no arquivo — usá-la lá seria constante antes de existir).

## O que o harness mostrou (e o que NÃO concluir)

`docs/spikes/terreno-grande-3d/?curvas=1` (e `&arcoiris=1`): as curvas de 1 m acompanham o morro,
nas duas cores. Trechos tracejados no canto SE: medido — as curvas de 861–864 m JÁ saem da
geração em pedaços (863 m: 3 pedaços), porque o terreno ali é quase plano e as curvas entram e
saem do lote; é o dado, não o 3D (a planta mostra o mesmo). Assentar na malha NÃO mudou esse
print (18.707 × 18.719 pixels de curva): neste morro liso o desnível dentro da célula é pequeno;
o assentamento é para terreno real, mais irregular — mantido por ser a superfície exata, não por
ter corrigido algo aqui.

## Estado

- [x] `curvasDeNivel3d` + `amostradorDaMalha` + viewer (`lineSegments`) + editor
- [x] `__tests__/blueprintCurvasNo3d.test.ts` (9: pares de pontas na cota relativa; agrupamento
      por cor/mestra; arco-íris; curva degenerada; cone gerado de verdade com cada vértice na sua
      cota; altura da malha nos nós, nos dois triângulos e o centro torcido; nulos; assentar)
- [x] Suíte 8.794 = 8.760 + 34 pendentes + 0 falhos; `tsc` exit 0; `check-ui-standard.sh` (editor e viewer) e `check-xss-sinks.sh` limpos; build ✓
- [x] Publicado `146d783b` (1 recusa: o `main` tinha um commit de condomínio, sem relação; rebase); `ci` = success; o domínio serve `146d783`
- [ ] Conferência do usuário no estudo real: 3D com Terreno ligado e Exibir › Curvas de nível

---

# Pedido posterior — 12/10/2026: o relevo e as curvas não apareciam no 3D do estudo

Com print do 3D (menu Exibir aberto: "Terreno" desmarcado; sem item de curvas):

> veja print, o problema com o corte da imagem foi corrigida.
> porem o terreno 3 com as curvas nao foi gerado.
> repare tambem que em exibir nao aparece curvas de nivel

## Diagnóstico

- O Terreno do 3D estava DESLIGADO (o padrão antigo) — sem ele não há relevo nem curvas.
  "Gerar liga o Terreno" (publicado antes) só vale para quem gera DE NOVO.
- "Curvas de nível" só existia no Exibir da PLANTA: no 3D não havia como ligar.

## Decisão

- Terreno do 3D com três estados, chave nova `blueprint:vista3dTerreno:v2`: `null` =
  AUTOMÁTICO (ligado quando o estudo tem curvas geradas), `true`/`false` = escolha explícita do
  menu ou de um modelo de vista. Migração: `true` na chave antiga (escolha de quem ligou)
  continua ligado; `false`/ausente (quase sempre o padrão) vira automático. Estudos só de
  edificação (sem curvas) seguem sem o lote no 3D, como antes.
- O espelho `haCurvasGeradas` é declarado ANTES do memo da configuração de vista (que lê o
  Terreno na renderização) e atualizado por um efeito depois do hook da topografia — ler a
  topografia direto lá seria constante antes de existir.
- "Curvas de nível" no Exibir do 3D, logo abaixo de Terreno: a MESMA escolha da planta;
  desligada dizendo o porquê ("Não há curvas geradas…" / "Ligue o Terreno…").

## Estado

- [x] Editor (estado em três, migração, espelho, item do menu)
- [x] 3 testes no `BlueprintEditor.test.tsx` (sem curvas: automático desligado e o item das curvas
      desligado com o motivo; com curvas — `listar` espionado com uma versão —: Terreno e curvas
      ligados sozinhos, desligar grava `false` explícito e o motivo vira "Ligue o Terreno"; chave
      antiga `true` continua ligado). Prova de que morde: tirar o automático → o 2º falha
- [x] Suíte 8.803 = 8.769 + 34 pendentes + 0 falhos; `tsc` exit 0; `check-ui-standard.sh` e `check-xss-sinks.sh` limpos; build ✓
- [ ] Publicação e CI
