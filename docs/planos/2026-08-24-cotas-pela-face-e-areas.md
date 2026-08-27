# Cotas pela face + áreas útil e total

## Context

O editor de plantas cota **tudo pelo eixo** das paredes. Vem de uma decisão
antiga e declarada (`AVISO_COTA_DE_EIXO` em `utils/blueprintCotas.ts`: *"Cotas
medidas no EIXO das paredes… cota sem dizer de onde é medida é cota que
engana"*). É defensável no papel, mas não é o que a prancha de arquitetura faz,
nem o que se confere na obra com a trena.

Pedido de 24/08/2026, literal:

> 1. Cota interna é traves da face interna sempre. A cota externa é atrave da
> face externa externa. Mas se existir uma cota internmediaria, por exemplo, se
> uma lateral tivermos 3 ambientes em serie, ou seja, dois ambientes na
> extremidade e uma no meio, cotas començando e terminando no eixo para o
> ambiente do meio e dos dois ambientes da extremidade uma cota comecando na
> face externa e a outrea terminando no eixo do ambiente do centro.
> 2. Área do ambiente pela face interna e área total para face externa

Respostas de escopo, na sequência:

- **Onde vale:** exportação **e** canvas
- **Escopo da cadeia:** por **lado do contorno externo**, não global por eixo
- **Depois de ver o plano:** *"Incluir as sugestões do fora de escopo"* — as três
  exclusões que eu havia proposto entram: cota de abertura, lado oblíquo e o
  alcance no orçamento.

Resultado pretendido: a planta cota como prancha — total pela face externa,
cadeia parcial que começa e termina na face externa e quebra nos eixos das
divisórias, cota livre de cada ambiente pela face interna, e uma cadeia própria
para as aberturas. As áreas passam a significar o que o nome diz: útil por
dentro, construída por fora.

---

## O que já existe e deve ser reaproveitado

Este trabalho é **mais montagem que invenção**:

| Peça | Onde | Papel aqui |
|---|---|---|
| `cadeiasDeCotas(model, folgaMm)` | `utils/blueprintCotas.ts` (126 linhas) | o motor de cadeia; hoje global por eixo X/Y e 100% de eixo |
| `rotuloDeCota(mm)` | idem | formatação em metros — já resolve a armadilha do `toFixed(2)` em 0,075 |
| `cadeiaFecha(cadeia)` | idem | autoconferência soma-das-partes × total |
| `extensaoDeCanto(walls, wall, end)` | `utils/blueprintKernel/model.ts` | avanço de mitra por ponta — a régua de face/eixo |
| `faceInternaMm(walls, wall)` | idem (feito hoje) | vão livre da parede |
| `anelRecuado(anel, recuos[])` | `utils/blueprintKernel/geom.ts` | recua **e expande** anel com mitra e sentido correto |
| `areaRecuada(ring, walls)` | `utils/blueprintKernel/quantities.ts:168` (privada) | área pela face interna — **já implementada e já em uso** |
| `signedArea`, `polygonArea` | `geom.ts`, exportadas | contorno externo e áreas |

Consumidores atuais de `cadeiasDeCotas`: `utils/blueprintExport.ts:418` (PDF/SVG)
e `utils/blueprintDxf.ts:243`. **O canvas não consome nada disso** — tem só os
rótulos por parede do botão "Medidas".

---

## Duas restrições que o levantamento impôs

### 1. `Space.areaMm2` NÃO pode mudar de significado

Entra no **payload canônico** (`utils/blueprintKernel/canonical.ts:278`), que
gera o hash da versão publicada. Trocar área de eixo por área de face mudaria o
hash de **toda** versão já publicada — quebrando a identidade endereçável por
hash, que é a promessa central do módulo, e invalidando
`verifySnapshotIntegrity`.

**Portanto:** as áreas novas são **derivadas e exibidas**, nunca gravadas por
cima de `areaMm2`. Mesma disciplina que já separa "área de eixo" de "área de
piso" no quantitativo.

### 2. O contorno externo é descartado hoje

`buildArrangement` filtra faces por `signedArea(...) > 0`
(`arrangement.ts:411`), mantendo só as limitadas — a face não limitada (o
contorno externo) é descartada de propósito. A cadeia por lado precisa dela.

---

## Item 1 — cadeias de cota por lado

### A régua

Ao longo de um lado do contorno externo, com N ambientes em série:

```
┌ TOTAL ──────────────────────────────────────────────┐  face ext → face ext
│ ┌ parcial ─┐┌─── parcial ───┐┌─ parcial ─┐          │  face ext → eixo →
│ │          ││               ││           │          │           eixo → face ext
│ └ interna ─┘└─── interna ───┘└─ interna ─┘          │  face int → face int
│   ┌─┐  ┌──┐      ┌───┐            ┌─┐               │  ABERTURAS (cadeia própria)
└───────────────────────────────────────────────────┘
```

- **Extremos do lado** → face **externa**
- **Divisórias internas** → **eixo**
- **Cota de ambiente** → face **interna** a face **interna**
- **Aberturas** → cadeia própria, mais perto do desenho

### Arquivos

- **`utils/blueprintKernel/arrangement.ts`** — expor
  `contornoExternoDoNivel(model, level)`: o anel não limitado (ciclo de área
  negativa, revertido), por componente conexo. Não muda o que
  `buildArrangement` devolve; só deixa de descartar. *Pronto quando:* retângulo
  → 4 vértices; L → 6.

- **`utils/blueprintCotas.ts`** — o grosso:
  - `ladosDoContorno(anel)` — funde arestas colineares consecutivas em lados.
  - `cadeiasDoLado(model, level, lado)` → `{ total, parcial, internas, aberturas }`,
    todas em coordenada **local ao lado** (`de`/`ate` medidos ao longo da
    direção do lado, não em X/Y).
  - `cadeiasPorLado(model, level, folgaMm)` — escalona `posicaoMm`: aberturas
    mais perto do desenho, depois internas, parcial, total por fora.
  - Manter `cadeiasDeCotas` viva (dois consumidores + `blueprintTrocaDeArquivos.test.ts`
    dependem) ou migrar os três na mesma fase — decidir na implementação e
    registrar.
  - `AVISO_COTA_DE_EIXO` deixa de descrever a realidade: substituir por um aviso
    que declare a convenção nova (ext/eixo/int), porque a razão original —
    *"cota sem dizer de onde é medida é cota que engana"* — continua valendo.
  - *Pronto quando:* `cadeiaFecha` passa em total×parcial, e a soma bate ao mm.

- **`components/blueprint/BlueprintCanvas.tsx`** — desenhar as cadeias no botão
  "Medidas": linha de cota, linhas de chamada, ticks, escalonadas para fora do
  desenho. Os rótulos por parede (eixo + `int.`) ficam redundantes com a cadeia
  — **decidir se saem ou viram segundo toggle**, e registrar a escolha em
  `docs/planos/`.

- **`utils/blueprintExport.ts` e `utils/blueprintDxf.ts`** — consumir as cadeias
  por lado. Os dois já desenham cadeia como LINE+TEXT; muda a fonte, não o
  desenho. *Pronto quando:* tela, PDF e DXF trazem os mesmos números.

### Cota de abertura (entrou no escopo)

`blueprintCotas.ts` hoje exclui abertura de propósito: *"cotar vão de porta na
mesma cadeia da estrutura dobra o número de segmentos"*. A razão vale contra
**misturar** — não contra ter **cadeia própria**, que é o que a prancha faz.

A abertura tem `wallId` + `offsetMm` + `widthMm`. A posição no lado sai
projetando as duas bordas do vão na direção do lado. Cadeia com os pares
(borda, borda) de cada abertura daquele lado, e o trecho de parede entre elas.
*Pronto quando:* uma porta de 900 mm a 4000 do canto aparece como segmento de
0,90 começando em 4,00.

### Lado oblíquo (entrou no escopo)

Fica **quase de graça** por causa do desenho escolhido: a cadeia já é
unidimensional **ao longo do lado**, então não há projeção em X/Y para dar
errado — era exatamente isso que eu ia excluir. O que muda é só a renderização:
linha de cota paralela ao lado e texto girado junto. *Pronto quando:* um lado a
30° cota o comprimento real e o rótulo acompanha a inclinação.

---

## Item 2 — área útil e área construída

- **`utils/blueprintKernel/quantities.ts`** — promover `areaRecuada` (linha 168,
  privada) a exportada. Nada de reimplementar: a fórmula com termo linear +
  termo de canto (`tan(giro/2)`) já é a certa e já alimenta o piso.

- **`utils/blueprintKernel/`** — `areaTotalExternaDoNivel(model, level)`: pega
  `contornoExternoDoNivel`, expande meia espessura com `anelRecuado` (recuos
  negativos), devolve `polygonArea`. *Pronto quando:* retângulo de eixo W×H com
  parede `t` dá (W+t)×(H+t).

- **`components/blueprint/BlueprintEditor.tsx`** — a lista de ambientes
  (~linha 2689) passa a mostrar a área pela **face interna** no lugar da de
  eixo; o cabeçalho (~2642) soma essas. Acrescentar **área construída** (face
  externa) como linha própria. A aba Quantitativos já mostra Piso × Eixo e
  continua.

⚠️ `Space.areaMm2` intocado — restrição 1.

### Alcance no orçamento (entrou no escopo)

Levantado: `utils/blueprintBudget.ts:246` **já** usa `areaPisoM2` (a recuada)
para `AREA_PISO` — o orçamento já recebe área de face interna, e nada aqui
piora isso.

O que falta e agora entra: **a área construída não existe em lugar nenhum** do
quantitativo (`Quantitativos.totais`, `quantities.ts:118`, só soma piso). É o
número de laje, cobertura e da área construída legal (NBR 12721 — há módulo
próprio no produto).

- `quantities.ts` — `totais.areaConstruidaM2`, com fórmula e rastreabilidade
  como os demais (RF-121).
- ⚠️ **Subir `QuantityPolicy.version`.** O próprio módulo avisa: *"toda mudança
  de FÓRMULA obriga a subir a versão, senão todo estudo já quantificado serve o
  número velho para sempre e a correção fica invisível — pior que não ter
  corrigido, porque parece corrigida."* Acrescentar campo aos totais é mudança
  de resultado.
- `blueprintBudget.ts` — expor `AREA_CONSTRUIDA` como medida do de-para, ao lado
  de `AREA_PISO`. É aditivo: nenhum mapeamento existente muda de valor.

---

## Verificação

1. **Unidade** — `__tests__/blueprintCotas.test.ts` (estendendo o que já há em
   `blueprintTrocaDeArquivos.test.ts`):
   - o caso do pedido: lado com 3 ambientes → parcial de 4 pontos
     (ext, eixo, eixo, ext), 3 segmentos, `cadeiaFecha` verdadeiro
   - interna = eixo − espessura em canto reto; ponta livre não desconta
   - abertura de 0,90 a 4,00 do canto sai nessa posição
   - lado a 30°: comprimento real, sem projeção
   - área útil = (W−t)×(H−t); área construída = (W+t)×(H+t)
   - contorno externo de um L tem 6 vértices

2. **Navegador** — `docs/spikes/wall-render/medidas.mjs`, que já fotografa o
   toggle. Conferir à vista: cadeia fora do desenho, escalonada, sem sobrepor a
   planta. ⚠️ Este harness estava podre e foi consertado hoje — **rodar antes de
   mexer**, para não confundir defeito novo com podridão velha.

3. **Três destinos batem** — mesmo modelo em tela, PDF e DXF com os mesmos
   números. É a razão declarada de as cadeias serem compartilhadas.

4. **Hash intacto** — o payload canônico de um modelo não muda. É o teste que
   prova que a restrição 1 foi respeitada.

5. **Regressão** — `npx vitest run __tests__` (1628 hoje),
   `npx tsc --noEmit -p .`, `bash scripts/check-ui-standard.sh` nos componentes
   tocados.

---

## Sequência sugerida

Fases entregáveis, porque o conjunto é grande e cada uma se verifica sozinha:

1. **Contorno externo + áreas** (item 2 inteiro) — menor, independente, e já
   entrega valor: área útil e construída na tela.
2. **Cadeia por lado com a régua ext/eixo/int** (item 1 base) — em
   `blueprintCotas.ts`, com os testes.
3. **Renderização** nos três destinos: canvas, PDF/SVG, DXF.
4. **Cadeia de aberturas e lado oblíquo** — as duas dependem de 2 e 3 prontas.
5. **`AREA_CONSTRUIDA` no orçamento** + subida da versão da política.

---

# Andamento

## Fase 1 — contorno externo + áreas ✅ CONCLUÍDA

- [x] `contornoExternoDoNivel(model, level)` em `arrangement.ts`, sobre o mesmo
      pipeline de `buildArrangement` (extraído `segmentosDoNivel` para as duas
      lerem a MESMA lista — duas cópias divergiriam no primeiro `kind` novo).
- [x] `areaRecuada` exportada e parametrizada com `sentido: 1 | -1`. `-1`
      EXPANDE, e é assim que sai a área pela face externa. Uma `areaExpandida`
      própria seria a segunda cópia da regra de espessura.
- [x] `areaConstruidaMm2(model, level)` em `quantities.ts`.
- [x] `BlueprintEditor` — lista de ambientes passa a mostrar área ÚTIL (face
      interna); cabeçalho mostra "X m² úteis · Y m² construídos".
- [x] 8 testes em `blueprintKernel.test.ts`.

### O achado que mudou a Fase 2

O contorno de duas salas lado a lado sai com **6 vértices, não 4** — os dois
extras são onde a divisória encosta na fachada. Minha primeira expectativa de
teste dizia 4 e estava errada: **esses vértices são exatamente os pontos onde a
cadeia parcial quebra**. Descartá-los por serem colineares jogaria fora a
informação que o contorno existe para trazer. Ficou fixado em teste, com o
porquê escrito.

### Restrição 1 respeitada, e provado

`__tests__/blueprintKernelGoldens.test.ts` fixa hashes reais e passa **7/7**. O
próprio arquivo avisa: *"Se um hash aqui mudar, a pergunta não é 'atualizo o
golden?'. É 'o que na geometria mudou?'"*. Nenhum mudou — `Space.areaMm2` segue
sendo a área de eixo, e a identidade das versões publicadas está intacta.

## Fase 2 — cadeia por lado com a régua ext/eixo/int ✅ CONCLUÍDA

- [x] `ladosDoContorno(anel)` — funde arestas colineares, **guardando** os
      intermediários.
- [x] `cadeiasDoLado(model, level, lado)` → `{ total, parcial, internas }` em
      coordenada **local ao lado**.
- [x] `cadeiasPorLado`, `parcialFecha`, `AVISO_COTA_POR_FACE`.
- [x] `__tests__/blueprintCotasPorLado.test.ts` — 10 testes.

### O caso do pedido, medido

Lateral de eixo 9000 com 3 ambientes e parede de 200 mm:

| cadeia | resultado |
|---|---|
| **total** (face ext → face ext) | **9,20** m |
| **parcial** (face ext → eixo → eixo → face ext) | **3,10 · 3,00 · 3,10** |
| **internas** (face int → face int) | **2,80 · 2,80 · 2,80** |

A parcial fecha contra o total, e a soma das internas mais as 4 paredes de 200
dá exatamente os 9,20 — nada some no caminho.

**Lado oblíquo já funciona** e não custou caso especial: a cadeia é
unidimensional ao longo do lado, então a hipotenusa 3-4-5 cota 5000 de eixo em
vez de projetar 4000 ou 3000. Era o item que eu ia excluir do escopo.

### Estado

`npx vitest run __tests__` — **1646 passaram**, 24 puladas · `tsc` limpo ·
`check-ui-standard.sh` sem violação.

## Falta

- **Fase 3** — renderizar nos três destinos (canvas, PDF/SVG, DXF)
- **Fase 4** — cadeia de aberturas
- **Fase 5** — `AREA_CONSTRUIDA` no orçamento + subir `QuantityPolicy.version`

## Fase 3 — renderização nos três destinos ✅ CONCLUÍDA

- [x] `referencialDoLado` + `pontoDaCota` — a ÚNICA conversão local→mundo, e os
      três renderizadores passam por ela.
- [x] `BlueprintCanvas` — botão **Cotas** próprio, com linha, tiques a 45° e
      rótulo girado.
- [x] `blueprintExport.ts` (PDF/SVG) e `blueprintDxf.ts` — consomem
      `cadeiasDoModelo`.
- [x] Motor antigo (`cadeiasDeCotas`, `cadeiaFecha`, `AVISO_COTA_DE_EIXO`)
      **REMOVIDO**.
- [x] 4 testes novos: invariante da normal, e os três destinos batendo.

### Decisão: "Cotas" é botão PRÓPRIO, não substitui "Medidas"

O plano deixava em aberto se os rótulos por parede sairiam. **Ficaram**, com
botão separado, e a razão é de informação, não de gosto: a cadeia cota os LADOS
da edificação, e **uma parede do miolo que não encosta no contorno não aparece
nela**. Fundir os dois faria essa parede perder a medida ao ligar a cadeia, sem
nada na tela dizendo por quê.

### O motor antigo foi removido, e é por isso

Depois de migrar PDF e DXF, `cadeiasDeCotas` ficou com **zero consumidores de
produção** — vivo só pelos próprios testes. É o pior estado possível: código
morto que parece mantido. Removido junto com `cadeiaFecha` e
`AVISO_COTA_DE_EIXO`; `rotuloDeCota` ficou (continua em uso, e é ele que resolve
a armadilha do `toFixed` em 0,075). Os contratos que ainda valiam foram
reexpressos contra o motor novo, não apagados.

### Dois defeitos que só o print mostrou

O harness `docs/spikes/wall-render/cotas.mjs` (novo, com `?cotas=1`) pegou o que
teste de valor não pega:

1. **Rótulos empilhados e ilegíveis** — numa lateral com trechos curtos os
   números saíam sobrepostos. Agora o rótulo só é escrito se COUBER no trecho
   (`measureText`); a linha e os tiques ficam, porque ainda mostram onde a
   cadeia quebra.
2. **Os três níveis lado a lado num lado VERTICAL** — liam como um número só
   ("3,80 6,20 6,20" em fileira). Corrigido girando o texto com o lado, que é a
   convenção de prancha **e** o que faz o lado oblíquo se ler. O ângulo é
   normalizado para o texto nunca sair de cabeça para baixo.

### Conferido no print, com T = 1200 mm

| cadeia | topo do desenho |
|---|---|
| total | **17,20** (16,00 de eixo + 1,20) |
| parcial | **8,60 · 8,60** |
| internas | **6,80 · 6,80** |

### Os três destinos batem — agora é teste

Todo rótulo produzido pela fonte aparece **no PDF e no DXF**, e o número de
EIXO ('9,00' na lateral de 9000) não aparece em destino nenhum. É o teste que
impede alguém de "otimizar" um dos caminhos fazendo a conta por conta própria.

### Estado

`npx vitest run __tests__` — **1648 passaram** · `tsc` limpo ·
`check-ui-standard.sh` sem violação.

## Falta

- **Fase 4** — cadeia de aberturas
- **Fase 5** — `AREA_CONSTRUIDA` no orçamento + subir `QuantityPolicy.version`

## Fase 4 — cadeia de aberturas ✅ CONCLUÍDA

- [x] `cadeiasDoLado` devolve `aberturas`, particionando o lado em vão/parede.
- [x] Os três renderizadores desenham, com o vão em traço FORTE.
- [x] `AFASTAMENTO_COTA.aberturas` na linha mais interna — esquadria é o que se
      lê junto do desenho.
- [x] 6 testes.

A razão que excluía abertura (*"cotar vão de porta na mesma cadeia da estrutura
dobra o número de segmentos"*) vale contra **misturar**, não contra existir — na
prancha a esquadria tem a sua linha. E há teste provando que a abertura NÃO
contamina a cadeia da estrutura: `parcial` e `internas` seguem com 1 segmento.

Critério do plano cumprido e conferido no print: **porta de 0,90 a 4,00 do canto
sai como segmento de 0,90 começando em 4,00**, e a cadeia fecha —
`11,70 · 0,90 · 4,60 = 17,20`.

## Fase 5 — área construída no orçamento ✅ CONCLUÍDA

- [x] `Quantitativos.totais.areaConstruidaM2`, somando os níveis.
- [x] **`QuantityPolicy.version` 1.1.0 → 1.2.0.**
- [x] `EscopoMedida` ganhou `EDIFICACAO`; `AREA_CONSTRUIDA` no catálogo.
- [x] 5 testes (3 em `blueprintBudget.test.ts`, 2 em `blueprintQuantities`).

### O teste de versão fez o trabalho dele

`blueprintQuantities.test.ts` fixa `POLITICA_PADRAO.version` e **quebrou** ao
acrescentar o campo — que é exatamente para o que ele existe. Acrescentar campo
ao resultado É mudança de resultado: sem o bump, todo estudo já quantificado
continuaria servindo o registro velho, sem o campo, e a área construída
apareceria vazia sem nada explicando.

### `EDIFICACAO` é escopo próprio, e não `AMBIENTE`

Área construída não é atributo de ambiente, parede nem abertura — é do contorno.
Encaixá-la em `AMBIENTE` geraria **uma linha por cômodo com o mesmo número**, que
somaria errado no orçamento. Há teste fixando que sai UMA linha só.

Levantado e registrado: `blueprintBudget.ts` **já** mandava `areaPisoM2` (face
interna) para `AREA_PISO`. Nada aqui alterou número que o orçamento já
consumia — a mudança é aditiva.

## Estado final

`npx vitest run __tests__` — **1659 passaram**, 24 puladas · `tsc` limpo ·
`check-ui-standard.sh` sem violação · goldens de hash **7/7** (o payload
canônico não mudou).

**As 5 fases do plano estão concluídas.**
