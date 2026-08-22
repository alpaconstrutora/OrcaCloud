# Gerar paredes automaticamente a partir do PDF do projeto

## Pedido original

Sessão de 22/08/2026, na sequência da conferência da planta de fundo.

> e como gero as paredes automaticamente?

A resposta foi que não existe caminho automático, mas que **parede não é
ambiente**: o bloqueio semântico que travou o épico (fechar vão) é do ambiente,
e a parede já tinha extração provada. Faltava uma etapa nunca testada
(retângulo → eixo). Ofereci medi-la antes de prometer a feature; o usuário
respondeu:

> sim

A medição aprovou (rodada 6 do Spike C, commit `09e789b`). Perguntei se
commitava o spike ou seguia para a Fase 1; o usuário respondeu:

> sim

Entendido como as duas coisas.

## O que a medição estabeleceu

- **52 eixos de 147 segmentos**, 69,1 m de parede, 68% do comprimento de face
  emparelhado.
- **A espessura derivada agrupa em 20/15/10 cm** — valores de construção, 75%
  dos eixos. É a prova de que os pares são paredes de verdade.
- **A parede não é retângulo fechado**: 140 dos 143 subpaths têm um segmento
  só. Cada face é uma linha solta. O pareamento geométrico é inevitável.
- **Consumir a face por TRECHO, não inteira** — uma fachada encosta em várias
  paredes internas. Foi o que levou 42→52 eixos.

## As três decisões de desenho

### 1. O PDF é escolhido de novo, e isso é dito na tela

A importação de hoje **destrói o vetor**: rasteriza a 150 dpi e sobe o PNG
(`useBlueprintUnderlay.importar`). Guardar o vetor exigiria mexer no pipeline
de importação, no bucket e provavelmente no schema.

Para a Fase 1 o usuário aponta o PDF outra vez, e a tela **explica por quê**.
É um clique a mais numa operação que se faz uma vez por planta — e mantém a
Fase 1 sem migration, sem mudança de schema e sem tocar no caminho de
importação que acabou de ser verificado.

### 2. A escala vem da aferição que já existe — não se pergunta nada

Descoberta que dispensa qualquer campo de escala na tela. A corrente é exata:

```
pt do PDF ──(×150/72, com Y invertido pela altura da página)──> px da imagem
px da imagem ──(pixelParaModelo, a aferição do usuário)──> mm do modelo
```

O raster do fundo saiu do MESMO PDF a 150 dpi, então o pt do vetor e o px da
imagem são o mesmo espaço a menos de um fator constante. **As paredes geradas
caem exatamente em cima da planta de fundo**, usando a aferição que o usuário
já fez. Nenhuma escala nova para errar.

Consequência: a ação só existe com um fundo aferido. É a ordem natural
(importar → aferir → gerar) e a tela deixa isso explícito.

### 3. A região é o que está na tela

A prancha tem ~23 desenhos (plantas, cortes, fachadas, tabelas). Gerar de todos
de uma vez seria um amontoado.

Em vez de inventar uma ferramenta de recorte, a região é o **enquadramento
atual**: o usuário dá zoom na planta que quer e gera. Zero interação nova, e
reaproveita o enquadramento que acabou de ser corrigido.

## Itens

- [x] **`utils/blueprintVetor.ts`** — o algoritmo, puro e sem pdfjs:
      `juntarColineares`, `parearFaces` (com consumo por trecho),
      `histogramaEspessura`, `ptParaModelo` e `espessuraDeConstrucao`.

- [x] **`__tests__/blueprintVetor.test.ts`** — 20 testes, incluindo o caso que
      a medição ensinou (face longa emparelhando com DUAS faces opostas) e os
      dois do arredondamento de espessura.

- [x] **`services/blueprintUnderlayService.ts`** — `extrairSegmentosPdf`.

- [x] **`components/blueprint/BlueprintCanvas.tsx`** — `onVistaMudou`.

- [x] **`components/blueprint/PainelGerarParedes.tsx`** — painel lateral, na
      aba "Do PDF".

- [x] **`components/blueprint/BlueprintEditor.tsx`** — `runBatch`, um passo de
      desfazer só.

- [x] **`docs/spikes/prancha-real/`** — cena `vetor`, que roda o caminho no
      NAVEGADOR contra a prancha real.

## Duas mudanças de rumo durante a implementação

