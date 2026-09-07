# Importar DXF · classificação SINAPI · georreferência

## Pedido original

> vamos implementar  importar DXF, classificação SINAPI e georreferência

São os três itens que sobram da **Etapa 4 do roadmap BIM** (interoperabilidade
Revit/Archicad). Os outros dois — visualizador de IFC e importar parede/porta/
janela do IFC — já estão em produção.

## O que foi MEDIDO antes de planejar (07/09/2026)

### DXF: há material de prova, e de duas naturezas

| arquivo | tamanho | o que é |
|---|---|---|
| `planta-08082026-v4.dxf` | 4 KB | **nosso próprio export** (AC1009/R12) |
| `AR_PREFEITURA_R15 … revit.dxf` | 15 MB | arquitetônico real, saído do Revit |
| `projeto_de_Altair_Prefeitura…dxf` | 8,3 MB | arquitetônico real, aprovado na prefeitura |
| `TÊRREO.dxf` | 2,9 MB | elétrico real |

⚠️ **O formato varia no básico.** O nosso export escreve o código de grupo sem
espaço à esquerda (`0`); o do AutoCAD escreve com (`  0`). Um leitor que não
apare os dois lados lê zero entidades e não reclama — foi o que aconteceu com a
minha primeira contagem, que deu vazio no arquivo cheio.

O nosso export tem camadas nomeadas: `PLANTA-PAREDES` (42 entidades),
`PLANTA-EIXOS` (7), `PLANTA-AMBIENTES` (12), `PLANTA-ABERTURAS`,
`PLANTA-TEXTO`. Ou seja, **o eixo da parede está lá**. Isso dá o caso de prova
mais forte que existe para importação: exportar e reimportar tem de devolver as
mesmas paredes. Um DXF de terceiro NÃO tem camada de eixo, e aí o caminho é
outro — parear as duas faces paralelas.

### Georreferência: NÃO existe de onde ler

Procurei em todo o repositório: `latitude`/`longitude` existem em Market
Intelligence, em cidades do Dados Mestres e em evidências de qualidade —
**nada ligado ao estudo de planta nem ao terreno**. O kernel não tem campo de
coordenada.

Então georreferenciar **não é ler o que já se sabe: é passar a saber**. Exige
campo novo no modelo e um lugar na tela para informar. Isso muda a natureza do
item, e o plano assume isso em vez de fingir que é só emitir a entidade.

### SINAPI: o dado já existe

`CamadaParede.itemCode` e o `itemCode` das peças já guardam o código do
catálogo. Falta só emiti-lo no IFC como classificação — é o menor dos três.

## Ordem: do menor para o maior

Publicando por fatia, como nas frentes anteriores.

## Fatia 1 — classificação SINAPI no IFC

`IfcClassification` (uma por arquivo, "SINAPI") +
`IfcClassificationReference` por código distinto +
`IfcRelAssociatesClassification` ligando os elementos que têm aquele código.

- Só sai código que EXISTE. Elemento sem `itemCode` não ganha referência vazia:
  Pset vazio e classificação vazia são a mesma doença.
- A parede com camadas tem um código POR CAMADA. A classificação é do elemento,
  então saem todas as referências que a parede tiver — e não a "principal",
  que exigiria eleger uma sem critério.
- Prova: contagem de atributos por entidade (o mesmo rito das outras entidades
  IFC) e ida e volta pelo `web-ifc` lendo os códigos de volta.

## Fatia 2 — georreferência

`IfcMapConversion` + `IfcProjectedCRS`, a partir de um campo novo no modelo.

**O campo**: `georreferencia?: { latitude; longitude; elevacaoM; rotacaoNorteDeg }`
no `BlueprintModel`, ausente por padrão (como `areaEscrituraMm2`), OMITIDO do
payload quando ausente — o ritual de sempre, para o acervo não mudar de hash.

⚠️ A pergunta que decide a fatia: **`IfcMapConversion` quer coordenada
PROJETADA (E/N em metros, com um CRS), não latitude/longitude.** Converter
lat/long para UTM é uma conta de projeção (fuso, hemisfério, falso leste) que
erra em silêncio se o fuso sair errado — o desenho aparece a centenas de
quilômetros no visualizador federado, com forma perfeita.

Decisão: guardar o que o usuário informa e emitir o que for coerente com isso.
Se ele informar **lat/long**, sai `IfcSite.RefLatitude`/`RefLongitude`, que é
exatamente o campo para isso e não exige projeção nenhuma. `IfcMapConversion`
só sai quando houver E/N e o código do CRS — que é o que um topógrafo entrega.
Emitir UTM calculado por mim seria inventar precisão.

## Fatia 3 — importar DXF

A maior, e a que exige medir antes de escolher o caminho.

### O leitor

DXF ASCII, seção `ENTITIES`, pares (código, valor). Apara espaço dos dois lados
— ver a medição acima. Entidades que interessam: `LINE`, `LWPOLYLINE`,
`POLYLINE`+`VERTEX`, `ARC` e `CIRCLE` (para RECUSAR nomeando, não para
aproximar). Camada em cada entidade (código 8).

### Dois caminhos, e a tela escolhe

1. **Camada de EIXO** (o nosso próprio export, e qualquer arquivo em que o
   desenhista tenha uma camada de eixos): cada linha é uma parede. Exato.
2. **Pares de FACES** (todo DXF de terceiro): duas linhas paralelas, próximas e
   sobrepostas viram uma parede de espessura igual à distância entre elas.
   `utils/blueprintVetor.ts` já tem `parearFaces` e `juntarColineares`, feitos
   para o Digitalizador — reusar, e não escrever um segundo pareador.

⚠️ A ESPESSURA e a UNIDADE são o risco. DXF não declara unidade de forma
confiável (`$INSUNITS` existe e mente), e uma planta em metros lida como
milímetros dá uma casa de 12 cm. A tela pede a escala, com a mesma disciplina do
casamento de pavimentos do IFC: sugerir medindo, e deixar a pessoa confirmar.

### O que este plano NÃO promete

- Blocos (`INSERT`) explodidos: um DXF de arquitetura põe porta e janela em
  bloco, e resolver a transformação de bloco aninhado é frente própria.
- Texto, cotas e hachuras: não viram nada.
- Arco e círculo: RECUSADOS com o nome da forma. O kernel não tem parede curva,
  e retificá-la mudaria a área do ambiente em silêncio.

## Verificação

| Fatia | Prova |
|---|---|
| 1 · SINAPI | contagem de atributos; ida e volta lendo os códigos de volta pelo `web-ifc` |
| 2 · georreferência | goldens do kernel intactos com o campo ausente; `RefLatitude` no IFC relido |
| 3 · DXF | ida e volta com o NOSSO export (exportar → importar → mesmas paredes) + leitura dos arquivos reais da empresa, com o que for recusado nomeado e contado |
| todas | suíte, build, `check-ui-standard`, harness da importação |
