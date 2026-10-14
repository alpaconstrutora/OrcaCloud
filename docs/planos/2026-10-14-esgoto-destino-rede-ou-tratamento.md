# Esgoto — "Destino do esgoto" (rede pública × tratamento individual) como hipótese do estudo

> **Estado: PUBLICADO (14/10/2026, `dee77095`).**
> ~~**Estado: PLANO — nada implementado.**~~ Separado a pedido do usuário; os itens 2 e 3 da mesma avaliação
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

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 14/10 | Com ligação confirmada no desenho e o destino tratamento: avisa e pede para apagar à mão, ou apaga sozinho? | **"o sistema avisa e pede autorizacao para apagar sozinho"** |
| 14/10 | Começar? | o usuário respondeu à decisão e aprovou a publicação anterior com "Depois disso, sigo com o item 1" no texto |

Decisões minhas (registradas para conferir):
- **Simetria:** a regra vale nos DOIS sentidos. Destino rede pública com unidades de tratamento no
  desenho também são dois destinos: o sugerido do outro destino sai no lançamento; o CONFIRMADO só sai
  com a autorização (`useConfirm`, variante `warning`, Ctrl+Z desfaz).
- **"Rede pública" grava o campo AUSENTE** (não `'REDE_PUBLICA'`): assim, voltar para rede pública
  devolve o hash da ART que o estudo tinha.
- O memorial e o executivo passam a olhar a hipótese também: destino tratamento ainda não lançado não
  cobra "coletor até a rede pública" — cobra o tratamento.

## Decisão a tomar com o usuário antes de implementar (proposta original)

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

- [x] 0 Reprodução ANTES: `__tests__/blueprintEsgotoDestino.test.ts` no código antigo — 7 de 10 falharam
  (com destino tratamento o lançamento punha a ligação; o estudo relido descartava o campo). Os prints
  da conferência visual (gaveta com coletor e tratamento juntos) mostravam a mistura.
- [x] 1 `HipotesesDeEsgoto.destino?` / `distanciaAteALigacaoMm?` / `distanciaEntreCaixasMm?` fora do padrão;
  `destinoDoEsgoto()`. Teste: hash de estudo sem o campo IGUAL; tratamento muda; voltar a rede pública devolve.
- [x] 2 `useBlueprintHidro` → `esgotoDaColuna` (só valores válidos; inválido cai para ausente). Teste de ida e volta.
- [x] 3 `planejarEsgotoCompleto(model, hip, terreno, { tratamento, apagarConfirmadosDoOutroDestino })`: etapa 0
  tira o SUGERIDO do outro destino; o CONFIRMADO vira `confirmadosDoOutroDestino` e bloqueia o destino novo
  até a autorização. Simetria nos dois sentidos. Os 6 testes antigos de `blueprintEsgotoCompleto` passam sem mudança.
- [x] 4 `blueprintColetorPredial` usa as distâncias (ausente = 15/25 m). Teste.
- [x] 5 Gaveta: "Destino do esgoto" (1º campo das hipóteses, no resumo); coletor só com rede pública, tratamento
  só com tratamento (sem botão próprio — o rodapé lança); rodapé diz o destino; com peça confirmada do outro
  destino o botão pede autorização (`useConfirm` "Apagar e lançar"); distâncias editáveis; o painel do coletor
  lê as distâncias. Teste do editor: ligação CONFIRMADA → trocar para tratamento → aviso → apagar e lançar.
- [x] 6 Executivo e memorial: `comTratamentoIndividual(model, hip)` — desenho OU hipótese. Teste do executivo.
- [x] 7 Verificação (14/10/2026): `check-ui-standard.sh` 0 alertas; `tsc` 0 erros; editor sozinho 253/253;
  suíte inteira (sem o editor) 9084 = 9050 + 34 pendentes, 0 falha, 926 arquivos. Bundle da `planta-api`:
  nenhum dos arquivos tocados é empacotado (lista de módulos conferida). Conferência VISUAL no app real
  (`c:/tmp/pwtest/conferencia-destino-esgoto.cjs`, plantas descartáveis arquivadas): 12 portões ok — rede
  pública mostra o coletor; tratamento troca o painel, lança tanque/filtro/sumidouro e NENHUMA ligação; botões
  do rodapé numa linha (achado da 1ª rodada: "Refazer tudo" quebrava — corrigido).

## Publicação

14/10/2026: `dee77095` empurrado para `main` (`db39abc3..dee77095`). Check-run `ci` = success.
`conferir-producao.sh "Destino do esgoto" "Apagar a ligação à rede pública?"`: os dois textos no bundle
servido; domínio = `origin/main` (`dee7709`).
