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
- Correção 1 + conciliação com o #154 (24/10/2026): água antiga no forro sem registro relança pelo forro da casa
  (`forroDaAguaDaCasa`, irmão de `forroEletricoDaCasa`, os dois sobre `hipotesesDoForroDaCasa`). A regra das premissas é
  UMA para eletrodutos e água (`hipotesesDaCasaDoEstudo` no editor): as gravadas; sem linha gravada (`vazio`), o padrão
  (o mesmo que gerar a casa usa — gerar NÃO grava a linha). ~~Sem a tabela, o padrão; bloqueio só com o forro desligado~~
  — SUPERADO pela correção 2 da F3 (I1/I2): erro de leitura (sem a tabela, timeout, RLS) NÃO vira padrão e bloqueia; e o
  forro da casa só vale com a ASSINATURA da casa. "Tem casa" é decidido pelo desenho (rede no forro de verdade, sem
  registro). Desde a correção 1 da F5 (M6), o motivo diz qual dos três casos: "Carregando as premissas…", "Não foi
  possível ler as premissas da casa." ou "O forro está desligado nas premissas da casa." — o mesmo texto nos eletrodutos,
  na água e no esgoto.

**Limitações conhecidas** (atualizadas na correção 2 da F3, 24/10/2026 — depois da conciliação com o #154):
- Rede antiga no forro, SEM registro: relança no forro da casa só com a ASSINATURA da casa (`temAssinaturaDaCasa`:
  todo horizontal no forro numa cota de faixa da casa ±2 mm e os ambientes com o rebaixo do forro da casa) e com as
  premissas da casa lidas (gravadas, ou o padrão quando não há linha). Sem a assinatura (planta sem casa, eletroduto ou
  ramal à mão acima da face de um forro real), ou com ERRO ao ler as premissas, continua bloqueada, com o motivo à vista.
- Casa gerada com premissas de forro que depois mudaram (outra faixa ou outro rebaixo) e sem registro: a assinatura não
  bate e a rede fica bloqueada — relançar exige o registro (gerar de novo) ou voltar as premissas.
- Água antiga sem registro relança com a faixa da quente e a subida do alimentador da casa, mas não recupera a cota
  enterrada ajustada pelo F18 (que dependia do esgoto daquele momento): o alimentador volta à cota do estudo.
- Esgoto (F4): casa gerada com as premissas da casa mudadas depois (outra faixa do esgoto) e sem registro: a água ainda
  tem a assinatura (o forro), e o esgoto relança com a faixa das premissas ATUAIS — não com a da geração. Casa gerada com
  o forro desligado: não há sinal de casa, e o esgoto antigo relança pelo estudo (no sobrado, tira as colunas do lugar).
- Esgoto (F4, correção 1): o que o Refazer MANTÉM e uma escolha comandaria — a caixa de inspeção CONFIRMADA (os
  afastamentos da caixa automática) e a ligação com a cota da rede CONFIRMADA (a profundidade presumida) — fica como
  está: a escolha nova não se aplica a ela. Essas escolhas saem do aviso enquanto a peça ficar, o registro guarda o valor
  ANTERIOR (nunca diz que aplicou o que não aplicou) e a confirmação diz "fica como está; … não se aplica a ela". A
  ligação aceita com a cota ESTIMADA é refeita na profundidade nova.
- Esgoto (F4, correção 1): o tratamento CONFIRMADO fica onde o usuário o pôs quando o destino continua o tratamento e
  nenhuma premissa dele mudou (sem registro, também). Mudou uma premissa do tratamento: as unidades voltam à posição e às
  medidas do motor (a confirmação diz). Com a caixa de inspeção SUGERIDA e o tratamento confirmado, a caixa de onde sai
  o tratamento também fica (o motor não liga caixa nova a unidade mantida): a rede segue ligada da caixa ao sumidouro, o
  afastamento novo não se aplica (fora do aviso, registro com o anterior) e a confirmação diz "fica como está".
- Esgoto (F4, correção 1): esgoto antigo bloqueado (a água no forro como a da casa, sem as premissas ou sem a
  assinatura): o "Lançar (n)" de pontos NOVOS segue ligado, como antes da F4; o relançar e o "Refazer tudo" ficam
  desligados, à vista, com o motivo.
- Prova no app: os cenários estão cobertos pelos testes do editor; prova por imagem no navegador NÃO feita. A planta
  "Garden" real (dados exportados) passa: eletrodutos a 2755 e água a 2598/2630 com a assinatura — relançar disponível.

## Decisões tomadas na Task 4 (esgoto)
- Alvo `null` (planta inteira): o "Lançar" do esgoto lança caixa, ramais, destino e ventilação de todos os pavimentos num
  lote. Módulo `utils/blueprintEscolhasDoEsgoto.ts`.
- Escolhas = as premissas do esgoto que mudam a rede (destino, caimentos, cota do ramal, DN do TQ e da ventilação, rota,
  raio do shaft, ventilação até a parede, válvula de admissão de ar — e a altura dela só com ela ligada —, afastamentos da
  caixa); as da rede pública (profundidade, distâncias das caixas do coletor) só com a rede pública; as do tratamento
  (filtro, padrão, temperatura, limpeza, infiltração, diâmetro do sumidouro) e a população da reservação só com o
  tratamento. Na comparação, as de um destino só entram com os DOIS lados nesse destino.
- **Destino = saída (a): uma das escolhas do registro.** Com registro, a troca de destino aparece no aviso como qualquer
  escolha, o botão principal vira "Relançar com as escolhas atuais" e a confirmação do Refazer — que nomeia a ligação, o
  coletor ou o tratamento a apagar — é a autorização; o rodapé deixa de dizer "há peças confirmadas do outro destino"
  (um aviso só). Sem registro (rede antiga), o caminho de antes: o "Lançar" pede a autorização.
- "Rede do sistema" (o que o Refazer apaga): os tubos de esgoto ligados à rede (`redeDaOrigem` das caixas de inspeção, da
  ligação e das unidades de tratamento — o critério do "Refazer tudo" de antes) e os com rótulo do motor (TQ, Ventilação,
  Coletor predial, Tratamento), confirmados inclusive; a caixa de inspeção SUGERIDA e as do coletor; a ligação SUGERIDA
  (com o destino tratamento, qualquer ligação); as unidades de tratamento; as válvulas de admissão de ar e as conexões
  (joelho, tê, luva, redução) sobre os tubos apagados — nomeadas na confirmação. Nunca: aparelhos, ralos, caixas
  sifonadas, a caixa de gordura (âncora da casa, não do esgoto), a caixa de inspeção confirmada e a ligação confirmada com
  a rede pública, nem tubo de outra disciplina.
- O "Refazer tudo" do esgoto agora refaz o esgoto INTEIRO (antes: só os ramais até a caixa — o coletor e a ventilação
  apagados só voltavam no "Lançar") e pede confirmação só se houver algo confirmado (antes: sempre).
- Casa Automática: grava o registro ESGOTO no lote dela, com a FAIXA do esgoto e, no sobrado, o tubo de queda por grupo e
  o raio do shaft da casa em chaves sem rótulo. Medido no sobrado da casa: relançar sem esses extras deixava 3 das 15
  colunas (TQ e ventilação) no lugar e somava 18 conflitos de rede; com o registro, ou com as premissas da casa, igual à
  casa (15/15, sem conflito novo). Na térrea a faixa não muda nada.
- Esgoto antigo SEM registro numa casa (sinal: a água no forro, com ou sem registro da água): com as premissas da casa e a
  ASSINATURA da casa na água (`aguaNoForroDaCasa`, sobre `blueprintAssinaturaDaCasa`), relança com os extras da casa
  (`esgotoDaCasaNoModelo`); sem as premissas (erro de leitura), sem a assinatura ou com o forro desligado nelas, os
  botões desligam com o motivo. Sem água no forro (não é casa), relança pelo estudo.

## Decisões tomadas na Task 5 (circuitos automáticos)
- Alvo = o PAVIMENTO (`alvoId` = `levelId`): o motor cria os circuitos dos pontos soltos de um pavimento, num quadro que
  pode ser de outro pavimento. Módulo `utils/blueprintEscolhasDosCircuitos.ts`. O painel trabalha no pavimento em que o
  usuário está, como o "Criar" sempre trabalhou; as funções recebem o pavimento explicitamente.
- Escolhas = critério ("Dividir luz e TUG"), carga máxima (declarada ou `'PADRAO'` = 10 A × tensão do quadro) e a seção
  mínima de TUE das hipóteses elétricas do estudo (a única que o motor lê). Com "um por função" de qualquer lado, a carga
  sai da comparação (não divide nada; o painel desliga o campo).
- **Quais circuitos são do motor:** o kernel não mudou. O registro guarda, numa chave sem rótulo (`circuitosDoMotor`), uma
  ASSINATURA por circuito criado: FNV-1a do nome + FNV-1a do resto das propriedades (tipo, tensão, disjuntor, seções,
  ligação, DR, curva, reserva). Não id (o kernel reatribui por posição ao ler o payload) nem uid (aleatório, nasce dentro
  do lote; a Casa Automática simula o lote e o editor o reexecuta com outros uids). Circuito do motor com o nome trocado
  ou com disjuntor/seção/curva/DR declarados depois deixa de bater e FICA (só o resto mudou → "do motor, alterado" na
  confirmação). A `fase` fica fora (balanceamento do quadro; a confirmação avisa que os novos nascem sem fase). Os pontos
  ficam fora (apagar ou mover ponto não é editar o circuito). Circuito com ponto em outro pavimento nunca é do motor deste.
- Circuitos de antes do registro: nenhum é identificável — sem aviso. ~~Com nada a criar, o botão desligava com o motivo
  "… ou apague os circuitos (Quadro de cargas) para relançar."~~ — SUPERADO pela correção 1 da F5 (I1, abaixo): o
  conselho de apagar quebrava a rede da Garden. O padrão de nome foi descartado: confundiria o circuito que o usuário
  batizou igual.
- **Correção 1 da F5 (25/10/2026, revisão final do PR 2):**
  - I1 (a planta Garden: 31 circuitos, todos de antes do registro, e 319 eletrodutos no forro): sem registro no pavimento,
    o painel oferece "Refazer todos os circuitos deste pavimento" — entram todos os circuitos com pontos SÓ nele — com
    confirmação FORTE: cada circuito pelo nome, o que estava editado à mão e se perde (disjuntor, seção, curva, DR, fase) e
    quantos eletrodutos são apagados e precisarão ser relançados. No MESMO lote, antes de apagar trechos, a rede antiga no
    forro (sem registro dos eletrodutos) ganha o registro ELETRODUTOS do quadro com o forro da casa (`forroDaCasaQueVale`):
    o relançar continua no forro. Sem como saber o forro (sem premissas, sem a assinatura), o Refazer fica bloqueado, com o
    motivo dos eletrodutos. Medido na Garden real: relançados 85 horizontais a 2755 (o forro) e 0 a 2150 — antes, apagar
    os circuitos e criar de novo dava 62 a 2150, fora do forro e por cima dos órfãos. Nenhum motivo manda apagar circuito.
  - I2: o Refazer refaz os DRs — os que citavam só circuitos refeitos saem (o geral fica) e os circuitos novos que pedem
    DR ganham o de 30 mA da norma (`sugerirDRs`/`comandosDasSugestoesDeDR`, como a Casa Automática). Na Garden, 9 DRs →
    9, nenhum vazio (antes: 9 vazios).
  - I3: o número do nome ("C3 — ") fica fora da assinatura — "Renumerar circuitos" não tira mais o circuito do motor.
  - M1: circuito sem ponto só conta como do motor num quadro dos circuitos do motor que têm ponto no pavimento.
  - M2: o aviso diz o pavimento ("Térreo — …"), e uma linha "Também no Superior" aparece quando há outro pavimento com
    diferença. M3: o motivo do botão desligado aparece também em texto no painel. M4: "Refazer tudo" (o nome dos outros
    motores) fica à vista ao lado do "Criar" e, desligado, diz por quê.
  - M5: com registro e nenhuma escolha mudada, a confirmação diz "Nenhuma escolha mudou — o resultado será o mesmo (e os
    itens confirmados se perdem)." — a mesma frase nos eletrodutos, na água, no pluvial e no esgoto (`TEXTO_NADA_MUDOU`).