### A prévia colorida saiu — a prévia é o próprio resultado

O plano previa acender no canvas os traços da espessura escolhida. Substituído
por um resumo numérico ("59 paredes · 20 cm ×20 · 15 cm ×11 · 10 cm ×8") antes
de aplicar, porque gerar é **um** passo de desfazer: errar a espessura custa um
Ctrl+Z, e uma camada de prévia exigiria um caminho de desenho novo no canvas
para dar a mesma informação que o número já dá. Volta se o uso mostrar que o
número não basta.

### A espessura passou a ser encostada no centímetro

**Não estava no plano, e foi a cena `vetor` do harness que obrigou.** O
pareamento devolvia 20,3 · 19,9 · 19,7 cm para paredes que são todas a mesma
parede de 20 cm — a diferença é onde o CAD pousou o traço.

Não é questão estética: espessura é dimensão de **quantitativo**, e 20,3 com
19,7 produziria duas linhas de orçamento para a mesma alvenaria. Com
`espessuraDeConstrucao` o resultado passou a bater exatamente com o histograma
do spike (20 cm ×20 · 15 cm ×11 · 10 cm ×8).

## Verificações

- `__tests__/blueprintVetor.test.ts` — **20/20**
- `npx vitest run __tests__` — **1472 passaram**, 24 puladas
- `docs/spikes/prancha-real/conferir.mjs` — **12/12**, e a cena `vetor`
  confere que o pdfjs do NAVEGADOR lê os mesmos 19923 traços que o de Node e
  gera 59 paredes contra as 58 do spike (a folga é o arredondamento para
  milímetro inteiro, que o spike não faz)
- `docs/spikes/medicoes/passeio.mjs` — **9/9** com a 6ª aba; a lista de abas do
  harness foi atualizada, senão ele aprovaria uma barra que transborda
- `npx tsc --noEmit` — limpo
- `scripts/check-ui-standard.sh` nos três componentes — sem violação
- `scripts/check-org-selector-guard.sh` — 14/14

## Um defeito de algoritmo que o teste de unidade pegou

`juntarColineares` dobrava o ÂNGULO para o semiplano positivo
(`if (ang < 0) ang += π`). Parece equivalente a canonizar o vetor e não é: a
direção (−1, 0) tem ângulo exatamente π, não é negativa, escapava da correção
e ia para a chave "180.0" enquanto (1, 0) ia para "0.0" — a mesma face
desenhada da direita para a esquerda virava duas faces, e as duas ficavam
órfãs.

O spike original tinha o mesmo defeito. Corrigido nos dois; com a correção o
spike passa de 52 para **58 eixos** e de 68% para **71%** de comprimento
emparelhado, com as três espessuras dominantes idênticas.

## Fora do escopo da Fase 1

- **Guardar o vetor na importação.** É o que elimina o segundo clique, e é
  mudança de pipeline + storage. Fase 2.
- **Ambiente/cômodo.** Continua bloqueado pelo fechamento semântico de vão.
  Esta fase entrega PAREDE, não área.
- **Foto e scan.** Sem vetor não há o que extrair; é o braço multimodal, que
  segue parado pela `GEMINI_API_KEY` inválida.
- **Mitrar os cantos.** O eixo abrange só a sobreposição do par e para uma
  espessura antes do canto. O editor já tem a mitragem do traçado manual; ligar
  as duas é trabalho próprio, e sem ela o usuário fecha o canto arrastando a
  ponta, como já faz.

---

# Fase 2 — guardar o vetor na importação

## Pedido

> vamos para a fase 2

Elimina o segundo clique: o PDF passa pela importação uma vez, e é ali que o
vetor é guardado.

## As decisões

### Arquivo ao lado da imagem, com caminho DERIVADO — sem migration

O vetor vai para `{storage_path sem .png}.vetor.json`, no mesmo bucket. Não há
coluna nova, e portanto não há migration — vantagem real neste projeto, cujo
histórico de migrations está furado (`20270208*` fora de `schema_migrations`).

O preço: a **ausência do arquivo** é a única forma de saber que não há vetor.
Por isso `carregarVetor` trata 404 como "não tem", nunca como erro, e
`caminhoDoVetor` tem teste garantindo que é estável — se esse caminho mudasse
entre versões, todo vetor já guardado viraria invisível de uma vez.

### Segurança: as policies existentes já cobrem, e foi conferido

