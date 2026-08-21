# Planta Inteligente — ferramenta de Terreno (polígono e linha)

## Pedido original

> preciso de uma ferramenta do tipo poligono e do tipo linha para desenhar um terreno e deve ter as seguintes caracteristicas:
> 1. de fechar em um poligono fechado
> 2.,opcao de aplicar o ortogonal
> 3. opcao de alterar as medidas apos concluida, igual a ferramenta retangulo
> 4. mostrar as medidas dos lados, igual a ferramenta retangulo
> 5. opcao de clicar e mover, igual a ferramenta retangulo
> 6. Sugira mais funcionalidades para a ferramenta

Sessão: `0cca01b3-e758-4415-839e-5516fd06a6fd` · 2026-08-21

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 2026-08-21 | Qual a diferença entre a ferramenta "polígono" e a "linha"? | **Dois gestos, mesmo resultado**: polígono = clico os vértices e fecho voltando ao primeiro; linha = traço divisa por divisa, encadeando, e fecha ao voltar ao início. Os dois produzem o mesmo contorno fechado. |
| 2026-08-21 | O contorno do terreno entra no orçamento como material? | **Limite, sem material** (`Boundary`). Lote é divisa jurídica, não construção. |
| 2026-08-21 | Quais extras valem a pena? | **Todos os quatro**: área/perímetro/erro de fechamento · recuos → envelope construível · taxa de ocupação e coeficiente · gravar a área de volta no Empreendimento. |

## Contexto

Não havia como desenhar um terreno. As duas ferramentas que pareciam servir não serviam:

- **Polígono** é um polígono **REGULAR** (`poligonoPeloLado(centro, raio, N, ângulo)`): todos os lados iguais. Um lote tem lados desiguais.
- **Retângulo** e **Polígono** criam **PAREDES**. Parede tem espessura e altura, e `quantities.ts` deriva área e volume de alvenaria de cada uma — o perímetro do lote entraria no orçamento **como alvenaria**.

### O achado que definiu a arquitetura

O kernel **já tinha** a primitiva certa, desligada: `Boundary` — *"limite sem material físico"* (`model.ts`).

| Já funcionava | Onde |
|---|---|
| Entra no arranjo planar como segmento de mesma dignidade que parede | `arrangement.ts` (`rawSegments`) |
| Não gera linha de PAREDE no quantitativo (espessura 0, não recua área de piso) | `quantities.ts` (`espessuraDoTrecho` → 0) |
| ⚠️ **mas gerava PISO** — ver o achado no fim deste documento | `arrangement.ts` + `quantities.ts` |
| Entra no payload canônico e no hash | `canonical.ts` |
| Persiste no banco (`object_type='BOUNDARY'`) | `aplicar_20270905000000_blueprint_kernel_foundation.sql` |
| Sai em PDF e em DXF | `blueprintExport.ts`, `blueprintDxf.ts` |

O que faltava — e é o trabalho deste plano: nenhuma UI criava (`AddBoundary` sem chamadores) e o canvas nunca lia `model.boundaries`; não havia `MoveBoundaryVertex` nem `DeleteBoundary` (`AddBoundary` era **via de mão única**: aplicado, só saía por `undo`); `assertModelInvariants` nunca percorria `model.boundaries`.

### Duas consequências técnicas que mudaram o desenho

**1. As características 3, 4 e 5 vinham de graça no Retângulo porque ele faz PAREDES.** Editar comprimento é `esticarParede`; mostrar cota é o botão *Medidas*; mover é o que foi entregue em 19/08. Nada disso alcançava `Boundary`. Escolher o limite sem custo significou **construir as três para ele**.

**2. `Space.areaMm2` NÃO serve como área do lote.** A área do ambiente é `grossArea − holeArea`. Um anel de terreno em volta da casa produz uma face com a casa como buraco — a área do **quintal**, não a do lote. A área do terreno é calculada direto do anel, com `polygonArea`.

## Plano

### Fundação — `Boundary` vira cidadão de primeira classe

**Por que os atributos vão DENTRO do payload:** `modelFromCanonicalPayload` reconstrói os boundaries com ids `bnd_` **novos**. Id de boundary **não sobrevive a publicar+recarregar**, então uma tabela externa chaveada por id de divisa perderia o vínculo no primeiro publish.

`Boundary` ganha `kind: 'TERRENO' | 'DIVISA'` e `papel?: 'FRENTE' | 'FUNDOS' | 'LATERAL_DIREITA' | 'LATERAL_ESQUERDA' | null`.

