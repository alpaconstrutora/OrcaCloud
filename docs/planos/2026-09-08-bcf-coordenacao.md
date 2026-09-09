# BCF — a pendência sai do OrçaCloud

## Pedido original

> Qual o próximo etapa / passo ?
>
> Bcf

Recomendado por mim e escolhido pelo usuário, com esta justificativa: das
pendências registradas, o BCF é a que mais cresceu de valor durante a sessão sem
ninguém tocar nela.

## Por que agora, e não antes

Passamos a produzir **duas** espécies de pendência, e as duas morriam aqui
dentro:

- o **comentário ancorado em elemento** (Etapa 5, fatia 1);
- o **conflito** entre instalação e estrutura (Etapa 6, F3).

Quem precisa desviar o cano é o projetista, e ele trabalha no Revit, no
Navisworks ou no Solibri. Sem BCF, a lista de conflitos é um relatório interno:
correto, completo e **invisível para quem tem de agir**.

## ⚠️ O GUID é a coisa mais importante desta frente

O BCF **não descreve** o elemento: ele o **aponta**, por `IfcGuid`. Se o guid do
tópico não for byte a byte o mesmo do IFC que o acompanha, o receptor abre a
pendência e **não seleciona nada** — e isso é pior que não exportar, porque o
arquivo parece funcionar e a coordenação segue com todo mundo achando que
avisou.

Por isso o guid sai de `ifcGuidDeUid`, a **mesma função** do exportador de IFC, e
não de uma reimplementação. E isso só é possível por causa da **Etapa 1**: antes
do `uid` estável, o guid mudava a cada publicação, e a pendência de hoje
apontaria para outra parede amanhã.

**O teste que vale por todos os outros** gera o IFC e o BCF do mesmo desenho e
exige que o guid do tópico esteja **dentro** do IFC.

## ⚠️ A câmera, que era a dúvida registrada no plano da Etapa 5

O plano dizia: *"a câmera exige decidir o que é 'a vista' de um comentário 2D"*.

A resposta: o nosso editor é 2D e **não há estado de navegação 3D para
capturar**. Em vez de inventar um enquadramento que afirmaria um ponto de vista
que ninguém escolheu, sai uma câmera **ortogonal olhando de cima**, centrada na
pendência — que é exatamente a vista em que ela foi criada.

E isso importa menos do que parece: o que faz o trabalho do outro lado é o
`Components/Selection`, que manda o receptor **destacar as peças**. A câmera é
conveniência; a seleção é a mensagem.

## O que ficou feito

`utils/blueprintBcf.ts` (puro) monta os arquivos do BCF 2.1: `bcf.version`, e
por tópico um `markup.bcf` e um `viewpoint.bcfv`, cada um numa pasta com o guid
do tópico. `montarBcf` no serviço de exportação zipa com `pizzip` — por
`import()` dinâmico, como o `docxRenderService` já faz.

O botão vive na seção **Conflitos** do painel. ⚠️ **Ele aparece mesmo sem
conflito nenhum**, e é de propósito: o BCF leva também os comentários, e um
desenho pode ter zero conflitos e dez comentários para o projetista. Esconder o
botão trancaria metade da coordenação atrás de um conflito.

### O que os 14 testes travam

- ⚠️ **o guid do tópico está dentro do IFC** do mesmo desenho, e sai da mesma
  função — não de uma cópia;
- ⚠️ **exportar duas vezes não duplica a pendência**: o guid do tópico é
  DERIVADO do par de uids que ele aponta. Sem isso, cada rodada de coordenação
  encheria a caixa de entrada de quem recebe, e ninguém diria o que é novo;
- ⚠️ **a câmera está em METRO** e o kernel em milímetro — errar põe a câmera a
  3 km do modelo, e quem abre vê o vazio;
- ⚠️ **o comentário RESOLVIDO viaja como `Closed`**, e não é omitido: quem
  recebe precisa saber que aquilo já foi decidido, senão reabre a discussão;
- o `Selection` leva os componentes — sem ele o receptor chega ao lugar certo
  sem saber o que olhar, num modelo com dezenas de peças ali;
- o XML escapa `&` e `<`, e o título é a primeira linha do comentário (um título
  de 400 caracteres inutiliza a lista de quem recebe);
- ⚠️ **o `.bcfzip` é lido DE VOLTA**: montar os arquivos e zipá-los são duas
  coisas, e a segunda falha sozinha. O caso abre o pacote e confere que o guid
  do elemento sobreviveu ao zip.

## ⚠️ O que este trabalho NÃO faz

**IMPORTAR BCF.** O ciclo fecha quando o projetista responde no Revit e a
resposta volta — e isso exige decidir o que fazer com tópico que não casa com
elemento nenhum, com tópico fechado lá e aberto aqui, e com comentário escrito
do outro lado. É fatia própria, e a estrutura de leitura já está meio pronta
(o mesmo XML, lido em vez de escrito).

