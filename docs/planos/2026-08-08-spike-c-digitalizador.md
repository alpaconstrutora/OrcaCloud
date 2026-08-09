# Spike C — Digitalizador: extração vetorial em PDF de projeto

## Pedido original

> qual a proxima fase? → **Spike C**
>
> (planta fornecida pelo usuário: `PROJETO INICIAL-REGULARIZAÇÃO-R06-A0.pdf`)

Sessão de 2026-08-08. Primeira rodada do Spike C (PRD §30) sobre **uma prancha
real de aprovação** da ALPA — não amostra sintética.

---

## 1. O documento

Prancha A0 (1,19 × 0,84 m), 445 KB, uma página. Dentro dela:

- **23 desenhos**: plantas de subsolo a cobertura, três cortes, duas fachadas,
  locação, detalhes, duas tabelas de esquadrias e o carimbo.
- **37.772 segmentos vetoriais**, 1.573 itens de texto, 26 imagens pequenas.
- **59 rótulos de área** escritos pelo arquiteto (`a=19.49 m²`).

## 2. Três achados que mudam o PRD

### 2.1 O recorte não é uma etapa — é a primeira condição

O PRD lista "recortar área útil" (RF-006) como um passo entre outros. Não é:
uma folha de aprovação **nunca** contém um desenho só. Jogar a prancha inteira
num detector produz lixo garantido, porque corte, fachada e tabela têm traço
igual ao da planta.

O recorte automático funcionou parcialmente: agrupando os rótulos `a=...` por
proximidade saíram 10 candidatos, e os títulos (`PLANTA PAV. 02`) foram
localizados sozinhos. Mas o raio de agrupamento juntou **duas plantas vizinhas**
num grupo só — a folha as coloca perto demais. Agrupar por rótulo é um bom
começo, não uma solução.

### 2.2 A planta traz o próprio gabarito

Cada ambiente tem a área escrita. Isso resolve de graça a parte mais cara do
Spike C: não é preciso anotar planta à mão para ter referência. Compara-se a
área derivada contra a que o arquiteto declarou, e o critério de aceite do PRD
(§4.1, erro mediano ≤ 2%) passa a ser medível em dado real, sem anotação.

**É o achado mais reaproveitável desta rodada.** Vale para qualquer projeto
brasileiro aprovado, porque a área por ambiente é exigência de prefeitura.

### 2.3 "PDF vetorial = problema de parsing" está ERRADO

Foi o que eu afirmei ao ver o primeiro extrato de texto. A medição desmentiu.

**Extrair a parede funciona.** Os traços se separam por espessura:

| espessura | segmentos | comprimento médio |
|---|---:|---:|
| 0,00 pt | 609 | 22,3 pt |
| 0,24 pt | 573 | 9,9 pt |
| 0,12 pt | 505 | 9,8 pt |
| **0,60 pt** | **239** | **36,4 pt** |

A 1:100, 36,4 pt = 1,28 m — comprimento de parede. Os finos e curtos são cota,
hachura e contorno de letra. Confirmado **visualmente**: renderizando cada grupo
numa cor, o grupo de 0,60 pt desenha exatamente as paredes
(`docs/spikes/digitalizador/segmentos.png`).

**Derivar o ambiente falha.** Com uma planta isolada:

| | |
|---|---:|
| candidatos a parede | 147 |
| faces derivadas | 33, a maior com **1,93 m²** |
| pontas soltas | 19 |
| **declarado pelo arquiteto** | 12 ambientes, **156,61 m²** |
| **derivado** | 4 fragmentos, **5,82 m²** |

As faces encontradas são o *miolo dos próprios retângulos de parede*, não
cômodos. Duas causas estruturais, ambas visíveis no PNG:

**a) A parede não é um eixo — é um retângulo fechado independente.** O CAD
exporta cada parede como um polígono próprio. Nos cantos eles se encostam mas
**não compartilham vértice**. O arranjo planar recebe 147 arestas soltas, não uma
rede conectada.

