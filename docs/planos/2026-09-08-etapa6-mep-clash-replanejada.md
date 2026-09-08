# Etapa 6 (instalações e clash) — replanejada com números medidos

## Pedido original

> replanejar a Etapa 6

O contexto: ao encerrar a Etapa 5 eu disse que a Etapa 6 estava **mal
dimensionada** e precisava ser reescrita antes de ser executada. Este documento
faz isso — e o refaz medindo, não relendo o plano antigo.

## O que o plano antigo dizia

| item | dias |
|---|---|
| modelo de rede como grafo de trechos + conectores | 15 |
| absorver `electrical_*` (o segundo motor de arranjo planar) | 5 |
| clash entre disciplinas e com a estrutura (AABB + refinamento) | 5 |
| **total** | **~25** |

## O que foi MEDIDO em 08/09/2026

**1. Os 5 dias de "absorver `electrical_*`" já foram gastos.** O segundo motor
de arranjo planar (`utils/geometry/roomDetection.ts`) foi apagado em 07/09 e o
editor elétrico passou a chamar o kernel. Esse item está feito.

**2. O grafo de trechos EXISTE como código.** `OpuraElectricalConduit` é
literalmente `sourceId → targetId` com fios anotados, e tem
`ConduitRenderer.tsx` e `ConduitPropertiesSidebar.tsx` para desenhar e editar.
Dimensionar isso em 15 dias foi ler a lacuna errada: não é ausência, é
duplicação.

**3. ⚠️ Mas ele NUNCA carregou uma rede.** Contado no banco de produção:

| tabela | linhas |
|---|---|
| `opura_electrical_projects` | 1 |
| `opura_electrical_plans` | 1 |
| `opura_electrical_rooms` | 1 |
| `opura_electrical_walls` | 1 |
| `opura_electrical_points` | 8 |
| `opura_electrical_circuits` | 2 |
| `opura_electrical_boards` | 1 |
| **`opura_electrical_conduits`** | **0** |
| `opura_electrical_takeoffs` | 0 |

Onze tabelas, 12 componentes, 2 serviços e 8 migrations para 15 linhas de dado.
O módulo é um protótipo que nunca virou uso.

**4. ⚠️ E ele não conversa com a Planta Inteligente. Nada.** Nenhum arquivo de
um cita o outro — conferido nos dois sentidos. São dois mundos:

| | módulo elétrico | Planta Inteligente |
|---|---|---|
| base do desenho | uma IMAGEM (`fileUrl` + `scaleFactor`) | modelo paramétrico |
| unidade | pixel | milímetro inteiro |
| identidade | id de linha | `uid` estável entre revisões |
| versão | `versions` própria | snapshot com hash |
| tem IFC, quantitativo, comentário, aprovação, GED | não | sim |

**5. Hidráulica e esgoto não existem em lugar nenhum.** A única ocorrência de
"hidráulica" no código é uma categoria do catálogo de manutenção.

**6. ⚠️ O clash NÃO parte do zero — e isso o plano antigo não sabia.**
`utils/blueprintKernel/sobreposicao.ts` já mede interseção **volumétrica** entre
parede e estrutura: área comum em planta × faixa vertical em que os dois
convivem. Ele nasceu de um problema de DINHEIRO (o mesmo metro cúbico sendo pago
como concreto e como alvenaria), não de imagem, e já entra no quantitativo.
A forma do dado — `{ aId, bId, areaPlantaMm2, alturaMm, volumeMm3 }` — é
exatamente a que uma tubulação precisa.

## A decisão que este replano tem de tomar

**Sobre QUAL modelo o MEP nasce?** É a única pergunta que importa, porque tudo
depois dela é consequência.

**Decisão: no KERNEL.** As instalações entram como uma família do
`BlueprintModel`, ao lado de estrutura, telhado e escada.

Por quê, com o que foi medido:

