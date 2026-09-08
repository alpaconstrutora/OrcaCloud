# O IFC que sai daqui: paredes e portas que um receptor não mostra

## Pedido original

> abri o ifc no revit o que exatamente voce quer que eu veja ?
>
> Arquivo → Abrir → IFC: abriu telhado e escada, nao apreceram portas e paredes

## O que se sabia, e por que teoria não decidia

O arquivo de prova (`C:/tmp/prova-ifc/prova-planta-inteligente.ifc`) abriu num
receptor de terceiro mostrando **telhado e escada**, e nenhuma **parede** nem
**porta**. Havia um padrão tentador: parede e porta são justamente os elementos
ligados por `IfcRelVoidsElement` — o vão fura a parede, a porta preenche o vão —
e telhado e escada não têm vão nenhum.

⚠️ **Conferi a estrutura antes de acusar o vão, e ela estava certa**: as quatro
paredes existiam, contidas no pavimento, com `ObjectPlacement` e `Representation`
na ordem do schema; o `IfcOpeningElement` tinha 9 atributos terminando em
`.OPENING.`; o `IfcRelVoidsElement`, 6; o placement do vão era relativo ao da
parede. O nosso próprio visualizador (web-ifc) desenhava tudo. Nada ali dizia
qual era o defeito.

## O que decidiu: apontar o NOSSO leitor para o NOSSO escritor

O importador de IFC da Etapa 4 lê bem dois modelos IFC4 reais. Apontado para o
nosso próprio export, ele leu **ZERO paredes**, recusando as quatro com uma
frase só:

> a parede não tem eixo no arquivo, e deduzi-lo do corpo seria estimar

Foi o começo do fio. Puxando-o até o fim, apareceram **cinco defeitos reais**,
cada um encontrado só depois de o anterior ser corrigido — e o quinto só depois
de as paredes já estarem aparecendo do outro lado:

### 1. Parede sem `Axis` — só `Body`

A nossa parede saía com uma representação só, o sólido. Nos dois modelos reais,
`Axis` está em **191 de 191** paredes: é por ele que um receptor reconstrói uma
PAREDE — comprimento, sentido, junção — em vez de um sólido genérico.

⚠️ E o eixo emitido é o **eixo**, não o vão do corpo: o corpo cresce em cada
ponta para fechar o canto (o avanço de mitra), e mandar o corpo faria a parede
chegar do outro lado mais longa do que é. Comprimento vira quantitativo lá.

### 2. `Position` do perfil como `$`

`IfcRectangleProfileDef.Position` é OPCIONAL no schema IFC4 — e mandar `$` mesmo
assim quebra leitores na prática. O `web-ifc` reclamava
`GetRefArgument() unexpected token type, expected REF` em **cada** perfil nosso,
e nos dois modelos reais o `Position` é uma referência em **100%** dos casos.
Cinco lugares emitiam `$`. O que o schema permite e o que o ecossistema aceita
não são a mesma coisa.

⚠️ E os elementos que usam perfil RETANGULAR são exatamente parede, vão, porta,
janela, pilar e viga — os que não apareceram. Telhado e escada usam
`IfcArbitraryClosedProfileDef`, e apareceram.

### 3. Parede homogênea sem composição nenhuma

