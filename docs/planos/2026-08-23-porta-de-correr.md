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
