# Circuito e quadro no kernel — para o módulo elétrico poder sair

## Pedido original

> f5
>
> seguir com a sua recomendacao

A recomendação, dada ao fechar a F5 da Etapa 6: **não remover o módulo elétrico
agora**. O caminho honesto é o kernel ganhar circuito e quadro primeiro; aí a
tela velha sai sem perder nada.

## Por que a remoção estava travada

Medido em 08/09/2026, ao fazer a F5:

- **não há o que migrar**: os 8 pontos não têm potência nem circuito, os 2
  circuitos se chamam `Iluminação` e `dfdfdf`, e disjuntor, seção de fio e
  potência instalada são `NULL` nos dois;
- ⚠️ **mas apagar levaria junto o QUADRO DE CARGAS** — quadros, circuitos,
  disjuntor, seção de fio, fator de demanda —, que o kernel não tem.

Ou seja: a única coisa que impede a remoção é uma capacidade que existe e nunca
foi usada. Construí-la no kernel é o que transforma "apagar e perder" em
"apagar e não perder".

## ⚠️ A linha que este plano NÃO cruza: DIMENSIONAMENTO

A Etapa 6 pôs fora do escopo, com todas as letras, "queda de tensão, perda de
carga, diâmetro mínimo por NBR — é cálculo de projeto, não modelagem, e cada
disciplina tem a sua norma". Isso continua valendo, e a fronteira é fina o
bastante para precisar de frase:

| entra | não entra |
|---|---|
| o disjuntor que alguém **declarou** | o disjuntor que a norma **exigiria** |
| a seção de fio **declarada** | a seção **calculada** pela corrente e pela distância |
| a soma das potências **declaradas** nos pontos | a demanda **normativa** por tipo de cômodo |

**Somar é registro; decidir é projeto.** Um quadro de cargas que LISTA o que o
projetista declarou e SOMA é bookkeeping — e é exatamente o que a tela velha
faz. Um que sugira o disjuntor a partir da carga seria outra coisa, com norma,
responsabilidade técnica e ART atrás.

## O desenho

### `Quadro` — uma família nova do kernel

É peça física, com lugar: fica numa parede, numa cota. `id`, `uid`, `levelId`,
`nome`, `at`, `cotaMm`.

### `Circuito` — uma família nova SEM geometria

Um circuito não tem forma: é um agrupamento. `id`, `uid`, `quadroId`, `nome`,
`tipo`, `tensaoV`, `disjuntorA`, `secaoMm2` — **todos declarados**, todos
opcionais menos o nome e o quadro.

⚠️ Sem `levelId`: um circuito alimenta pontos de mais de um pavimento, e amarrá-lo
a um piso partiria em dois o que é um só — o mesmo argumento que fez o
`IfcDistributionSystem` atravessar pavimentos na F4.

### `Terminal` ganha dois campos, **omitidos quando ausentes**

- `circuitoId?: string | null` — qual circuito alimenta o ponto;
- `potenciaW?: number | null` — a carga **declarada** dele.

⚠️ Omitidos quando ausentes é o que mantém o payload — e o hash — de todo
desenho existente exatamente como está. É o ritual de sempre.

### O quadro de cargas é DERIVADO

Função pura: por circuito, a soma das potências declaradas dos pontos dele e a
contagem; por quadro, a soma dos circuitos. Nada é gravado — gravar o total o
deixaria obsoleto no instante em que alguém mudasse a potência de um ponto, e um
total obsoleto não some da tela: vira um número plausível.

## Fatias

1. **O kernel** (~1,5 d): as duas famílias, os dois campos, invariantes,
   comandos, canônico de ida e de volta, o quadro de cargas derivado, testes e o
   bump de `KERNEL_VERSION` — nesta ordem, com as goldens passando na versão
   ANTIGA antes do bump.
### ✅ FATIA 1 FEITA em 08/09/2026

`Quadro` e `Circuito` são famílias do kernel; `Terminal` ganhou `circuitoId` e
`potenciaW`. Invariantes, quatro comandos, canônico de ida e de volta, cascata
de pavimento e o quadro de cargas derivado (`quadroDeCargas.ts`).

**O ritual do hash, na ordem que o faz valer**: com `KERNEL_VERSION` ainda em
**0.18.0** e as duas famílias JÁ inteiras no lugar, a suíte passou — 3.217
casos, os sete goldens inclusive. Só então o bump para **0.19.0**.

**O que os 12 testes travam:**

- ⚠️ **terminal SEM circuito não ganha as chaves novas.** É o que protege o
  acervo: os desenhos que já têm ponto elétrico foram feitos antes de circuito
  existir, e emitir `circuito: null` neles mudaria a forma canônica — e o hash —
  de cada um;
- **o ponto volta no MESMO circuito**: a referência vai por ÍNDICE na ordem
  canônica, e um índice trocado ligaria a tomada ao circuito de iluminação sem
  erro nenhum — a soma sairia no lugar errado;
- ⚠️ **ponto sem potência é contado à parte.** "160 W em 3 pontos" esconde que um
  deles não tem potência nenhuma, e a soma pareceria completa;
- ⚠️ **ponto fora de circuito aparece, e não some** — é pendência de projeto:
  alguém desenhou a tomada e não disse quem a alimenta;
- **o disjuntor e a seção saem como foram DECLARADOS**, e sem declaração ficam
  nulos — nunca um valor "recomendado";
- **circuito órfão é recusado**: ele é o que um disjuntor DE UM QUADRO protege;
- **apagar o pavimento** leva o quadro e os circuitos dele, e DESLIGA os pontos
  de outros pisos que os citavam, em vez de deixá-los apontando para o vazio.

