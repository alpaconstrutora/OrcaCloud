# Porta de correr — as duas formas

## Pedido original

Sessão de 22–23/08/2026, depois de a geração de paredes acusar seis "paredes
fantasma" paralelas a 15 cm umas das outras. O usuário identificou a causa:

> essa planta tem alguns objetos que dificultam a analise. que são portas de
> correr e não portas de abrir que temos no app

E, perguntado se a folha corre por fora ou é embutida:

> Neste projeto especifico ela é embitida, mas o mais comum é correndo por fora
> da parede. Como existem as duas maneiras de representar uma porta de correr,
> recomendo termos as duas formas

## Por que isto não é cosmético

Hoje há três tipos: `door`, `window`, `passage`. Uma porta de correr obriga a
escolher entre dois erros:

- **como `passage`** (vão livre) — some do quantitativo de esquadrias. Vão livre
  é o vão SEM esquadria, e porta de correr tem folha, trilho e puxador. O
  orçamento fica furado.
- **como `door`** — entra no orçamento certo, mas o desenho ganha um arco de
  giro que não existe, e o arco ocupa área de parede que na de correr precisa
  estar livre.

## As duas formas, e por que ambas

| | onde a folha vai | como aparece na planta |
|---|---|---|
| **embutida** | para dentro do vão do bolso, na própria parede | o trecho vira parede dupla com cavidade |
| **por fora** | desliza sobre a face da parede | folha desenhada paralela à parede, deslocada |

A embutida é a deste projeto; a por fora é a mais comum. Não dá para escolher
uma: são construções diferentes, com preço e detalhe diferentes.

## Decisões de modelagem

### `kind: 'sliding'` + `embutida: boolean` — não dois `kind`

Dois `kind` duplicariam todo `switch` do desenho e do orçamento por uma
diferença que não muda o que se compra. E é a convenção que o próprio `Opening`
já segue: `hingeAtStart` e `swingReversed` são booleanos planos, presentes em
toda abertura, justamente para não bifurcar o tipo — está escrito no comentário
do modelo.

### Os dois booleanos existentes servem sem mudança de significado

Descoberta que evita campo novo:

- **`hingeAtStart`** já diz "de qual ponta do vão" — na de correr, para qual
  ponta a folha recolhe.
- **`swingReversed`** já diz "para qual lado da parede" — na de correr POR
  FORA, sobre qual face ela desliza. Na embutida não se aplica, porque a folha
  vai para dentro.

Os quatro estados que o Revit chama de *flip hand* / *flip facing* continuam
valendo, com leitura própria.

### Rodapé e esquadria já funcionam sozinhos

Conferido no código, não suposto:

- **rodapé** é interrompido por `sillMm === 0`, não por `kind`
  (`quantities.ts`, mudança 1.0.0→1.1.0 que corrigiu a porta-janela). Porta de
  correr no piso interrompe, como deve.
- **esquadria** conta tudo que não é `passage`
  (`blueprintBudget.ts:294`). Correr entra, como deve.

Nada a mudar nos dois. O que falta é a CONTAGEM por tipo.

### Hash canônico: `embutida` só é emitida em abertura de correr

Precedente 0.5.0→0.6.0: campo novo sai como `undefined` quando não se aplica,
para que desenho sem a feição não ganhe chave nova. Os seis goldens não têm
abertura nenhuma, então só a string de versão muda — a mesma prova das duas
versões anteriores, e é preciso REFAZÊ-LA: com a versão revertida, os seis têm
de bater byte a byte.

## Itens

- [x] **`utils/blueprintKernel/units.ts`** — `KERNEL_VERSION` para 0.7.0.
- [x] **`utils/blueprintKernel/model.ts`** — `kind` ganha `'sliding'`; campo
      `embutida: boolean`; `nomeDoTipoDeAbertura`.
- [x] **`utils/blueprintKernel/commands.ts`** — `AddOpening` aceita os dois.
- [x] **`utils/blueprintKernel/canonical.ts`** — emite `embutida` só quando
      `kind === 'sliding'`; lê com padrão.