**Snapshot PNG por tópico.** O BCF o aceita e alguns receptores o mostram na
lista. O nosso canvas sabe gerar imagem; o que falta é decidir o recorte, e um
recorte errado é pior que nenhuma imagem.

**O BCF não substitui o IFC — ele o acompanha.** A tela diz isso com todas as
letras, porque um BCF sozinho abre sem nada para selecionar.

## ✅ CONFERIDO CONTRA O SCHEMA OFICIAL em 08/09/2026

O usuário reportou que o Solibri Anywhere foi descontinuado e que o BIMcollab
não abriu o arquivo. Em vez de mandá-lo procurar um terceiro programa, fui ao
**árbitro que existe sem software nenhum**: os XSD publicados do BCF 2.1
(`markup.xsd` e `visinfo.xsd`, buildingSMART).

⚠️ **Ordem importa em `xs:sequence`**: um elemento fora de lugar faz um validador
estrito recusar o arquivo inteiro — e o receptor que recusa não costuma dizer
por quê. As regras viraram **7 casos**, e todas passaram:

- `markup`: `Topic` antes de `Viewpoints`, os dois com `Guid`;
- `Topic`: `Title` → `CreationDate` → `CreationAuthor` → `Description`;
- `viewpoint`: `Components` antes da câmera, `Selection` antes de `Visibility`;
- ⚠️ **`Visibility` é OBRIGATÓRIO** dentro de `Components` — é o único filho
  obrigatório dele, e a falta não apareceria em leitura nenhuma;
- a câmera com os **quatro** filhos na ordem;
- ⚠️ **`IfcGuid` é ATRIBUTO**, com **22 caracteres** de `[0-9A-Za-z_$]` — a
  mesma compressão do IFC, e é por isso que o guid serve dos dois lados.

**E o XSD corrigiu um entendimento meu**: `ViewToWorldScale` é o **tamanho
visível da vista em metros**, não um fator de zoom. O valor (10 m) estava certo
por acaso; agora está certo por razão, e o comentário diz qual.

⏳ **O que isto NÃO substitui**: abrir num receptor de verdade. O schema garante
que o arquivo é VÁLIDO; só o receptor mostra se clicar no tópico **seleciona a
peça**. O risco residual caiu muito — o guid já foi provado presente no IFC —,
mas a conferência final continua valendo quando houver um programa à mão
(BCFier para Revit, ou usBIM, ambos gratuitos).

## ✅ LER BCF — e a verificação parou de depender de terceiro

O usuário não conseguiu nenhum software que abrisse BCF. Em vez de continuar
esperando, fui pelo caminho que já era a próxima fatia — **um leitor nosso** — e
busquei o árbitro externo onde ele existe: o repositório do buildingSMART tem
**casos de teste oficiais**, e o "Component Selection" traz um `markup.bcf` e um
`viewpoint.bcfv` escritos pela biblioteca `iabi.BCF` em 2017.

Eles estão em `bim-spike/samples/bcf/`, ao lado dos dois IFC4 de referência, e o
teste PULA declarando o motivo quando não os encontra.

**O que o leitor prova, contra o arquivo DELES:**

- entende o markup: guid, título, autor, data e descrição;
- lê o `Header` — de que IFC a pendência fala;
- acha os **três** componentes do viewpoint;
- ⚠️ e o nome do viewpoint deles **não é** `viewpoint.bcfv`, é
  `Viewpoint_<guid>.bcfv`. Um leitor que presumisse o nosso nome não acharia o
  arquivo, e a seleção sumiria sem erro nenhum.

**E contra o nosso**, a ida e volta afirma sobre os **dados de origem** — o
conflito que gerou o tópico —, e não sobre o XML intermediário: dois lados meus
podem partilhar o mesmo engano, e comparar o lido com o escrito aceitaria isso.

O leitor também aguenta o mundo real: prefixo de namespace (`bcf:Topic`), aspas
simples, e escape de XML no texto.

### ⚠️ Duas faltas minhas que a comparação revelou

**1. O `Header/File` não existia.** O arquivo real abre declarando qual IFC os
tópicos acompanham — GUID do `IfcProject`, nome e caminho. Sem ele, o receptor
tem guids e nenhuma pista do modelo, e o "mande o IFC junto" era uma frase na
nossa tela em vez de um dado no arquivo. Agora sai, com o `IfcProject` derivado
da MESMA função que o `gerarIfc` usa.

**2. E o arquivo de prova gravava o IFC com o nome ERRADO.** O `Header` dizia
`prova-bcf-v1.ifc` e eu escrevia `prova.ifc` — um receptor que siga o
`Reference` procuraria um arquivo que não existe, e a pendência abriria sem
modelo. **Declarar um nome e gravar outro é pior que não declarar.** Virou caso
de teste.

⏳ **O que ainda falta**: a TELA de importação. O leitor e o casamento com o
modelo existem e estão provados; o que não existe é o painel que mostra as
pendências que voltaram e deixa alguém agir sobre elas.