- **Não há o que preservar do outro lado.** Zero eletrodutos. Migrar 8 pontos e
  1 ambiente é trabalho de uma tarde, e nada obriga a fazê-lo hoje.
- **Tudo o que as Etapas 1 a 5 construíram vale só para o kernel**: `uid`
  estável, hash de versão, diff entre revisões, IFC, quantitativo, comentário
  ancorado em elemento, aprovação, publicação no GED. Nascer fora é abrir mão
  das cinco etapas de uma vez — e depois pedi-las de novo, uma a uma.
- **Clash exige UM sistema de coordenadas.** Duas bases significam uma conversão
  no meio da verificação de segurança, e a conversão seria pixel↔milímetro com
  fator vindo de uma imagem — o mesmo defeito de tolerância-em-pixel que o
  arranjo acabou de eliminar.
- **O elétrico não é apagado.** Ele continua onde está, funcionando como está,
  enquanto tiver quem o use. Aposentá-lo é decisão futura, e barata quando vier.

## ⚠️ A parte de verdade difícil: o Z

O kernel é **2D com alturas**: `Point` tem `x` e `y` inteiros em milímetro, e a
terceira dimensão vem de `heightMm`, `baseMm`, `elevationMm` do pavimento. Isso
não é limitação acidental — é o que faz o arranjo planar, o hash e as goldens
funcionarem.

**Uma rede é genuinamente tridimensional.** Um eletroduto sobe pela parede,
corre no forro e desce até a tomada. Um esgoto tem CAIMENTO — ele precisa de
cotas diferentes nas duas pontas, e a inclinação é o que o faz funcionar.

**Como resolver sem pôr `z` no `Point`** (que quebraria o hash de todo o acervo
e o invariante do arranjo):

> Um `Trecho` é `a`/`b` em planta **mais duas cotas**, `cotaAMm` e `cotaBMm`,
> medidas do piso do pavimento.

Isso cobre:

- corrida horizontal numa altura (`cotaA === cotaB`);
- **prumada** (`a === b`, cotas diferentes) — o trecho vertical;
- **caimento** de esgoto (cotas diferentes ao longo de um trecho horizontal), que
  é o caso em que errar é caro e silencioso.

O que NÃO cobre, e sai declarado: trecho em diagonal nos três eixos ao mesmo
tempo. Em instalação predial isso praticamente não ocorre, e fingir que cobre
seria pior do que dizer que não cobre.

⚠️ **E o `Trecho` NÃO participa do arranjo planar** — pela mesma razão que
estrutura, telhado e escada não participam: um cano atravessando a sala não parte
o ambiente. Se entrasse no grafo, área de piso, rodapé e revestimento mudariam
por causa de um encanamento.

## Fatias

### F1 — A rede como família do kernel (~4 d)

`Trecho` com `uid`, `levelId`, `a`/`b`, `cotaAMm`/`cotaBMm`, `disciplina`
(`ELETRICA` · `AGUA_FRIA` · `AGUA_QUENTE` · `ESGOTO`), `bitolaMm` e `itemCode`;
`Terminal` (tomada, ponto de água, ralo) com `uid`, ponto, cota e `itemCode`.
Entram no payload canônico, no hash e no diff.

⚠️ **O ritual do kernel vale inteiro**: campo novo OMITIDO quando ausente,
goldens passando com a versão ANTIGA e a família já em pé, e só então o bump de
`KERNEL_VERSION`.

Quantitativo por trecho: comprimento por disciplina e bitola — que é como se
compra cano e eletroduto.

**A prova**: uma prumada de 2,80 m entre dois pavimentos mede 2,80 m, e não zero
(que é o que um comprimento calculado só em planta daria); e um esgoto com
caimento de 2% em 10 m mede o comprimento INCLINADO.

### ✅ F1 FEITA em 08/09/2026

`Trecho` e `Terminal` são famílias do `BlueprintModel`, com `uid`, invariantes,
quatro comandos (`AddTrecho`, `SetTrechoProps`, `AddTerminal`,
`SetTerminalProps`), payload canônico de ida e de volta, cascata ao apagar o
pavimento e quantitativo.