⚠️ Muda o payload canônico → **bump `KERNEL_VERSION` 0.4.0 → 0.5.0**. Consequência conhecida: hash antigo nunca bate com o novo, a referência de "já publicado" fica nula e **Publicar nasce habilitado**. Errar oferecendo publicar é recuperável; errar escondendo o botão prende o trabalho. Campo ausente lê como `kind:'DIVISA'`/`papel:null`.

Comandos: `AddBoundary` ganha `kind` + guarda de degenerado; `MoveBoundaryVertex`; `DeleteBoundary`; `SetBoundaryPapel`. **`TranslateWalls` → `TranslateEntities`** (com `wallIds` e `boundaryIds`) — conserta o defeito latente de arrastar um bloco e deixar as divisas para trás, quebrando o anel em silêncio.

### F1 — A ferramenta (as 5 características)

`BlueprintTool` ganha `'terreno'` e `'divisa'`. Mesmo motor de gesto do traçado de parede (`cadeia`, `capturarTracado`, `fechandoContorno`), emitindo `AddBoundary` — **sem mitra**, porque limite não tem espessura. A diferença entre as duas é a prévia: Terreno mostra o lado de fechamento e a área; Divisa mostra só o lado em curso.

Ortogonal: **zero código novo** — `travarOrtogonal` + `ortoAtivo` já valem para qualquer traçado (orto nasce ligado, Shift inverte, F8 alterna).

Canvas: traço fino **tracejado** (a mesma gramática que separa MEDIDO de DERIVADO); hit-test `limiteSob`; entra no laço; o botão *Medidas* passa a cotar os limites; alças na divisa selecionada.

`PainelTerreno.tsx`: comprimento de cada divisa editável, reusando `pontaEsticada` e a disciplina de `esticarParede` — num anel, mover a ponta arrasta **junto** a divisa vizinha, no MESMO lote.

### F2 — Área, perímetro e erro de fechamento

`utils/blueprintTerreno.ts` (puro): caminha o ciclo fechado dos boundaries `kind='TERRENO'` e devolve `{ anel, areaMm2, perimetroMm, fechado, erroFechamentoMm }`. **Erro de fechamento** exposto em mm: todo levantamento tem, e esconder é esconder erro de medida.

### F3 — Recuos → envelope construível

Generalizar `mitra` para **distância por lado** (`meia` → `d1`/`d2`). Marcar o papel de cada divisa (`SetBoundaryPapel`). Deslocar cada lado para dentro pelo seu recuo e intersectar os vizinhos → anel do envelope, hachurado.

Recuos **digitados** no painel. Não amarrar em `plant_urban_rulesets`/`regulatory_map_zones` nesta fase: são duas verdades regulatórias com tipos incompatíveis (`NUMERIC` × `TEXT` livre que aceita "N.A.") e uma tem a DDL em `migrations_pending_review/`.

### F4 — Taxa de ocupação e coeficiente

TO = projeção construída ÷ área do lote; CA = área construída ÷ área do lote. A área construída já é derivada pelo kernel; a do lote vem da F2. Limites da zona digitados ao lado.

### F5 — Gravar a área de volta no Empreendimento

⚠️ `blueprint_studies` tem `project_id → projects` e **não** tem FK para empreendimento. Seletor explícito no painel, com o projeto do estudo como sugestão — nunca inferir calado. Gravar `terreno_area` (+ polígono em `plant_terrains.polygon_geometry`, campo que existe no banco há meses e nunca foi escrito nem lido), com confirmação mostrando o valor que será substituído.

## Estado

Tudo entregue em 2026-08-21, sem commit ainda (a árvore tem trabalho de outra sessão).

