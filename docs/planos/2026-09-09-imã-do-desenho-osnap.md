# O ímã do desenho: pontos notáveis, marca na tela e controle

## Pedido original

> sinto falta de um componente snap

Perguntado o que faltava — já que o ímã existia —, o usuário escolheu **as quatro
coisas**: encaixar sobre a parede, marca na tela dizendo onde prendeu, controle
na barra, e os encaixes clássicos que faltavam.

## O que existia, e o buraco exato

O ímã pegava: ponta de parede, canto do corpo da parede, eixo e canto de peça
estrutural, terminal de instalação e grade.

⚠️ **Não havia alvo nenhum ao longo da parede.** Uma tomada fica no MEIO de uma
parede, não na ponta — e ali o ponto caía na grade: perto da parede e fora dela.
Era exatamente o gesto que o usuário estava testando quando sentiu falta.

E ele era **mudo**: o ponto pulava e nada dizia por quê. Prender no canto certo e
prender na grade a 1 mm dele parecem a mesma coisa na tela e produzem plantas
diferentes — uma fecha o ambiente, a outra deixa um vão que só aparece quando a
área não é calculada.

## O que foi feito

### 1. `utils/blueprintEncaixe.ts` — o motor, puro

Seis tipos novos: `SOBRE` (eixo e faces), `MEIO`, `INTERSECAO`, `CENTRO`,
`PERPENDICULAR`, `EXTENSAO`.

Puro porque é geometria, e geometria dentro de um `<canvas>` só se testa
renderizando um contexto 2D que o jsdom não tem. O ímã antigo vive inline no
`BlueprintCanvas` e **nunca teve um teste** — suportável com dois casos, não com
oito.

### 2. A marca na tela

Forma por tipo, na convenção de CAD (quadrado = extremidade, losango = canto,
triângulo = meio, círculo = centro, X = interseção, esquadro = perpendicular,
reticências = extensão, ampulheta = sobre), em magenta, com o nome por extenso ao
lado — ninguém é obrigado a decorar oito símbolos.

### 3. O controle na barra

`MenuEncaixe`, reusando o popover do `MenuExibir` — que ganhou `rotulo`, `icone` e
`ajuda` como props. A alternativa era copiar 130 linhas (fechar em clique fora,
fechar em Esc, `menuitemcheckbox`, largura reservada do check) e ter duas versões
divergindo na primeira correção.

## As decisões

### ⚠️ Prioridade vence distância

Entre dois candidatos ganha o de maior prioridade, não o mais perto. É a
convenção de CAD e a única previsível: com a distância decidindo, aproximar o
mouse um pixel trocaria "interseção de duas paredes" por "um ponto qualquer sobre
uma delas", e o desenho mudaria de significado sem o gesto mudar. Dentro do mesmo
tipo, aí sim ganha o mais próximo — é o que decide entre o eixo e a face.

### ⚠️ Cruzamento no ar não prende

Duas paredes que quase se encontram têm o cruzamento das RETAS fora das duas.
Prender ali criaria geometria a partir de uma linha imaginária.

### ⚠️ Extremidade e canto continuam onde estavam

Eles NÃO foram para o motor novo. O laço antigo carrega um portão de distância
que evita a varredura quadrática de `isFreeWallEnd` — com 20 mil paredes (o
acervo do Spike B) é o que trava a aba. Mudar isso de lugar seria trocar uma
otimização medida por elegância.

Pelo mesmo motivo, a `INTERSECAO` — que é quadrática nos segmentos — só roda
depois de uma **triagem** que reduz a lista aos poucos que passam perto do cursor.
Há um teste com 200 paredes provando que a triagem não come candidato válido: um
filtro apertado demais faria o ímã falhar só em desenho grande, que é onde
ninguém testa.

### Este menu não controla a GRADE

Desligar tudo aqui não solta o ponto no contínuo — ele continua caindo no passo
da grade, que tem controle próprio (Precisão). São dois conceitos separados no
CAD (osnap × grid snap), e juntá-los faria "desligar o ímã" mudar também a
precisão do desenho.

### ⚠️ A preferência é guardada como LISTA, não como `Set`

`usePersistedState` serializa em JSON, e um `Set` volta do `localStorage` como
`{}`. O sintoma seria o ímã parar de funcionar por inteiro **depois de recarregar
a página** — e só depois, que é o pior lugar para procurar.

E `encaixesAtivos` ausente significa **tudo ligado**, não nada: um `Set` vazio é
uma resposta legítima ("desliguei tudo") e não pode ser confundido com "quem me
chamou não sabe da existência disto".

## Verificação

1. `npx vitest run __tests__/blueprintEncaixe.test.ts` — 16 casos.
2. `bash scripts/check-ui-standard.sh` nos `.tsx`.
3. Suíte cheia e `npm run build`.
4. ✅ **Medido em NAVEGADOR de verdade** — `docs/spikes/encaixe-osnap/`, com
   ponteiro real sobre o canvas real:

   | gesto | resultado |
   |---|---|
   | cursor a 40 mm do eixo, encaixe **ligado** | terminal em **y = 3030** — o eixo da parede |
   | marca magenta na tela | **330 pixels** |
   | mesmo gesto, encaixe **desligado** | y = **3000** — grade pura |
   | marca com o encaixe desligado | **0 pixels** |

   ⚠️ As medidas do harness são TORTAS de propósito: a parede vai de
   (1010, 3030) a (6010, 3030), e nem a linha nem o meio dela caem num múltiplo
   do passo da grade. Com medidas redondas, o ímã e a grade dariam a MESMA
   resposta e o passeio aprovaria o mundo sem encaixe nenhum.

## ⚠️ Depois da entrega: "nao percebi o funcionamento do snap"

O relato veio com um print da vista **3D**. O motivo é esse: o controle de
Encaixe vive na barra da **planta baixa**, e não na de vista — encaixe é
ferramenta de desenho, e no 3D não há o que encaixar.

E, mesmo na planta, a marca só aparece com uma ferramenta de DESENHO ativa
(parede, terminal, quadro, rede…). Com a **Selecionar** — que é a padrão — o
ímã não roda: nada está sendo posicionado. É a convenção de CAD, onde o marcador
de osnap também só aparece dentro de um comando.

A fiação entre o motor e o canvas não tinha teste nenhum quando o relato chegou,
e era exatamente sobre ela que ele falava. O harness acima é essa cobertura: ele
prova as três coisas que nenhum teste de unidade alcança — o ponto prende, a
marca aparece, e desligar solta.