- [x] **`utils/blueprintKernel/quantities.ts`** — `tipo` ganha `'sliding'` e a
      contagem `portasDeCorrer`.
- [x] **`components/blueprint/BlueprintCanvas.tsx`** — símbolo das duas formas,
      SEM arco.
- [x] **`components/blueprint/BlueprintEditor.tsx`** — o tipo no seletor e o
      controle de embutida/por fora.
- [x] **`__tests__/blueprintKernelGoldens.test.ts`** — atualizar com a prova
      refeita.
- [x] Testes de unidade do símbolo, da contagem e do hash.

## Fora do escopo

- **Reconhecer porta de correr na extração do PDF.** É o que motivou tudo, mas é
  problema separado: exige distinguir a cavidade do bolso de uma parede dupla
  real. Depois.
- **Janela de correr.** Mesma família, mas o desenho da janela não tem folha
  aberta — entra junto só se o uso pedir.

## Um defeito que só OLHAR pegou

A primeira versão desenhava a folha da correr **de face** exatamente sobre a
face da parede (`desloc = meia`). Renderizado, o traço sumia dentro do contorno
da própria parede — a porta de correr por fora ficava indistinguível de parede
cheia.

Nenhum teste de unidade vê uma linha que coincide com outra. Só apareceu na
cena `aberturas` do harness, que desenha os cinco símbolos lado a lado em Chrome
real. A folha passou a ficar 45 mm FORA da face, que é a convenção de planta e
faz ela ler como peça encostada na parede — que é o que ela é.

Na mesma olhada caiu o "traço de sentido" que eu tinha posto na soleira:
renderizado, virou um risco solto no meio do vão, lido como sujeira. A POSIÇÃO
da folha já diz para que lado ela recolhe.

## Verificações

- `__tests__/blueprintPortaDeCorrer.test.ts` — **9/9**
- `npx vitest run __tests__` — **1525 passaram**
- goldens do kernel — atualizados COM a prova refeita: revertendo a versão para
  0.6.0 os seis voltam a bater byte a byte, e as contagens de ambientes
  (9/49/144/3/78/4) nunca falharam
- `docs/spikes/medicoes/passeio.mjs` — 9/9 · `prancha-real` — 15/15
- `tsc` limpo · `check-ui-standard.sh` sem violação
- **Os cinco símbolos fotografados** lado a lado, em Chrome real

---

# Trocar o tipo de uma abertura já inserida

## Pedido

> 1. nao ha opcao de inserir porta de correr
> 2. nao ha opcao de inserir janela

Havia — mas só **antes** do primeiro clique. Os comandos existentes sobre uma
abertura eram `DeleteOpening`, `FlipOpening`, `SetOpeningSize` e `MoveOpening`.
**Nenhum trocava o tipo.**

Quem inseria uma porta e queria janela tinha de apagar e refazer, perdendo
posição, largura, altura e peitoril já ajustados. Com quatro tipos — e dois
deles recém-chegados — esse é o caminho por onde todo mundo passa: ninguém
acerta o seletor da barra antes de ver a abertura no lugar.

Confirmado no banco: a abertura que o usuário inseriu era `kind=door`, o
padrão do seletor.

## Itens

- [x] **`utils/blueprintKernel/commands.ts`** — `SetOpeningKind`. Posição e
      medidas ficam: trocar o tipo é dizer O QUE a abertura é, não onde está
      nem quanto mede. `embutida` é ZERADA ao sair de correr, para não guardar
      uma afirmação sobre bolso numa janela.
- [x] **`components/blueprint/PainelParedeSelecionada.tsx`** — seletor de tipo
      na caixa "Abertura selecionada", mais o de forma da folha quando o tipo é
      correr.
- [x] **`components/blueprint/BlueprintEditor.tsx`** — liga o comando.
- [x] **`__tests__/blueprintPortaDeCorrer.test.ts`** — 4 testes: vira janela
      sem perder medidas, vira correr nas duas formas, zera `embutida` ao
      sair, recusa abertura inexistente.

