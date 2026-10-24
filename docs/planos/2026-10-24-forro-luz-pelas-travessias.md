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

## Implementação (24/10/2026)

- `utils/blueprintForroEntreComodos.ts` (novo, puro): `arvorePelasTravessias` — o Prim do forro com a distância pelo grafo
  (reta no mesmo cômodo; entre cômodos, Dijkstra pelas pontas das travessias; sem caminho, a reta até o alcançado mais
  perto). Num cômodo só, as mesmas ligações de `arvoreComRotaLimitada` com `limite: null` (teste de equivalência).
- `utils/blueprintEletrodutos.ts`: só a 1ª chamada de `ligarPeloTeto` do modo pela luz (as luzes), e só com `noForro`, usa a
  árvore nova; cada trecho reto por `ligarNaRede`. Travessia com ponta (ou o próprio segmento) dentro de um obstáculo de
  `ligarNaRede` (pilar, prumada, ramal da laje de cima) fica de fora — achado da medição: no sobrado 10 × 30 a ponta caía
  sob o ramal do banheiro de cima e 3 trechos saíam "sem contorno possível".
- `utils/blueprintEncaminhamentoPorAmbiente.ts`: a regra do cômodo (contém, ou o mais perto até 600 mm na face da parede)
  virou `comodoDoPonto`, exportada — a região de cada nó.
- Testes: `__tests__/blueprintForroEntreComodos.test.ts` (6) e 6 novos no bloco do forro de
  `__tests__/blueprintEletrodutos.test.ts` (travessia usada e nada mais cruza a divisória; mesmo cômodo em reta; cômodos
  sem travessia em reta; ponta dentro de obstáculo; sem anel + idempotente; `ARVORE_NO_TETO` com o hash do HEAD 0f3a20d8).

## Números (24/10/2026)

Antes = HEAD 0f3a20d8 (PR #137); depois = esta mudança. Casa Automática gerada inteira; contagem só da rede ELÉTRICA.
"Viga atravessada" = conflito ESTRUTURA × VIGA com comprimento dentro > 0; furos = `furosPrevistos` (dispensa/verificar);
pilar = eixo dentro / de raspão; elétrica × água/ar = conflitos REDE; anéis = arestas − (nós − componentes).

| Casa | Viga atravessada | Furos dispensa / verificar | Pilar dentro / raspão | Elétrica × água/ar | Metros | Anéis |
|---|---|---|---|---|---|---|
| 12 × 30 térrea com ar | 15 → 13 | 5 / 10 → 6 / 7 | 0 / 0 → 0 / 0 | 0 → 0 | 266,5 → 268,3 | 0 → 0 |
| 12 × 30 sobrado com ar | 50 → 50 | 6 / 44 → 2 / 48 | 0 / 9 → 0 / 10 | 0 → 0 | 327,0 → 328,0 | 1 → 1 |
| 10 × 30 sobrado 4 dorm. | 71 → 68 | 4 / 71 → 5 / 68 | 0 / 0 → 0 / 0 | 0 → 0 | 325,9 → 321,9 | 2 → 2 |
| 10 × 30 3 pav. 4 dorm. | 94 → 93 | 8 / 91 → 8 / 89 | 0 / 19 → 0 / 18 | 0 → 0 | 367,1 → 369,6 | 0 → 2 |
| 12 × 30 3 pav. R1-A | 68 → 67 | 4 / 71 → 7 / 68 | 0 / 0 → 0 / 0 | 0 → 0 | 418,0 → 420,0 | 2 → 3 |

`ARVORE_NO_TETO` com forro: comandos idênticos nas 5 casas (hash do plano sobre o mesmo modelo, HEAD × depois).

`blueprintCasaAutomatica.test.ts` local, por describe (o arquivo inteiro derruba o worker): os 30 blocos passaram (F12b
na 2ª tentativa); o arquivo inteiro fica para a CI.

Leitura:
- a contagem de viga atravessada quase não cai: toda ligação entre cômodos cruza UMA viga, pela reta ou pela travessia.
  O ganho esperado era o furo sair do lugar ruim para o previsto;
- no sobrado com ar a dispensa piorou (6 → 2): dos 12 furos elétricos em travessia, 10 caem "a N cm do apoio" pelo
  critério de `furosPrevistos`. A travessia de `paredesDoForro` foge da zona de 2h só dos PILARES sobre o eixo; o
  `furosPrevistos` conta também a ponta da viga (apoio em outra viga). As duas réguas não batem — fora do escopo desta
  mudança (`paredesDoForro` não muda);
- anéis novos (3 pav.: +2; R1-A: +1; sobrado 10 × 30: um trocado): todos fecham numa ponta de travessia com um trecho SEM
  circuito — a árvore dos REDE pelos anéis (que nasce do quadro, sem ver os alcançados) chega à mesma travessia que a luz
  já usou. Trecho sem circuito é eletroduto ocioso; o REDE não muda nesta tarefa.

## Estado
- [x] implementação + testes
- [x] números das 5 casas
- [ ] revisão
- [ ] PR + CI
- [ ] publicação