O caminho começa pelo `organization_id`, e
`aplicar_20270905000015_blueprint_underlay_storage_policies.sql` recorta as
QUATRO operações por `public.is_org_member(((storage.foldername(name))[1])::uuid)`,
**sem nenhuma condição de extensão**. O `.vetor.json` cai sob o mesmo recorte.
Conferido no arquivo da migration, não na memória — a tabela estar recortada
não recorta o objeto no bucket, e é assim que vazamento entra.

### Formato achatado: cinco números por segmento

`{v, larguraPt, alturaPt, seg: [ax, ay, bx, by, w, ...]}`. Uma prancha A0 tem
~20 mil traços, e a forma com um objeto por segmento gasta mais espaço com nome
de campo repetido do que com número. **Medido: 670 KB** para os 19923 traços.

### NUNCA bloqueia a importação

A extração roda depois do upload da imagem, com o erro engolido. PDF protegido,
operador exótico ou folha grande demais não podem impedir alguém de importar a
planta de fundo — seria trocar uma funcionalidade que funciona por uma que
talvez funcione. Sem vetor, a aba cai no caminho da Fase 1, que continua lá.

### Busca sob demanda, não no carregamento

O arquivo tem centenas de kilobytes e só interessa a quem abre a aba "Do PDF".
Buscar no carregamento cobraria de todos o custo de algo que a maioria não abre.

## Itens

- [x] **`services/blueprintUnderlayService.ts`** — `caminhoDoVetor`,
      `salvarVetor`, `carregarVetor`, `achatarSegmentos`, `desachatarSegmentos`.
- [x] **`hooks/useBlueprintUnderlay.ts`** — grava o vetor na importação de PDF
      (sem poder quebrá-la) e expõe `vetorDaPranchaAtiva` sob demanda.
- [x] **`components/blueprint/PainelGerarParedes.tsx`** — procura o vetor
      guardado ao abrir e a cada troca de prancha; só pede o arquivo se não
      houver. Guarda de corrida com `cancelado`: trocar de prancha durante a
      busca faria a resposta da anterior chegar depois e mostrar os traços da
      folha errada, sem aviso.
- [x] **`__tests__/blueprintVetorArmazenado.test.ts`** — 8 testes: caminho
      estável, volta completa, arredondamento e sobra truncada.
- [x] **`docs/spikes/prancha-real/`** — confere a volta pelo arquivo contra a
      prancha real.

## Verificações

- `docs/spikes/prancha-real/conferir.mjs` — **13/13**. A conferência nova mede
  o que mais podia dar errado calado: **o vetor guardado gera exatamente as
  mesmas 59 paredes, com 0,00 mm de diferença de comprimento**, em 670 KB. O
  arredondamento de 0,01 pt não mordeu.
- `npx vitest run __tests__` — **1480 passaram**, 24 puladas
- `npx tsc --noEmit` — limpo
- `scripts/check-ui-standard.sh` nos três arquivos — sem violação

## Continua fora do escopo

- **Pranchas já importadas não ganham vetor retroativamente** — não há PDF
  guardado para extrair. Elas caem no caminho da Fase 1, e a tela diz isso.
- Mitrar cantos, ambiente/cômodo, foto e scan: inalterados.

---

# Fase 3 — a tela avisa quando a aferição está torta

## Pedido

Depois do primeiro teste com dado real, mostrei que a aferição do usuário estava
1,45% longa e propus duas correções na tela. Resposta:

> sim

## O caso real que motivou

Lido do banco em 22/08/2026 (usuário de leitura), estudo "Planta 22/08/2026":

```
mm_por_pixel = 17,178867814079   ·   cota declarada = 1100 mm
1:100 exato  = 16,9333            →   +1,45%
```

A causa é banal: 1,1 m ocupa **65 px** no raster, e o clique caiu em **64**.
Um pixel.

O efeito não é banal. Gerando a mesma planta com as duas aferições:

| | paredes | comprimento | espessuras |
|---|---|---|---|
| aferição do usuário | 59 | 86,87 m | **21cm ×14** · 15cm ×11 · 10cm ×8 · **20cm ×7** |
| 1:100 exato | 59 | 85,63 m | **20cm ×20** · 15cm ×11 · 10cm ×8 |