Parede sem camadas declaradas não emitia material. Era leitura correta do schema
e errada na prática: do lado de lá, "sem camadas" não quer dizer "espessura t",
quer dizer espessura NENHUMA — e quem não quiser chutar tem de recusar, como o
nosso leitor recusou ("a parede não declara composição, e a espessura sairia de
estimativa"). Agora sai **uma camada** da espessura inteira. Não se inventa nada:
a espessura está declarada no modelo; só o MATERIAL sai como "não especificado".

### 4. Quatro entidades de material com atributos a menos

| entidade | nós | IFC4 real |
|---|---|---|
| `IFCMATERIAL` | 1 | 3 |
| `IFCMATERIALLAYER` | 3 | 7 |
| `IFCMATERIALLAYERSET` | 2 | 3 |
| `IFCMATERIALLAYERSETUSAGE` | 4 | 5 |

Atributo a menos é o erro mais caro deste módulo porque **não estoura**: o
arquivo abre, a maior parte aparece, e a entidade malformada some em silêncio.
Nenhum teste reclamava — todos afirmavam sobre o texto que nós mesmos
escrevíamos.

### 5. String de STEP com UTF-8 cru — e o receptor TRUNCANDO em silêncio

Achado **depois** de as paredes já aparecerem, olhando as propriedades da porta
no receptor: `IfcName` chegou lá como **`Porta 90`**, e nós emitimos
`Porta 900×2100`.

String de STEP é ASCII: a ISO 10303-21 manda tudo fora do ASCII imprimível como
`\X2\` + unidades UTF-16 em hexadecimal + `\X0\`. Nós escrevíamos os bytes UTF-8
literais, e o leitor engasgava no primeiro deles e descartava o resto da string
— **sem erro nenhum**.

No arquivo de prova pequeno eram **34** strings assim, entre elas o nome do
pavimento (`Térreo`, que truncaria em `T`) e o material
(`Material não especificado`). No modelo real são os nomes de ambiente, as
descrições de item de orçamento e a cobertura inteira do arquivo. O modelo IFC4
de referência usa `\X2\` **1.526** vezes.

A barra invertida também passou a ser dobrada: ela é o caractere de escape do
formato, e uma barra crua num nome faria o leitor tratar o que vem depois como
comando.

⚠️ **Os testes que procuravam texto acentuado dentro do arquivo passaram a
procurar na mesma moeda** (`__tests__/apoio/textoNoIfc.ts`), e não a afrouxar a
busca. Afrouxar teria feito exatamente o contrário do necessário: parar de olhar
justo o que ficou delicado.

## O que passou a existir para isto não voltar

**`__tests__/ifcIdaEVoltaProprio.test.ts`** — o nosso leitor contra o nosso
escritor. Não se contenta em contar: confere o eixo lido contra as COORDENADAS
DE ENTRADA do desenho, que são uma terceira fonte. Um erro simétrico (escrever
errado e ler errado do mesmo jeito) não passa por ela.

- 4 paredes voltam — antes voltavam **zero**;
- o retângulo volta 10.000 × 6.000, e cada parede com o comprimento do EIXO
  (10.000 ou 6.000), nunca 10.200 — que é o que se leria do corpo;
- espessura 200 e altura 2.800 sobrevivem;
- a porta volta com `offsetMm = 2.000` (o desenhado) e não 7.100 (o espelho), na
  parede que eu escolhi.

**`__tests__/ifcContagemDeAtributos.test.ts`** — cada entidade que emitimos tem o
mesmo número de atributos que a mesma entidade nos dois IFC4 reais. O árbitro é
externo: não é a minha leitura do schema, é o que Revit e ArchiCAD produzem.
Entidade nova sem par nos modelos de referência tem de ser declarada
explicitamente, porque é onde a contagem erra sem ninguém ver.

⚠️ **O portão foi medido no caso DEFEITUOSO antes de ser aceito**: com o
`IFCMATERIALLAYER` de volta a 3 atributos ele reprova com a frase
`IFCMATERIALLAYER: nós 3, real 7`, e volta verde ao restaurar.

No portão da ida e volta entrou também o caso do acento: `'Térreo'` volta
íntegro pelo decodificador do `web-ifc`, e o arquivo traz
`'T\X2\00E9\X0\rreo'` — nunca o texto cru.

**`__tests__/apoio/casaDeProva.ts`** — a casa de prova saiu do teste que só roda
com `IFC_PROVA=1` e virou módulo, para o portão de contagem alcançar o maior
número possível de entidades distintas rodando na suíte inteira.

## ✅ CONFIRMADO NO RECEPTOR em 07/09/2026

**As paredes e as portas apareceram.** Reaberto o arquivo regerado, o mesmo
receptor que antes mostrava só telhado e escada passou a mostrar tudo — e com as
propriedades da porta legíveis do lado dele.

Ou seja: os defeitos 1 a 4 acima **eram** a causa, e não só defeitos ao lado
dela. Antes desta confirmação o plano registrava, com todas as letras, que a
causalidade não estava provada; agora está, e por reabertura, não por
argumento.

⚠️ O log de importação (`prova-planta-inteligente.ifc.log.html`) continua sem
servir para nada nesta história: ele registra `Entities Processed: 0` e
`Elements Created: 0` com um erro de API — abortou antes de olhar o conteúdo, na
tentativa anterior. Quem decidiu foi abrir, não ler o log.

Os arquivos de bissecção seguem em `C:/tmp/prova-ifc/` e deixaram de ser
necessários para ESTA pergunta:

| arquivo | o que isolava |
|---|---|
| `1-so-paredes.ifc` | 4 paredes, sem vão nenhum |
| `2-paredes-com-vao.ifc` | as mesmas + 1 vão livre, sem porta |
| `3-paredes-com-porta.ifc` | + a porta preenchendo o vão |
| `prova-planta-inteligente.ifc` | a casa completa |

## Verificação

| o quê | prova |
|---|---|
| eixo | ida e volta lê 4 paredes com o comprimento do eixo; 4/4 paredes do arquivo de prova têm `'Axis','Curve2D'` |
| `Position` | zero perfis com `$`; o `web-ifc` parou de reclamar |
| composição | 4/4 paredes com `IfcMaterialLayerSetUsage`; espessura volta 200 |
| contagem | portão externo verde, e reprovando o defeito quando ele volta |
| tudo | `npm run test` 3.119 · `npm run build` · `npx tsc --noEmit` |

## A mão da porta: metade fechada, metade em aberto

**Conferido no BIMvision em 07/09/2026**, lendo os atributos crus:

| porta | offset | lido no receptor |
|---|---|---|
| PORTA-ESQUERDA | 1.000 mm | `SINGLE_SWING_LEFT` |
| PORTA-DIREITA | 2.500 mm | `SINGLE_SWING_RIGHT` |

Isso fecha o pior cenário — o de que a mão se perdesse na exportação e as quatro
portas saíssem iguais, com todo IFC já emitido errado. **Elas saem diferentes, e
com os valores que pretendíamos.**

⚠️ **O que essa leitura NÃO decide**: se o nosso `LEFT` é o `LEFT` da norma. Um
espelho GLOBAL — trocar as duas de lado por igual — passaria por esse teste sem
deixar rastro, porque o receptor só devolveu o texto que nós escrevemos.

### Duas tentativas de medir a convenção, e as duas negativas

Antes de deixar em aberto, tentei decidir medindo as **62 portas com
`SINGLE_SWING`** do modelo real do Revit (DigitalHub):

1. **Assimetria de massa da folha** no eixo local: as medianas separam
   (`LEFT` 0,5101 × `RIGHT` 0,4899 numa família), mas o SENTIDO não é
   consistente — em 2 das 4 famílias o `LEFT` pende para +X, nas outras 2 para
   −X. Não decide.
2. **Lado da ferragem** (a maçaneta fica oposta à dobradiça, e se projeta para
   fora do plano da folha): o que o corte isolou é simétrico — o batente, que se
   projeta dos dois lados —, e a fração deu exatamente 0,500 nas 59 portas. Não
   decide.

### ⭐ O achado que essas medições deram de brinde

**No Revit, a mão está na GEOMETRIA**: dentro da mesma família, as portas `LEFT`
e as `RIGHT` têm **zero geometria em comum**, e nenhuma delas usa placement
espelhado (determinante negativo em 0 de 62).

Isso diz uma coisa sobre o NOSSO arquivo que não era óbvia: a nossa folha é uma
**caixa simétrica**, então **a mão viaja só pelo `OperationType`**. Um receptor
que desenhe a porta a partir da geometria não vai mostrar mão nenhuma — não por
defeito nosso, mas porque a informação não está lá, e por desenho não estaria.
O canal é o atributo, e ele funciona.

### O que decide, quando alguém quiser fechar

Um receptor que **DESENHE** o arco a partir do `OperationType` — o Revit, com a
planta do pavimento criada (o importador traz os níveis mas **não cria as
vistas de planta** deles; é preciso Vista → Vistas de plano → Planta de piso,
desmarcando "Não duplicar vistas existentes"). Comparar o arco das portas de
offset 1.000 e 2.500 com `planta-no-nosso-canvas.png`.

## Fora do escopo
- `IfcWallType` e `IfcClassificationReference` para parede.
