# Importar paredes, portas e janelas do IFC

## Pedido original

> do que se trata o item 4?

E, depois de eu explicar a Etapa 4 do roadmap BIM e propor medir antes de dar
prazo:

> ok

> sim

O item 4 é interoperabilidade Revit/Archicad. Dele, esta frente ataca a peça
maior: **a importação trazer parede, porta e janela**, que hoje traz só
geometria estrutural (pilar, viga, laje, estaca, bloco).

## A medição que abriu a frente — 06/09/2026

Feita antes de propor prazo, em três arquivos, com `web-ifc`:

| | FZK-Haus (2,6 MB) | DigitalHub (14,3 MB) |
|---|---|---|
| paredes | 13 | 178 |
| **com eixo `Axis` de 2 pontos** | **13** | **178** |
| curvas ou multi-segmento | 0 | 0 |
| **com camadas de material** | **13** | **178** |
| corpo extrudado simples | 9 | 169 |
| corpo de outro tipo | 4 | 9 |
| portas · janelas | 5 · 11 | 70 · 47 |
| `IfcOpeningElement` | 17 | 248 |
| `IfcRelVoids` · `IfcRelFills` | 17 · 16 | 248 · 115 |

**191 de 191 paredes** trazem o eixo como polilinha de DOIS PONTOS e a
composição em camadas. Isso é exatamente a `Wall` do kernel — `a → b`,
`thicknessMm` e `camadas` —, então a tradução é LEITURA, não aproximação. E a
medição eliminou trabalho que o roadmap reservava: **zero** paredes curvas,
**zero** que exijam sair da malha.

**265 vãos, todos com `RelVoids`** apontando a parede hospedeira. Só 131 têm
`RelFills` apontando esquadria; os outros 134 são furo sem esquadria, e o kernel
já tem `passage` para isso.

### ⚠️ O arquivo real do usuário NÃO serve de prova

`106525_ALPA CONSTRUTORA E INCORPORADORA.ifc` (1,9 MB) tem **zero** parede,
porta, janela, laje, pilar e viga: são **31 `IfcBuildingElementProxy`**, todos
malha bruta (10.771 faces), num único pavimento. Não é modelo BIM — é geometria
sem semântica, provavelmente de ferramenta não-BIM. Ele cai na categoria das 118
malhas que a importação recusa, e nenhuma melhoria de parede o alcança.

**Consequência: a conferência final depende de um IFC arquitetônico exportado de
Revit ou Archicad de um projeto do usuário.** Os dois samples provam o código;
não provam o exportador que a empresa usa.

## A descoberta que decide a identidade

O objetivo do item — "importa do Revit, mexe aqui, exporta de volta, e o Revit
reconhece que é a mesma parede" — parecia exigir um campo novo no kernel para
guardar o `GlobalId` de origem. **Não exige.**

`IfcGloballyUniqueId` **é** um UUID de 128 bits comprimido em 22 caracteres, e
`ifcGuidDeUid` (em `utils/blueprintIfc.ts`) já implementa exatamente essa
compressão padrão — 2 bits no primeiro caractere, 6 em cada um dos outros 21.
Ela é **reversível**.

Então: `uid = uidDeIfcGuid(globalId)`, e a exportação devolve o **mesmo
`GlobalId`, caractere por caractere**. Sem campo novo, sem tabela de-para, sem
tocar no hash — o `uid` já vive fora dele desde a Etapa 1. E `EH_UID` é uma
guarda só de FORMATO (`/^[0-9a-f]{8}-…$/`, sem exigir nibble de versão), então
qualquer valor de 128 bits decodificado passa.

⚠️ A prova disto é um teste de ida e volta com GUIDs REAIS lidos dos arquivos,
não com valores inventados: um GUID que eu escreva à mão passaria por qualquer
implementação, inclusive uma errada.

## Fatia 1 — o leitor entende parede