## Verificações

- `blueprintPortaDeCorrer.test.ts` — **13/13**
- `npx vitest run __tests__` — **1529 passaram**
- `tsc` limpo · `check-ui-standard.sh` sem violação

---

# Ângulos fora do ortogonal — medido na origem

## Pedido

> 3. veja que paredes e porta ficaram desalinhadas nao estao 90 graus. Acho que
> se deve aos cantos ao conectar as paredes

## A hipótese do usuário foi descartada por leitura de código

A mitragem move a ponta **ao longo da própria direção da parede** até a
interseção. Uma translação sobre a própria reta não gira nada. Não é ela.

## O que os números do modelo mostravam

```
1,50 m ·  91,298°  → 34 mm de desvio
0,72 m · −87,066°  → 37 mm
1,59 m · −177,510° → 69 mm
```

Grande demais para arredondamento — mas quatro das oito saíram em 90,000° e
180,000° exatos. Metade perfeita, metade torta: causa específica, não ruído.

## A resposta veio do arquivo

O usuário forneceu o `ALLAN.pdf`. Medindo as faces do grupo de parede
(0,72 pt) **antes de qualquer processamento**:

```
133 faces
  exatas (<0,01°)  62
  0,01 – 0,5°      26
  0,5 – 1,5°       31
  1,5 – 3°          3
  acima de 3°      11
```

**71 das 133 já estão fora do ortogonal no arquivo.** O desenho não é
esquadrejado — provavelmente redesenhado sobre levantamento. O pipeline carrega
essa característica para o modelo, e está certo em carregar.

⚠️ E é por isso que **NÃO se deve forçar ortogonal**: a prancha A0 da ALPA tem
uma parede real a **44,31°**. Endireitar por regra destruiria uma parede
diagonal legítima e mentiria no quantitativo.

## Um defeito meu, que amplificava

`parearFaces` tomava a direção do eixo de UMA das duas faces — `faces[c.i]`, a
de índice menor. O ângulo do eixo dependia da ORDEM em que as faces entraram na
lista, que é arbitrária; com 2° de tolerância de paralelismo, o eixo podia
nascer até 2° torto por sorteio.

Corrigido para a MÉDIA das duas direções, com o cuidado de alinhar o sentido
antes de somar (a emenda de ±90° da direção canônica pode deixar as duas
opostas, e somar assim daria a bissetriz errada).

**Medido no ALLAN:** pior desvio 0,789° → **0,56°**.

## O que fica em aberto, dito com clareza

O usuário viu **2,9°**, e a minha reprodução do mesmo arquivo não passa de
0,56% — nem antes da correção. Não consegui reproduzir o caso dele.

A explicação mais provável: ele **recalibrou depois de gerar**. O banco mostra a
aferição de agora; se as paredes saíram com outra escala, os limiares de
espessura do pareamento eram outros e os pares escolhidos foram outros. É
hipótese, não conclusão — e está registrada como tal.

## O que NÃO fiz, e por quê

Apertar a tolerância de 2° para 0,5° melhora o ângulo e custa paredes:

| ALLAN | paredes | ortogonais | pior |
|---|---|---|---|
| tol 2° | 18 | 50% | 0,56° |
| tol 0,5° | 13 | 69% | 0,28° |

Cinco paredes a menos por 0,28° de ganho é troca que o usuário tem de fazer,
não eu. Fica como opção a oferecer, com os dois números à vista.

## Itens

- [x] **`utils/blueprintVetor.ts`** — direção do eixo passa a ser a média das
      duas faces.

## Verificações

- `npx vitest run __tests__` — **1529 passaram**
- `docs/spikes/prancha-real/conferir.mjs` — **15/15**
- `tsc` limpo

---

# O vão encontrado só oferecia porta ou parede

## Pedido

> continue sem opcao de criar janela

E, com a captura:

> veja que tem opcao de porta ou parede

## O mal-entendido, e de quem foi