**b) O vão de porta interrompe o contorno.** Numa planta real o cômodo **não é
fechado por paredes** — a porta é um buraco de verdade no traço. O kernel deriva
ambiente de contorno fechado, e contorno fechado não existe aqui.

## 3. O que isso significa para o R1

O pipeline do PRD (§11.1) trata "reparo topológico" como *"une extremidades,
remove duplicidade e sugere junções"*. Para PDF de projeto isso subestima o
trabalho. Faltam **duas etapas que o PRD não nomeia**:

1. **Retângulo de parede → eixo.** Parear faces paralelas opostas dentro de uma
   banda de espessura e emitir o eixo entre elas. É algoritmo conhecido
   (esqueleto/eixo medial restrito), tratável, mas não é "parsing".
2. **Fechar o vão de abertura.** Detectar a interrupção no contorno e decidir se
   é porta (fecha, e vira `Opening`) ou passagem real (não fecha). Sem isso,
   nenhum cômodo com porta fecha — ou seja, nenhum cômodo.

Nada disso invalida a tese do produto. Invalida a **estimativa de esforço**: o
braço vetorial parecia o barato, e é o que exige mais reconstrução geométrica.

## 3.1 Rodada 2 — preenchimento a partir do rótulo

A rodada 1 tentou reconstruir a topologia. Bateu em dois muros de uma vez, e cada
um exige um algoritmo próprio. A rodada 2 contornou os dois: a parede não precisa
virar eixo se for só **barreira**, e o rótulo `a=19.49 m²` que o arquiteto
escreveu dentro do cômodo é **semente exata** — a planta diz onde cada ambiente
está.

Varredura de quais espessuras contam como barreira:

| barreira | ≤2% | ≤5% | erro mediano | vazaram |
|:---|---:|---:|---:|---:|
| só parede (0,60 pt) | 0 | 0 | — | preenchimento escapa inteiro |
| **+ folha/arco da porta (0,24 pt)** | **2** | 2 | **0,3%** | 10 |
| + linha fina (0,12 pt) | 2 | 3 | 1,2% | 10 |

Com preenchimento independente por rótulo — cada um numa geração própria, para
que um vazamento não roube o território dos seguintes:

| declarada | derivada | erro |
|---:|---:|---:|
| 22,26 m² | 22,21 m² | **−0,2%** |
| 17,01 m² | 16,95 m² | **−0,3%** |
| os outros 10 | 135,55 m² cada | todos a MESMA região |

### O que isso estabelece

**A precisão não é o problema.** Quando o contorno fecha, o erro é 0,2–0,3% —
uma ordem de grandeza dentro do critério do PRD (§4.1, ≤ 2%), medido contra o
número que o arquiteto escreveu, em documento real.

**O fechamento é o problema, e ele é único.** Dez dos doze ambientes são a mesma
região conectada de 135,55 m²: as portas abertas ligam sala, circulação e hall num
blob só. Não são dez defeitos — é um só, repetido.

Incluir o grupo de 0,24 pt como barreira ajudou porque **a folha e o arco da porta
estão nele**, e em alguns vãos isso fecha por acidente. Não é solução: é sorte de
desenho.

**Consequência prática:** o Digitalizador não precisa de detector melhor nem de
mais precisão. Precisa de UMA etapa — fechar o vão de abertura — e ela vale para
os dois caminhos, o vetorial e o de preenchimento. É o item de maior alavancagem
do R1 inteiro.

## 3.2 Rodada 3 — tentativa de fechar o vão, e por que falhou

Duas tentativas de fechar o vão automaticamente, ambas medidas contra os 12
ambientes:

**a) Ponta solta mais próxima.** Medido antes de escrever qualquer heurística
(`pontas.test.ts`): das pontas soltas do traço de 0,60 pt, a maioria dos pares
mais próximos **não é vão de porta** — é grade de guarda-corpo, barras verticais
paralelas e próximas, na mesma faixa de espessura da parede. Proximidade sozinha
não distingue os dois. Descartada sem chegar a rodar contra o gabarito.