Os 1,45% empurram a parede de 20 cm para 20,6 cm, **em cima da fronteira do
arredondamento**: 14 viram 21 cm e 7 ficam em 20 cm. A mesma alvenaria em duas
linhas de orçamento — exatamente o que `espessuraDeConstrucao` existe para
evitar. O arredondamento absorve erro pequeno, mas não erro que joga o valor na
borda do balde.

## Itens

- [x] **`utils/blueprintUnderlay.ts`** — `escalaPadraoProxima` (a escala redonda
      que a aferição quase acertou, com PISO para não virar ruído) e
      `precisaoDaAfericao` (quanto vale um pixel de erro na aferição feita).
- [x] **`components/blueprint/ControlesDeFundo.tsx`** — o aviso de escala e a
      linha do vão em pixels; o botão e o tooltip passam a pedir a cota MAIS
      LONGA.
- [x] **`__tests__/blueprintAfericaoQualidade.test.ts`** — 9 testes, um deles
      com os números reais lidos do banco.
- [x] **`docs/spikes/medicoes/`** — cena `resumo`, que fotografa a faixa.

## As duas decisões

### O aviso diz a CONSEQUÊNCIA, não o desvio

"1,5% de diferença" não move ninguém. "Parte a espessura das paredes entre 20 e
21 cm, e a mesma alvenaria vira duas linhas no orçamento" move — e é verdade
medida, não retórica.

### O vão em pixels é o número acionável

A precisão da escala não depende de clicar bem: depende de sobre QUE
COMPRIMENTO se clicou. 65 px faz um pixel valer 1,5%; 590 px, 0,17%. Mesma mão,
nove vezes mais precisa. Por isso a tela mostra o vão — "use a cota mais longa"
é conselho que se pode seguir, "clique com cuidado" não é.

### Só para prancha vinda de PDF

`escalaAparente` supõe 150 dpi, que é como `rasterizarPdf` gera — para PDF o
número é exato. Numa foto ou num JPG solto o dpi é desconhecido, "1:101,5" não
significa nada, e sugerir 1:100 seria inventar precisão inexistente. A sugestão
é calada por `linha.pdf_pagina !== null`.

## Verificações

- `__tests__/blueprintAfericaoQualidade.test.ts` — **9/9**, incluindo o caso
  real e os dois casos em que a tela deve CALAR (aferição já boa; escala longe
  demais de qualquer padrão)
- `npx vitest run __tests__` — **1489 passaram**, 24 puladas
- `docs/spikes/medicoes/passeio.mjs` — **9/9**
- Faixa **fotografada** na cena `resumo`, com os números reais do banco de um
  lado e uma aferição sobre 10 m do outro — texto condicional é o tipo de coisa
  que passa no teste de unidade e não aparece na tela
- `npx tsc --noEmit` — limpo · `check-ui-standard.sh` — sem violação

---

# Correção — página girada: as paredes caíam fora do desenho

## Como apareceu

O usuário abriu a aba "Do PDF" com a planta bem visível na tela, escolheu
0,60 pt, e o painel disse **"Na área visível da tela: 0 paredes"**, com o botão
desabilitado.

## O diagnóstico, por eliminação medida

Cada hipótese foi descartada com dado, não com leitura:

| hipótese | como caiu |
|---|---|
| essa planta não usa 0,60 pt | tem 117 traços de 0,60 pt na região |
| o vetor guardado está corrompido | baixado do bucket: 686.057 bytes, íntegro |
| o algoritmo não acha paredes ali | gerando na região da PAV.01: **47 paredes** |
| `limitesDaVista` está errado | instrumentado no canvas: cobre a imagem ✓ |

Sobrou uma: as paredes não estavam onde a região procurava.

## A causa

```
page.rotate = 270
page.view   = [0, 0, 2384, 3370]     ← MediaBox em RETRATO
viewport    = 3370 × 2384            ← paisagem, depois do giro
transform   = [0, −2.0833, −2.0833, 0, 7020.8, 4966.7]
```

`ptParaModelo` fazia `py = (alturaPagina − y) × dpi/72` — um espelho de Y.
**Errado em três frentes ao mesmo tempo:** `x` e `y` estão trocados pelo giro,
os dois invertem, e a "altura" usada (2384, do viewport) não é a do eixo Y do
espaço do PDF (3370).

A planta das LOJAS fica em `y ≈ 3000`, acima de 2384 — então `py` saía
NEGATIVO, e as paredes iam parar dezenas de metros **acima** da imagem. O
recorte da tela, correto, não achava nenhuma.