- **Refazer** (sempre com confirmação — circuito não tem "sugerido"): num lote, apaga os circuitos do motor (o
  `DeleteCircuito` solta os pontos e os tira dos eletrodutos e dos DRs), apaga os ELETRODUTOS que só levavam esses
  circuitos e as caixas de passagem dos nós deles, recria os circuitos dos pontos soltos do pavimento no quadro do painel
  (que abre no quadro dos circuitos do motor) e grava o registro. Medido (sonda): sem apagar os eletrodutos, 11 trechos
  ficavam órfãos (sem circuito) e o "Lançar" dos eletrodutos criava 11 trechos novos, 10 deles exatamente por cima dos
  órfãos. Com o Refazer, nenhum órfão; o eletroduto que leva também outro circuito fica (sem os refeitos), e o plano dos
  eletrodutos mostra os pontos a ligar ("Lançar em todos (N)"). O aviso B dos eletrodutos NÃO acende (as escolhas dos
  eletrodutos não mudaram) — é o plano que mostra o que atualizar, e a confirmação manda relançar.
- Confirmação: o que sai e volta (circuitos, pontos — inclusive ponto posto à mão num deles —, quantos novos e em que
  quadro), o que mudou, os eletrodutos e a fiação a relançar (quantos saem, quantos confirmados, caixas, quantos ficam),
  DR e fase que se perdem, e o que fica (alterados e à mão, por nome) — "a escolha nova não se aplica a eles".