**b) Só colinear.** Um vão de porta continua o mesmo eixo da parede; duas barras
de guarda-corpo são paralelas mas deslocadas — não colineares. Esse filtro é
geometricamente correto para separar porta de guarda-corpo. Só que existe um
terceiro caso que ele não separa: **a borda de um terraço aberto também é
colinear e do tamanho de uma porta.**

As 8 pontes que o filtro criou caíram todas na mesma faixa de coordenadas — a
área de guarda-corpo de terraço, com vão de 2,2 a 2,4 m. Geometricamente é
indistinguível de uma porta larga. Fechei o que devia ficar aberto, e o
preenchimento vazou pela região inteira: **0 de 12 fecharam**, contra 2 de 12 na
rodada 2 sem fechamento nenhum. A tentativa piorou o resultado.

### O que isso estabelece

**Fechar vão não é problema geométrico — é problema semântico.** "Esta
interrupção no traço é uma porta (fecha) ou a borda do envelope construído
(fica aberta)?" não tem resposta só na distância e no ângulo entre dois pontos.
As três classes — parede contínua, vão de porta, borda de terraço — produzem
geometria parecida o bastante para que um filtro geométrico ora junte parede com
guarda-corpo (proximidade), ora abra o que devia ficar fechado (colinearidade).

Isso não invalida o achado da rodada 2 — a precisão de 0,2–0,3% quando o
contorno fecha continua de pé, e o preenchimento por rótulo continua sendo o
caminho certo. Muda a arquitetura da etapa que falta: não é geometria
determinística, é **classificação**. É exatamente onde o braço multimodal do
PRD tem função clara — perguntar "isto é porta ou borda externa?" é o tipo de
julgamento que um modelo de visão faz melhor que um filtro de ângulo.

## 3.3 Rodada 4 — braço clássico sobre RASTER

Segunda planta, fornecida pelo usuário: WebP 1070×1280, sem vetor nenhum. É o
caso "scan/foto" do PRD, que seguia sem teste. Sem API e sem modelo treinado —
só limiar, componente conexo e morfologia.

O braço multimodal **não pôde ser testado**: a `GEMINI_API_KEY` no `.env.local`
tem 19 caracteres e a API a recusa (chave válida tem ~39 e começa com `AIza`).

### O dilema do limiar

| limiar | componentes com área de cômodo |
|---:|---|
| 128 | **0** — todos os cômodos e o exterior são uma região só |
| 160 | 1 |
| 190–235 | 3, mas com área errada |

Limiar baixo: as linhas finas de soleira e folha de porta não contam como
barreira, e o preenchimento vaza pela porta — mesmo bloqueio das rodadas 1–3.

Limiar alto: as linhas finas passam a contar e fecham a porta, **mas a mobília
também vira barreira**. O quarto de cima tem caixa de 2,8 × 2,4 m (≈ 6,8 m²) e
saiu como componente de 3,0 m²: a cama partiu o cômodo ao meio.

### A abertura morfológica não resolve — e o porquê é o achado

Parede tem ~17 px de espessura nesta escala; traço de mobília tem 2–3 px. Abrir
(erodir e dilatar) deveria matar o fino e preservar o grosso. Testado com raio
2, 3 e 4:

| raio | escuros | componentes com área de cômodo |
|---:|---:|---:|
| 2 | 117.850 → 71.740 | **0** |
| 3 | 117.850 → 67.202 | **0** |
| 4 | 117.850 → 66.070 | **0** |

Removeu a mobília **e junto as linhas que fechavam as portas**. Voltou a vazar.

**As linhas finas fazem dois papéis com a mesma espessura:** soleira e folha de
porta (que fecham o vão) e contorno de mobília (que fragmenta o cômodo).
Geometricamente são indistinguíveis. Qualquer filtro que remova uma remove a
outra.

### Convergência das duas frentes

Vetorial e raster chegaram ao mesmo lugar por caminhos independentes:

| | o que trava |
|:---|:---|
| **Vetorial** (rodadas 1–3) | Fechar vão é semântico: porta, guarda-corpo e borda de terraço têm geometria parecida demais |
| **Raster** (rodada 4) | Fechar vão é semântico: a linha que fecha a porta e a que desenha o sofá têm a mesma espessura |

