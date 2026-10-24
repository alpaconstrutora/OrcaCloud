# Planta › Elétrico — no forro, luz × luz de cômodos diferentes pelas travessias previstas

## Pedido original

Sessão `9e26b316`, 24/10/2026 (tarde), logo após a publicação do PR #137 (eletroduto pela luz do ambiente). Pergunta
minha no relatório: *"Decisão sua: quer que, no forro, a ligação entre luzes de cômodos diferentes use as passagens
já previstas junto às paredes?"* — resposta do usuário:

> *"Decisão sua: quer que, no forro, a ligação entre luzes de cômodos diferentes use as passagens já previstas junto às paredes? sim"*

### Correção 1 (24/10/2026, ~16h, revisão do coordenador da sessão)

Depois da 1ª rodada (commit 3115f82a), antes de qualquer PR: resolver (A) o anel e o trecho sem circuito — a árvore dos
REDE pelos anéis do forro parte também do que já está alcançado, sem duplicar aresta, só no modo pela luz com forro,
`ARVORE_NO_TETO` idêntico; nas 5 casas, anéis = 0 e nenhum trecho sem circuito — e (B) as duas réguas do apoio:
`apoiosAoLongo` de `paredesDoForro` com a MESMA definição de apoio de `furosPrevistos` (função comum, não cópia); se a
parede não tiver posição livre, fica a do meio, como antes; medir os furos de TODAS as disciplinas antes e depois.

### Correção 2 (24/10/2026, ~16h45, revisão aprovada com correções)

I1: o ponto REDE ficava pendurado em rede existente ÓRFÃ (rota infinita) — passar aos anéis e às travessias só os
alcançados com rota finita; teste com a sonda (Sala | Cozinha | Área, trecho órfão do C2 no anel da Área). I2: corrigir
a leitura da água (três perdas de dispensa única, não uma) e registrar a pendência. I3: testes que amarram os ganhos
(furo da travessia dispensado; guarda numa casa com forro). Menores: junta de duas peças de viga com tolerância (+ teste
da viga partida), comentários desatualizados, "pilar de raspão" na tabela, nota no teste do hash.

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
sem forro, o desenho. (Superado na Correção 1: o REDE pelos anéis passou a crescer também do que já está ligado ao
quadro, e as travessias de `paredesDoForro` andaram — o que muda também a água, o ar e o `ARVORE_NO_TETO` com forro.)

**Arquivos:** `utils/blueprintEletrodutos.ts` (ramo do forro do modo pela luz); se a busca do caminho ficar grande,
uma função pura num arquivo novo (ex. `utils/blueprintForroEntreComodos.ts`) com teste próprio.

**Como sei que terminou:**
- teste: dois cômodos com parede comum e travessia; luz A e luz B ligadas por luz A → ponta da travessia em A →
  ponta em B → luz B (nenhum trecho cruza o eixo da parede comum fora da travessia);