**O ritual do hash foi cumprido na ordem que o faz valer**: com
`KERNEL_VERSION` ainda em **0.17.0** e as instalações JÁ inteiras no lugar, a
suíte passou — 3.162 casos, os sete goldens inclusive. Só então veio o bump para
**0.18.0**, e as seis falhas foram **todas de hash, nenhuma de geometria** (as
contagens 9/49/144/3/78/4 são afirmadas na linha ANTES do hash e não falharam em
momento nenhum).

**O que os testes travam:**

- ⚠️ **A PRUMADA de 2,80 m mede 2,80 m, e não zero.** As duas pontas estão no
  mesmo lugar em planta; um comprimento calculado só em planta faria a obra
  comprar zero metro de eletroduto para o trecho que sobe pela parede.
- **O esgoto com caimento mede o comprimento INCLINADO**, e a fórmula mostra a
  conta — quem confere o número não precisa adivinhar de onde ele saiu.
- **A cota pode ser NEGATIVA** (esgoto enterrado) e passar do pé-direito (o
  trecho que atravessa a laje). Um teto ali recusaria desenho correto.
- ⚠️ **A recusa de trecho degenerado olha os TRÊS eixos.** Conferir só a planta
  recusaria toda prumada — o trecho mais comum de uma instalação.
- **A linha de compra agrupa por disciplina E bitola**: eletroduto de 25 mm e
  cano de água de 25 mm não somam, porque são compras diferentes.
- **Desenho sem instalação não ganha chave nenhuma no que é hasheado** — a
  asserção é sobre `payloadDoHash`, porque o sidecar `identity` traz um array
  por família sempre, e ele fica fora do hash de propósito.

⏳ **Fora desta fatia, e de propósito**: desenhar na tela (é a F2). Os comandos
existem e são testados; o que não existe ainda é a ferramenta no canvas.

### F2 — Desenhar e ver (~4 d)

Ferramenta de trecho no canvas 2D, com encaixe nas paredes e nos terminais; o
trecho aparece no 3D na cota certa; painel de propriedades com disciplina e
bitola. Reusa o que já existe — seleção múltipla, copiar/colar, snap.

### ✅ F2 FEITA em 08/09/2026

**A geometria mora fora da tela.** `utils/blueprintRede.ts` guarda tudo o que dá
para decidir sem DOM — o cilindro do trecho no 3D, o ponto do terminal, o
encaixe, as tabelas de partida. ⚠️ Isso não é organização: `Blueprint3DViewer.tsx`
está sob `@ts-nocheck`, e um sinal trocado ali não é acusado por nada — o sintoma
é um cano deitado ou num andar errado, plausível demais para alguém notar.

**O que os 16 testes travam:**

- ⚠️ **A PRUMADA é o caso TRIVIAL** — eixo `(0,1,0)`, rotação identidade. O
  `CylinderGeometry` do three nasce alinhado ao Y; com outra convenção, o trecho
  mais comum de uma instalação seria o mais fácil de errar.
- ⚠️ **O Y da planta vira o Z do 3D**, e não o Y. Trocar os dois deita a
  instalação inteira, sem erro nenhum.
- ⚠️ **A elevação do pavimento entra na cota** — senão tudo do andar de cima cai
  no térreo, e o desenho continua plausível.
- ⚠️ **O encaixe traz a COTA junto.** Encaixar só em planta faria o cano passar
  exatamente por cima da tomada, dois metros acima dela — e pareceria ligado.
- **O encaixe ignora terminal de outro pavimento**, mesmo colado.

**Na tela**: menu Componentes com dois grupos novos — quatro trechos e quatro
pontos, um ícone por item. Em planta, traço fino na cor da disciplina, esgoto
tracejado (a convenção de prancha para o que corre enterrado) e a **prumada como
CÍRCULO** — desenhada como linha ela sumiria, já que as duas pontas estão no
mesmo lugar. No 3D, cilindro na cota certa. No painel, **as duas cotas como
campos separados**: é o que faz prumada e caimento deixarem de ser modos e
passarem a ser o que os dois números dizem.