Dois métodos independentes convergindo na mesma conclusão é evidência bem mais
forte do que um só teria dado. **A etapa que falta não é geométrica.**

## 3.4 Rodada 5 — o arco de giro, que eu vinha descartando

Nas rodadas 1 a 4 todos os extratores tinham esta linha:

```js
else if (t === OPS.curveTo) { k += 6; at = null; }
```

Descartei **todas as curvas** do PDF. O arco de giro da porta é exatamente uma
curva: a evidência estava no arquivo e eu declarei o problema "semântico" sem ter
olhado para ela.

### O arco funciona como detector

129 curvas na região. Distribuição de raio:

| raio | quantidade |
|:---|---:|
| < 200 mm | 122 (cantos, símbolos, letras) |
| 200–400 mm | 2 |
| **600–1000 mm** | **5** — raios de 730 e 832 mm |

730 e 832 mm é largura de folha de porta. Cinco detecções, nenhum falso
positivo, e o critério é imune aos dois casos que derrubaram a rodada 3:
guarda-corpo não tem arco, borda de terraço não tem arco.

### Mas não move o resultado

| configuração | fecharam |
|:---|---:|
| parede + traço fino | 1/12 |
| parede + traço fino + **fechamento por arco** | **1/12** |

Zero diferença. As 5 portas fechadas não liberam nenhum cômodo porque as outras
aberturas — janelas, vãos de passagem sem folha desenhada, porta de entrada —
continuam abertas, e basta uma para o preenchimento escapar.

**O arco é ingrediente correto, não solução.** Ele resolve com precisão o
subconjunto "porta com arco desenhado", e esse subconjunto não é o gargalo. A
conclusão das rodadas 3 e 4 continua de pé, agora qualificada: parte das
aberturas é resolvível geometricamente; a parte que sobra não é.

## 4. Onde o multimodal entra agora

A pergunta mudou. Não é mais "onde estão as paredes" — o vetor já responde
melhor e de graça. É **semântica**: qual desenho da prancha é a planta que
interessa, onde começa e termina cada cômodo, o que é porta e o que é passagem.

Isso reordena o Spike C: o braço multimodal deve ser testado como **classificador
de região e de abertura**, não como detector de parede. Para scan e foto ele
continua sendo o único caminho, e isso segue sem teste — não havia amostra.

## 4.1 Decisão de portão — 09/08/2026

**O braço multimodal fica ADIADO, não descartado.** Decisão do usuário depois das
cinco rodadas.

Motivo: cinco rodadas mostraram que cada solução parcial de fechamento some no
ruído da abertura seguinte. O arco resolve porta com símbolo e não move o
resultado; o traço fino fecha alguns vãos por acidente; a morfologia derruba os
dois. Antes de assumir custo por página e a questão de privacidade do DP-09, vale
medir a alternativa que não tem nenhum dos dois problemas.

**O que entra no lugar: fechamento por AÇÃO HUMANA.** O sistema detecta os vãos
candidatos e o usuário confirma quais fecham e o que são. É o que o PRD §7.1 já
prevê — "interface apresenta zonas problemáticas primeiro" — e se apoia no
resultado da rodada 2: quando o contorno fecha, o erro é 0,2–0,3%. Uma
confirmação humana rápida entrega o número certo, sem API, sem custo por página e
sem enviar planta de cliente para fora.

**Quando reavaliar a API:** depois de medir quanto tempo a revisão humana leva de
fato. Se for baixo, o multimodal não se paga. Se for alto, aí a comparação passa a
ter sentido — e o escopo dele já ficou mais estreito: não é detectar parede (o
vetor faz melhor e de graça) nem porta com arco (idem), e sim janela, vão sem
símbolo e o limite entre interior e exterior.

