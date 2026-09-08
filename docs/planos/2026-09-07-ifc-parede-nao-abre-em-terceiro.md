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

Foi o começo do fio. Puxando-o até o fim, apareceram **quatro defeitos reais**,
cada um encontrado só depois de o anterior ser corrigido:

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

**`__tests__/apoio/casaDeProva.ts`** — a casa de prova saiu do teste que só roda
com `IFC_PROVA=1` e virou módulo, para o portão de contagem alcançar o maior
número possível de entidades distintas rodando na suíte inteira.

## O que ainda NÃO se sabe

⚠️ **Não está provado que estes quatro defeitos são a causa do que o Revit
mostrou.** O que está provado é que eram defeitos, que um leitor independente
tropeçava neles, e que agora não tropeça. O log de importação do Revit
(`prova-planta-inteligente.ifc.log.html`) não ajuda a decidir: ele registra
`Entities Processed: 0` e `Elements Created: 0` com um erro de API — o
importador abortou antes de olhar o conteúdo.

Quem decide é reabrir. Os arquivos foram regerados em `C:/tmp/prova-ifc/`:

| arquivo | o que isola |
|---|---|
| `1-so-paredes.ifc` | 4 paredes, sem vão nenhum |
| `2-paredes-com-vao.ifc` | as mesmas + 1 vão livre, sem porta |
| `3-paredes-com-porta.ifc` | + a porta preenchendo o vão |
| `prova-planta-inteligente.ifc` | a casa completa |

Se a 1 aparecer e a 2 não, o problema é o vão; se a 2 aparecer e a 3 não, é o
preenchimento. Se as três aparecerem, os quatro defeitos acima eram a causa.

## Verificação

| o quê | prova |
|---|---|
| eixo | ida e volta lê 4 paredes com o comprimento do eixo; 4/4 paredes do arquivo de prova têm `'Axis','Curve2D'` |
| `Position` | zero perfis com `$`; o `web-ifc` parou de reclamar |
| composição | 4/4 paredes com `IfcMaterialLayerSetUsage`; espessura volta 200 |
| contagem | portão externo verde, e reprovando o defeito quando ele volta |
| tudo | `npm run test` 3.119 · `npm run build` · `npx tsc --noEmit` |

## Fora do escopo

- A **mão da porta** (`SINGLE_SWING_LEFT/RIGHT`) continua por conferir num
  receptor — é outra pergunta, e o arquivo de prova já a carrega.
- `IfcWallType` e `IfcClassificationReference` para parede.