⚠️ **Um defeito de TDZ apareceu no caminho e o teste o pegou**: a projeção do
terminal referencia o índice do circuito, e o bloco dos circuitos estava ABAIXO
do dos terminais no `projetar`. Todo desenho com ponto elétrico estourava
*"Cannot access before initialization"* — o mesmo defeito que derrubou a vista
3D em 05/09/2026. A ordem dos blocos ali é obrigatória, não estética, e agora
está escrita.

2. **A tela** (~1 d): escolher o circuito de um ponto no painel, gerenciar
   quadros e circuitos, e a tabela do quadro de cargas.
### ✅ FATIA 2 FEITA em 08/09/2026

**O quadro entra pelo canvas**: ferramenta própria em Componentes → Instalações,
um clique, e o símbolo de prancha (retângulo com a diagonal) com o nome ao lado.
⚠️ Ferramenta própria, e não um `tipo` de terminal, porque são coisas opostas: o
terminal CONSOME o circuito e o quadro o ORIGINA. Confundi-los faria uma tomada
poder ter circuitos pendurados nela.

**A seção Elétrica** no painel traz os quadros, os circuitos e o quadro de
cargas — disjuntor, seção, pontos e carga por circuito, com o total do quadro.
Criar circuito é um campo e um botão, ali mesmo.

**No painel do ponto**, o ponto ELÉTRICO ganha o seletor de circuito e a
potência declarada. ⚠️ Os dois campos só aparecem na elétrica: num ponto de água
não significam nada, e um campo que não significa nada é convite a preencher com
qualquer coisa.

**O que os 5 testes de componente travam — e não é o layout:**

- ⚠️ **a tela AVISA que a soma está incompleta** quando algum ponto do circuito
  não tem potência informada. Sem isso, "100 W em 2 pontos" pareceria a carga
  inteira do circuito;
- ⚠️ **os pontos FORA DE CIRCUITO aparecem em destaque** — eles não entram em
  soma nenhuma, e omiti-los faria o quadro parecer completo;
- ⚠️ **nada é sugerido**: sem declaração, disjuntor e seção ficam **vazios**, e a
  tela diz com todas as letras que não dimensiona. Um valor de partida ali
  viraria recomendação na cabeça de quem lê;
- em branco é **não informado**, não zero, e a tela explica a diferença no campo;
- sem quadro nenhum, ela explica onde criar um em vez de mostrar tabela vazia.

**Conferido de olho no app** (servidor novo, login real): o item "Quadro de
distribuição" está no menu, e a seção Elétrica abre com a frase certa. ⚠️ O
harness criou estudos vazios em produção de novo — apagados, com **zero**
restantes conferido de fora.

3. **A remoção** (~0,5 d): aí sim apagar o módulo elétrico — 12 componentes, 2
   serviços, a entrada de menu —, e depois as 11 tabelas.

### ✅ FATIA 3 FEITA em 08/09/2026 — o módulo saiu

**5.812 linhas removidas**: 12 componentes, 2 serviços, `types/electrical.ts`,
`utils/electricalArranjo.ts` e o teste dele, as duas rotas do `AppRouter` e o
item de menu do `Layout`.

**Os resíduos foram atrás**, e um deles importava:

- o estado órfão `activeElectricalProjectId` no `AppRouter`;
- ⚠️ a **permissão** `Projetos Elétricos` na matriz de acessos. Permissão para
  uma tela que não existe é mentira — a linha saiu. Mas os campos
  `canViewElectrical`/`canEditElectrical` **ficam no tipo**, marcados como
  legado: eles estão GRAVADOS no perfil de quem já os tinha, e apagá-los do tipo
  não apaga o dado — só faria o código deixar de saber que ele existe.

⚠️ **E o portão de contexto de organização reprovou, como deveria.** Ele guarda
um baseline de ocorrências de `activeOrganizationId || ''` por arquivo e
**recusa folga**: apagar a rota pagou uma dívida, e o número teve de descer de
31 para 30 com o motivo escrito. Um portão que aceitasse a folga deixaria a
dívida voltar em silêncio.

### ⏳ As 11 tabelas NÃO foram removidas, e é decisão

O plano dizia "e depois as 11 tabelas". Elas ficam, e o motivo é o peso da ação:
apagar código é reversível por git; **`DROP TABLE` não é**. O dado que há lá
dentro é rascunho (`dfdfdf`, potências nulas, zero eletrodutos), mas nada obriga
a destruí-lo hoje — tabela vazia não custa nada, e a migration que as criou
segue no histórico.

Quando alguém quiser, é um comando só, e a conferência de que não há dado real
já está feita neste documento.

## Verificação

| fatia | prova |
|---|---|
| 1 | goldens passam com a versão ANTIGA e as famílias já em pé; desenho sem circuito não ganha chave nenhuma no que é hasheado; a soma por circuito bate com as potências declaradas |
| 2 | escolher o circuito de um ponto e ver a carga do circuito mudar |
| 3 | o módulo sai e nada mais o importa; a suíte e o build seguem verdes |
| todas | suíte, build, `check-ui-standard`, e a tela aberta no app |

## Fora do escopo, e por quê

- **Dimensionamento de qualquer espécie** — ver a seção acima.
- **Fase e retorno** (o `WireAnnotation` da tela velha, com fase/neutro/terra por
  eletroduto). É detalhamento de instalação, não quadro de cargas, e entra
  quando alguém desenhar circuito de verdade e sentir falta.
- **Diagrama unifilar.** É outra representação, e o desenho não a tem.
