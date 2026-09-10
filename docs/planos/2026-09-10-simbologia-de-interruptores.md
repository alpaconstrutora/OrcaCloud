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

## Os dois itens que tinham ficado fora — "como corrigir?" (10/09/2026)

### A conferência passa a PAREAR as letras (`conferirComandos`)

- luz "a" precisa de interruptor com a letra "a" no cômodo — o de duas
  seções "ab" cobre a e b → **falta** "luz "a" sem interruptor com essa letra";
- interruptor com letra que nenhuma luz do cômodo usa → **aviso** (ou a luz
  está noutro cômodo, ou a letra está errada);
- **paralelo (three way) só existe aos pares**: um só, com a mesma letra, no
  pavimento → falta;
- **intermediário (four way)** precisa dos dois paralelos da mesma letra.

O par do paralelo é procurado no **pavimento**, não no cômodo — o caso comum
é escada/corredor, um em cada ponta. A letra se repete de cômodo para
cômodo, então isto pode deixar passar um par errado; nunca inventa falta.
A linha do ambiente mostra "interruptor ✗ (letras sem par)".

### O "Completar" escolhe a variante pelas letras

Quantas letras de luz estão sem interruptor é quantas seções o interruptor
precisa: 1 → uma seção, 2 → duas ("ab"), 3 → três ("abc"); acima de três,
mais de um interruptor. Luz de teto **sem letra** recebe a próxima livre (um
`SetTerminalProps`), senão o interruptor não teria o que comandar. Paralelo
e intermediário **nunca** saem daqui: qual porta faz par com qual é decisão
de projeto.

Portão medido: exigir 1 paralelo em vez de 2 → falha "PARALELO sozinho é
falta". 23/23 em `blueprintNbr5410Iluminacao`.

## Fora de escopo, declarado

- Par de paralelo entre PAVIMENTOS (escada de dois andares): a busca é por
  pavimento. Se precisar, vira busca no modelo inteiro.
