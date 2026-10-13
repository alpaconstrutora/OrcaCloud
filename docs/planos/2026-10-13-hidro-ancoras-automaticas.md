# Esgoto automático sem passo manual — as âncoras da hidráulica nascem sozinhas

## Pedido original

> incorporacao > planta inteligente: cliquei em esgoto automatico e recebi a seguinte mensagem: Coloque a ligação à rede pública (no limite do lote, com a cota da rede) para lançar o coletor predial.
>
> Aqui vem um ponto para analisarmos. Se é para ser automatico, por que pedirmos um passo manual ao usuário.
> é realmente necessarios que ele coloque a ligacao na frente do lote, ou isso também poderia ser manual e ele movaeria para o local mais adequado posteriormente?
>
> avalie o que poderia ser automatico de forma a relamente ser automatico com o minimo necessario de atuacao do usuário. Pois posicao ele altera depois.
>
> avalie e me retorne

Sessão `f5d214a0-96d4-4cc7-b66d-8c1718619c27` · 13/10/2026, à tarde.

Depois da avaliação (resumo na seção abaixo), em 13/10/2026 ~16:30:

> Se concordar, escrevo o plano em docs/planos. Concordo

## A avaliação que o usuário aprovou

O "Esgoto automático" só traça a rede **entre duas peças postas à mão**: a caixa
de inspeção (`planejarEsgoto` › "coloque uma caixa de inspeção") e a ligação à
rede pública (`planejarColetorPredial` › a mensagem do pedido). O mesmo padrão
se repete no hidrômetro (`planejarAlimentador`) e na caixa de areia ou saída
pluvial (`planejarCondutores`).

A peça manual guarda **posição** e **cota**, e o sistema já tem as duas:

- **posição**: a divisa com `papel: 'FRENTE'` (`Boundary.papel`), ou
  `Lote.testadaIndex`, ou a `Via` mais próxima. O ponto certo é a projeção da
  CI sobre a frente, que é a mesma linha reta que o coletor já traça;
- **cota**: a ficha da `LIGACAO_ESGOTO` já nasce com −1500 mm. Colocar a peça
  à mão não acrescenta informação.

Mover um terminal já apaga `sugerida` (`commands.ts`, "MOVER É DECIDIR"), e os
planos da gaveta são `useMemo` sobre o modelo: arrastar a peça refaz DN,
declividade e caixas intermediárias na hora. Logo, a peça pode nascer
sugerida e o usuário só ajusta.

**O que continua com o usuário** (é informação do mundo, não do desenho), e
nenhuma delas trava o lançamento:

1. onde é a frente, quando nenhuma divisa tem esse papel e não há via. É a
   ÚNICA pergunta que pode restar, e a resposta serve também aos recuos;
2. se há rede pública. Hoje isso é deduzido de `temTratamentoIndividual`. O
   lançamento automático respeita: com tratamento individual, não põe ligação;
3. a cota real da rede: fica **estimada** até ser confirmada, com aviso no
   memorial e na conferência do executivo (E3.3).

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 13/10/2026 | A ligação precisa ser posta à mão antes do coletor? | Não. Nasce sugerida na frente do lote e o usuário move depois. |
| 13/10/2026 | O que fica com o usuário? | Só o que o desenho não sabe: frente (se não marcada), haver rede pública, cota real. Nada disso trava. |
| 13/10/2026 | Ordem | Primeiro o esgoto (CI + ligação); depois a mesma rotina no hidrômetro e na saída pluvial. |

**Premissas novas, todas editáveis** (memória "toda folga vira hipótese"):

| Premissa | Padrão | Onde |
|---|---|---|
| Profundidade da rede pública abaixo do terreno na frente | 1500 mm | `HipotesesDeEsgoto.profundidadeDaRedeMm` |
| Afastamento da CI automática para fora da fachada | 1000 mm | `HipotesesDeEsgoto.afastamentoDaCiMm` |

Ausentes em hipóteses já gravadas = o padrão (mesmo molde do `raioDoShaftMm`).

## Plano

### Fase 1 — rotina compartilhada "ponto na frente do lote"

