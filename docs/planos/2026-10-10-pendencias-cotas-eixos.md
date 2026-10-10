# As 8 pendências de cotas e eixos da Planta

> Plano aprovado em 10/10/2026. Frente `pendencias-cotas-eixos` (REGRA #8).


## Contexto

Pedido: *"faça um plano para implementação das 8 pendências registradas"* — as do § Status do plano de 07/10 (cotas com
linha de chamada, eixos A, B… / 1, 2…, aba Estrutural, tudo já publicado). Decisões do usuário (10/10):
- sub-regiões repartem as cotas do lote só com um **item próprio em Exibir** (desligado por padrão);
- depois de criar, **nada fica selecionado** — eixos E os lançamentos automáticos (pilares, vigas, lajes, fundações);
- a bolha do eixo fica **sempre fora do desenho inteiro** (lote, paredes, blocos e cotas), em tela, PDF e DXF.

Uma frente, três blocos (um commit cada), ritual e prova no app no fim, uma publicação.

## Bloco A — DXF e texto (pendências 3, 4 e 5)

**3 · Eixo traço-ponto no DXF.** Hoje não há tabela LTYPE (e `CONTINUOUS`, usado por toda LAYER, nem é definido) —
`utils/blueprintDxf.ts` `gerarDxf` (TABLES/LAYER ~868) e `gerarDxfDaTopografia` (~601).
- Função `tabelaDeTiposDeLinha(passoMm)`: `TABLE LTYPE` com `CONTINUOUS` e `EIXO` (R12: `72 65`, `73 4`, `40` total,
  `49` traço / −vazio / 0 ponto / −vazio), comprimentos proporcionais à mesma `escala` das cotas (maior comprimento/10).
  Escrita ANTES da tabela LAYER nos dois geradores; `$LTSCALE 1` no HEADER.
- A camada `PLANTA-MALHA-EIXOS` passa a `par(6, 'EIXO')`; as demais continuam `CONTINUOUS` (agora definido).

**4 · Número do trecho curto por fora também no DXF.** A regra hoje mora duplicada no canvas e no PDF.
- Extrair para `utils/blueprintCotas.ts`: `ondeFicaORotulo(indice, total, comprimento, larguraDoTexto)` →
  `'MEIO' | 'ANTES' | 'DEPOIS' | 'OUTRO_LADO'` (a regra única: 1º trecho antes do início, último depois do fim, meio do
  outro lado da linha). Canvas (`desenharCadeia`), PDF (`desenharCotas`) e DXF (`entidadesDeCota`) passam a usá-la.
- DXF: largura estimada pela mesma função do item 5; posição em mm reais com `pontoDaCota` (antes do início =
  `t = de − largura/2 − folga`; depois do fim = `ate + …`; outro lado = afastamento menor).

**5 · Largura real do texto no PDF.** `Desenhista` (`utils/blueprintExport.ts:246`) ganha `larguraDoTexto?(texto,
alturaMm)`:
- `DesenhistaPdf` (`services/blueprintExportService.ts`): `setFontSize` + `doc.getTextWidth(paraWinAnsi(texto))`;
- `DesenhistaCanvas`: `ctx.measureText(texto).width / k` com a fonte do `texto()`;
- sem o método (DesenhistaDeProva, loteamento, unifilar): `larguraEstimadaDoTexto(texto, alturaMm)` — tabela de largura
  da Helvetica (dígitos 0,556; vírgula/ponto 0,278; maiúsculas/minúsculas médias), substituindo o `0,55 × caracteres`.
- `desenharCotas` usa a largura para o "cabe?" e para centrar (`mx − largura/2`), e a bolha do eixo para centrar o nome.

## Bloco B — o que reparte as cotas e onde fica a bolha (pendências 1, 2 e 8)

**1 · Recuo no PDF/DXF.** O envelope vem da zona (`blueprint_study_urban_context`), fora do modelo; a exportação não o
recebe (`<PainelVersoes>` em `BlueprintEditor.tsx` ~14567 não passa zona).
- Puro `envelopesParaExportacao(model, zona)` (em `utils/blueprintTerreno.ts`): por nível com lote fechado,
  `recuosEfetivos(zona.recuos, …, alturaDoModelo, ordinal)` (`utils/blueprintZonaUrbanistica.ts:236`) +
  `envelopeConstrutivo(medirTerreno(limites), limites, recuos)` → `Map<levelId, Point[][]>` (as peças). A mesma conta
  do editor, feita sobre o modelo PUBLICADO que vai para a prancha.
- `OpcoesExportacao.zona?` (recuos base + afastamento progressivo + frente escalonada) e `OpcoesDxf.envelopes?`;
  o editor passa `zona` ao `PainelVersoes`, que a põe em `opcoes()` (alimenta PDF, PNG, conjunto de pranchas, DXF, GED).
- PDF: o envelope desenhado (contorno tracejado fino, laranja do canvas) e `detalhesDoLote(limites, envelope)` nas
  cotas do lote. DXF: camada nova `PLANTA-ENVELOPE` (polilinha fechada) e o mesmo `detalhesDoLote`.
- Sem zona aplicada: nada muda (envelope = lote, sem quebra extra).

**2 · Sub-regiões nas cotas do lote (item em Exibir).**
- `usePersistedState('blueprint:cotasSubRegioes', false)`; item **"Cotas das sub-regiões"** em Vista › Exibir (planta e
  vistas), desligado com motivo quando o pavimento não tem sub-região; `CamadasDaPlanta.cotasSubRegioes` (padrão false)
  em `utils/blueprintTemplatesDeVista.ts` + `configuracaoDeVista`/`aplicarConfiguracaoDeVista`.
- `detalhesDoLote` ganha `subRegioes?: Point[][]`; o canvas passa as sub-regiões visíveis (as que já recebe, sem as
  `ocultos`) quando o item está ligado.
- Exportação: não entra — a prancha não desenha sub-região (cota não aponta para o que não se desenha); dito no `title`.

**8 · Bolha sempre fora do desenho.** A faixa que a bolha evita passa a ser cotas ∪ desenho:
- Canvas: `faixaDasCotas` (`BlueprintCanvas.tsx` ~4495) cresce também com a caixa de `paredesDoNivel`,
  `limitesDoNivel`, blocos, vagas, sub-regiões e estruturas do nível (em px), antes de `bolhasDosEixos` (~7710).
- PDF/DXF: `caixaDoDesenho(model)` — o `boundingBox` atual SEM os eixos — somada à faixa das cotas antes de
  `bolhasDosEixos` (`blueprintExport.ts` ~687, `blueprintDxf.ts` ~941).
- Resultado: nenhum nome de ambiente, rótulo de vaga ou sub-região fica sob a bolha, em qualquer zoom.

## Bloco C — comportamento do editor (pendências 6 e 7)

**6 · Nada selecionado depois de criar.** Em `BlueprintEditor.tsx`: tirar `selecionar(criados)` de `criarEixos`
(~8654), `lancarPilares` (~8704) e dos lançamentos de vigas, lajes e fundações (e dos relançamentos), deixando a
seleção vazia. A mensagem de resultado e o Ctrl+Z ficam como estão.

**7 · Eixos na convenção antiga.** Puro `eixosNaConvencaoAntiga(model)` em `utils/blueprintEixosAutomaticos.ts`
(vertical com número / horizontal com letra, só nome automático):
- Gaveta Eixos automáticos: aviso "N eixo(s) com a convenção antiga (vertical com número) — Renumerar corrige", com o
  botão já existente ("Renumerar M eixo(s)" quando não há eixo novo).
- Painel do eixo selecionado (`PainelEixoSelecionado`): a mesma frase quando o eixo selecionado é da convenção antiga.

## Arquivos

`utils/blueprintDxf.ts`, `utils/blueprintExport.ts`, `services/blueprintExportService.ts`, `utils/blueprintCotas.ts`,
`utils/blueprintTerreno.ts`, `utils/blueprintEixosAutomaticos.ts`, `utils/blueprintTemplatesDeVista.ts`,
`components/blueprint/BlueprintCanvas.tsx`, `BlueprintEditor.tsx`, `PainelVersoes.tsx`, `PainelEixosAutomaticos.tsx`,
`PainelEixoSelecionado.tsx`. Sem migration.

## Verificação

- Testes (Vitest):
  - DXF: tabela LTYPE com `CONTINUOUS` e `EIXO`, camada da malha com `EIXO`, `$LTSCALE`; o "1,50" curto fora do trecho.
  - `ondeFicaORotulo` (4 casos) e os três desenhistas usando-a; `larguraEstimadaDoTexto` ("1,50" < "27,00").
  - `envelopesParaExportacao` (lote 10 × 30, recuo 1,5/1,5 → peça certa; sem zona → vazio); PDF e DXF com "1,50" /
    "27,00" na lateral e o envelope desenhado/na camada `PLANTA-ENVELOPE`.
  - Sub-regiões: com o item ligado reparte, desligado não; template antigo = desligado.
  - Bolha: eixo curto dentro do lote com nome de ambiente → bolha além do desenho (canvas, PDF, DXF).
  - Editor: depois de "Criar"/"Lançar" nada selecionado; aviso da convenção antiga na gaveta e no painel do eixo;
    item "Cotas das sub-regiões" em Exibir.
- Ritual: tipos por arquivo (`tipos.sh`), `check-ui-standard`, guarda de org, XSS, suíte cheia com a conta fechando
  (`--maxWorkers=4`), build com PWA.
- App real (estudo descartável, apagado depois): lote 10 × 30 com recuo da zona e uma sub-região — PDF A3 e DXF
  exportados e conferidos (recuo nas cotas, envelope, eixo traço-ponto aberto num leitor de DXF por inspeção do
  arquivo); ligar "Cotas das sub-regiões"; zoom afastado com bolhas fora do desenho; criar eixos sem seleção; eixo
  antigo (vertical "1") mostrando o aviso. Push → `conferir-producao.sh` → check-run `ci`.

## Execução e verificação (10/10/2026)

- Bloco A (3, 4, 5) — `ondeFicaORotulo` e `larguraEstimadaDoTexto` em `utils/blueprintCotas.ts`; `Desenhista.larguraDoTexto`
  (jsPDF `getTextWidth`, canvas `measureText`); DXF com LTYPE (`CONTINUOUS`, `EIXO`), `$LTSCALE`, `escalaDoDxf` e o número
  curto por fora.
- Bloco B (1, 2, 8) — `envelopesParaExportacao` (em `utils/blueprintZonaUrbanistica.ts`, não em `blueprintTerreno.ts`:
  é lá que moram `recuosEfetivos` e `ordinalDoPavimento`); `OpcoesExportacao.zona`, `OpcoesDxf.envelopes`, camada
  `PLANTA-ENVELOPE`; Exibir › "Cotas das sub-regiões" (`blueprint:cotasSubRegioes`, `CamadasDaPlanta.cotasSubRegioes`);
  `caixaDoDesenho` + a faixa da bolha = cotas ∪ desenho nas três saídas.
- Bloco C (6, 7) — `selecionar([])` depois de criar eixos e de lançar/relançar pilares, vigas, lajes e fundações;
  `eixosNaConvencaoAntiga`/`eixoNaConvencaoAntiga` com aviso na gaveta e no painel do eixo.
- Testes: `blueprintPendenciasCotasEixos` (novo, 8), `blueprintCotasPorLado` (+5), `BlueprintCanvasMedidasLoteMassa` (+1),
  `BlueprintCanvasEixos` (+1), `BlueprintEditor` (+4). Suíte cheia: 7932 = 7898 + 34 pulados, 0 falha. Tipos 0 erros; build ok.
- App real (estudo descartável, apagado): Cotas das sub-regiões reparte (1,50 | 23,50 | 3,50 | 1,50); aviso da convenção
  antiga e "Criar 3 eixo(s) e renumerar 1" → o "1" vertical virou "A"; nada selecionado; zoom afastado com bolhas fora
  do desenho; PDF A3 1:200 com o envelope e a lateral 1,50 | 6,50 | 4,00 | 16,50 | 1,50; DXF com `PLANTA-ENVELOPE` e `EIXO`.
- Observação NOVA (não estava entre as 8): no PDF, casa a 2 m da divisa — as cadeias das paredes (até ~19 mm de papel)
  e as do lote se sobrepõem na lateral. Já acontecia antes; fica registrada no § Status do plano de 07/10.


## Complemento (10/10/2026) — cotas do lote além das da edificação

Pedido: *"corrigir: Uma observação nova, que não estava entre as 8: no PDF, quando a casa fica perto da divisa (2 m no
teste), as cotas da casa e as do lote se sobrepõem na lateral e os números se misturam. … se quiser, a correção é
afastar as cotas do lote para além das da casa."*

- `alcanceAlemDoLado` + `deslocamentoDaCadeiaDoLote` (`utils/blueprintCotas.ts`): cada saída guarda o que as cotas das
  paredes ocupam (linhas, chamadas, números) na sua unidade; a cadeia do lote de cada lado começa além disso, com um
  respiro (tela 6 px, papel 1,5 mm, DXF meia altura de texto). A chamada do lote continua nascendo na divisa.
- Tela, PDF e DXF. No PDF a caixa do número entra sempre (ele fica 2 mm para fora da linha).
- Teste: PDF 1:200 com a casa a 2 m da divisa — nenhum número de cota sobre outro (sem a correção falha em
  "4,15" × "4,00"); DXF — a cadeia do lote além das da casa.