**Conferido de olho no app** (servidor novo, login real): o editor monta, o menu
mostra os oito itens com os ícones certos, e não há erro de página.

⚠️ **E o harness criou DOIS estudos vazios em produção** ao abrir o editor.
Os dois foram apagados e a conferência de fora deu **zero** estudos restantes.

⏳ **Fora desta fatia**: mover e apagar trecho pela seleção múltipla (a criação e
a edição por painel existem; arrastar ainda não), e o trecho na vista de
elevação e de corte.

### F3 — Clash (~3 d)

Estender `sobreposicao.ts` para os trechos.

⚠️ **A saída é OUTRA, e é o ponto mais fácil de errar.** Parede × pilar é
problema de DINHEIRO e vira desconto no quantitativo. Cano × viga é problema de
COORDENAÇÃO e não vira desconto nenhum — vira uma pendência para alguém decidir.
Reusar o mesmo caminho faria a tubulação descontar volume de concreto, que é
exatamente o erro que `sobreposicao.ts` existe para impedir.

**A prova**: um cano atravessando uma viga aparece como conflito **e** o volume
de concreto da viga NÃO muda.

### ✅ F3 FEITA em 08/09/2026

`utils/blueprintKernel/conflitos.ts`, com **saída própria** — e é o ponto todo
da fatia. Ele reusa a `pegadaEmPlanta` de `sobreposicao.ts` (uma verdade só para
a pegada da peça) e **não toca no quantitativo**.

**A prova que o plano pediu, nas duas metades:**

- o cano que atravessa a viga aparece como conflito, com **200 mm por dentro** —
  a largura dela;
- e o **volume de concreto da viga não muda**: nem o total, nem a peça, e a
  lista de sobreposições — a que vira desconto — continua vazia.

**⚠️ Uma decisão de domínio que o plano não previa: cano dentro de PAREDE não é
conflito.** É onde ele mora. Eletroduto sobe embutido na alvenaria, e rasgo em
parede é rotina de obra. Acusar cada um encheria a lista de centenas de linhas
normais — e a primeira consequência de uma lista assim é ninguém mais olhar,
inclusive nos casos em que a viga está de fato no caminho. Entram só
**trecho × estrutura** e **trecho × trecho de outra disciplina** (mesma
disciplina é junção, que é a rede funcionando).

**O resto do que os 13 testes travam:**

- ⚠️ **a espessura conta**: um cano de 100 mm com o eixo 40 mm abaixo da face da
  viga conflita, e 60 mm mais abaixo não. Tubulação não é uma linha;
- ⚠️ **cruzar em planta não basta** — a distância entre disciplinas é medida em
  TRÊS dimensões. Em planta, cada cruzamento de traço viraria conflito;
- o cano que passa abaixo da viga não conflita — é a cota provando o seu valor;
- o conflito carrega o **uid** dos dois lados, não só o id: uma pendência de
  coordenação sobrevive à publicação, e ancorá-la no id a faria mudar de dono na
  revisão seguinte.

⚠️ **Um defeito meu que o teste pegou**: a distância entre eixos travava `s` e
`t` em [0,1] e parava aí. No ramo PARALELO, em que `s` é fixado em zero por não
haver solução única, o erro era grosseiro — `[0,1]` contra `[10,11]` no eixo x
dava **10**, e são **9**. Passou a tomar também o mínimo das quatro pontas
contra o outro segmento.

**Na tela**: seção "Conflitos" no painel, com a contagem no cabeçalho e uma
linha por par, dizendo se é travessia (metros por dentro) ou de raspão
(milímetros entre eixos). ⚠️ **Sem botão de "resolver"**: a lista é DERIVADA e
some sozinha quando o desenho deixa de ter o problema. Um estado "conhecido e
ignorado" sobreviveria à correção, e a lista passaria a mentir nos dois
sentidos.