**1.1 `utils/blueprintAncorasHidro.ts`** (novo)
- **O que muda:** três funções puras:
  - `frenteDoLote(model)`: o segmento da frente. Ordem de preferência:
    divisa com `papel === 'FRENTE'` → aresta `testadaIndex` do lote que contém
    a edificação → aresta do anel (`medirTerreno`) mais próxima de uma `Via` →
    `null`;
  - `pontoNaFrente(model, alvo)`: a projeção de `alvo` sobre a frente, presa
    dentro do segmento, recuada 300 mm para dentro do lote (a peça fica no lote,
    não na calçada);
  - `cotaDoTerrenoEm(model, p)`: pela topografia (`amostrador*` /
    `interpolador*` de `blueprintTopografia.ts`) quando houver; senão 0 (a cota
    do pavimento térreo, a mesma referência de hoje).
- **Como sei que terminou:** `__tests__/blueprintAncorasHidro.test.ts` cobre:
  frente por papel; frente por testada; frente pela via; sem nada → `null`;
  projeção fora do segmento presa na ponta; ponto 300 mm para dentro em anel
  horário E anti-horário (o erro de normal que `papeisSugeridos` documenta);
  cota com e sem topografia.

### Fase 2 — a caixa de inspeção nasce sozinha

**2.1 `utils/blueprintEsgotoAutomatico.ts` › `planejarEsgotoTracado`**
- **O que muda:** sem CI no desenho, em vez de `vazio('coloque uma caixa de
  inspeção…')`, o plano propõe uma `AddTerminal` `CAIXA_INSPECAO` com
  `sugerida: true` no pavimento mais baixo com aparelhos de esgoto. Posição:
  a saída do esgoto (tubo de queda, ou a fonte de maior UHC do térreo)
  projetada na fachada voltada para a frente, `afastamentoDaCiMm` para fora,
  fora de qualquer parede. Sem frente: a fachada mais próxima da saída. O
  traçado roda sobre o modelo já com a CI (`applyBatch` num rascunho, que o
  arquivo já importa) e a CI entra **no mesmo lote** de comandos dos ramais.
  O motivo "coloque uma caixa…" só sobra se não houver aparelho nenhum.
- **Como sei que terminou:** teste com o `sobrado()` da fixture **sem** a CI:
  `motivo === null`, o primeiro comando é a CI sugerida fora das paredes, todas
  as fontes ficam ligadas a ela, e o resultado bate com o do mesmo sobrado com
  a CI posta à mão naquele ponto. Teste de idempotência: com uma CI já no
  desenho (sugerida ou não), nenhuma CI nova é proposta. A suíte de esgoto
  existente continua verde.

### Fase 3 — a ligação à rede nasce sozinha

**3.1 `utils/blueprintColetorPredial.ts` › `planejarColetorPredial`**
- **O que muda:** sem `LIGACAO_ESGOTO` e **sem** tratamento individual
  (`temTratamentoIndividual`), o plano propõe uma `AddTerminal`
  `LIGACAO_ESGOTO` com `sugerida: true` em `pontoNaFrente(model, ci.at)`,
  cota = `cotaDoTerrenoEm(ponto) − profundidadeDaRedeMm`, e o coletor até ela
  no mesmo lote. Novo campo `cotaEstimada: boolean` no `PlanoDoColetor`.
  Os motivos que sobram:
  - sem frente: "Marque a divisa da frente do lote (a que dá para a rua): a
    ligação à rede vai nela.";
  - com tratamento individual: sem ligação, como hoje.
- **Como sei que terminou:** testes: sobrado com divisa de frente e CI, sem
  ligação → plano com a ligação sugerida na frente (no segmento, 300 mm para
  dentro), cota −1500 sem topografia, coletor até ela, `motivo === null`;
  sem frente → o motivo novo; com tanque séptico → nenhuma ligação proposta;
  com ligação já posta → nada de ligação nova (idempotência). Os testes
  atuais de `blueprintColetorPredial.test.ts` continuam verdes.

**3.2 Cota estimada até alguém confirmar**
- **O que muda:** a ligação automática nasce com o parâmetro
  `parametros['Cota da rede'] = 'estimada'`. "Confirmar cota" no painel (ou
  editar a cota da peça) troca para `'confirmada'`. Quando a peça está
  estimada, `blueprintMemorialHidro` escreve "cota da rede ESTIMADA (premissa
  de X m), confirmar com a concessionária", e `blueprintHidroExecutivo` põe a
  verificação "Coletor predial até a rede pública" como **pendente**, não
  como atende. Antes de implementar: conferir em `assertParametros` se texto
  livre é aceito como valor; se não for, usar booleano.
