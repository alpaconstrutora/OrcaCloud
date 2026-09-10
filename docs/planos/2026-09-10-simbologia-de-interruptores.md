# Simbologia de interruptores

## Pedido original

> simnbologia de interruptores
> [print: "Simbologia para interrutores" — uma seção (círculo, letra a);
> duas seções (círculo com diâmetro vertical, a | b); três seções (círculo em
> Y, a, b, c); paralelo / three way (círculo cheio); intermediário / four way
> (metade hachurada)]

## O que foi feito

**`Terminal.interruptor`** — kernel `0.26.0 → 0.27.0`, campo fechado
`TIPOS_DE_INTERRUPTOR = UMA_SECAO · DUAS_SECOES · TRES_SECOES · PARALELO ·
INTERMEDIARIO`, omitido quando ausente (ausente = uma seção). Só vale em
`tipoEletrico: 'INTERRUPTOR'` (`BAD_SWITCH_KIND`); trocar o tipo do ponto
leva a variante junto. Goldens provadas neutras antes do bump, recapturadas
depois.

**Símbolo no canvas**, um por variante, como no print — com as letras vindas
de `comando`, **uma por seção** ("ab", "abc") nas posições do símbolo: em
cima (a | b) e embaixo (c). O rótulo "Int · C1" desce para baixo do símbolo,
porque em cima moram as letras. Raio mínimo de 7 px: um círculo em Y com
4 px vira mancha.

**Menu**: o grupo "Elétrica — interruptores" passa a ter **cinco itens**, um
por variante; escolher no menu já grava a variante. **Painel do ponto**:
select "Interruptor" com as cinco, e a dica do comando muda para "uma letra
por seção, na ordem do símbolo: ab / abc".

**Inventário** (painel Componentes): a chave do interruptor leva a variante
(`PONTO_INTERRUPTOR_PARALELO`), porque é o item do menu que dá a ficha — o
teste da taxonomia pegou o interruptor **sem ficha** antes disto (a classe de
defeito "família nova desenha mas não alcança").

**IFC**: a variante viaja no `ObjectType` (`INTERRUPTOR:PARALELO`) — o enum
do IFC (`TOGGLESWITCH`) não distingue three-way de uma seção.

## Verificação

- `blueprintInterruptorVariantes` 5/5 · `blueprintPontoEletricoTipos` (a
  ficha do interruptor) · goldens 7/7 · `ifcIdaEVoltaProprio`.
- Harness `docs/spikes/encaixe-osnap`: os cinco símbolos lado a lado, olhados
  contra o print (foto no histórico da sessão).
- `check-ui-standard` em `MenuComponentes`, `PainelTrechoSelecionado`,
  `BlueprintCanvas`, `BlueprintEditor`: sem violação.
- Suíte inteira e build antes do push.

## Fora de escopo, declarado

- A conferência 9.5.2.1 não distingue paralelo de simples (qualquer
  interruptor no cômodo atende "comandado por interruptor").
- O "Completar pela norma" cria sempre interruptor de UMA seção.