- Lote parcial ("Criar" com circuitos do motor de outra escolha sobrando): o registro mantém as escolhas antigas e só
  acrescenta as assinaturas dos novos.
- Casa Automática: grava o registro CIRCUITOS por pavimento com os circuitos que o lote dela criou (os do pavimento e os
  do ar-condicionado, mesmas escolhas), depois do DR e antes dos eletrodutos.
- Limitações (F5):
  - ~~"Renumerar circuitos" tirava o circuito do motor~~ — resolvido na correção 1 (I3). Trocar o resto do nome, ou
    disjuntor/seção, continua tirando (de propósito).
  - Sem registro, o Refazer leva TODOS os circuitos com pontos só no pavimento, inclusive os criados à mão — por isso a
    confirmação forte, com cada nome e as edições que se perdem. Circuito com ponto em outro pavimento fica.
  - (M8 da revisão, deixado como limitação) Os circuitos do ar-condicionado criados pelo gerador de Climatização avulso
    (fora da casa) não entram no registro: com registro no pavimento, ficam no Refazer, como os criados à mão.
  - Um circuito criado à mão com exatamente as mesmas propriedades (o nome sem o número inclusive) de um do motor, no
    mesmo pavimento, seria tomado como do motor. A confirmação lista por nome o que sai; Ctrl+Z desfaz.
  - A fase (balanceamento) dos circuitos refeitos se perde — a confirmação a lista entre as edições; balanceie de novo. Os
    DRs são refeitos pela norma (correção 1, I2); um DR que o usuário montou à mão com circuitos refeitos é substituído
    pelos da norma.
  - O Refazer é do pavimento em que o usuário está: refazer o térreo não refaz o andar de cima — o aviso diz "Também no
    Superior" (correção 1, M2) e o relançar é feito com o painel aberto lá.
  - Prova no app: coberta pelos testes do editor; prova por imagem no navegador NÃO feita.