### F4 — IFC (~2 d)

`IfcFlowSegment` por trecho e `IfcFlowTerminal` por terminal, com
`IfcDistributionSystem` por disciplina, `Pset_OpuraPlanta` e as quantidades. A
cobertura do arquivo passa a dizer que CONTÉM instalações — hoje ela diz o
contrário, e essa frase é requisito.

⚠️ Passa pelos dois portões que a interoperabilidade ganhou em 07/09: a
contagem de atributos contra IFC4 real e a ida e volta pelo nosso próprio
leitor.

### ✅ F4 FEITA em 08/09/2026

Cada trecho sai como `IfcFlowSegment` — um cilindro na bitola declarada, ao
longo do eixo — e cada ponto como `IfcFlowTerminal`. Um `IfcDistributionSystem`
por disciplina **presente** agrupa a rede, com o enum do IFC4
(`.ELECTRICAL.` · `.DOMESTICCOLDWATER.` · `.DOMESTICHOTWATER.` · `.SEWAGE.`).

⚠️ **O sistema atravessa PAVIMENTOS de propósito**: a coluna de esgoto que desce
três andares é UMA rede. Um sistema por pavimento a partiria em três, e quem
recebe perderia justamente a ligação entre eles.

⚠️ **O eixo do trecho é o Z LOCAL da peça**, e a extrusão é sempre `(0,0,1)`.
Assim a PRUMADA é o caso trivial — o mesmo desenho que o 3D da tela já usava. A
alternativa (Z sempre para cima, direção de extrusão inclinada) faria o cano
vertical ser o caso especial, que é o mais comum de uma instalação.

**A cobertura mudou, e essa frase é requisito.** Ela dizia *"NÃO CONTÉM
instalações de nenhuma disciplina"* — deixou de ser verdade, e uma cobertura
desatualizada é pior que nenhuma: ela AFIRMA a ausência de algo que está no
arquivo. Agora declara o que entrou, e o que continua de fora: conexão (joelho,
tê, luva), registro, quadro, dimensionamento de qualquer espécie, e
ar-condicionado, gás e incêndio.

### ⚠️ Os dois portões, e o que eles revelaram

**O portão de contagem passou sem tocar nas entidades novas.** A casa de prova
não tinha instalação, então ele nunca olhou `IfcFlowSegment`. Um portão que
passa sem tocar no que deveria guardar é pior que nenhum — dá impressão de
cobertura. A casa de prova ganhou um ponto, uma prumada e um esgoto com
caimento, e aí ele acusou as **cinco** entidades sem par no mundo real.

E não há par: procurei em TODOS os IFC ao alcance — os dois de referência e os
três projetos da empresa. **Nenhum contém MEP.** Então:

- `IfcCircleProfileDef` foi conferido contra um IFC4 real: o projeto estrutural
  da empresa tem **759** delas, todas com 4 atributos e `Position` por
  referência — a mesma lição do perfil retangular;
- as outras quatro têm o `web-ifc` como árbitro, que traz o schema IFC4
  compilado. Os casos não CONTAM entidades: conferem que cada valor chegou no
  **campo certo** (`Name` com o rótulo, `Tag` com o identificador, o
  `PredefinedType` com o enum). Com a contagem errada os atributos escorregam de
  casa, e `Name` volta onde deveria estar `Description`.

A dispensa está declarada com todas as letras, e diz o que fazer quando um
arquivo com MEP aparecer: apontar o portão para ele e apagar as cinco linhas.