**Quando a chave for adicionada:** `GEMINI_API_KEY` no `.env.local` (a atual tem
19 caracteres e é inválida; a válida tem ~39 e começa com `AIza`). Testar
primeiro na planta genérica de catálogo, **nunca** na prancha da ALPA — nível
gratuito do Google costuma reservar direito de uso do conteúdo para melhoria de
produto, o que colide com o DP-09.

## 5. Ferramentas que ficam

| arquivo | o que faz |
|:---|:---|
| `docs/spikes/digitalizador/caracterizar.mjs` | Vetorial × raster, contagem de traços, rótulos de área |
| `docs/spikes/digitalizador/mapear.mjs` | Acha os títulos e agrupa os desenhos da prancha |
| `docs/spikes/digitalizador/segmentos.mjs` | Histograma de espessura, comprimento, cor e ortogonalidade |
| `docs/spikes/digitalizador/extrair.test.ts` | Rodada 1: extrai eixo, monta o modelo, compara contra o declarado |
| `docs/spikes/digitalizador/preencher.test.ts` | Rodada 2: preenchimento a partir do rótulo, com `FAIXAS` parametrizável |
| `docs/spikes/digitalizador/pontas.test.ts` | Rodada 3, medição: caracteriza pontas soltas antes de qualquer heurística |
| `docs/spikes/digitalizador/fechar_vaos.test.ts` | Rodada 3, tentativa: fechamento por colinearidade — **reprovada**, mantida pelo motivo de ter falhado |
| `docs/spikes/digitalizador/raster.mjs` | Rodada 4: braço clássico sobre raster, com limiar e abertura morfológica parametrizáveis |
| `docs/spikes/digitalizador/arcos.mjs` | Rodada 5: mede as curvas do PDF e a distribuição de raio |
| `docs/spikes/digitalizador/porta_por_arco.test.ts` | Rodada 5: detecta porta por arco e fecha o vão — detector correto, mas não move o resultado |

O `extrair.test.ts` fica **fora** de `__tests__/` de propósito: depende de PDF em
caminho absoluto e quebraria o CI. As saídas (`segmentos.svg/png`) vão para o
`.gitignore` — são regeráveis.

## 6. Critério de pronto

- [x] Documento real caracterizado, não amostra sintética
- [x] Recorte automático por rótulo e título — funciona parcialmente
- [x] Gabarito obtido do próprio desenho, sem anotação manual
- [x] Extração de parede por espessura — **funciona**, confirmada visualmente
- [x] Derivação de ambiente por eixo — **falha**, com as duas causas identificadas
- [x] Derivação por preenchimento a partir do rótulo — **precisão resolvida**
      (0,2–0,3% quando fecha); **fechamento é o único bloqueador restante**,
      e é um problema só, não dez
- [x] Fechamento geométrico de vão — **duas tentativas reprovadas**: proximidade
      confunde porta com guarda-corpo; colinearidade confunde porta com borda de
      terraço. O achado: fechar vão é classificação semântica, não geometria.
- [ ] **Pendente, e é o item de maior alavancagem do R1:** classificar a
      interrupção do traço (porta × borda externa) — candidato natural para o
      braço multimodal, não para mais filtro geométrico
- [ ] **Pendente:** retângulo → eixo (só necessário se o preenchimento não bastar
      para o editor — ele dá área, não geometria editável de parede)
- [x] Braço clássico sobre RASTER — **dilema do limiar medido**: baixo vaza pela
      porta, alto fragmenta pela mobília; abertura morfológica não separa porque
      a linha que fecha a porta tem a mesma espessura da que desenha o sofá
- [x] Convergência confirmada: vetorial e raster travam no MESMO ponto, por
      caminhos independentes
- [ ] **BLOQUEADO:** braço multimodal — `GEMINI_API_KEY` no `.env.local` é
      inválida (19 caracteres; a válida tem ~39 e começa com `AIza`). É o único
      caminho restante para a etapa semântica, e não pôde ser testado.
- [ ] **Pendente:** scan e foto — não havia amostra; o caso difícil segue sem teste
- [ ] **Pendente:** as 50 plantas estratificadas do PRD. Esta rodada usou UMA, e
      serve para direção, não para veredito