`services/ifcParametricoService.ts` passa a ler, além das 5 classes
estruturais, `IFCWALL` e `IFCWALLSTANDARDCASE`, por um caminho PRÓPRIO — a
parede não é uma peça extrudada de perfil, e forçá-la no `PecaParametrica`
existente seria distorcer os dois.

Nova `ParedeParametrica`: `expressID`, `globalId`, `nome`, `eixo` (dois pontos
em unidade de arquivo), `matriz`, `pavimento`, `camadas` (espessura + nome do
material + função), `alturaExtrusao` (quando o corpo é extrudado) e
`espessuraTotal`.

Recusas nomeando a forma, como já se faz para as estruturais: eixo com mais de
dois pontos, eixo ausente, sem camadas.

### A altura, e os 6,8 % que não a têm no corpo

13 das 191 paredes têm corpo que não é extrusão simples — são as recortadas pelo
telhado. Eixo e camadas elas têm; **a altura, não**.

Para essas a altura sai do **pé-direito do pavimento**, e a importação DECLARA
isso na tela ("altura do pavimento, o corpo é recortado"). O recorte em si o
kernel não representa, e fingir que representa poria uma parede inteira onde há
um bico — número plausível e errado, que é o defeito que este módulo mais teve.

## Fatia 2 — o tradutor produz `AddWall`

`utils/ifcParaKernel.ts` ganha `traduzirParedes`, irmã de `traduzirPecas`, com a
mesma regra de unidade: **todo ponto nasce em unidade de arquivo, passa pela
matriz e sai em metro**; nenhum fator manual.

- `a`/`b` do eixo, em mm, com a mesma ancoragem (`ARQUIVO`/`ORIGEM`/`DESENHO`)
  que as estruturais já usam — senão parede e pilar do mesmo arquivo entrariam
  em lugares diferentes;
- `camadas` do `IfcMaterialLayerSet`, na ordem, com `thicknessMm`;
- `alinhamento` a partir de `LayerSetDirection`/`DirectionSense`/
  `OffsetFromReferenceLine` do `IfcMaterialLayerSetUsage`: o IFC diz se a linha
  de referência é o eixo ou uma FACE, e o kernel já tem esse conceito
  (`AlinhamentoParede`, o "traçado pela face"). Ignorá-lo deslocaria a parede
  meia espessura em silêncio;
- `uid = uidDeIfcGuid(globalId)`.

### ✅ FATIAS 1 e 2 FEITAS em 07/09/2026

O leitor entende parede, o tradutor produz `AddWall` e a tela importa. **Três
medições mudaram o desenho, e nenhuma era o que eu supunha:**

1. **A matriz do parser é a do CORPO, não a do objeto.** Aplicá-la ao eixo
   colapsava **70 das 178** paredes do DigitalHub para comprimento zero e
   encolhia o resto. Corrigido compondo a cadeia de `IfcLocalPlacement`.
2. **O eixo do IFC nem sempre é a linha de centro.** No DigitalHub é; no
   FZK-Haus é uma FACE, para um lado ou para o outro conforme o
   `DirectionSense`. O material vai de `offset` a `offset + sentido × t`, e o
   centro é o meio disso — uma fórmula que acerta os dois arquivos, que
   discordam em offset E em sentido.
3. **O árbitro do item 2 é o CORPO desenhado, não outro cálculo meu.** 110
   paredes conferidas contra a geometria: 108 batem, **2 divergem** — dois tocos
   de 40 cm com o corpo 18 m ao lado do próprio eixo declarado. Sem explicação,
   e o teste os NOMEIA em vez de afrouxar o limite.

Mais duas decisões, ambas declaradas em vez de adivinhadas:

- ⚠️ **A função da camada não é lida — é declarada.** `IfcMaterialLayer` tem
  `Category`, e medido nos dois arquivos ele vem `$` num e `'Generisch'` no
  outro. Toda camada entra como `VEDACAO`; deduzi-la da espessura ou do nome do
  material seria adivinhar num campo que o 3D e o `LoadBearing` do IFC leem.
