# Planta Inteligente — simbologia dos condutores no eletroduto (NBR 5444)

**Data:** 15/09/2026 · **Frente:** `planta-ribbon` · **Estado:** ✅ concluído

## Pedido original (com a tabela da NBR 5444 e um exemplo de planta)

> simbologia dos circuitos eletricos nos eletrodutos veja print. veja print tambem de um exemplo

## O que foi feito

`utils/blueprintCondutores.ts` (novo, puro, compartilhado pelo canvas e pela prancha):

- `condutoresDoTrecho(trecho, circuito)`: a contagem do trecho decomposta pela
  ligação do circuito — FN = fase, neutro, terra · FF = fase, fase, terra · FFF =
  três fases e terra; contagem acima da base = **retorno(s)** (antes do terra);
  abaixo, tira de trás para a frente; sem circuito assume FN.
- `tracosDoCondutor(tipo)`: a forma de cada símbolo em coordenadas relativas —
  **fase** traço reto cruzando; **neutro** cruzando com o pé no topo ("⌐");
  **retorno** só do topo ao centro (não cruza); **terra** cruzando com a barra no
  topo ("T").
- `numeroDoCircuito(nome)`: "C12 — TUG Cozinha" → "12".

Canvas (`BlueprintCanvas.tsx`) e prancha PDF/DXF (`blueprintPranchaEletrica.ts`):
grupo de símbolos no meio do trecho (no meio da curva, quando curvo), **número do
circuito em cima** e **seção em mm² embaixo**, como no exemplo; o Ø fica à
esquerda do grupo. A legenda da prancha descreve os quatro símbolos.

O modelo não mudou (o trecho continua com `condutores` = contagem); sem bump.

## Verificação

- `__tests__/blueprintCondutores.test.ts` (7): decomposição FN/FF/FFF, retornos,
  contagem menor, sem circuito, número do circuito, forma dos quatro símbolos.
- `blueprintPranchaEletrica.test.ts`: expectativa do rótulo atualizada (Ø, número,
  seção separados).
- Suíte completa **319 arquivos / 4191 testes** verde · `tsc` 0 · build ok ·
  `check-ui-standard.sh` limpo.
- App real (Playwright, escritas bloqueadas): dois eletrodutos automáticos FN —
  cada um com fase, neutro (pé) e terra (barra), "1"/"2" em cima e "1,5"/"2,5"
  embaixo; captura ampliada 10× conferida.

## Um grupo por circuito (15/09, pedido com print: *"a representação (simbologia) dos circuitos está confusa. Precisa haver uma separação entre um circuito de outro"*)

Num tronco com cinco circuitos os quinze traços saíam colados e "3 4 7 8 9" em
cima de tudo. Agora (canvas e prancha) os condutores de cada circuito formam um
**grupo** com um vão entre grupos; em cima de cada grupo o **número do circuito
dele**, embaixo a **seção dele**; o "Ø 25" fica à esquerda do conjunto, abaixo
da linha. Retorno sem dono é grupo "r". Trecho curto: passo e vão encolhem até
caber (mínimo 45 %). Prova: tronco QDC→luz com C1 e C2 — dois grupos separados,
"1 / 1,5" e "2 / 2,5", Ø 25 à esquerda; ramal luz→TUG só com o grupo "2".

## Sobreposições (15/09/2026, print: "olha que confusão de sobreposições")

Quatro causas no canvas, todas tratadas em `BlueprintCanvas.tsx`:

1. **Rótulo do ponto** escrevia o nome inteiro do circuito ("Luz teto · C4 —
   Iluminação Ambiente 4"), atravessando o cômodo. Agora só sigla + número
   ("Luz teto · C4"); a tomada leva `-4-` entre traços, como na norma. O nome
   completo vive no quadro de cargas e no painel do ponto. O rótulo da luz usa
   o raio DESENHADO (2×) — nascia dentro do círculo.
2. **Tomada**: potência ia "para cima" (lado da parede, onde passa o eletroduto
   com os números dos condutores). Número do circuito e potência (e a instrução
   da sugerida) formam um bloco do lado do ambiente (direção do ápice), linhas
   sempre empilhadas na vertical; letra do comando do lado oposto.
3. **Condutores**: números/seções só quando os grupos couberam sem encolher
   abaixo de 75 % (senão só os traços); seção UMA vez, centrada, quando é a
   mesma em todos os circuitos do trecho; Ø só com ≥ 44 px de folga além dos grupos.
4. **Nome do ambiente** sobe para cima do símbolo e do rótulo da luz quando há
   luz de teto a menos de 24 px da âncora (a luz nasce no centróide, onde o
   nome ficava).

Prova: harness Playwright (escritas bloqueadas, 0 erros JS) com quadro, luz,
tomadas e eletrodutos: "Luz teto · C1", tomadas com "-2- / 100 VA" empilhados do
lado do ambiente, seção 2,5 uma vez por trecho, Ø só nos trechos longos.