- [x] Fundação — `Boundary` de primeira classe (modelo, canônico, comandos, invariantes)
- [x] F1 — ferramentas Terreno e Divisa, desenho, seleção, cotas, mover, editar medida
- [x] F2 — área, perímetro, erro de fechamento (`utils/blueprintTerreno.ts` + `PainelTerreno.tsx`)
- [x] F3 — recuos por lado → envelope construtivo (`mitra` generalizada + `anelRecuado`)
- [x] F4 — taxa de ocupação e coeficiente, com limites da zona digitados
- [x] F5 — write-back da área para o Empreendimento, com seletor e confirmação
- [x] Padrão de UI verificado (REGRA #1) — `check-ui-standard.sh` limpo nos arquivos tocados + conferência por print
- [x] Testes: 1406 na suíte (13 novos de kernel + 14 de terreno) + harness `docs/spikes/terreno/` (4/4)

### Notas de implementação

**F3 — `mitra` generalizada.** A função que fecha o canto da parede já fazia
exatamente a conta do recuo; faltava deixar os **dois** deslocamentos entrarem
(`meia` → `meia`/`meiaDoSegundo`). Sem cópia nova de geometria.

⚠️ **`envelopeValido` precisou de uma terceira checagem.** Simples + mesma
orientação não bastava: um retângulo recuado além da metade inverte os DOIS
eixos, a orientação inverte duas vezes e volta ao normal, e o resultado é um
retângulo perfeitamente simples do lado errado do lote. A prova que pega isso é
**cada lado manter a direção do lado que o originou**. Há teste.

**F4 — limitação declarada.** TO e CA usam a mesma área enquanto o editor
trabalha um nível de cada vez. O painel diz isso em texto, em vez de deixar
parecer que o coeficiente já soma pavimentos.

**F5 — a sugestão vem de `empreendimentos.project_id`.** `blueprint_studies` não
tem FK para empreendimento, mas os dois apontam para `projects`. O empreendimento
da obra do estudo vem **pré-selecionado**, nunca gravado sozinho, e a confirmação
mostra a área que será substituída.

### ⚠️ Achado durante a implementação: o lote virava PISO no orçamento

Escolher `Boundary` evitou a alvenaria, mas não bastava. `Boundary` sempre
participou do arranjo planar, então o anel do lote fechava uma face, a face virava
`Space`, e `computeQuantities` derivava **piso** dela. Medido antes da correção:
uma casa de 18,67 m² dentro de um lote de 30×30 passava a somar **900 m² de piso**
no orçamento — o mesmo estrago que a ferramenta Parede faria com alvenaria, só que
na outra linha da planilha.

**Correção:** o contorno de `TERRENO` fica **fora do arranjo planar**
(`arrangement.ts`); `DIVISA` continua entrando e continua dividindo ambiente, que
é o que ela sempre significou. É a separação que justifica o campo `kind` ter
nascido. Há teste para os dois lados e um terceiro provando que desenhar o lote
não muda uma linha do quantitativo.

### Sobre o bump de kernel 0.4.0 → 0.5.0

Os seis golden files mudaram de hash. **Foi provado que só a versão mudou**, não a
geometria: trocando a string de volta para `0.4.0`, o payload dos seis volta a
bater **byte a byte** com o golden anterior, e as contagens de ambientes
(9/49/144/3/78/4) seguiram idênticas. A prova e o motivo estão no cabeçalho de
`__tests__/blueprintKernelGoldens.test.ts`.

## Verificação

### Testes de unidade
- Anel só de limites fecha e a área bate com a conta à mão — **e é diferente de `Space.areaMm2`** quando há casa dentro.
- `MoveBoundaryVertex` no anel arrasta a vizinha junto; lote recusado não deixa o modelo pela metade.
- `TranslateEntities` move parede **e** limite no mesmo passo.
- Invariantes recusam limite degenerado e fora de mm inteiro.
- Payload de kernel 0.4.0 (sem `kind`) carrega com o padrão.

### Harness de gesto — `docs/spikes/terreno/`
⚠️ **Desenhar, laçar e arrastar são GESTOS: jsdom não alcança.** Quatro aferições:
1. cinco cliques + clique no 1º vértice **fecham** o anel;
2. com orto o lado enviesado sai reto — **e sem orto sai torto** (sem a segunda metade, a primeira não prova nada);
3. arrastar o lote inteiro preserva todos os comprimentos;
4. editar um lado pelo painel move a divisa vizinha junto e o anel continua fechado.

### Conferência no app (Incorporação › Planta Inteligente)
1. Desenhar lote de 5 lados desiguais sobre planta de fundo calibrada.
2. Ligar *Medidas* e conferir as cotas.
3. Recuos diferentes por lado → envelope.
4. Desenhar a casa dentro e conferir TO/CA.
5. **Aplicar no orçamento e conferir que o lote NÃO virou linha de alvenaria** — a razão de ter escolhido `Boundary`.
6. Publicar, recarregar, conferir que as divisas voltaram com os papéis certos.

## Fora de escopo (declarado)

- **Memorial descritivo por rumo/azimute** (digitar lado a lado da matrícula).
- **Mais de um lote por estudo** (gleba com vários lotes).
- **Georreferenciamento** — o ÒPURA Market tem polígono em PostGIS/WGS84, outro sistema de coordenadas.
- **Topografia / curvas de nível**.
- **Ligar recuos à base regulatória** (ver F3).
