# Esgoto — "Destino do esgoto" (rede pública × tratamento individual) como hipótese do estudo

> **Estado: PLANO — nada implementado.** Separado a pedido do usuário; os itens 2 e 3 da mesma avaliação
> estão em `2026-10-14-esgoto-tratamento-e-botoes.md`.

## Pedido original

> 3. Aavaliar ma sequencia a gaveta de Esgoto, que tem a mesma mistura (coletor e tratamento são dimensionamento).

Depois da avaliação, perguntado se fazia os 3 itens juntos:

> comece pelos itens 2 e 3, que são rápidos e o 1 separado, com plano próprio

Sessão Claude Code (VS Code) · 14/10/2026.

## O problema (lido no código, `origin/main` de 14/10/2026 — reproduzir na tela antes de corrigir)

1. A gaveta mostra **ao mesmo tempo** o Coletor predial (rede pública) e o Tratamento individual (sem
   rede): `dimensionarTratamento` não tem condição, então quem tem rede pública vê tanque/filtro/
   sumidouro, com "não se aplica" no meio.
2. O "Lançar" do rodapé (`planejarEsgotoCompleto`) **sempre** escolhe a rede pública: sem ligação, o
   coletor propõe uma na frente do lote (13/10). `planejarTratamento` recusa quando há ligação
   (`blueprintTratamento.ts:265`). Logo, num lote SEM rede pública, o automático não serve: apagar a
   ligação → o próximo "Lançar" a recria; "Lançar tratamento" antes → o "Lançar" ainda acrescenta
   ligação + coletor (dois destinos no desenho — **deduzido, não reproduzido**).
3. O "Lançar" do rodapé não lança tratamento.

## Decisão a tomar com o usuário antes de implementar

| Pergunta | Proposta |
|---|---|
| Nome e valores | "Destino do esgoto": **Rede pública** (padrão) · **Tratamento individual** |
| Onde mora | `HipotesesDeEsgoto.destino?: 'REDE_PUBLICA' \| 'TRATAMENTO'` — **opcional, ausente = rede pública** |
| Com ligação já no desenho e o usuário escolhe tratamento | o "Lançar" **não apaga** a ligação confirmada (decisão do usuário); avisa e pede para apagar à mão. Ligação SUGERIDA é apagada no relançamento. |
| 15 m / 25 m do coletor (NBR 8160) | entram aqui como hipóteses (`distanciaAteALigacaoMm?`, `distanciaEntreCaixasMm?`), mesmo critério de "ausente = norma" |

## Por que "opcional, ausente = padrão" (e não um campo com padrão)

- **Hash da ART:** `hashDaBaseHidro` = `sha256(stableStringify({ desenho, hipoteses }))` sobre TODAS as
  hipóteses (`blueprintHidroExecutivo.ts:301`). Um campo novo com valor padrão mudaria o hash de todo
  estudo já emitido — toda emissão hidráulica com ART deixaria de valer de uma vez. `stableStringify`
  **ignora `undefined`** (`blueprintKernel/hash.ts:122`): campo ausente = hash igual.
- **Leitura do estudo:** `completar()` em `hooks/useBlueprintHidro.ts` só aceita chaves que existem no
  padrão e do MESMO tipo — uma chave opcional fora do padrão seria **descartada** ao carregar. Tem de ser
  tratada lá (como `ANULAVEIS`), com teste de ida e volta.

## Plano

**1. `utils/blueprintEsgotoAutomatico.ts`** — `destino?` e as duas distâncias opcionais em
`HipotesesDeEsgoto` (fora de `HIPOTESES_ESGOTO_PADRAO`).
- **Como sei que terminou:** `hashDaBaseHidro` de um estudo sem os campos é IGUAL ao de antes
  (teste com hash fixado).

**2. `hooks/useBlueprintHidro.ts`** — `completar` preserva `destino` (só os dois valores válidos) e as
distâncias (número > 0).
- **Como sei que terminou:** teste: gravar `destino: 'TRATAMENTO'`, recarregar, continua; valor inválido
  cai para ausente.

**3. `utils/blueprintEsgotoCompleto.ts`** — com `TRATAMENTO`: caixa → ramais → **tratamento** (em vez de
coletor + ligação) → ventilação; ligação sugerida existente é apagada; confirmada gera pendência.
- **Como sei que terminou:** testes: lote sem rede → um "Lançar" põe tanque/(filtro)/sumidouro e
  NENHUMA ligação; com ligação confirmada → pendência, nada apagado; `REDE_PUBLICA`/ausente → igual a hoje
  (os testes atuais de `blueprintEsgotoCompleto` passam sem mudança).

**4. `utils/blueprintColetorPredial.ts`** — usa as distâncias das hipóteses (ausente = 15/25 m).
- **Como sei que terminou:** teste com 10 m entre caixas muda `caixasIntermediarias`.

**5. `BlueprintEditor.tsx` (gaveta de esgoto)** — o campo "Destino do esgoto" nas hipóteses (e no
resumo delas); com `REDE_PUBLICA` só aparece o Coletor, com `TRATAMENTO` só o Tratamento (e o "Lançar
tratamento" do painel sai, porque o "Lançar" do rodapé passa a lançá-lo); o rodapé diz o destino.
- **Como sei que terminou:** teste do editor: trocar o destino troca o painel e o que o "Lançar" põe.

**6. Memorial / executivo** (`blueprintMemorialHidro.ts`, `blueprintHidroExecutivo.ts`) — o destino entra
no memorial; a verificação NBR 7229 só roda com `TRATAMENTO`, a de ligação só com `REDE_PUBLICA`.
- **Como sei que terminou:** testes do memorial com os dois destinos.

**7. Verificação** — reproduzir o problema 2 na tela ANTES (memória "reproduzir antes de corrigir");
`tsc`; suíte inteira com a conta fechando; o bundle da `planta-api` não empacota esgoto (conferido em
14/10: `planejarEsgoto*`, `planejarColetorPredial`, `planejarTratamento`, `hashDaBaseHidro` com 0
ocorrências em `kernel.bundle.mjs`) — conferir de novo antes de publicar.

## Estado

- [ ] aguardando o usuário decidir a tabela "Decisão a tomar" e mandar implementar.