- teste: mesmo cômodo continua reta; cômodos sem travessia continuam em reta (luz ligada);
- as 5 casas com forro: viga atravessada e furos dispensa/verificar antes (PR #137) × depois, na tabela abaixo;
  `ARVORE_NO_TETO` com forro idêntico; (superado na Correção 1: idêntico até (A), medido; com a régua única do apoio as
  travessias andam e ele muda junto — o teste do hash `cd0bef12` é só regressão do caso sem travessia);
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

### 1ª rodada (commit 3115f82a)

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
  já usou. Trecho sem circuito é eletroduto ocioso; o REDE não muda nesta tarefa. → resolvido na correção 1.

### Correção 1

O que mudou:
- (A) `arvorePelasParedes` ganhou `alcancados` (opcional): a árvore também cresce dos pontos que já estão na rede e são
  nó do grafo (a ponta da travessia que a luz usou), e não os emenda. O planejador passa os alcançados só no modo pela
  luz com forro, e só liga o quadro à raiz dos anéis se alguma aresta sair dela. `ARVORE_NO_TETO`: hash idêntico ao do
  HEAD com a régua antiga do apoio (medido nas 5 casas antes de (B)).
- (B) `distanciaAoApoioDaViga` (nova, em `blueprintFurosPrevistos.ts`) é a régua única do apoio: as PONTAS da peça de
  viga e os pilares sobre o eixo dela. `furosPrevistos` e `paredesDoForro` a usam. A travessia fica a 2h + meio furo
  máximo (Ø 12 cm / 2) da face do apoio e a 2h + um furo máximo da vizinha — a régua mede da face do furo. Sem posição
  livre, a do meio, como antes. Como `paredesDoForro` é do forro todo, (B) muda também a água, o ar e o `ARVORE_NO_TETO`
  com forro (as travessias andam).

Antes = HEAD 0f3a20d8; 1ª = commit 3115f82a; depois = correção 1. Furos = dispensa / verificar.

| Casa | Viga atravessada (elétrica) | Pilar de raspão (elétrica) | Furos elétrica | Furos todas as disciplinas | Anéis | Trechos sem circuito | Metros |
|---|---|---|---|---|---|---|---|
| 12 × 30 térrea com ar | 15 → 13 → 14 | 0 → 0 → 0 | 5/10 → 6/7 → 7/7 | 6/34 → 7/31 → 10/30 | 0 → 0 → 0 | 0 → 0 → 0 | 266,5 → 268,3 → 267,3 |
| 12 × 30 sobrado com ar | 50 → 50 → 47 | 9 → 10 → 10 | 6/44 → 2/48 → 8/39 | 7/89 → 4/92 → 9/83 | 1 → 1 → 0 | 1 → 1 → 0 | 327,0 → 328,0 → 325,1 |
| 10 × 30 sobrado 4 dorm. | 71 → 68 → 55 | 0 → 0 → 0 | 4/71 → 5/68 → 9/50 | 7/124 → 8/121 → 11/104 | 2 → 2 → 0 | 5 → 7 → 0 | 325,9 → 321,9 → 312,5 |
| 10 × 30 3 pav. 4 dorm. | 94 → 93 → 87 | 19 → 18 → 17 | 8/91 → 8/89 → 13/78 | 12/126 → 11/125 → 16/114 | 0 → 2 → 0 | 0 → 10 → 0 | 367,1 → 369,6 → 365,5 |
| 12 × 30 3 pav. R1-A | 68 → 67 → 69 | 0 → 0 → 0 | 4/71 → 7/68 → 14/63 | 8/124 → 11/121 → 17/118 | 2 → 3 → 0 | 2 → 6 → 0 | 418,0 → 420,0 → 420,5 |

Pilar com eixo dentro: 0 em todas; elétrica × água/ar: 0 em todas. Por disciplina (antes → depois): água quente
térrea 0/6 → 2/5, sobrado 10 × 30 1/15 → 0/16, 3 pav. 1/16 → 0/17; água fria R1-A 1/11 → 0/13, sobrado com ar 0/15 → 0/14;
esgoto igual nas 5.

Leitura (correção 1):
- anéis e trechos sem circuito zerados nas 5 casas (inclusive os que já existiam no HEAD);
- o furo da travessia passou a ser o furo bom: dos furos elétricos em travessia, dispensa / verificar = 7/4, 8/2, 9/5,
  9/5, 10/4 (no sobrado com ar eram 2/10 na 1ª rodada). O que sobra a verificar nelas é furo de outra disciplina a
  menos de 2h (a mesma posição serve a todas);
- o grosso do "verificar" elétrico que resta NÃO está em travessia: trecho horizontal que cruza viga fora delas (viga de
  transição sob cômodo sem parede embaixo, onde não há travessia prevista) e "outro furo elétrico a menos de 2h". Fica
  para outra tarefa;
- ~~água fria R1-A piorou 1 dispensa (1/11 → 0/13): a travessia andou e o ramal mudou; o resto da água igual ou melhor.~~
  (corrigido na Correção 2:) a água perdeu a ÚNICA dispensa em TRÊS casas — água quente do sobrado 10 × 30 (1/15 →
  0/16), água quente do 3 pav. (1/16 → 0/17) e água fria do R1-A (1/11 → 0/13); só a água quente da térrea melhorou (0/6
  → 2/5). O mecanismo: `furosPrevistos` marca "outro furo a menos de 2h" pela distância AO LONGO da viga, sem olhar cota
  nem disciplina; a elétrica que entra na MESMA travessia da água faz as duas virarem "verificar".

**Pendência (não implementada):** a elétrica deve preferir a travessia sem furo de outra disciplina, ou cada disciplina
ter posição própria ao longo da parede (as travessias de `paredesDoForro` caem no mesmo ponto para todas).

Testes da correção 1: `blueprintRotaPeloForro`, `blueprintAguaAutomatica`, `blueprintEsgotoAutomatico`, `blueprintFurosPrevistos`, `blueprintRotaPelasParedes` e os do elétrico (175) verdes; mais 15 arquivos de água, esgoto, pluvial e elétrico (203) verdes; `blueprintCasaAutomatica` por describe: os 30 blocos verdes de primeira; `tsc` rc=0.

### Correção 2

Só alcançado com rota finita é fonte (luzes e anéis); junta de peças de viga com tolerância. Números das 5 casas medidos de novo: iguais aos da correção 1 (tabela acima). Testes novos: a rede órfã (sonda I1), o furo da travessia dispensado (planejar → aplicar → `furosPrevistos`), a viga partida em 0–1000 / 1000–1860 / 1860–4000, o órfão no módulo puro e a guarda no bloco F14b de `blueprintCasaAutomatica` (sem anel, todo trecho com circuito, furos elétricos a verificar ≤ 7 na térrea e ≤ 39 no sobrado).

## Estado
- [x] implementação + testes
- [x] números das 5 casas
- [x] correção 1 (A) anel / trecho sem circuito — anéis = 0 e sem circuito = 0 nas 5 casas
- [x] correção 1 (B) a régua do apoio comum (`distanciaAoApoioDaViga`)
- [x] correção 2 — I1 (só alcançado ligado ao quadro), I2 (leitura da água + pendência), I3 (testes dos ganhos), menores
- [ ] pendência: elétrica × água na mesma travessia (ver Leitura da correção 1)
- [ ] revisão
- [ ] PR + CI
- [ ] publicação
