# Planta › a caixa da luz de teto na rede (os eletrodutos entram nela)

## Pedido original

Sessão de 25/10/2026, tarde, com a foto de uma caixa octogonal amarela (seis entradas laterais) e o print do 3D da Garden
(os eletrodutos se encontram num nó acima da caixa da luz e um só desce até ela):

> *"Veja imagem, essa é uma caixa de luz de teto, note que a caixa tem 6 entradas e é por onde cada conduite chega.  Por sua vez note que na planta 3d os conduites se encontrar acima da caixa e desce apenas um conduite o que nao é o correto"*

Decisão do usuário (pergunta com as duas opções, mesma sessão): **"Caixa no alto, na rede"**. A caixa fica onde os
eletrodutos já correm (2,755 m na Garden) e cada um entra por uma lateral dela. Da caixa até a luminária no forro
(2,553 m) desce só cabo, sem eletroduto: o trecho vertical de 20 cm deixa de existir e sai do quantitativo.

## Diagnóstico (rascunho da Garden, 25/10 11:40, e `origin/main`)

As 12 luzes da Garden estão a 2.553 (uma a 2.559), na face do forro. A rede corre na faixa a 2.755 (45 mm abaixo da laje).
O motor (`utils/blueprintEletrodutos.ts`, `ligarPeloTeto`) faz cada pendente "subir ao teto na própria posição": a luz
ganha uma vertical 2.553 → 2.755, e todos os eletrodutos do cômodo encontram-se no alto dela. A fiação
(`utils/blueprintKernel/fiacao.ts`) liga a peça à rede pelo nó (x, y, cota da peça), então sem essa vertical a luz
ficaria sem caminho. Conexões e conferência de pontas abertas não cobrem a elétrica; o comprimento do circuito
(dimensionamento) parte do quadro e não usa a cota da peça.

## Itens

### 1. A regra de ligação — `utils/blueprintKernel/ligacaoDaPeca.ts` (novo), `utils/blueprintKernel/fiacao.ts`

- **O que muda:** `caixaDaLuzNaRede(t, cotaDaRede)` diz quando a luz de teto tem a caixa na rede: abaixo dela, até
  `ALCANCE_DA_CAIXA_DA_LUZ_MM` (600). `cotasDeLigacao(model)` diz onde cada peça se liga: a própria cota, exceto a luz de
  teto sem eletroduto na cota da luminária, que se liga na ponta mais baixa no mesmo prumo, acima dela, dentro do
  alcance. A fiação usa essa cota. É uma regra derivada do desenho, sem campo novo: o payload gravado não muda, e a
  planta antiga (com a descida) continua ligada como antes. A luminária continua com a cota dela, que é a altura de
  montagem do cálculo de iluminação.
- **Pronto quando:** `blueprintCaixaDaLuzNaRede.test.ts` cobre a regra (dentro e fora do alcance, outra peça) e a cota
  de ligação (sem descida → a rede; com descida → a luminária; interruptor → a própria). A fiação sem a descida dá F N T
  no ramal até a luz e F R até o interruptor. A planta antiga sai igual, com a descida levando N R T. O teste falha com
  a fiação de antes.

### 2. O motor não lança a descida — `utils/blueprintEletrodutos.ts`

- **O que muda:** em `ligarPeloTeto`, a luz com `caixaDaLuzNaRede(p, teto)` não sobe ao teto: o nó dela é (at, teto).
  `noDoPonto` dela é o do teto, e é por ali que o caminho até o quadro dá o circuito aos trechos.
- **Pronto quando:** os testes "NO FORRO" de `blueprintEletrodutos.test.ts` foram ajustados: nenhuma descida na luz, e a
  rede chega a ela na faixa. O hash do caso `ARVORE_NO_TETO` com forro muda uma vez, porque as duas descidas saíram.
  Os demais 59 passam como estavam.

### 3. A caixa da luz no 3D, na cota da rede — `components/blueprint/Blueprint3DViewer.tsx`

- **O que muda:** a caixa da luz de teto é desenhada na cota de ligação (`cotasDeLigacao`), centrada no nó onde os
  eletrodutos chegam. Na planta já relançada, eles entram pelas laterais. Na planta antiga, a caixa continua embaixo,
  na descida.
- **Pronto quando:** print do 3D da Garden relançada (harness local), antes × depois.

### 4. A planta-api — `supabase/functions/planta-api/kernel.bundle.mjs`

- **O que muda:** o bundle (`scripts/build-planta-api-kernel.mjs`) ganha `ligacaoDaPeca`, porque `computeQuantities` usa
  a fiação. Publicar a função só com autorização do usuário.
- **Pronto quando:** bundle regerado e versionado; deploy feito após autorização (ou registrado como pendente).

**Para a Garden mudar:** relançar os eletrodutos ("Relançar com as escolhas atuais"). A planta atual guarda as descidas.

## Estado

- [x] item 1 + testes — `blueprintCaixaDaLuzNaRede.test.ts` (4/4; o da fiação falha com a regra desligada)
- [x] item 2 + testes — `blueprintEletrodutos.test.ts` 62/62
- [x] item 3 + print — harness local: a Garden como está (viewer de `origin/main`) × relançada pelo motor novo com as
  escolhas gravadas no registro (viewer novo). Na luz (4150, 8900): antes 9 trechos (8 na rede + a descida 2553→2755) e
  os eletrodutos se encontrando acima da caixa; depois 8 trechos a 2755 entrando na caixa, sem descida
- [x] item 4: bundle regerado (só acrescenta `ligacaoDaPeca` e a chamada na fiação)
- [x] item 4: deploy da planta-api — autorizado pelo usuário ("Publicar", 25/10/2026, noite); publicada de uma frente em
  `8b69470f` (bundle regerado sem diferença; `plantaApi.test` 3/3): versão 80, ACTIVE, 26/10/2026 01:25 UTC;
  `/planta-api/docs` 200
- [x] tsc + suíte — tsc 0 erros; suíte local (sem `blueprintCasaAutomatica`, que roda na CI): 11.492 ok + 2 testes de
  tela que caíram por tempo sob carga e passaram sozinhos (`PainelVersoes` 39/39) = 11.494 ok, 0 falhas, 34 pulados, total 11.528
- [x] PR + CI — PR #171, ci 29min50s verde
- [x] publicação — mesclado por squash (d0c1f41f) em 25/10/2026; `conferir-producao.sh` provou o domínio servindo 1eceed0 (contém d0c1f41f)
