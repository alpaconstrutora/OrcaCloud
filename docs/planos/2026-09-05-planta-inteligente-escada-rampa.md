# Planta Inteligente — ESCADA E RAMPA (Etapa 2 do roadmap BIM, item 3)

## Pedido original

> escada e rampa

Sessão `b7041736-bf7a-4895-a5ec-193e752d57b7` · 2026-09-05, em resposta a
*"qual o proximo etapa?"* — respondida com os quatro itens que restam da Etapa 2
e a recomendação da escada, por ser o único que ainda é um elemento de
construção **ausente por completo**: o modelo tem pavimentos, laje e pé-direito,
e nenhuma forma de subir de um para o outro. Uma casa de dois pavimentos
desenhada hoje é um edifício sem acesso ao andar de cima.

Contexto: `docs/planos/2026-09-05-planta-inteligente-corte.md` (a vista onde a
escada se lê) e `docs/planos/2026-09-04-planta-inteligente-telhado.md` (o molde
de família nova).

## Decisões de desenho

### 1. UMA família para as duas, com `tipo`

`stairs: Escada[]`, com `tipo: 'ESCADA' | 'RAMPA'`. As duas são a mesma coisa
geométrica — **um percurso em planta que vence um desnível** — e diferem em
como a superfície é resolvida (degraus × plano contínuo), no que se confere
(espelho × inclinação) e na entidade IFC.

Duas famílias duplicariam o percurso, o acerto do cursor, o painel, as quatro
vistas e as quatro exportações, para render uma diferença que cabe num campo.
O telhado já provou o custo do caminho contrário: `Agua` tem `inclinacaoPct = 0`
como caso legítimo (laje impermeabilizada) em vez de uma família "laje plana".

### 2. O NÚMERO DE DEGRAUS É DERIVADO, e o desnível manda

O usuário grava um **alvo** de espelho (padrão 175 mm). O kernel calcula:

```
desnivel = elevação do pavimento de CIMA − elevação deste
n        = max(2, round(desnivel / alvoEspelhoMm))
espelho  = desnivel / n            ← fecha EXATO, por construção
piso     = comprimentoDoPercurso / (n − 1)
```

