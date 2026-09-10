# Distribuição automática de tomadas — Fatia 2: mínimo pela NBR 5410, só o déficit, W→VA

## Pedido original

> Aceito o painel, mas também queria a distribuição automática e onde depende
> do projetista, por exemplo em cima da pia do banheiro, eu compreendo que o
> sistema não sabe onde seria, mas o sistema pode inserir uma tomada no
> banheiro e o projetista tem o trabalho apenas de mover para o local adequado.
> Também proponho que além da distribuição automática também tenha um campo
> para que o usuário pode decidir a quantidade de tomadas por ambiente e por
> parede e depois ele move para o local que ele deseja. Avalie

Depois da fatia 1 publicada: **"Fatia 2"**.

## O que a fatia 2 faz

A distribuição automática de verdade é a que sabe **quantas** a norma pede.
Com o ambiente classificado (fatia 1), a lista de ambientes mostra a linha:

> NBR 5410: mín. **6** (1 a cada 3,5 m de 19,4 m, 2 delas sobre a bancada) ·
> há **6** · altura média: 0/2 — faltam **2**, 2 sobre a bancada da pia
> `[Completar pela norma]`

e o botão cria **só o déficit**, como sugeridas (fatia 1), fora de portas,
janelas **e das tomadas que já existem**. As de altura média (bancada,
lavatório) nascem a 1,30 m com a instrução escrita no desenho e no painel do
ponto: *"Posicione sobre a bancada da pia"* / *"junto ao lavatório"*.

### A tabela (9.5.2.2.1) — `minimoDeTomadas(tipo, perímetro interno, área útil)`

| Tipo | Mínimo | Altura média |
|---|---|---|
| Banheiro | 1 | 1, junto ao lavatório |
| Cozinha / copa / área de serviço | ⌈perímetro ÷ 3,5⌉, nunca < 2 | 2, sobre a bancada |
| Varanda | 1 | — |
| Sala / dormitório | ⌈perímetro ÷ 5⌉ | — |
| Outro | área ≤ 6 m² → 1; senão ⌈perímetro ÷ 5⌉ | — |

"Ou fração" é teto: 14,2 m ÷ 5 = 2,84 → **3**.

### O que conta como existente — `conferirTomadas`

- TUG/TUE elétricas cujo ponto cai **dentro do contorno** do ambiente
  (`pointInPolygon`, descontando vazios).
- "Média" pela **mesma fronteira do símbolo** (`alturaDaTomada`): 800 ≤ cota
  < 1650.
- Ponto elétrico **sem tipo** dentro do ambiente **não conta — e é dito**:
  "(+1 sem tipo, fora da conta)".
- O perímetro é o **interno**, pelas faces (`perimetroInternoM`) — o que a
  norma mede. A lista de ambientes passou a mostrar esse mesmo número (antes
  era o de eixo, e "19,4 m" da norma ficava ao lado de "Perímetro 20,00 m").

### Três estados, todos ditos

- sem tipo → "classifique o ambiente para conferir";
- atende → verde, "atende", **sem botão** — o mínimo é piso, nunca vira
  "remova 2";
- falta → âmbar, "faltam N", botão.

Cozinha com 4 baixas **atende a contagem e ainda deve 2 sobre a bancada**: o
botão cria `max(déficit, déficit de médias)`, as médias primeiro.

### W → VA

A NBR 5410 dimensiona por potência **aparente** (9.5.2.2.2: "600 VA por ponto
de tomada"). Todo rótulo de potência na tela — canvas, quadro de cargas,
painel do ponto, inventário — passou a **VA** (`UNIDADE_DE_POTENCIA`). O campo
do modelo continua `potenciaW` porque o nome está no canônico; só o rótulo
mudou. Teste antigo que esperava "160 W" passou a exigir "160 VA" e a
recusar "160 W".

## Portões medidos no defeito

- Ignorar as tomadas existentes ao completar (`continue` no bloqueio) →
  falha "as sugeridas NÃO caem coladas nas tomadas que já existem"
  (a sugerida única caía exatamente em cima da existente, x = 3000).

## Verificação

- `npm run typecheck` limpo.
- `blueprintNbr5410Minimo` 18/18 · `components/DistribuirTomadas` 13/13 ·
  `PainelEletrica` (VA) · fatia 1 intacta (40/40 nos três arquivos).
- `check-ui-standard` em `DistribuirTomadas`, `PainelEletrica`,
  `PainelTrechoSelecionado`, `BlueprintEditor`, `BlueprintCanvas`: sem
  violação.
- Harness visual novo `docs/spikes/distribuir-tomadas/` (a linha do ambiente
  com o CSS do app, três estados) — olhado em screenshot antes de publicar.
- Suíte inteira e build antes do push.

## Fora de escopo, declarado

- Potência mínima por ponto (9.5.2.2.2) e o painel "Conferência NBR 5410"
  com as 6 regras — fatia 3.
- Ponto de ligação direta (chuveiro, aquecedor) — fatia 3.
- A distância do lavatório (9.1.4.2) não é conferida: o sistema não sabe onde
  o lavatório está — por isso a sugerida diz "junto ao lavatório" e espera
  ser movida.