Respondi duas vezes sobre o seletor **Tipo** da barra de ferramentas —
verifiquei o código, o bundle em produção e o render real, e nos três a opção
Janela existia. Estava tudo certo e **completamente ao lado**: o usuário falava
da lista de **Vãos** do painel Ambientes, onde cada vão encontrado oferecia dois
botões, `É porta` e `É parede`.

Lição: quando alguém diz "não há opção de criar X", a pergunta certa é ONDE ele
está procurando — não se a opção existe em algum lugar.

## Por que a falta era real

Em planta, **janela interrompe a face da parede exatamente como porta**. O
detector de vãos não tem como distinguir as duas, e por isso oferece as duas
juntas — é o desenho do PRD §7.1: a máquina acha, o humano decide.

Com só "porta" e "parede", as duas saídas erravam, e **calado**:

- **como porta** → peitoril zero, e o rodapé é interrompido ao longo de um vão
  onde há peitoril de verdade;
- **como parede** → a janela some do quantitativo de esquadrias.

## Itens

- [x] **`components/blueprint/BlueprintEditor.tsx`** — `fecharComPorta` vira
      `fecharComAbertura(vao, kind, embutida?)`, e a lista passa a oferecer
      **cinco** saídas: porta, de correr, janela, vão livre, parede. Janela
      nasce com peitoril de 900 mm — é o que a separa da porta no rodapé.
- [x] **`__tests__/components/BlueprintEditor.test.tsx`** — trava os cinco
      rótulos e os quatro tipos distintos.

## Verificações

- `npx vitest run __tests__` — **1530 passaram**
- `tsc` limpo · `check-ui-standard.sh` sem violação

---

# Os vãos são nomeados na lista e anônimos no desenho

## Pedido

> as pontas soltas são listadas e nomeadas por vão (vão 1, vão 2...), porem na
> planta os vão não são nomeados, levando a necessidade de identificar atraves
> das medidas o que leva a um trabalho extra

## Por que a medida não resolve

Na planta que o usuário revisava, os vãos eram 0,44 · 0,52 · 0,98 · 0,98 ·
0,98 · 0,98 m. **Quatro medidas idênticas.** Casar "Vão 5" da lista com o vão
certo no desenho era impossível pela medida — e a medida era a única coisa
escrita ali.

## Duas correções, para dois momentos diferentes

**O número no desenho** resolve o caso parado: o rótulo passa de `0.98 m` para
`Vão 3 · 0,98 m`, com o índice do MESMO array que a lista numera.

**O destaque ao passar o mouse** resolve o caso em movimento, que é o de quem
percorre a lista de cima a baixo: a linha da lista acende o vão no desenho, com
traço mais grosso, e a própria linha ganha fundo âmbar.

O destaque segue `limiteEmDestaque` — prop própria, fora de `selectedIds`.
Destacar não é selecionar: passar por seleção faria o mouse sobre a lista trocar
o que os painéis mostram e o que Delete apagaria.

⚠️ `onFocus`/`onBlur` junto com `onMouseEnter`/`onMouseLeave`: a lista é
percorrível por Tab, e quem navega por teclado precisa do mesmo retorno.

## Itens

- [x] **`components/blueprint/BlueprintCanvas.tsx`** — rótulo com o número;
      `vaoEmDestaque` engrossa o traço do vão aceso.
- [x] **`components/blueprint/BlueprintEditor.tsx`** — estado do destaque,
      ligado ao cursor e ao foco da linha; decimal com vírgula na lista.
- [x] **`docs/spikes/medicoes/`** — cena `vaos`, com TRÊS vãos de mesma medida
      — o caso em que a medida não distingue nada.

## Verificações

- `npx vitest run __tests__` — **1530 passaram**
- `docs/spikes/medicoes/passeio.mjs` — 9/9 · `prancha-real` — 15/15
- `tsc` limpo · `check-ui-standard.sh` sem violação
- **Fotografado**: três vãos de 0,98 m saem como "Vão 1", "Vão 2" e "Vão 3", com
  o aceso visivelmente mais grosso