## ✅ A TELA DE IMPORTAÇÃO — o ciclo fecha

Seção **"Do BCF"** no painel, irmã de "Do PDF", "Do IFC" e "Do DXF" — e a única
das quatro que traz **pendência** em vez de geometria. Escolhe o `.bcfzip` que
voltou, e ele é casado com o desenho pelo identificador de cada elemento.

⚠️ **A tela mostra de propósito o que NÃO casou.** Um BCF de coordenação fala do
modelo de quem o escreveu, que tem peças que não são nossas — e pode falar de
peças que **alguém apagou daqui**. Esconder esses tópicos deixaria a lista bonita
e mentirosa: o caso mais importante de todos é justamente a pendência sobre a
parede que sumiu. Os dois grupos aparecem, e o que não casou vem com o motivo.

Cada pendência casada traz um botão **"achar no desenho"** que seleciona a peça.
A ponte é o `uid` — e ela existe por causa da Etapa 1.

⚠️ **E a importação NÃO GRAVA nada**, por decisão declarada na tela: virar
comentário do estudo precisa de uma coluna para o guid do tópico. Sem ela,
reimportar o mesmo arquivo criaria os comentários de novo e a discussão
duplicaria a cada rodada de coordenação. **Gravar sem essa coluna seria mais
rápido hoje e caro na segunda importação.**

### O ciclo, provado ponta a ponta

O teste exporta, zipa, **lê o zip de volta pelo mesmo caminho que um receptor
percorreria** — abrir, achar os markups, seguir o nome do viewpoint declarado,
ler os componentes — e casa com o modelo. As pendências voltam apontando os
**mesmos elementos do conflito de origem**, e o `Header` sobrevive ao zip.

⚠️ E há um caso para o arquivo de OUTRA ferramenta: um zip montado à mão com
`Viewpoint_v1.bcfv` — o padrão do buildingSMART — para provar que o leitor segue
o **nome declarado** e não um nome fixo nosso.

## ✅ O TÓPICO IMPORTADO VIRA COMENTÁRIO — 09/09/2026

Migration `aplicar_20270920000007_blueprint_comments_bcf_topic.sql`: a coluna
`bcf_topic_guid` e a unicidade por `(study_id, bcf_topic_guid)`.

### ⚠️ O índice NÃO é parcial, e isso é o coração da fatia

A forma "natural" seria `WHERE bcf_topic_guid IS NOT NULL`, para cobrir só o que
veio de BCF. Ela **quebra o upsert**: o PostgREST emite
`ON CONFLICT (study_id, bcf_topic_guid)`, que não casa com índice PARCIAL, e a
escrita falha com **42P10**. É um erro já pago neste sistema.

O índice cheio resolve sem custo: no PostgreSQL **NULL é distinto de NULL** num
índice único, então os comentários escritos à mão — todos com o campo nulo —
convivem sem restrição. A unicidade morde só onde o valor existe.

### ⚠️ E a prova é a SEGUNDA importação, não a primeira

`db query` roda como `postgres` e bypassa a RLS — não responde "a escrita
passa?". Uma sessão autenticada de verdade, contra a produção, revertida:

```
login ok
rodada 1 gravada ✓
rodada 2 gravada ✓ (sem 42P10)
linhas com este tópico: 1 (tem de ser 1)
texto: "rodada 2 — respondido e fechado"
resolvido: sim
REVERTIDO — comentários de teste restantes: 0
```

**Reimportar é o NORMAL**: a rodada 2 de uma coordenação traz os tópicos da
rodada 1 dentro, respondidos. Sem isso, cada rodada duplicaria a discussão
inteira, e em três rodadas ninguém mais acharia nada.

### As decisões da tela

- **Guarda TUDO, inclusive o que não casou.** Guardar só o que casou perderia
  justamente a pendência sobre a peça que alguém apagou — a que mais precisa de
  alguém olhando. O que não casa entra ancorado no PONTO em vez do elemento.
- **Fechado do outro lado entra como resolvido aqui.**
- ⚠️ **`resolvido_em` só é MARCADO, nunca apagado.** Se o tópico voltou aberto e
  alguém aqui já o resolveu, quem decidiu foi quem está mais perto do desenho —
  e desfazer isso porque o arquivo do projetista está desatualizado apagaria uma
  decisão nossa em silêncio.
- A tela **diz** que reimportar atualiza em vez de duplicar. Quem não souber
  disso evita reimportar com medo, e o recurso morre de desconfiança.

## Verificação

| o quê | prova |
|---|---|
| o guid | o `IfcGuid` do tópico está dentro do IFC gerado do mesmo desenho |
| idempotência | dois envios do mesmo conflito dão o mesmo guid de tópico |
| o zip | o `.bcfzip` é reaberto e os três arquivos estão nos caminhos certos |
| a unidade | a câmera sai em metro |
| tudo | suíte 3.225 · build · `check-ui-standard` |