## Estado
- [x] desenho aprovado (24/10/2026)
- [x] Task 1 — F1 núcleo (registro no modelo) — kernel 0.105.0 (`registrosDeLancamento`, `RegistrarLancamento`/`ApagarRegistroDeLancamento`), `utils/blueprintRegistroDeLancamento.ts`, `AvisoDeEscolhasMudaram.tsx`; bundle da planta-api regerado (a function ainda precisa de deploy)
- [x] Task 2 — F2 eletrodutos — `utils/blueprintEscolhasDoEletroduto.ts` (escolhas por quadro, rótulos e padrões, lotes de lançar/refazer com o registro, botão da regra A, confirmação por quadro); `refazerEletrodutos` apaga as CP da rede inclusive aceitas (`caixasDaRedeDoQuadro`); aviso B na tabela por quadro; Casa Automática com a preferência de caixas e o registro no lote
- [x] Task 3 — F3 água e pluvial — `utils/blueprintEscolhasDaAguaEPluvial.ts` (escolhas, rótulos e padrões dos dois sistemas, alvo global; lotes com o registro e a regra do lote parcial; Refazer novo que apaga a rede do sistema, confirmados inclusive, e nunca aparelhos/pontos; botão da regra A; confirmação com o que mudou); aviso B nos dois painéis; "Refazer tudo" e "Relançar com as escolhas atuais" nos rodapés; Casa Automática grava os registros AGUA e PLUVIAL (com o forro, a faixa da quente, a subida e os ajustes F18 sem rótulo)
- [x] Task 4 — F4 esgoto — `utils/blueprintEscolhasDoEsgoto.ts` (escolhas, rótulos e padrões, alvo global; o destino como escolha; lotes com o registro e a regra do lote parcial; Refazer que apaga a rede do motor — confirmados e o outro destino inclusive, nunca aparelhos/ralos/caixa confirmada — e relança o esgoto inteiro; botão da regra A; confirmação com o que mudou e as peças por nome); aviso B na gaveta; "Relançar com as escolhas atuais" no rodapé; Casa Automática grava o registro ESGOTO (faixa, tubo de queda por grupo e raio do shaft sem rótulo); esgoto antigo de casa relança pelas premissas da casa (assinatura da água) ou bloqueia com o motivo
- [x] Task 5 — F5 circuitos automáticos — `utils/blueprintEscolhasDosCircuitos.ts` (escolhas, rótulos e padrões; alvo = pavimento; assinatura dos circuitos do motor no registro; lote de criar com o registro e a regra do lote parcial; Refazer que tira só os do motor e os eletrodutos que só os levavam e recria; confirmação honesta; botão da regra A com motivo); aviso B no painel dos circuitos; "Criar 0" vira "Relançar com as escolhas atuais"; "Refazer circuitos automáticos" ao lado do "Criar"; Casa Automática grava o registro CIRCUITOS por pavimento
- [x] revisão final do ramo (Tasks 1+2) — "Sim, com correções"; correção 2 `65779b7e` (falso forro, portão de camadas, menores)
- [x] PR 1 (Tasks 1+2) + CI — PR #149, `ci` 22min21s verde; suíte local 11.459 ok, 0 falhas
- [x] publicação do PR 1 — squash `a28bd09e` em 24/10/2026; `conferir-producao.sh "Relançar com as escolhas atuais"` provou o domínio servindo a28bd09; `supabase functions deploy planta-api` (autorizado: "pode") com o bundle 0.105.0, função respondendo 200
- [x] PR 1b — #154 (rede antiga no forro relança pelas premissas da casa), depois do relato *"alterei e não ficou disponível para relançamento"* (Garden); publicado `baaadb1`
- [x] revisão final do PR 2 (Tasks 3–5) — "Sim, com correções" (Garden sem registro de circuitos não relançava; DRs vazios; renumerar); correção `24cadaf8`
- [x] suíte local do PR 2 antes da correção final: tsc 0; 11.555 ok, 0 falhas, 34 pulados
- [ ] PR 2 (Tasks 3–5) + CI
- [ ] publicação do PR 2