Rotação de página não é exótica: quem plota A0 a partir de um template retrato
produz exatamente isso.

## Por que passou por tudo

Eu conferia **quantas** paredes saíam, nunca **onde** elas caíam. Contagem certa
com posição errada aprova em teste de unidade, no spike e no harness — os três
usavam a mesma conversão defeituosa dos dois lados, então eram consistentes
entre si e errados juntos.

É a mesma lição que o harness de `medicoes/` já trazia escrita — *"caixa
envolvente prova enquadramento, nunca orientação"* — aplicada a um eixo em que
eu não a apliquei.

## Itens

- [x] **`utils/blueprintVetor.ts`** — `ptParaModelo` passa a receber a MATRIZ do
      pdf.js (`ParaPixel`) em vez da altura da página. `paraPixelSemRotacao`
      existe com nome explícito, para que usar o caminho antigo seja escolha
      visível.
- [x] **`services/blueprintUnderlayService.ts`** — `extrairSegmentosPdf`
      devolve `viewport.transform` no dpi do fundo; formato guardado vai a
      **v2** com a matriz. **v1 é rejeitado, não migrado**: não há como
      recuperar a matriz sem o PDF, e aceitá-lo assumindo "sem rotação"
      reintroduziria o mesmo erro calado.
- [x] **`hooks/useBlueprintUnderlay.ts`** — `regravarVetor`, para que a prancha
      com vetor v1 volte a abrir pronta depois de apontar o PDF uma vez.
- [x] **`__tests__/blueprintVetor.test.ts`** — bloco novo com a prancha girada
      real, incluindo a invariante **"toda parede cai dentro da imagem"** e o
      contra-caso que mostra a versão antiga reprovando nela.
- [x] **`docs/spikes/prancha-real/`** — a mesma invariante, sobre a prancha
      real, no navegador.

## Verificações

- `blueprintVetor.test.ts` — **24/24**
- `npx vitest run __tests__` — **1501 passaram**
- `docs/spikes/prancha-real/conferir.mjs` — **14/14**, com a conferência nova:
  *"toda parede gerada cai DENTRO da imagem — 59 paredes, nenhuma fora"*
- `docs/spikes/medicoes/passeio.mjs` — 9/9
- `tsc` limpo · `check-ui-standard.sh` sem violação

---

# Correção — sem escala, o painel passa a RECUSAR

## Como apareceu

O usuário criou um estudo novo, importou a prancha, **não aferiu**, e gerou. O
modelo ganhou **13 paredes somando 2,5 m**, com espessuras de 5, 6, 8, 9, 10 e
11 cm espalhadas. Nenhuma delas é parede.

A prancha estava com `mm_por_pixel = 1` — a sentinela de "escala desconhecida".
Tudo saiu 17× menor, e o pareamento, usando uma faixa de espessura 17× errada,
selecionou pares que não são parede.

## A causa, e ela é de desenho

O painel **avisava** que faltava aferir e **gerava assim mesmo**.

Isso quebra a lógica que o próprio módulo já seguia. A planta de fundo nasce com
`mmPorPixel = 1` DE PROPÓSITO, porque é obviamente errado e empurra a aferir —
mas o gerador consumia esse "obviamente errado" sem hesitar, e devolvia um
resultado que **parece plausível**. Treze paredes com espessura em centímetros
redondos não denunciam nada até alguém medir.

Aviso não basta quando o resultado errado é convincente.

## Itens

- [x] **`components/blueprint/PainelGerarParedes.tsx`** — `semAfericao` vira
      prop vinda do hook (e não mais o palpite `underlay.mmPorPixel === 1`,
      que é detalhe de armazenamento). Com ela, nenhuma parede é calculada e
      **não existe botão de gerar**; a mensagem diz as duas saídas: declarar a
      escala no campo `1:___` ou aferir sobre a cota mais longa.
- [x] **`__tests__/components/PainelGerarParedes.test.tsx`** — 3 testes:
      recusa com a mensagem, o botão de gerar NÃO existir, e a recusa sumir
      quando a escala existe.

## Verificações

- `PainelGerarParedes.test.tsx` — **3/3**
- `npx vitest run __tests__` — **1504 passaram**
- `tsc` limpo · `check-ui-standard.sh` sem violação