- **Como sei que terminou:** testes do memorial e do executivo com a ligação
  estimada e com a confirmada; teste de que editar a cota troca a marca.

### Fase 4 — um botão só

**4.1 `components/blueprint/BlueprintEditor.tsx` (gaveta de esgoto)**
- **O que muda:** "Lançar" no rodapé passa a ser o **esgoto inteiro** num
  `runBatch` só (um Ctrl+Z desfaz tudo): CI (se faltar) → ramais → ligação (se
  faltar) → coletor → ventilação. O planejamento é encadeado sobre o modelo
  já com o passo anterior aplicado. Os botões de cada seção continuam, para
  relançar só uma parte. O botão deixa de ficar desabilitado sem CI. Depois
  de lançar, um resumo diz o que foi presumido: "Caixa de inspeção e ligação à
  rede postas na frente do lote, rede estimada a 1,50 m. Arraste as peças para
  onde estão de verdade e confirme a cota com a concessionária."
- **Como sei que terminou:** teste de componente (`__tests__/components/`) que
  monta a gaveta com o sobrado sem CI e sem ligação, clica em Lançar e
  encontra no modelo CI, ligação, ramais e coletor, com o resumo na tela.
  Depois, conferência no navegador de verdade (memória "verificar UI de
  verdade"): desenho sem CI → Lançar → arrastar a ligação → o painel do
  coletor recalcula. Screenshot no relatório.

**4.2 `PainelColetorPredial.tsx` e as hipóteses da gaveta**
- **O que muda:** campos "Profundidade da rede" e "Afastamento da CI" nas
  hipóteses; no painel do coletor, a linha "Cota da rede: estimada" com o
  botão "Confirmar cota". O padrão de UI vale (REGRA #1): rodar
  `scripts/check-ui-standard.sh` nos dois arquivos.
- **Como sei que terminou:** `check-ui-standard.sh` sai 0 nos arquivos
  tocados; o teste de componente acha os dois campos e o botão.

### Fase 5 — a mesma rotina na água e na pluvial

**5.1 `utils/blueprintAlimentador.ts`**: sem hidrômetro, propor `HIDROMETRO`
sugerido em `pontoNaFrente(model, reservatório)`.
- **Como sei que terminou:** teste: sobrado com frente e caixa d'água, sem
  hidrômetro → hidrômetro sugerido na frente e alimentador até a caixa; com
  hidrômetro → nada novo.

**5.2 `utils/blueprintCondutoresPluviais.ts`**: sem caixa de areia nem saída,
propor `LIGACAO_PLUVIAL` sugerida (sarjeta) em `pontoNaFrente`, na cota do
terreno ali.
- **Como sei que terminou:** teste análogo ao 5.1.

**5.3 As gavetas de água e pluvial** ganham o "Lançar tudo" como em 4.1.
- **Como sei que terminou:** teste de componente análogo ao 4.1.

### Fase 6 — o kernel da `planta-api`

**6.1** Se algum arquivo empacotado no `supabase/functions/planta-api/kernel.bundle.mjs`
for tocado, regerar o bundle **depois da última edição** e rodar
`plantaApi.test` (memória "bundle da planta-api").
- **Como sei que terminou:** bundle regerado e `plantaApi.test` verde, ou a
  constatação registrada aqui de que nenhum arquivo empacotado mudou.

## Estado

- [x] 1.1 rotina "ponto na frente do lote": `utils/blueprintAncorasHidro.ts` +
  `__tests__/blueprintAncorasHidro.test.ts` (13/13). Prova de que o teste vigia o lado de dentro:
  invertida a normal de propósito, 8 dos 13 caíram. `tsc --noEmit` exit 0 (a 1ª rodada caiu com
  SIGSEGV do Node 24, a 2ª com 12 GB passou). Ainda sem commit.
  Desvio do texto do item: a cota do terreno recebe a topografia como `LeitorDoTerreno`
  (`cotaEmM` + `cotaZeroM`, o formato do `TerrenoParaCorte`), porque a topografia não mora no
  modelo: é uma versão carregada à parte pelo `useBlueprintTopografia`.
- [x] 2.1 CI automática (`posicaoDaCaixaProposta`, `comCaixaProposta`,
  `__tests__/blueprintEsgotoCaixaAutomatica.test.ts` 12/12). Suíte inteira: 8974 = 8939 + 34
  pendentes + 1 falha; a falha era `blueprintEsgotoAutomatico.test.ts` exigindo o motivo
  "caixa de inspeção" num pavimento vazio — exatamente o comportamento que este plano muda;
  a asserção passou a exigir "coloque os aparelhos". Os 3 arquivos de esgoto: 39/39.
  `tsc --noEmit` exit 0 (1ª rodada caiu com exit 7 do Node, sem erro TS). Ainda sem commit e
  ainda não conferido no navegador (fica para o 4.1).
  Decisões tomadas na execução:
  - a caixa proposta vai em `PlanoDeEsgoto.caixaProposta`, e o `destinoId` continua **null** até
    o lançamento, porque `blueprintHidroExecutivo` lê `destinoId == null` como "sem caixa de
    inspeção" (uma caixa só proposta não existe);
  - a cota da caixa automática é a da ficha (−600) ou a de chegada da rede, se mais funda:
    a chegada não depende da cota da caixa, então a caixa automática nunca nasce com o aviso
    "aprofunde a caixa";
  - sem fonte de esgoto, o traçado roda num rascunho com caixa provisória só para o motivo
    dizer o que falta de verdade (louça sem ponto, aparelho só na água fria), e não
    "coloque uma caixa de inspeção";
  - o rodapé da gaveta deixou de dizer "Sem caixa de inspeção no desenho." quando há caixa
    proposta (o botão Lançar já fica habilitado).
  - Limite conhecido: fontes ligadas por trechos desenhados à mão, sem caixa, dão "todos os
    pontos já estão ligados" e não propõem caixa; `trechosDeEsgotoSemDestino` continua acusando.
- [x] 3.1 ligação automática (`__tests__/blueprintColetorLigacaoAutomatica.test.ts`; os 5
  arquivos da hidráulica 59/59). Suíte inteira: 8988 = 8954 + 34 pendentes, 889 arquivos, 0
  falha. `tsc --noEmit` exit 0. Ainda sem commit; o painel do coletor ainda não mostra a
  proposta nem o "Confirmar cota" (é o 4.2). Decisões tomadas na execução:
  - entre várias caixas de inspeção, sai do lote a que fica mais perto da frente;
  - sem caixa nenhuma, o motivo é "Lance o esgoto primeiro…" (o botão único da Fase 4
    encadeia as duas coisas);
  - o editor passa ao coletor a topografia exibida (`terrenoParaCorte`, a mesma do corte);
  - a casa de prova virou fixture: `__tests__/fixtures/casaEsgotoNoLote.ts`;
  - `blueprintColetorPredial.test.ts` exigia "Coloque a ligação…" num sobrado sem divisas;
    passou a exigir `MOTIVO_SEM_FRENTE`, que é o comportamento novo pedido.
- [x] 3.2 cota estimada (mesmo arquivo de teste, mesma suíte e typecheck do 3.1).
  Decisões tomadas na execução:
  - a marca fica NA PEÇA (`parametros.cota_da_rede`), não nas premissas do estudo: como
    premissa, todo projeto antigo com a ligação posta à mão e a cota digitada passaria a
    acusar "estimada". Sem a chave = confirmada;
  - **mudança no kernel**: `AddTerminal` aceita `parametros` (antes, só `SetParametros`
    com o id que o `nextId` ainda ia gerar, o que o próprio kernel desaconselha), e
    `SetTerminalProps` com `cotaMm` troca `'estimada'` por `'confirmada'` ("editar a cota é
    decidir a cota", o irmão de "mover é decidir"). Constante `PARAMETRO_COTA_DA_REDE` em
    `model.ts`. Só `blueprintSelecao` (ação do usuário) manda `cotaMm` fora do kernel;
  - executivo: ligação só proposta → "ligação à rede pública não lançada"; cota estimada →
    "cota da rede ESTIMADA — confirmar com a concessionária"; os dois `atende: false`
    (bloqueiam a emissão com ART). Memorial: parágrafo próprio para cada caso;
  - por mexer no kernel e no esgoto, a Fase 6 (bundle da `planta-api`) é obrigatória.
- [x] 4.1 um botão só (esgoto). `utils/blueprintEsgotoCompleto.ts` (`planejarEsgotoCompleto`) +
  `__tests__/blueprintEsgotoCompleto.test.ts` (6/6); o "Lançar" do rodapé usa ele; resumo do que
  foi presumido no topo da gaveta (`esgoto-presumido`), até a gaveta fechar; botão desligado diz o
  motivo no `title`. Teste de componente novo em `BlueprintEditor.test.tsx` ("Esgoto automático SEM
  caixa nem ligação…"): do desenho sem caixa/ligação ao "Confirmar cota". Decisões e achados:
  - o 2º clique RELANÇA a rede, e `relancarEsgoto` apaga os sugeridos ligados à caixa — o coletor
    e a ventilação juntos (comportamento antigo do "Relançar", que os deixava apagados). O botão
    único os refaz no mesmo lote; o teste confere que o desenho final é o mesmo, sem peça dupla;
  - coletor com trecho CONFIRMADO à mão não é relançado pelo botão único (decisão do usuário).
  - **Desvio do critério:** a conferência no navegador foi num HARNESS do canvas real
    (`docs/spikes/esgoto-automatico/`, roteiro `c:/tmp/pwtest/esgoto-auto/roteiro.js`), não no app
    logado: o editor da Planta faz autosave a cada gesto e o bloqueio de escrita do Playwright já
    falhou (memória de 26/09). Prints: com frente → CI fora da fachada sul, LR tracejada (sugerida)
    na frente, coletor ø100 i 13,6 %; arrastar a LR 2 m → vira sólida e o coletor acompanha; sem
    frente → CI a oeste e a pendência "Marque a divisa da frente". Console: nenhum erro. A gaveta
    em si é provada pelo teste de componente (editor real, jsdom).
  - Suíte: o `BlueprintEditor.test.tsx` não fecha numa rodada nesta máquina (V8_Fatal / "still
    running" em posições diferentes — 113, 74, 5, 18 — inclusive SEM as mudanças de tela, provado
    com stash). União das rodadas: 250/250 passaram ao menos uma vez, 0 falha; resto da suíte
    8745 = 8711 + 34 pendentes, 0 falha. Tipos: `tsc` caiu 3× (0xC0000005); checagem por arquivo
    (`tsc_por_arquivo.cjs`) 1760/1760 arquivos, 0 erro.
  - Observação: com a caixa a −0,60 e a rede presumida a −1,50, o coletor curto sai com
    declividade > 5 % e o painel já avisa "considere um degrau" (regra antiga do coletor).
- [x] 4.2 premissas e "Confirmar cota" na gaveta: "Rede pública a … mm de profundidade" e "Caixa a
  … mm da fachada" nas hipóteses (+ a linha que explica o que o lançamento põe); no painel do
  coletor, a ligação proposta e a caixa "Cota da rede estimada … Confirmar cota" (SetParametros).
  `check-ui-standard.sh` exit 0 em `PainelColetorPredial.tsx` e `BlueprintEditor.tsx`; o teste
  de componente acha os dois campos (1500 / 1000) e clica no botão.
- [ ] 5.1 hidrômetro automático
- [ ] 5.2 saída pluvial automática
- [ ] 5.3 um botão só (água e pluvial)
- [ ] 6.1 bundle da planta-api

## Verificação

1. `npx vitest run __tests__/blueprintAncorasHidro.test.ts __tests__/blueprintColetorPredial.test.ts`
   e os demais testes de esgoto, alimentador e pluvial tocados.
2. `npm run typecheck`. O exit code se lê por grep, não por `tail` (memória do TS2459).
3. A suíte inteira antes do push, lendo o resultado (incluindo `Errors` do Vitest).
4. No navegador: um estudo com o térreo desenhado, louças com ponto, divisa da
   frente marcada, **sem** CI e **sem** ligação → Esgoto automático → Lançar.
   Esperado: um clique, rede completa até a frente, resumo do que foi
   presumido. Arrastar a ligação para outro ponto da frente → o painel do
   coletor recalcula. Ctrl+Z → some tudo de uma vez.
5. Publicação pela REGRA #8 (`git push origin HEAD:main`), depois
   `conferir-producao.sh` e o check-run `ci` do commit.
