# Seção T no kernel · IfcCovering · modo walk

## Pedido original

> implemete secao T e IfcCovering e modo walk

As três vêm do que sobrou da Etapa 2 do roadmap BIM e da importação de IFC. São
de tamanhos muito diferentes, e este plano diz isso na cara: a seção T é feature
de kernel (modelo, 2D, 3D, IFC, quantitativo, versão do hash); as outras duas
são bem menores.

## A pergunta que abria a seção T — MEDIDA em 06/09/2026

O plano da importação dizia para medir, antes de decidir, se basta T ou se
aparecem L e I. Medido nos dois modelos estruturais reais, olhando só os perfis
usados por `IfcBeam`:

| forma | Garden Cambuhy (14 MB) | Igreja (1,2 MB) |
|---|---|---|
| retângulo | 28 | — |
| **T** | **219** | — |
| L, I, cruz, U | **0** | 0 |

Os 219 foram separados de U cortando uma horizontal perto do lado oposto à mesa
e contando os cruzamentos do contorno: **2 = uma alma só (T)**; 4 seriam duas
pernas (U). Todos deram 2.

**Decisão: implementar SEÇÃO T, e não polígono geral.** Um perfil poligonal
arbitrário no kernel arrastaria desenho 2D, 3D, IFC e quantitativo para um caso
que nenhum arquivo real usa — e o kernel inteiro é construído sobre a ideia de
representar exatamente o que se sabe, e recusar o resto.

## Fatia 1 — a seção T no kernel

### Desenho

`Structural` ganha um campo opcional:

```ts
secaoT?: { mesaAlturaMm: number; almaLarguraMm: number };
```

E **nada mais muda de significado**:

- `larguraMm` continua sendo a largura em PLANTA — que numa viga T é a da mesa,
  a parte mais larga, e é o que a peça de fato ocupa;
- `alturaMm` continua sendo a altura total da seção;
- `mesaAlturaMm` é a espessura da mesa; `almaLarguraMm`, a largura da alma.

Ausente = seção retangular, exatamente como hoje. É o mesmo padrão de
`circular`, e é o que mantém todo o acervo válido.

⚠️ **A mesa fica em CIMA.** Viga T invertida existe, mas nenhum dos 219 casos
reais é uma — e inventar um campo `invertida` que nada exercita é criar um
caminho que ninguém percorre e ninguém confere. Quando aparecer, entra com o
arquivo que a exige.

### O ritual do hash

`KERNEL_VERSION` está DENTRO do hash. A ordem é a de sempre:

1. campo novo OMITIDO do payload quando ausente, para o acervo não mudar de hash;
2. provar os goldens passando com a versão ANTIGA e a família nova já no lugar;
3. só então subir a versão e recapturar.

### ✅ FEITA em 06/09/2026

- `secaoT` no modelo, no comando e no payload; `KERNEL_VERSION` 0.15.0 → 0.16.0
  com o ritual cumprido na ordem.
- `utils/blueprintKernel/secaoT.ts` (puro): área, perímetro de fôrma e contorno.
- Quantitativo: volume da seção, não da caixa.
- Importação: as 219 vigas T do modelo real entram (3.373 → 3.592 aceitas).
- 3D: perfil extrudado ao longo do eixo, conferido de olho no harness
  (`?cena=vigaT`, a T ao lado da caixa equivalente).
- IFC: seção varrida, com ida e volta pelo `web-ifc` provando que as quatro
  medidas voltam idênticas.

**Descoberta de um teste que falhou:** o perímetro de fôrma da T é IGUAL ao da
caixa, sempre — `2m + (L−a) + 2(A−m) + a = L + 2A`. Menos concreto, mesma fôrma.

### O que alcança

- `contornoEmPlanta` — não muda: a pegada em planta continua sendo a da mesa.
- 3D — a extrusão deixa de ser caixa e passa a ser o perfil em T.
- Quantitativo — volume e área de fôrma deixam de ser `largura × altura`.
  ⚠️ Isso **muda número já gravado**, então sobe a versão do quantitativo.
- IFC — `IfcArbitraryClosedProfileDef` com os 8 vértices. `IfcTShapeProfileDef`
  existe, mas o exportador que gerou os arquivos reais não o usa, e um leitor
  que aceite um aceita o outro.
- Importação — a viga T deixa de ser recusada; as 219 entram.

## Fatia 2 — `IfcCovering`

Forro, piso e revestimento existem hoje só como GRANDEZA derivada do ambiente
(`areaPisoM2`, `areaFaceLiquidaM2`), não como elemento. No IFC eles não saem.

### ✅ FEITA em 06/09/2026 — e sem geometria, de propósito

Piso e forro saem como `IfcCovering` (`.FLOORING.` / `.CEILING.`) por ambiente,
ligados a ele por `IfcRelCoversSpaces`, com a área em
`Qto_CoveringBaseQuantities`. Sem família nova no kernel: é derivação, como
`spaces`.

⚠️ **SEM CORPO.** O desenho sabe a ÁREA — é o contorno do ambiente — e NÃO sabe
a espessura: não há campo, e ninguém a informou. Emitir um sólido exigiria
inventá-la, e um revestimento de 5 cm que ninguém pediu é volume de argamassa
saindo num arquivo de coordenação. O produto sai carregando o que se sabe.

⚠️ **CLADDING ficou de fora**, declarado na cobertura: dizer QUAIS faces de
parede recebem acabamento exige uma informação que o desenho não tem. Emitir
todas seria inventar; escolher algumas, mais ainda.

O round-trip que já existia pegou um defeito meu: eu montava o GUID como
`${labelUid}:piso`, e uid é UUID, não texto livre — a guarda de formato recusou.
`uidDeterministico` dá o que se queria de verdade: identidades distintas entre
piso e forro e estáveis entre revisões.

## Fatia 3 — modo walk

Navegação em primeira pessoa no 3D: a câmera desce à altura do olho e anda pelo
desenho. É o menor dos três e não alcança nada além do viewer.

⚠️ O viewer está sob `@ts-nocheck`, então tudo o que for lógica sai para módulo
puro, e o portão é o harness — que já existe para os dois viewers.

## Ordem

1. Seção T (kernel → 3D → quantitativo → IFC → importação), publicando por fatia.
2. `IfcCovering`.
3. Modo walk.
