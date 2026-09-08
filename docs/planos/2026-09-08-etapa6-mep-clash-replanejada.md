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

### F3 — Clash (~3 d)

Estender `sobreposicao.ts` para os trechos.

⚠️ **A saída é OUTRA, e é o ponto mais fácil de errar.** Parede × pilar é
problema de DINHEIRO e vira desconto no quantitativo. Cano × viga é problema de
COORDENAÇÃO e não vira desconto nenhum — vira uma pendência para alguém decidir.
Reusar o mesmo caminho faria a tubulação descontar volume de concreto, que é
exatamente o erro que `sobreposicao.ts` existe para impedir.

**A prova**: um cano atravessando uma viga aparece como conflito **e** o volume
de concreto da viga NÃO muda.

### F4 — IFC (~2 d)

`IfcFlowSegment` por trecho e `IfcFlowTerminal` por terminal, com
`IfcDistributionSystem` por disciplina, `Pset_OpuraPlanta` e as quantidades. A
cobertura do arquivo passa a dizer que CONTÉM instalações — hoje ela diz o
contrário, e essa frase é requisito.

⚠️ Passa pelos dois portões que a interoperabilidade ganhou em 07/09: a
contagem de atributos contra IFC4 real e a ida e volta pelo nosso próprio
leitor.

### F5 — Absorver o módulo elétrico (~2 d, **só quando alguém pedir**)

Migrar os 8 pontos e ligar a tela antiga ao kernel, ou aposentá-la. Fica fora
das quatro primeiras de propósito: não há pressão nenhuma vinda do uso, e fazer
antes seria trabalho contra dado que não existe.

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
