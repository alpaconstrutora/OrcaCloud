# Paredes se sobrepondo nas junções (vista 3D) — Planta Inteligente

## Pedido original

> incorporacao < planta inteligente: veja pelo print de uma planta que esta
> aberta neste momento inclusive caso queira verificar, que as paredes nao estao
> unido corretamente, elas estão se sobrepondo nas conexões. entrando uma na obra

(sessão de 2026-09-03, com print da vista 3D em close, mostrando as paredes
entrando umas nas outras nas junções.)

---

## O que está errado — medido, não suposto

O corpo da parede no 3D é um retângulo que avança `extensaoDeCanto` **igual nas
duas faces** em cada ponta ([model.ts:1119](../../utils/blueprintKernel/model.ts#L1119),
aplicado em [Blueprint3DViewer.tsx:83](../../components/blueprint/Blueprint3DViewer.tsx#L83)).
Esse avanço fecha o entalhe do canto (defeito de 30/08/2026) **cobrindo o quadrado
da junção duas vezes** — uma vez por parede. No 2D isso é invisível: o preenchimento
é uma união e ninguém vê o que está desenhado duas vezes. No 3D são dois sólidos,
e o que se vê é exatamente o print: face contra face (z-fighting) e ponta de
parede saindo do outro lado da vizinha.

Medição nas duas plantas reais do acervo (`blueprint_branches.draft_payload`,
lidas com `supabase db query --linked`, script de medição no scratchpad — recorte
das duas plantas por nível, área de interseção dos corpos par a par):

| planta | paredes | pares que se invadem | área desenhada 2× | maior sobreposição |
|---|---|---|---|---|
| Planta 23/08/2026 | 33 | 56 | **0,88 m²** só pelo avanço (3,08 m² no total) | 0,0225 m² = 150 × 150 |
| Planta 01/09/2026 | 39 | 33 | **0,80 m²** só pelo avanço (1,15 m² no total) | 0,0400 m² = 200 × 200 |

A maior sobreposição em cada planta é **exatamente `t × t`**: o quadrado inteiro
do canto, coberto pelas duas paredes. Não é folga de arredondamento.

A diferença entre "só pelo avanço" e "no total" é sobreposição que já vem do
**modelo** (paredes desenhadas por cima de paredes: em `Planta 23/08` há três
trechos deitados sobre a fachada de 9,85 m, e dois vértices com 4 pontas que são
na verdade um canto com cada parede duplicada). Isso é dado, não desenho, e
**não é o que este plano corrige** — fica registrado ao final como pendência.

Classificação de todas as pontas de parede das duas plantas:

| tipo de ponta | 23/08 | 01/09 | o que acontece hoje |
|---|---|---|---|
| livre | 1 | 7 | avanço 0 — correto |
| **canto (1 vizinha no vértice)** | 42 | 46 | as duas avançam `t/2`: quadrado `t × t` coberto 2× |
| **T (morre no corpo de outra)** | 15 | 16 | avança `t/2` = meia espessura da hospedeira: **atravessa e sai do outro lado**, coplanar com a face oposta |
| estrela (3+ pontas no vértice) | 8 | 9 | idem |

O T é o "entrando uma na outra" do pedido: com hospedeira e divisória de mesma
espessura (o caso das duas plantas), o avanço de `t/2` põe a ponta da divisória
**exatamente na face de trás** da hospedeira.

---

## A correção — mitra de verdade: um avanço por FACE

`extensaoDeCanto` devolve **um** número por ponta, e um número só não sabe
descrever um corte em bisel. A régua nova devolve **dois**, um por face:

```
mitraDaPonta(walls, wall, end) -> { esquerdaMm, direitaMm }   // sinal: + avança, − recua
```

O valor de cada face é a **interseção da linha daquela face com a linha da face
correspondente da vizinha** — a construção clássica de offset de polilinha. Ela
acerta sozinha os quatro casos, inclusive com espessuras diferentes:

- **canto** (1 vizinha): face externa `+e`, face interna `−e`. As duas paredes
  caem na MESMA reta de mitra: nem vão, nem sobra. Em 90° e espessura igual,
  `e = t/2` — o mesmo número que `extensaoDeCanto` dá hoje, e é isso que garante
  que a silhueta externa não muda.
- **continuação colinear**: 0 e 0 — as duas se encontram no vértice.
- **T**: recua até a **face de chegada da hospedeira**, e para ali. Fim da
  travessia.
- **estrela (3+ pontas)**: cada face mitra com a vizinha adjacente em ÂNGULO
  (leque ordenado em volta do vértice), e o miolo que sobra vira uma peça
  própria (`poligonoDaJuncao`) — sem ela, mitrar todas as pontas de um vértice em
  T-com-vértice-partilhado abriria um buraco de `t × t` onde hoje há massa.

### Duas regras que só a planta REAL exigiu

Nenhuma das duas é dedutível da geometria de livro; as duas nasceram de buraco
medido na planta do usuário, e por isso estão comentadas no código:

1. **Junção soldada por TOLERÂNCIA, não por igualdade.** `DEFAULT_TOLERANCE_MM`
   (5 mm) é a mesma folga com que o arranjo planar já solda vértices. Exigindo
   coordenada idêntica, o canto (24455, −18355) da Planta 23/08 — desenhado com
   5 mm de folga — virava "hospedeira uma da outra": as duas paredes recuavam até
   a face da outra e abria um buraco de 150 × 150 mm.
2. **Quina não é junção em T.** A ponta só "morre no meio" de outra parede se
   sobrar, para cada quina dela, meia espessura das DUAS. Fora disso é canto
   aberto, e canto aberto mitra contra as retas de face da vizinha (que são as
   mesmas, esteja o vértice soldado ou a 14 cm). As duas plantas têm cantos
   fechados com 5, 38, 76 e 144 mm de folga; sem esta regra cada um continuaria
   com as duas paredes se invadindo.

Junção que nem assim se deixa classificar cai de volta em `extensaoDeCanto`: ela
sobrepõe, mas nunca deixa vão — entre os dois defeitos, num canto malfeito,
sobrepor é o menos grave.

`extensaoDeCanto` **fica como está**, e com ela a planta baixa, o encaixe, as
cotas e o PDF — que estão certos e que o usuário não reclamou. São réguas de
finalidade diferente: o 2D pinta uma união (sobreposição é invisível), o 3D
precisa de uma partição. O teste do item 5 trava as duas juntas no caso comum
(90°, espessura igual), para não divergirem como já divergiram antes.

---

## Mudanças

### 1. `utils/blueprintKernel/juncoes.ts` (novo)

Módulo próprio — `model.ts` já tem 1.300 linhas e este assunto tem vida própria.

- `pontasNaJuncao(walls, p)` — as pontas de parede que nascem em `p`, com direção
  de saída e espessura, **ordenadas por ângulo**.
- `mitraDaPonta(walls, wall, end): { esquerdaMm, direitaMm }` — `esquerda` é a
  face do lado `+n`, com `n = rot90(a→b)`. Trava em `AVANCO_MAX` meias-espessuras
  (canto agudo tende ao infinito) e trata como colinear quem estiver abaixo de
  `SENO_MINIMO_MITRA` — os dois limites já existem no kernel, não são novos.
- `poligonoDaJuncao(walls, p): Point[] | null` — o miolo do vértice de 3+ pontas.
  `null` quando não há (ponta livre, canto, colinear) ou quando o polígono
  degenera (paredes duplicadas na mesma direção).

**Pronto quando:** os casos do item 5 passam, incluindo espessuras diferentes.

### 2. `utils/blueprintKernel/index.ts`

Reexportar os três. **Pronto quando:** `tsc --noEmit` limpo.

### 3. `utils/blueprintElevation.ts` — o perfil carrega a mitra

`PerfilParede` ganha `mitraA` e `mitraB` (`{ esquerdaMm, direitaMm }`), do mesmo
recorte por nível que `avancoAMm`/`avancoBMm` já usam. Os dois campos antigos
**ficam** — a elevação e os testes existentes continuam iguais.

**Pronto quando:** o perfil de uma parede em canto reto de 150 devolve
`{esquerda: 75, direita: −75}` (ou o inverso, conforme o lado do canto).

### 4. `components/blueprint/Blueprint3DViewer.tsx` — a ponta em bisel

Sem peça nova e sem CSG: a extrusão continua sendo o perfil frontal, e o bisel
sai **deslocando os vértices do plano da ponta** depois de extrudar. O retângulo
nasce no avanço MENOR das duas faces (corte reto, recuado) e cada vértice da
ponta é empurrado para fora conforme o `z` local dele — que é onde ele está na
espessura. Vantagens sobre montar uma cunha separada:

- os furos (que ficam a `EPS` da borda) não são tocados;
- não há costura nova para o `<Edges>` desenhar dentro da face;
- vale igual para parede em camadas — cada faixa tem seu `z`, e a conta é a mesma.

O miolo dos vértices de 3+ pontas entra como uma malha própria, extrudada na
vertical igual à laje (`shapeDoAnel` + `rotateX(-π/2)`, com o `y` negado).

**Pronto quando:** no harness, o canto reto e o obtuso fecham sem entalhe **e**
sem face dupla, e a divisória em T para na face da hospedeira.

### 5. `__tests__/blueprintJuncoes.test.ts` (novo)

Geometria pura, sem DOM:

- canto reto, espessura igual → `+t/2` / `−t/2`, e a face externa bate com
  `extensaoDeCanto` (a trava contra divergência das duas réguas);
- canto de 120° → `(t/2)/tg(60°)`, com sinal trocado na face interna;
- **canto com espessuras diferentes** (100 morrendo em 300) → o avanço externo é
  150, e não 50: é a metade DA VIZINHA. É o caso que separa a régua nova da
  antiga, e o que `recuoAteFace` já documenta ter sido erro real;
- T perpendicular → as duas faces recuam `t_hosp/2`; T oblíquo → recuos diferentes;
- colinear e ponta livre → 0 e 0;
- vértice de 3 pontas (run + ramo) → o polígono do miolo existe e tem área;
- **invariante da união**: numa planta de teste, a área da união dos corpos com a
  mitra é igual à de hoje (não abriu vão), e a soma das interseções par a par cai
  para zero (não sobrou sobreposição).

### 6. `docs/spikes/blueprint-3d/` — o harness, que está QUEBRADO

`main.tsx:15` importa `./estudo-real.json`, que não existe no repositório (e não
pode existir: é planta de cliente), e `:374` chama `construirReal`, que não está
definido. Hoje o harness **não compila**. Trocar por `import.meta.glob`, que
resolve para vazio quando o arquivo não está lá, e cair na casa sintética nesse
caso.

Cena nova `?cena=juncoes`: canto reto, canto obtuso, **T perpendicular**, T
oblíquo e vértice de 3 pontas, longe da origem, com parede grossa e baixa (é o
que faz o defeito caber na tela — mesma razão de `construirCanto`). Par de PNG
antes/depois em `passeio.mjs`.

**Pronto quando:** `saida-juncoes.png` de antes mostra a travessia do T e a face
dupla no canto, e o de depois não mostra nenhuma das duas.

---

## O que este plano NÃO faz

- **Não mexe no 2D, no encaixe, nas cotas nem no PDF.** Estão certos para o que
  fazem e não foram reclamados. Consequência assumida: em canto de **espessuras
  diferentes** o 2D continua com o entalhe que a mitra revela (avança a própria
  meia espessura em vez da metade da vizinha). Fica como pendência.
- **Não mexe no IFC.** `IFCRECTANGLEPROFILEDEF` é um retângulo — não sabe
  descrever bisel. Corrigir de verdade pede `IFCARBITRARYCLOSEDPROFILEDEF`.
  Pendência registrada, não escondida.
- **Não limpa a sobreposição que vem do MODELO** (parede desenhada por cima de
  parede: 2,2 m² na Planta 23/08). É dado do usuário, e apagar parede que ele
  desenhou não é decisão de quem conserta render. Vale um aviso na tela algum
  dia; hoje fica anotado.

---

## Verificação — FEITA (03/09/2026)

1. ✅ `npx vitest run` — **2.305 passam, 24 skip, 125 arquivos**. Os goldens do
   kernel passaram **sem tocar em nada**, o que confirma que a mudança não vazou
   para o payload canônico. `KERNEL_VERSION` não subiu.
2. ✅ `npx tsc --noEmit` limpo.
3. ✅ `bash scripts/check-ui-standard.sh components/blueprint/Blueprint3DViewer.tsx`
   — sem violação.
4. ✅ Harness 3D (`passeio.mjs` a partir de `c:/tmp/pwtest`), sem erro de console
   em nenhuma cena. Par antes/depois em close nos quatro casos:
   - **T perpendicular**: antes, a ponta da divisória aparecia SAINDO da face de
     trás da hospedeira (um retângulo destacado na parede); depois, some.
   - **vértice de três pontas**: antes, o contorno duplo da junção e uma língua
     no topo; depois, uma emenda só e o topo contínuo.
   - **canto reto** e **canto de espessuras diferentes**: fecham com a diagonal
     da mitra, sem entalhe e sem face dupla.
5. ✅ Medição contra as **duas plantas REAIS** (payload lido do banco, medição
   descartável rodada e removida):

   | planta | sobreposição pelo avanço ANTES | DEPOIS | buracos abertos |
   |---|---|---|---|
   | Planta 23/08/2026 | 0,882 m² | **0,011 m²** (−98,7%) | **0** |
   | Planta 01/09/2026 | 0,797 m² | **0,000 m²** (−100%) | **0** |

   O resíduo da 23/08 são dois cantos em que a própria planta tem a **parede
   duplicada** (dois vértices com 4 pontas que são um canto com cada parede
   desenhada duas vezes). Não é a régua: é o dado.

   "Buracos" foi medido por amostragem de 25 mm sobre a planta inteira (23.772 e
   36.420 pontos): ponto que o desenho antigo cobria e o novo não, **e** que
   pertence ao retângulo nu de alguma parede. Os poucos pontos descobertos que
   NÃO pertencem a retângulo nenhum (3 e 16) são farpa que o avanço antigo
   inventava para fora da junção — sumir com eles é o conserto, não regressão.
6. ✅ A planta real de 01/09 renderizada inteira no viewer (39 paredes, payload
   copiado para o harness e **apagado em seguida** — é planta de cliente): sem
   erro de console, junções fechadas, aberturas intactas.

Fora de escopo verificado por consequência: a **planta baixa não muda**, porque
`extensaoDeCanto` não foi tocada e nenhum consumidor 2D passou a usar a mitra.
