# Planta Inteligente — conexão automática entre pontos de conexão

## Pedido original

> vamos implementar snap. quando um circulo se aproximar de outro, Fazer conexão automatica

Sessão: `173a7f9b-72cd-49d6-972f-e29192178ac2` · 2026-08-31

Continuação direta de
[`2026-08-31-encaixe-nos-cantos-do-concreto.md`](2026-08-31-encaixe-nos-cantos-do-concreto.md),
que criou os "círculos" — os pontos de conexão que a peça de concreto desenha
quando está selecionada.

## Contexto

O ímã que existia (`capturar`) encaixa o **cursor**: responde "que ponto eu estou
apontando?". Serve para desenhar, onde o que nasce nasce debaixo do ponteiro.

Arrastando uma peça pronta a pergunta é outra — "que ponto DELA está perto de que
ponto de outra?" — e o cursor não tem nada a ver com a resposta: quem agarra uma
viga pelo meio para encostá-la num pilar está com o ponteiro a um metro de
qualquer canto. Encaixar o cursor ali não aproxima as duas peças de nada.

## Decisões

| Pergunta | Decisão |
|---|---|
| O que se compara? | **Conjunto de pontos × conjunto de pontos**, e o que sai é uma correção do DESLOCAMENTO — não da posição do cursor. |
| Quem anda, quem fica | A partição é a **seleção**: o mesmo conjunto que `TranslateEntities` move. Peça não se conecta a si mesma (os cantos dela andam junto; o par mais próximo seria sempre ela consigo, a zero). |
| Quantos pares? | **Um: o mais próximo.** Duas correções não se somam — a segunda desfaria a primeira. E premiar "o par que alinha mais pontos" faria a laje ganhar de um pilar que estava a 2 mm do lugar. |
| Ordem contra grade e ortogonal | A conexão entra **por último e ganha das duas**. Grade e orto são palpites sobre onde parar; um ponto a 3 px de outro é intenção declarada. É a ordem do CAD (osnap vence ortho). |
| Tolerância | `SNAP_PX / escala` — o **mesmo raio** do ímã do cursor, em pixel, porque "perto" é o que o olho vê. |
| Arrastar um VÉRTICE | **Fora.** Mover a ponta de uma viga gira a seção: os cantos daquele lado não acompanham por translação, e encostar um canto num ponto ali é equação não linear. "Quase coincidente" não vale nada — o valor inteiro da conexão é a coincidência EXATA. |

## Plano

### 1. Regra pura · `utils/blueprintConexao.ts` ✅

`encaixarConexao(pontosQueAndam, delta, pontosParados, toleranciaMm)` →
`{ em, alvo, correcao, distanciaMm } | null`. Correção arredondada para
milímetro inteiro (o kernel recusa coordenada fracionária, e 0,4 mm de folga
deixaria os pontos "quase" no mesmo lugar).

**Pronto quando:** `__tests__/blueprintConexao.test.ts` passa (6 casos).

### 2. Ligação · `components/blueprint/BlueprintCanvas.tsx` ✅

- `conexoesDoNivel` — os pontos partidos em *andam* / *ficam*, memoizado sobre
  as estruturas **reais** (a conta soma o delta ela mesma; usar as já deslocadas
  somaria duas vezes);
- `deltaDoArraste` passa a devolver `{ delta, conexao }` — quem chama precisa do
  par para marcar na tela;
- o cálculo saiu de dentro do updater do `setState` (dois estados mudam agora, e
  o React chama o updater duas vezes em modo estrito).

### 3. Marca na tela ✅

Anel verde (`COR_CONEXAO`) no ponto de encontro, enquanto o gesto dura. Sem ela
o bloco salta os últimos milímetros sozinho e o gesto vira mistério — "por que
pulou, e para onde?".

### 4. Conferência em Chrome real · `docs/spikes/conexao-automatica/` ✅

```bash
npx vite --port 3103
PLAYWRIGHT_CORE=c:/tmp/pwtest/node_modules/playwright-core \
  node docs/spikes/conexao-automatica/passeio.mjs http://127.0.0.1:3103
```

Pilar 40×40 parado em (5000, 5000); viga 3 m × 30 cm arrastada pelo meio. O
deslocamento que faz os cantos coincidirem é **(800, 1650)** — e 1650 **não** é
múltiplo do passo de mover (100 mm), então a grade daria (800, 1600) e o passeio
distingue os dois mundos.

**Resultado:** viga em `(1800, 4650)–(4800, 4650)`, canto dela em `(4800, 4800)`
sobre o canto do pilar; marca verde presente no pixel; e o quarto caso — arrastar
para LONGE — obedece só à grade, provando que o encaixe não gruda sempre.

## Resultado

Quatro itens concluídos em 31/08/2026. `npx tsc --noEmit` limpo; suíte inteira
2103 passando; passeio aprovado com print conferido.

## Pendências conhecidas

- **Só concreto com concreto.** Parede e divisa não têm círculo e não entram na
  conta — encostar uma viga na face de uma parede continua sendo trabalho de
  cursor.
- **Sem tecla para desligar** o encaixe no meio do arraste (o CAD tem). O raio é
  de 12 px, então o incômodo só apareceria numa prancha muito densa; se aparecer,
  a tecla é a saída.
- **Arrastar vértice** não conecta — ver a decisão acima.