- ⚠️ **Parede recortada usa o pé-direito do nível.** São 13 das 191. `null` no
  tradutor diz "não sei", que é diferente de zero — zero faria parede sem corpo.

E uma trava contra o defeito mais difícil de ver: **paredes e estrutura do mesmo
arquivo têm de se sobrepor**. As duas passam por conversões diferentes (a
estrutura pelo mundo do web-ifc, Y para cima; a parede pelas coordenadas do
próprio arquivo), e se discordassem no sinal de `y` os pilares cairiam
espelhados em relação às paredes — com cada peça, isolada, na medida certa.

### ✅ CONFERIDO DE OLHO em 07/09/2026 — e achou um defeito

`docs/spikes/importar-ifc/` monta o painel de importação REAL ao lado da planta
e do 3D reais. O Playwright entrega o IFC direto ao `input[type=file]`, então o
arquivo não precisa ser servido nem versionado, e **nada disso passa por login**
— o que era a razão de eu achar que a conferência dependia de credencial.

O que se vê: casa de **12 × 10 m**, 13 paredes de 24 e 30 cm com composição,
altura de 2,50 m no 3D. A geometria está certa.

⚠️ **MAS OS AMBIENTES NÃO FECHAM.** Só 2 são detectados, e um deles cai fora da
casa. A causa foi medida no modelo já importado: das 26 pontas de parede, **16
caem exatamente sobre a ponta de outra, 2 ficam a menos de 20 cm e 8 estão a
mais de 20 cm — até 3,98 m**.

Não é arredondamento: são paredes internas que morrem no MEIO de outra (junção
em T). O grafo do kernel não cria nó aí, o anel não fecha, e sem ambiente não há
área, nem piso, nem forro, nem quantitativo. **A parede entra certa e o desenho
não vira orçamento** — que é metade do valor da importação.

### ✅ RESOLVIDO em 07/09/2026 — e a causa não era a que eu tinha escrito

A hipótese acima (junção em T sem nó, resolver com `SplitWall`) estava errada, e
duas medições a desmentiram:

1. **`recomputeSpaces` JÁ parte os segmentos onde eles se cruzam**
   (`splitAtIntersections`). O T em si nunca foi o problema.
2. Medindo a distância de cada ponta ao SEGMENTO mais próximo — e não à ponta
   mais próxima, que era o que eu media antes: **16 a 0 mm · 120, 120, 120, 150,
   150, 150, 150, 150, 170 · e um 1.624**. As espessuras do arquivo são 240 e
   300, e 120 e 150 são exatamente METADE delas.

A parede interna foi desenhada até a **FACE** da parede que ela encontra, não
até o eixo. Ela para meia espessura antes de cruzar, e por isso o corte em
interseção não tem o que cortar.

`utils/ifcEncostarParedes.ts` leva essa ponta ao eixo. **A permissão é estreita
e verificável: a ponta só se move quando já está DENTRO do corpo da outra
parede.** Estar no concreto é a prova de que o traço foi até a face; levá-la ao
eixo é ler a convenção, não inventar geometria. Fora disso a ponta fica onde
está e é RELATADA na tela — o caso de 1.624 mm é parede de fato solta, e emendá-la
seria desenhar por cima do projeto de outra pessoa. E ela anda só na direção da
PRÓPRIA parede: de lado giraria o trecho.

Resultado medido no harness: **ambientes de 2 para 4**, e a região que caía fora
da casa sumiu. O portão exige 4, e a prova nas duas direções foi feita — com o
encosto desligado ele reprova com "só 2 ambientes fecharam".

A tela DECLARA a mudança: "N pontas encostadas no eixo da parede vizinha — o
arquivo as desenhou até a face, e sem isso o ambiente não fecha".

**Três portões novos, todos provados nesta rodada:** paredes entraram (13),
pegada com tamanho de casa (entre 8 e 30 m de lado), composição junto (13 com
camadas) e o 3D pintando 17,1% da tela. O de AMBIENTES ficou com o mínimo em 1
— é o número que a fatia da junção em T tem de subir.

