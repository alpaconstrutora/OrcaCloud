# Planta › Elétrico — no forro, luz × luz de cômodos diferentes pelas travessias previstas

## Pedido original

Sessão `9e26b316`, 24/10/2026 (tarde), logo após a publicação do PR #137 (eletroduto pela luz do ambiente). Pergunta
minha no relatório: *"Decisão sua: quer que, no forro, a ligação entre luzes de cômodos diferentes use as passagens
já previstas junto às paredes?"* — resposta do usuário:

> *"Decisão sua: quer que, no forro, a ligação entre luzes de cômodos diferentes use as passagens já previstas junto às paredes? sim"*

## Contexto

Com o PR #137, no forro da Casa Automática a árvore das luzes liga luz a luz (e quadro a luz) em RETA, mesmo entre
cômodos diferentes — a reta fura a viga onde cair. Resultado medido em 5 casas: viga atravessada 33→15, 44→49,
61→70, 79→94, 63→68 e furos "a verificar" subindo nas casas grandes. A Casa Automática já prevê, em cada parede
compartilhada, TRAVESSIAS (`paredesDoForro` em `utils/blueprintRotaPeloForro.ts`, ids `forro:travessia:A:B:…`), postas
fora da zona de 2h junto dos apoios (NBR 6118, 13.2.5.1, F14c) — a passagem certa para cruzar a viga.

## Abordagem

**Grafo do forro** (só no modo `PELA_LUZ_DO_AMBIENTE` com `noForro`):
- cada cômodo (Space do pavimento) é uma região onde tudo se liga em RETA (como hoje, com `ligarNaRede`, que desvia
  de pilar);
- entre cômodos, só pelas travessias: a aresta `pa → pb` de cada `forro:travessia:A:B:…` (pa no anel de A, pb no de B);
- nós: as luzes (pendentes e já alcançadas), a raiz do pavimento (o quadro/prumada na faixa) e as pontas das travessias.

**Árvore das luzes:** o Prim de hoje (`limite: null` no forro) passa a medir a distância pelo grafo do forro (menor
caminho), e ligar = percorrer esse caminho: reta dentro do cômodo até a travessia, a travessia, reta até a luz.
Mesmo cômodo = reta, como hoje. Sem caminho pelas travessias (cômodos sem parede comum longa o bastante, ou ponto
fora de qualquer cômodo) = reta, como hoje (nunca deixa luz sem ligar).

**Não muda:** luz → ponto dentro do cômodo (q no anel + descida), VIZINHA, REDE pelos anéis, `ARVORE_NO_TETO`, o modo
sem forro, o desenho.

**Arquivos:** `utils/blueprintEletrodutos.ts` (ramo do forro do modo pela luz); se a busca do caminho ficar grande,
uma função pura num arquivo novo (ex. `utils/blueprintForroEntreComodos.ts`) com teste próprio.

**Como sei que terminou:**
- teste: dois cômodos com parede comum e travessia; luz A e luz B ligadas por luz A → ponta da travessia em A →
  ponta em B → luz B (nenhum trecho cruza o eixo da parede comum fora da travessia);
- teste: mesmo cômodo continua reta; cômodos sem travessia continuam em reta (luz ligada);
- as 5 casas com forro: viga atravessada e furos dispensa/verificar antes (PR #137) × depois, na tabela abaixo;
  `ARVORE_NO_TETO` com forro idêntico;
- CI verde (inclui `blueprintCasaAutomatica`).

## Estado
- [ ] implementação + testes
- [ ] números das 5 casas
- [ ] revisão
- [ ] PR + CI
- [ ] publicação
