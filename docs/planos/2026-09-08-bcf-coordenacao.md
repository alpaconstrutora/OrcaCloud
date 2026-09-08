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

## Verificação

| o quê | prova |
|---|---|
| o guid | o `IfcGuid` do tópico está dentro do IFC gerado do mesmo desenho |
| idempotência | dois envios do mesmo conflito dão o mesmo guid de tópico |
| o zip | o `.bcfzip` é reaberto e os três arquivos estão nos caminhos certos |
| a unidade | a câmera sai em metro |
| tudo | suíte 3.225 · build · `check-ui-standard` |
