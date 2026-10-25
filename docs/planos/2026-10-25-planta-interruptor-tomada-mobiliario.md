# Planta — o ponto do eletroduto acompanha o interruptor, a barra da tomada na face e a subcamada Mobiliário

## Pedido original

Sessão de 25/10/2026, manhã, com dois prints (planta Garden: interruptor "a" do Dormitório 1 arrastado, o eletroduto
esticado do lugar antigo; e o painel Camadas com a planta dos dormitórios):

> *"veja print.
> 1. Ao mover o interruptor o ponto nao veio junto, pois neste caso o ponto atende somente ao interruptor entao deveria vir junto.
> 2. o simbolo da tomada esta alinha com o eixo da parede. deve esta alinha com a face da parede
> 3. veja print. crie uma subcamada em arquitetura para mobiliario"*

Esclarecimento do item 2 (mesma sessão, com print de uma planta elétrica feita à mão):

> *"Veja print. o que deve estar gravada na face da parede é a barra que sai da seta"*

Pedido seguinte (mesma sessão, tarde, depois do PR #157 no ar, com dois prints do Dormitório 2 da Garden):

> *"bugs:
> 1. veja print que é possivel arrastar um trecho do eletroduto e desconecta-lo
> 2. veja print onde movi o interruptor para ao lado da porta e veja que o trecho de eletroduto faz um caminho mais longo, sendo que sair direto do ponto de luz no teto e ir diretamente para ele seria o melhor caminho. Isso aconteceu quando mudei o interruptor de uma parede para outra"*

Mesma sessão, tarde (14h), depois do #159, com print de uma tomada da Garden (TUG -13-, 100 VA) com dois círculos e duas
setas a 45° sob o triângulo:

> *"Aqui temos um erro: o simbolo de subir se trata somente quando sobe de uma pavimento para outro. para ficar clarono caso do garden a casa tem apenas um pavimento entao os simbolos nao devem aparecer apesar de subir para laje nao devem ter o simbolo por nao se tratar de outro pavimennto. ficou claro?"*

## Diagnóstico (lido em `origin/main` e no rascunho da Garden, salvo 25/10 09:59)

1. **Interruptor.** O motor lança, para cada ponto, a descida vertical no ponto e um toco de ~50 mm no forro que liga a
   descida ao NÓ onde a rede da luz chega (`N`). O `TranslateEntities` só arrasta as pontas PRESAS à peça
   (`pontasPresasAsPecas`): a descida vai junto, o toco estica do `N` (que fica) até o lugar novo — na Garden, o
   interruptor de `9350,13875` foi para `9897,13878` e o toco virou um trecho de 549 mm. O `N` só serve àquele ponto
   (chegam nele exatamente dois eletrodutos: o da luz e o toco).
2. **Tomada.** O ponto (`at`) está na face; o desenho (`apoioDaTomada` + canvas + prancha) põe a BASE do triângulo na face e
   a haste ENTRA na parede até o eixo. Na referência, a ponta da barra é que encosta na face e a barra sai da base do
   triângulo para dentro do ambiente.
3. **Mobiliário.** Toda peça de `componentes` (menos climatização) cai na camada `ARQUITETURA` — não dá para esconder os
   móveis sem esconder as paredes.

## Itens

### 1. O nó de chegada que só serve à peça acompanha a peça — `utils/blueprintKernel/commands.ts`

- **O que muda:** `pontasPresasAsPecas` passa a devolver, além das pontas presas, as pontas que andam porque o NÓ do
  outro lado do eletroduto preso só serve àquela peça: só eletroduto (`ELETRICA`), no mesmo pavimento, nó sem peça
  elétrica nem quadro, e com exatamente UM outro eletroduto chegando nele (o trecho VERTICAL no próprio nó — na Garden,
  a descida do forro de 2755 a 2438 — é parte do nó e anda inteiro com ele; a primeira versão o contava como derivação e
  a prova na Garden pegou). A regra é a do `manterJuncoes` das paredes:
  o toco muda de comprimento, nunca de direção — a componente do deslocamento PARALELA ao toco só o estica; a
  PERPENDICULAR leva o nó (e a ponta do eletroduto da luz que chega nele). Nó compartilhado (derivação) não anda. A
  função passa a devolver o deslocamento de cada ponta (não mais `true`), e o canvas (prévia do arraste) usa a MESMA
  função — a prévia é o que o comando grava.
- **Pronto quando:** teste do kernel: interruptor com descida + toco de 50 mm perpendicular à parede + eletroduto da luz
  até o nó; mover 550 mm ao longo da parede → descida vertical no lugar novo, toco com os mesmos 50 mm e a mesma
  direção, nó no lugar novo, eletroduto da luz termina no nó novo. Nó com dois eletrodutos além do toco → não anda (o
  toco estica, como antes). Mover AO LONGO do toco → só estica. Hidráulica não muda. Prova com o rascunho real da Garden.

### 2. A barra da tomada encosta na face — `utils/blueprintRede.ts`, `components/blueprint/BlueprintCanvas.tsx`, `utils/blueprintPranchaEletrica.ts`

- **O que muda:** a ponta da barra fica na face (o ponto, ou a face quando o ponto está para dentro da parede); a barra
  sai da base do triângulo, para dentro do ambiente, com metade do tamanho do símbolo (a proporção que a prancha já
  usava); o triângulo vem depois dela. Nada do símbolo entra na parede. Uma regra só (`HASTE_DA_TOMADA`, fração do
  símbolo) para canvas, acerto do clique e prancha.
- **Pronto quando:** teste puro do apoio (ponta da barra na face; centro do símbolo a 1× o tamanho da face) e teste da
  prancha (nenhum traço da tomada do lado de dentro da face); print no harness.

### 3. Subcamada Mobiliário — `utils/blueprintCamadasPorDisciplina.ts`, `components/blueprint/BlueprintEditor.tsx`

- **O que muda:** a Arquitetura vira grupo com duas subcamadas, **Construção** (o que era a camada; id `CONSTRUCAO` —
  com o id `ARQUITETURA` igual ao do grupo, o olho da subcamada mexeria no grupo inteiro) e **Mobiliário**
  (componentes de família `MOBILIARIO`, `ARMARIO` e `EQUIPAMENTO` — móveis, armários e eletrodomésticos). Louças e
  bancadas ficam na Construção: são fixas e ligadas aos pontos de água. O mobiliário de estudo do ambiente (sobreposição
  do "Mobiliar") segue a subcamada Mobiliário; cotas, rótulos e preenchimento seguem a Construção. Estado gravado antes
  (navegador, template de vista) com a chave `ARQUITETURA` vale para as duas subcamadas (`sanearEstados`). Isolar com
  "arquitetura em meio-tom" atenua o grupo inteiro, como antes. O template de fábrica "Instalações" passa a ocultar o
  Mobiliário (construção em meio-tom).
- **Pronto quando:** testes: cama/armário/geladeira → `MOBILIARIO`; vaso/bancada → `ARQUITETURA`; climatização →
  `MECANICA`; isolar uma rede com base atenuada deixa as duas subcamadas em meio-tom; o painel mostra
  "Arquitetura" com a seta e as duas linhas. `check-ui-standard.sh` nos `.tsx` tocados.

### 4. Os dois bugs depois do #157 — `utils/blueprintKernel/model.ts`, `commands.ts`, `components/blueprint/BlueprintCanvas.tsx`

- **Diagnóstico do bug 2 (rascunho da Garden, 25/10 11:40):** o interruptor C3 estava em `3975,13885` (parede da direita),
  o toco de N `3925,13885` apontava em +x; o usuário o levou para `2569,13885` (parede de baixo, ao lado da porta) — o
  movimento foi todo AO LONGO do toco, a componente perpendicular era zero e o nó ficou no canto antigo (toco de 1.356 mm
  rente à parede). A regra do item 1 levava só a componente perpendicular.
- **O que muda:** (a) o nó de chegada que só serve à peça anda o deslocamento INTEIRO; (b) o trecho SELECIONADO arrastado
  não se solta: a ponta numa peça (terminal ou quadro da mesma disciplina) fica — anda só se a peça anda junto —, a ponta
  num nó anda e leva as pontas dos vizinhos naquele nó; preso a peças paradas nas duas pontas, não sai do lugar e a
  barra do canvas diz por quê. Uma função só (`deslocamentoDasPontasPresas`, agora com `trechoIds`) para o comando e a
  prévia. Vale para toda disciplina (água também não se solta mais).
- **Pronto quando:** `blueprintNoDeChegadaAcompanha.test.ts` (troca de parede leva o nó; trecho luz→nó arrastado leva o
  toco e fica na luz; preso nas duas pontas não anda; com a peça junto anda inteiro; ponta solta e água);
  `BlueprintCanvasTrechoPreso.test.tsx` (a dica); `blueprintRedeConexaoMantida` ajustado (a ponta no quadro parado não
  sai mais dele). Prova no rascunho real: o mesmo gesto do usuário (−1.406 mm em x) leva o nó para `2519,13885`, a luz
  vai direto (2.084 mm) e o toco fica com 50 mm.

### 5. Sobe/desce só entre pavimentos — `utils/blueprintRede.ts`, `components/blueprint/BlueprintCanvas.tsx`, `utils/blueprintPranchaEletrica.ts`

- **Diagnóstico:** o canvas punha o círculo com a seta em TODO eletroduto com desnível (`sentidoDoEletroduto`) — na
  Garden, a descida do forro até cada tomada e interruptor e o pedaço vertical do forro rebaixado; a prancha punha o
  círculo com ↑/↓ em toda prumada. A passagem entre pavimentos é gravada como um trecho em cada pavimento (o
  planejador: até o teto no de baixo, do piso no de cima), então ela se lê pela continuação no mesmo ponto.
- **O que muda:** `eletrodutosQuePassamDePavimento(model)` — sobe quando a vertical chega ao teto e o pavimento de cima
  tem eletroduto com ponta ali no piso (ou a cota passa do piso de cima); desce quando chega ao piso e o de baixo tem
  ponta ali no teto; sem pavimento vizinho, nunca. Só esses levam o símbolo, no canvas e na prancha. A vertical que fica
  no pavimento não leva o círculo (é metade do símbolo da norma) nem o Ø ao lado; selecionada, o círculo aparece.
- **Pronto quando:** `blueprintSobeDesceEntrePavimentos.test.ts` (térrea sem símbolo; prumada do quadro ao pavimento de
  cima com, nos dois lados; descida até a laje sem continuação sem; desce do quadro de cima com; atravessando a laje à
  mão com; água fora); print da Garden antes × depois.

## Estado

- [x] item 1 + testes — `__tests__/blueprintNoDeChegadaAcompanha.test.ts` (7); prova no rascunho da Garden: interruptor
  `8594,12875` movido 550 mm → nó, descida do forro e toco de 50 mm em `9144`, luz até o nó novo
- [x] item 2 + testes — `blueprintTomadaSimbolo.test.ts`; retratos do desenho da prancha e do canvas atualizados (mesmos
  textos, geometria nova da tomada)
- [x] item 3 + testes — `blueprintCamadasPorDisciplina.test.ts`, `PainelCamadas.test.tsx`, `PainelConflitosCamadas.test.tsx`
- [x] prova no navegador (os três itens) — harness local com o rascunho da Garden no canvas real: interruptor movido sem
  toco diagonal; tomadas com o ponto na face, barra e triângulo no ambiente; Arquitetura › Construção 75 / Mobiliário 13,
  oculto some cama/armário/criado/geladeira/máquina e ficam lavatório/vaso/box/tanque
- [x] tsc 0 erros; suíte (sem `blueprintCasaAutomatica`, que vai na CI): 11.437 ok + 7 que caíram por tempo sob carga e
  passaram sozinhos (329/329) = 11.444 ok, 0 falhas, 34 pulados, total 11.478; bundle da planta-api regerado SEM diferença
  (ele não empacota os comandos de edição — não há função para publicar)
- [x] PR + CI — PR #157, `ci` 29min40s verde
- [x] publicação — squash `157c0fe5` em 25/10/2026; `conferir-producao.sh "Mobiliário"` provou o domínio servindo 157c0fe
  (sem deploy de função)
- [x] item 4 + testes
- [x] item 4: PR + CI — PR #159, `ci` 30min34s verde
- [x] item 4: publicação — squash `44808e4e` em 25/10/2026; `conferir-producao.sh "não se solta delas"` provou o domínio
  servindo 44808e4 (sem deploy de função)
- [x] item 5 + testes — `blueprintSobeDesceEntrePavimentos.test.ts` (7); harness local com o rascunho da Garden (11:40):
  a tomada -13- sem os dois círculos e as setas; no conjunto, nenhuma seta em tomada ou interruptor
- [x] item 5: PR + CI — PR #162, `ci` 23min16s verde; suíte local 11.476 ok, 0 falhas, 34 pulados, total 11.510
- [x] item 5: publicação — squash `024463ed` em 25/10/2026; `conferir-producao.sh` provou o domínio servindo 024463e
  (sem texto novo de tela para procurar; sem deploy de função)