⚠️ E o portão nasceu com TRÊS defeitos meus, todos encontrados porque a barra
da tela mostrava 13 paredes enquanto ele dizia "entraram null": `\d` dentro de
template literal vira a letra `d`; `drawImage` num canvas WebGL sem
`preserveDrawingBuffer` volta em branco (media 0,0% com a cena desenhada); e o
401 de listar arquivos digitais, esperado num harness sem sessão, contava como
erro de console.

## Fatia 3 — vãos, portas e janelas

`IfcOpeningElement` → `RelVoids` dá a parede hospedeira; `RelFills` dá a
esquadria, e sua ausência é `passage`.

⚠️ **É aqui que está o risco concentrado da frente, e ele não é geométrico: é
aritmético e silencioso.** `offsetMm` (distância de `wall.a` até a borda do vão,
medida ao longo do eixo) e `sillMm` (peitoril) saem de projetar o placement do
vão sobre o eixo da parede. Errar o sentido do eixo espelha a posição da janela
na fachada; errar a origem da altura põe o peitoril no lugar errado. Nos dois
casos o desenho fica **plausível**.

As travas:
1. teste com os vãos REAIS dos dois arquivos, conferindo que todo `offsetMm`
   cai dentro do comprimento da parede e que `offset + largura ≤ comprimento` —
   uma projeção espelhada viola isso em quase todo vão não centrado;
2. ida e volta pelo `web-ifc`: exportar o modelo importado e reler as posições;
3. conferência de olho no harness do 3D.

Recusar, e não adivinhar: vão cuja projeção cai fora da parede hospedeira, vão
sem `RelVoids`, esquadria sem `OverallWidth`/`OverallHeight`.

Mão da porta (`hingeAtStart`/`swingReversed`): o IFC traz `OperationType` no
`IfcDoorType`. A exportação já mapeia os quatro estados para
`SINGLE_SWING_LEFT/RIGHT` e `SLIDING_*`; a importação lê a MESMA tabela ao
contrário. Ausente = o padrão do kernel, declarado.

## Fatia 4 — a tela

A tela de importação já mostra contagem por classe, recusas nomeadas, par de
pavimentos e as três âncoras. Paredes e vãos entram nas mesmas listas — nenhuma
tela nova. O que muda é o vocabulário: "componentes" passa a distinguir
estrutura de vedação, e a linha de recusa ganha os motivos novos.

## Ordem e prova

| Fatia | Prova |
|---|---|
| 0 · plano | este arquivo |
| 1 · leitor | teste contra os dois arquivos reais: 191 paredes lidas, 191 com eixo de 2 pontos e camadas, 13 declaradas como altura-do-pavimento |
| 2 · tradutor + identidade | ida e volta de GUID com valores REAIS dos arquivos; parede importada e reexportada mantém o `GlobalId` caractere por caractere; alinhamento de face não desloca o eixo |
| 3 · vãos | 265 vãos, todo `offsetMm` dentro da parede; 131 esquadrias com dimensão; 134 `passage`; mão da porta pela tabela inversa |
| 4 · tela | `bash scripts/check-ui-standard.sh` nos `.tsx` tocados |
| 5 · ponta a ponta | suíte + build + harness; importar o FZK-Haus no app e olhar em 3D |

Publicar por fatia, como nas frentes anteriores.

## Fora do escopo, e por quê

- **Telhado do IFC** — o kernel tem telhado desde 0.12.0, mas casar água a água
  com `IfcRoof` é frente própria; sem ela, as 13 paredes recortadas continuam
  com altura do pavimento.
- **DXF, classificação SINAPI e georreferência** — os outros três itens da
  Etapa 4, cada um independente deste.
- **`IfcTypeObject` para parede e estrutura** — a exportação já o tem para
  esquadria; estendê-lo não depende da importação.
- **As 118 malhas e as 189 formas multi-sólido** que a importação recusa hoje:
  não são caso de parede, e cada uma exige decidir o que representar.