Gravar `espelho` e `n` como campos independentes é o erro que este projeto já
cometeu e documentou em `Agua.inclinacaoPct` ("graus é DERIVADO, nunca
gravado"). Aqui a consequência seria pior que um arredondamento: espelho e
número que não multiplicam o desnível produzem uma escada que **chega 30 mm
abaixo do piso**, e o desenho não denuncia — os degraus aparecem todos.

**O desnível vem do pavimento de cima**, não do pé-direito: o pavimento acima é
o de menor `elevationMm` maior que o deste. Sem nenhum acima, cai em
`defaultHeightMm`, documentado. Consequência aceita e visível no painel:
acrescentar um pavimento depois **muda o número de degraus** da escada que já
existe. Isso é o correto — a escada tem de chegar ao piso — e o painel diz em
palavras qual desnível está vencendo e até onde.

### 3. O PERCURSO É POLILINHA, e a forma sai dele

2 pontos = lance reto; 3 = um patamar em L; 4 = U. A forma não é um campo: ela é
lida da contagem de vértices, como `FORMA_ESTRUTURAL` faz com pilar/viga/laje.
Um campo `forma` ao lado do desenho seria a mesma pergunta feita duas vezes, com
as duas respostas divergindo no primeiro arraste de vértice — exatamente o
argumento que `Agua.pontos` já carrega sobre o beiral.

Fica **de fora**: escada curva, leque, caracol. São geometria de outra natureza
(o degrau deixa de ser retângulo) e não cabem no escopo de estudo preliminar.

### 4. BLONDEL avisa, não recusa

`2 × espelho + piso` deve cair entre 630 e 650 mm; a NBR 9050 quer espelho de
160 a 180 mm. Fora disso a escada é ruim, **não é indesenhável**. Recusar
travaria o usuário no meio do traçado, quando o percurso ainda está curto por
estar sendo desenhado.

Invariante RECUSA só o que produziria desenho errado calado: menos de 2 pontos,
percurso de comprimento zero, largura ≤ 0, `alvoEspelhoMm` fora de (0, 1000].
O resto é AVISO no painel, com o número ao lado — a mesma escolha das pontas
soltas.

### 5. O FURO NA LAJE entra na máquina que já existe

`utils/blueprintKernel/sobreposicao.ts` já resolve "dois componentes ocupam o
mesmo espaço" e já recalcula o desconto **a cada leitura**, com o argumento
escrito lá: gravar o volume descontado o deixa obsoleto quando alguém move a
peça, e um desconto obsoleto vira um número plausível — a pior espécie de erro
num orçamento.

A escada entra ali como mais um par. A diferença é que **não há "quem cede" a
decidir**: onde passa a escada não há laje, e ponto. Então a escada não ganha
`cedeSobreposicao` — ela sempre vence a `LAJE` que atravessa.

Limitação declarada, herdada: o furo na BORDA da laje não é subtraído do sólido
no 3D (a extrusão ignora furo que toca o contorno). O quantitativo desconta
certo nos dois casos; é o desenho que simplifica.

### 6. KERNEL_VERSION 0.13.0 → 0.14.0, com a prova

`stairs` é conteúdo e entra no hash, **omitida quando vazia** (disciplina de
`structures`, `roofs` e `sections`). Bump e recaptura de goldens só depois de
confirmar, com a versão revertida e a família inteira no lugar, que os seis
payloads voltam byte a byte.

### 7. Em planta, o SÍMBOLO — com a linha de corte

Degraus como linhas transversais, seta de subida partindo do primeiro degrau, e
**a quebra a 45°** que interrompe o lance: em planta baixa só se vê o que está
abaixo do plano de corte da planta (1,50 m), e desenhar o lance inteiro seria
desenhar o que a planta não mostra. A rampa não tem degraus nem quebra: sai
como contorno, seta e a inclinação escrita.

## Plano — um item por arquivo, com critério de pronto

### Fase 0 — Plano
- [x] Este arquivo (REGRA #6), com o pedido literal.

### Fase 1 — Kernel ✅ (05/09/2026)
- [x] `model.ts` — `Escada` (`tipo`, `levelId`, `pontos`, `larguraMm`,
  `alvoEspelhoMm`, `rotulo`), família `stairs`, `findEscada`, invariantes
  `BAD_STAIR_POINTS/WIDTH/RISER` e `DEGENERATE_STAIR`, uid na trava.
- [x] `utils/blueprintKernel/escada.ts` (novo) — `medirEscada`: desnível,
  `n`, espelho real, piso, comprimento, Blondel, e a **pegada em planta**
  (o percurso engrossado pela largura, com os cantos do patamar resolvidos).
- [x] `commands.ts` — `AddEscada`, `SetEscadaProps`, `MoveEscadaVertex`,
  `DeleteEscada`. `RemoveLevel` LEVA a escada junto (ao contrário do corte:
  ela pertence ao pavimento de partida).
- [x] O furo na laje saiu como `furosDaEscada` em `escada.ts`, e NÃO dentro de
  `Sobreposicao`: aquela estrutura carrega a semântica de "quem cede", e aqui
  não há disputa a decidir — onde passa a escada não há laje. O princípio é o
  mesmo (derivado a cada leitura, nunca gravado) e está travado por teste:
  encurtar o lance encolhe o furo sem comando nenhum de furo.
  A laje é escolhida por cota ABSOLUTA — acima do piso de partida e não além do
  de chegada —, porque a laje de teto tanto é desenhada no pavimento de baixo
  com base no pé-direito quanto no de cima com base zero.
- [x] `canonical.ts` / `identity.ts` — `stairs` na geometria (omitida quando
  vazia) e em `identity`; prefixo de rótulo `E`.
- [x] `units.ts` — **0.13.0 → 0.14.0** com a prova: com a versão ainda em
  0.13.0 e toda a escada no lugar, os sete goldens passaram INTACTOS. Depois do
  bump, as seis falhas foram todas de hash e nenhuma de contagem de ambientes —
  que é o que prova que só a string da versão mudou.
- [x] Pronto: `__tests__/blueprintEscada.test.ts` — 29 casos, valores à mão.

**Uma armadilha que o teste pegou:** a asserção "planta sem escada não ganha a
chave `stairs`" tem de ser sobre `payloadDoHash`, **não** sobre
`canonicalPayload`. O sidecar `identity` fica FORA do hash e por isso ganha
`stairs: []` de graça — o que ele de fato faz. Afirmar sobre o payload completo
confundiria as duas metades e travaria uma mudança que é livre por construção.

### Fase 2 — Vistas
- [ ] `BlueprintCanvas.tsx` — símbolo em planta: degraus, seta, quebra a 45°.
- [ ] `blueprintElevation.ts` e `blueprintCorte.ts` — o perfil escalonado.
  É no CORTE que a escada paga o que custou.
- [ ] `Blueprint3DViewer.tsx` — o sólido escalonado, e o furo na laje.

### Fase 3 — Editor
- [ ] `hooks/useBlueprintEditor.ts` — ferramenta `escada` (polilinha, como a
  divisa, fechando com duplo clique ou Enter).
- [ ] `PainelEscadaSelecionada.tsx` (novo) — tipo, largura, alvo de espelho, e
  **o resultado em palavras**: "22 degraus de 173 mm vencendo 3,80 m até o
  Pavimento 1", com o aviso de Blondel quando couber.
- [ ] `MenuComponentes.tsx` — grupo Circulação.

### Fase 4 — Saídas
- [ ] `blueprintIfc.ts` — `IfcStair` (`PredefinedType` derivado da contagem de
  vértices) e `IfcRamp`, `Pset_StairCommon`/`Pset_RampCommon`,
  `Qto_StairBaseQuantities`. Atualizar `COBERTURA_IFC`.
- [ ] `blueprintDxf.ts` — camadas `PLANTA-ESCADA` e `ELEVACAO-ESCADA`.
- [ ] `blueprintExport.ts` — o símbolo na prancha.
- [ ] `blueprintDiff.ts` — `ESCADA_ADICIONADA/REMOVIDA/MOVIDA/ALTERADA`.
- [ ] `blueprintPlanilha.ts` / `blueprintBudget.ts` — a escada no quantitativo.

### Fase 5 — Persistência
- [ ] Migration — `object_type` aceita `'STAIR'`; a RPC explode
  `payload->'stairs'` com `element_uid`.

### Fase 6 — Verificação
- [ ] `tsc`, suíte, goldens, `check-ui-standard`, build, migration aplicada e
  provada de fora.

## Estado

- Fase 0: feita.
- Fases 1–6: pendentes.