⚠️ **E a prova geométrica: a prumada mede 2,20 m de altura no sólido lido de
volta.** Se o eixo local não fosse a direção do trecho, ela sairia como um disco
— e o receptor mostraria nada onde há um cano subindo pela parede. **Duas
tentativas minhas de medir isso estavam erradas antes de acertar**: primeiro
esperei metro onde o vértice cru vem na unidade do arquivo, depois li o vértice
no sistema LOCAL da geometria, onde o Y é o diâmetro e não a altura. As duas
mediram 98,98 — o cano de esgoto de 100 mm, deitado. O código estava certo nas
duas vezes.

### F5 — Absorver o módulo elétrico (~2 d, **só quando alguém pedir**)

Migrar os 8 pontos e ligar a tela antiga ao kernel, ou aposentá-la. Fica fora
das quatro primeiras de propósito: não há pressão nenhuma vinda do uso, e fazer
antes seria trabalho contra dado que não existe.

### ✅ F5 FEITA em 08/09/2026 — e a medição mudou o que ela é

**Não há o que migrar.** Olhando o dado antes de mexer nele:

| o que | o que está lá |
|---|---|
| os 8 pontos | 6 tomadas e 2 luminárias, **nenhuma com potência**, **nenhuma num circuito** |
| os 2 circuitos | `Iluminação` e **`dfdfdf`** |
| disjuntor, seção de fio, potência instalada | **NULL** nos dois |
| eletrodutos | **0** |

`dfdfdf` é digitação de teclado. O módulo é protótipo de ponta a ponta, e migrar
isso para o kernel seria fabricar dado de produção a partir de um rascunho.

**Mas ele também NÃO pode ser simplesmente apagado**, e isso o plano não previa:
ele tem **quadro de cargas** — quadros, circuitos, disjuntor, seção de fio,
fator de demanda — e o kernel não tem. Dimensionamento elétrico está declarado
FORA do escopo desta etapa. Aposentar a tela levaria junto uma capacidade que
existe, ainda que nunca usada.

**O que foi feito, então, é o que impede o estrago começar**: a tela de Projetos
Elétricos abre com um aviso de **módulo legado**, dizendo que o desenho de
instalações passou para a Planta Inteligente, com um atalho para lá, e dizendo
por que ela continua existindo (o quadro de cargas).

⚠️ **O pior desfecho não é ter dois lugares** — é alguém começar um projeto de
verdade no protótipo sem saber que o outro existe, e descobrir depois que o
trabalho não atravessa para o IFC, nem para o orçamento, nem para a verificação
de conflito. O aviso resolve isso hoje, sem apagar nada.

⏳ **A remoção continua em aberto, e é decisão de quem usa**, não minha: são
5.122 linhas em 12 componentes e 2 serviços, 11 tabelas, e ela leva junto o
quadro de cargas. O caminho honesto é o kernel ganhar circuito e quadro
primeiro — aí a tela velha não perde nada ao sair.

| | dias |
|---|---|
| F1 rede no kernel | 4 |
| F2 desenhar e ver | 4 |
| F3 clash | 3 |
| F4 IFC | 2 |
| **total (sem F5)** | **13** |

Contra os 25 do plano antigo. A diferença não é otimismo: são os 5 dias já
gastos no arranjo, o clash que já tem metade pronta, e o modelo de rede que
deixou de ser 15 dias de zero para ser 4 dias de família nova num kernel que já
sabe versionar, exportar, comentar e aprovar.

## Fora do escopo, e por quê

- **Dimensionamento** (queda de tensão, perda de carga, diâmetro mínimo por NBR).
  É cálculo de projeto, não modelagem, e cada disciplina tem a sua norma. O que
  este plano entrega é a rede desenhada e medida; dimensioná-la é outro PRD.
- **Ar-condicionado, gás e incêndio.** A estrutura de `disciplina` os aceita sem
  mudança; entram quando alguém os pedir.
- **BCF**, que é a ponte para levar o conflito ao Revit e ao Navisworks. Já está
  na fila como fatia própria da Etapa 5.
- **Rota automática** (o software achar o caminho do cano sozinho). É um
  problema de otimização inteiro, e desenhar à mão resolve o que se precisa
  agora.
