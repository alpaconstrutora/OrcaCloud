# Planta — motores de lançamento relançam quando uma preferência/escolha muda

## Pedido original

Sessão `9e26b316`, 24/10/2026 (tarde, ~16h), logo após o PR #140 (preferência "caixas de passagem × pela luz do teto"):

> *"quando o usuário faz uma allteracao em preferencias, porem exemplo alterar o tipo de lançamento de eletroduto para Sem caixas de passagem, o motor de lançar Eletrodutos por circuito deve ficar disponivel para relançar e incluir essa nova preferencia. Isto deve valer para qualquer alteracao de preferencia"*

Respostas (mesma sessão): *"Todos os motores (Recomendado)"*; *"Refaz tudo, pedindo confirmação (Recomendado)"*.

## Contexto

Pedido (24/10/2026, tarde, logo após o PR #140 — preferência "caixas de passagem × pela luz do teto"):
> *"quando o usuário faz uma allteracao em preferencias, porem exemplo alterar o tipo de lançamento de eletroduto para Sem caixas de passagem, o motor de lançar Eletrodutos por circuito deve ficar disponivel para relançar e incluir essa nova preferencia. Isto deve valer para qualquer alteracao de preferencia"*

Decisões do usuário (mesma sessão):
1. **Todos os motores** (eletrodutos, água, esgoto, pluvial, circuitos automáticos), não só os eletrodutos.
2. **Rede já aceita (confirmada) + escolha mudou → refaz tudo, pedindo confirmação** (diz o que muda e o que será refeito; desfazível com Ctrl+Z).

**Causa (lida em `origin/main`):** os motores só olham a GEOMETRIA ("falta ligar algum ponto?"), nunca COM QUE ESCOLHAS a rede foi lançada — nada grava isso no modelo.
- Eletrodutos (`components/blueprint/BlueprintEditor.tsx` ≈8729 `planejarEletrodutosDoModelo`; `utils/blueprintEletrodutos.ts`): com a rede toda ligada o plano sai `vazio('todos os pontos já têm eletroduto')` (≈899); o "Lançar em todos" do rodapé (≈20113, `haOQueLancar` ≈8771) fica **desligado e sem dizer por quê**. `relancarEletrodutos` (≈1034) só apaga sugeridos; `refazerEletrodutos` (≈1058) apaga a rede do quadro, mas **deixa as caixas de passagem já aceitas** (só apaga `sugerida`) — trocar para "sem caixas" deixaria CP órfãs.
- Água / pluvial (≈20005 / ≈20042): "Lançar/Relançar tudo" desliga com "Nada a lançar: já está completa"; **não há Refazer**.
- Esgoto (≈19957): tem "Refazer tudo"; só a troca de DESTINO vira pendência (`confirmadosDoOutroDestino`) — o molde a generalizar.
- Circuitos automáticos (≈8810, ≈20269; `utils/blueprintCircuitosAutomaticos.ts:171`): só pega ponto sem circuito; "Criar 0" desligado; não há relançar.
- As escolhas vêm de lugares diferentes: preferência do usuário no banco (`caixasDePassagem`, `hooks/usePreferenciaDaPlanta.ts`), `usePersistedState` do navegador (encaminhamento, rota máxima, pela parede, critérios de circuitos, hidráulica), `useState` (bitola) e hipóteses do estudo (`eletricaDoEstudo.hipoteses`, tabela `blueprint_study_eletrica`).

## Abordagem

**Duas regras, iguais em todo motor:**
- **A. Nunca "nada a fazer" com rede existente:** havendo rede lançada pelo motor, o botão principal fica disponível como **"Relançar com as escolhas atuais"** (o molde é o "Relançar" da Estrutura, que já é sempre disponível "com as hipóteses atuais"). Rede só com sugeridos → relança direto; com confirmados → confirmação que lista o que será refeito (trechos, caixas, circuitos) e aplica num lote só (Ctrl+Z desfaz tudo).
- **B. Diz QUANDO e POR QUE relançar:** cada lançamento grava no modelo as escolhas usadas; se as atuais diferem, o painel do motor mostra um aviso âmbar *"Lançado com: com caixas de passagem · agora: sem caixas de passagem"* com o mesmo botão. Rede antiga, sem registro: só a regra A (sem aviso — não se sabe com que foi lançada).

### Task 1: F1 — Núcleo: o registro do lançamento no modelo
- **Kernel** (`utils/blueprintKernel/model.ts`, `canonical.ts`, `commands.ts`; o molde de campo opcional novo é `muros`): `registrosDeLancamento?: RegistroDeLancamento[]`, `{ motor: 'ELETRODUTOS'|'AGUA'|'ESGOTO'|'PLUVIAL'|'CIRCUITOS'; alvoId: string | null /* quadro, pavimento… */; escolhas: Record<string, string | number | boolean | null> }`. Comando `RegistrarLancamento` (upsert por motor+alvo) que entra NO MESMO LOTE do lançamento → Ctrl+Z volta o registro junto. Clone, payload canônico (serializa e lê) e `KERNEL_VERSION` 0.104.0 → 0.105.0; regerar o bundle da planta-api se ele empacotar o model/canonical (`scripts/build-planta-api-kernel.mjs`).
- **Módulo puro** `utils/blueprintRegistroDeLancamento.ts`: `escolhasNormalizadas(...)`, `diferencasDasEscolhas(gravadas, atuais, rotulos) → { item, rotulo, antes, agora }[]` (estável, ignora chave nova com o valor padrão), `textoDasDiferencas(...)`.
- **Componente** `components/blueprint/AvisoDeEscolhasMudaram.tsx`: o aviso âmbar + botão, no padrão visual do painel (REGRA #1; `check-ui-standard.sh`); botão desligado sempre diz o motivo (memória "botão desabilitado sempre diz por quê").

### Task 2: F2 — Eletrodutos (alvo = quadro)
- Escolhas registradas: `encaminhamento`, `caixasDePassagem`, `rotaMaximaVezes`, `rotaPelaParede`, `bitolaMm` e um resumo das `HipotesesEletricas` do estudo que mudam a bitola (seção/queda — o rótulo "hipóteses elétricas do estudo").
- Todo lote de lançar/relançar/refazer leva `RegistrarLancamento` por quadro.
- Rodapé: com rede existente e plano vazio, "Lançar em todos" vira **"Relançar com as escolhas atuais"** (refaz por quadro; confirmação se houver confirmados), nunca desligado sem motivo. Por quadro, a tabela mostra o aviso B.
- Corrigir `refazerEletrodutos`: apaga também as `CAIXA_PASSAGEM` (inclusive aceitas) que estão nos nós da rede apagada do quadro — senão "sem caixas" deixa CP órfãs.
- Casa Automática passa a usar a preferência do usuário de caixas (hoje força `HIPOTESES_ELETRODUTO_PADRAO`, com caixas) — anotado em "Limitações" do PR #140.

### Task 3: F3 — Água e pluvial
- Escolhas = as hipóteses de cada sistema que o painel já monta (ler as fontes no editor). Registro por pavimento (ou global, conforme o motor lança).
- Acrescentar **Refazer** (apaga a rede do sistema, inclusive confirmados, com confirmação; reaproveitar o padrão do esgoto) e aplicar as regras A e B.

### Task 4: F4 — Esgoto
- Generalizar o caso do destino (`confirmadosDoOutroDestino`) para o registro: qualquer hipótese do esgoto que mudou aparece no aviso B; o "Refazer tudo" existente é a ação.

### Task 5: F5 — Circuitos automáticos
- Escolhas = os critérios/cargas de `blueprint:circuitosAutomaticos` (ler as fontes). Registro global (ou por quadro).
- "Refazer circuitos automáticos": remove os circuitos criados pelo motor e o `circuitoId` dos pontos deles e recria com as escolhas atuais — **confirmação explícita** de que eletrodutos e fiação desses circuitos mudam (relançar eletrodutos em seguida; o aviso B dos eletrodutos acende). Circuito criado à mão: fica (o motor só refaz os seus — marcar a origem no registro ou pelo nome/flag existente; decidir na F5 com o que o modelo já tem).

**Fora (anotar):** distribuir tomadas/luzes (ação por ambiente guiada pelo déficit da norma, não "lançar tudo"); climatização (prévia gerada a cada clique — já sempre disponível); preferências só de exibição (não há motor).

## Execução
- Frente nova de `origin/main` (`bash scripts/nova-frente.sh relancar-quando-escolha-muda`), ler `orçacloud-saas/CLAUDE.md` inteiro.
- Plano versionado `docs/planos/2026-10-24-relancar-quando-escolha-muda.md` com o pedido literal e as 2 decisões (REGRA #6).
- F1 → F2 → F3 → F4 → F5, um subagente por fase com revisão, como nas frentes anteriores; revisão final do ramo; PR, CI verde, eu faço o merge e confiro com `conferir-producao.sh`.
- Sem migration de banco (o registro mora no modelo da planta).
- Frente em paralelo `forro-luz-pelas-travessias` mexe em `blueprintEletrodutos.ts`: esta frente começa por F1 (kernel) e só toca o planejador depois que aquela for mesclada (rebase).

## Verificação
- **Testes (por fase):**
  - F1: comando registra/atualiza; Ctrl+Z volta; payload canônico ida e volta; `diferencasDasEscolhas` (igual, diferente, chave nova com padrão = igual).
  - F2: rede toda ligada + caixas trocadas → plano com "Relançar com as escolhas atuais" disponível e aviso com a diferença; relançar com sugeridos refaz sem confirmação; com confirmados pede confirmação; "sem caixas" remove as CP (inclusive aceitas) e não deixa órfã; o lote leva o registro; rede antiga sem registro → botão disponível sem aviso.
  - F3/F4/F5: o mesmo roteiro por motor.
  - Teste de componente do aviso (texto, botão, motivo quando desligado).
- tsc, suíte inteira com a conta fechando; `blueprintCasaAutomatica` na CI.
- **Prova no harness local** (planta Garden): lançar com caixas → aceitar → trocar a preferência para "sem caixas" → aparece "Lançado com: com caixas · agora: sem caixas" e o botão → confirmar → as CP somem e o aviso some. Prints antes/depois.

## Divisão em dois PRs (24/10/2026, ~18h30)

Pergunta minha: *"posso publicar as etapas 1 e 2 assim que a correção passar na revisão, e deixar água, esgoto e
circuitos para um segundo PR"* — resposta do usuário: *"sim"*. **PR 1 = Tasks 1 + 2** (núcleo + eletrodutos);
**PR 2 = Tasks 3–5** (água/pluvial, esgoto, circuitos), a partir do `main` com o PR 1.

## Decisões tomadas nas correções (Tasks 1 e 2)
- O registro guarda as escolhas do eletroduto por quadro; com FORRO (Casa Automática), também a faixa do forro
  (chaves sem rótulo, fora do aviso) e sem a rota máxima (que o forro ignora). `hipotesesDoQuadro` reconstrói o forro
  do registro — relançar pelo editor mantém a rede no forro.
- Rede antiga no forro SEM registro (pavimento com forro de verdade, trecho acima da face do forro): botões desligados
  com o motivo "rede no forro lançada antes do registro — relançar aqui a tiraria do forro". Ponto alto com rota pela
  parede (TUE a 2,2 m) sem forro NÃO bloqueia.
- Lançamento parcial não regrava o registro enquanto sobrar rede lançada com a escolha antiga (o aviso continua certo).
- `refazerEletrodutos` apaga as caixas de passagem que estão nos nós da rede, inclusive aceitas; caixa solta fica.
- A Casa Automática usa a preferência de caixas do usuário; o resto do painel (bitola, rota…) segue o padrão — com o
  painel fora do padrão, o aviso acende logo após gerar (diferença real).
- `registrosDeLancamento` é REFERÊNCIA no portão das camadas (metadado, sem geometria).

## Decisões tomadas na Task 3 (água e pluvial)
- Alvo `null` (planta inteira) nos dois: os "Lançar tudo" lançam todas as origens / todas as águas do telhado num lote.
- Escolhas = só o que muda a rede: água (gaveta + pressão + alimentador + reservação + recalque); pluvial (intensidade
  que vale — informada, senão a da tabela —, calha, condutor). Pressão da rede pública, estática máxima, dias de reserva,
  fração do inferior e rendimento da bomba ficam fora (só aviso/volume).
- "Rede do sistema" (o que o Refazer apaga): água = tubos ligados a uma origem + alimentador, extravasor, limpeza, sucção
  e recalque (confirmados inclusive) + o registro de gaveta na limpeza; pluvial = todo tubo PLUVIAL + os bocais. Nunca:
  pontos de consumo, aparelhos, caixa, aquecedor, hidrômetro, bomba, boia, ralo posto à mão, caixa de areia, saída.
- Forro da casa: o registro AGUA guarda o forro, a faixa da quente, a subida do alimentador e a cota enterrada ajustada
  (F18) sem rótulo; o PLUVIAL, a profundidade ajustada do condutor (F18). O editor planeja com elas (relançar mantém a
  água no forro). Água antiga no forro sem registro → botões desligados com o motivo.

**Limitações conhecidas:** mover a climatização relança fora do forro quando a rede antiga do forro não tem registro
(como antes); eletroduto desenhado à mão acima da face de um forro real, sem registro, também bloqueia (motivo à
vista). Prova no app: o cenário inteiro está coberto pelo teste do editor (aviso → confirmação → CP saem → aviso some →
Desfazer volta); prova por imagem no navegador NÃO feita.

## Estado
- [x] desenho aprovado (24/10/2026)
- [x] Task 1 — F1 núcleo (registro no modelo) — kernel 0.105.0 (`registrosDeLancamento`, `RegistrarLancamento`/`ApagarRegistroDeLancamento`), `utils/blueprintRegistroDeLancamento.ts`, `AvisoDeEscolhasMudaram.tsx`; bundle da planta-api regerado (a function ainda precisa de deploy)
- [x] Task 2 — F2 eletrodutos — `utils/blueprintEscolhasDoEletroduto.ts` (escolhas por quadro, rótulos e padrões, lotes de lançar/refazer com o registro, botão da regra A, confirmação por quadro); `refazerEletrodutos` apaga as CP da rede inclusive aceitas (`caixasDaRedeDoQuadro`); aviso B na tabela por quadro; Casa Automática com a preferência de caixas e o registro no lote
- [x] Task 3 — F3 água e pluvial — `utils/blueprintEscolhasDaAguaEPluvial.ts` (escolhas, rótulos e padrões dos dois sistemas, alvo global; lotes com o registro e a regra do lote parcial; Refazer novo que apaga a rede do sistema, confirmados inclusive, e nunca aparelhos/pontos; botão da regra A; confirmação com o que mudou); aviso B nos dois painéis; "Refazer tudo" e "Relançar com as escolhas atuais" nos rodapés; Casa Automática grava os registros AGUA e PLUVIAL (com o forro, a faixa da quente, a subida e os ajustes F18 sem rótulo)
- [ ] Task 4 — F4 esgoto
- [ ] Task 5 — F5 circuitos automáticos
- [x] revisão final do ramo (Tasks 1+2) — "Sim, com correções"; correção 2 `65779b7e` (falso forro, portão de camadas, menores)
- [x] PR 1 (Tasks 1+2) + CI — PR #149, `ci` 22min21s verde; suíte local 11.459 ok, 0 falhas
- [x] publicação do PR 1 — squash `a28bd09e` em 24/10/2026; `conferir-producao.sh "Relançar com as escolhas atuais"` provou o domínio servindo a28bd09; `supabase functions deploy planta-api` (autorizado: "pode") com o bundle 0.105.0, função respondendo 200
- [ ] PR 2 (Tasks 3–5)
