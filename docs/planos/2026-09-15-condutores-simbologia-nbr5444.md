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
