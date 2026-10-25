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

## Estado

- [x] item 1 + testes — `__tests__/blueprintNoDeChegadaAcompanha.test.ts` (7); prova no rascunho da Garden: interruptor
  `8594,12875` movido 550 mm → nó, descida do forro e toco de 50 mm em `9144`, luz até o nó novo
- [x] item 2 + testes — `blueprintTomadaSimbolo.test.ts`; retratos do desenho da prancha e do canvas atualizados (mesmos
  textos, geometria nova da tomada)
- [x] item 3 + testes — `blueprintCamadasPorDisciplina.test.ts`, `PainelCamadas.test.tsx`, `PainelConflitosCamadas.test.tsx`
- [ ] prova no navegador (os três itens)
- [ ] tsc, suíte, bundle da planta-api regerado (o kernel mudou de comportamento)
- [ ] PR + CI
- [ ] publicação (+ deploy da `planta-api` só com autorização do usuário)
