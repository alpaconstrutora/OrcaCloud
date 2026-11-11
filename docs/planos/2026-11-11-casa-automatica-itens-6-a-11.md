# Casa automática — itens 6 a 11 da análise: planta da prévia, pendência que leva ao local, programa avisado no campo, motor dividido

## Pedido original

Sessão de 11/11/2026 (Claude Code, VS Code), depois da publicação do PR #359 (itens 1–5, plano
`2026-11-11-casa-automatica-previa-velha.md`).

> Faça fase própria para estes itens

"Estes itens" = os pendentes da análise de 11/11/2026 (pedido "incorporacao > planta inteligente > casa automatica:
analise"): 6 prévia sem desenho; 7 pendências só texto, sem levar ao elemento; 8 programa aceita combinação inválida e só
avisa depois de gerar; 9 cartão "Dados do Empreendimento" acima das abas em todas elas; 10 detalhes de acessibilidade e
rótulo ("Alternativas tentadas", setas em texto, grupos do relatório sem `aria-expanded`); 11 motor de 3.674 linhas num
arquivo.

Decisões do usuário na mesma sessão (perguntas de múltipla escolha):

- Item 7 — para onde a pendência leva: **"Os dois"** (marca na planta da prévia antes de lançar; com a casa lançada,
  também "Ver no editor", que seleciona e enquadra).
- Item 6 — o que a planta da prévia mostra: **"Seletor de disciplina"** (como as pranchas: Arquitetura · Humanizada ·
  Hidrossanitária · Elétrica · Climatização, mais o pavimento).
- Item 11 — até onde dividir: **"Por etapa"** (um arquivo por bloco, contexto compartilhado explícito, a função principal
  vira o roteiro), provado por casas de referência idênticas antes e depois.
- Desenho apresentado em chat — resposta: **"O desenho está certo? sim"**.

## Contexto lido no código (origin/main 39d049b2)

- A prancha já desenha a planta por pavimento e por disciplina: `desenharPlanta(d, model, opcoes, enq)` em
  `utils/blueprintExport.ts` (opções `humanizada`, `mobiliario`, `eletrica`, `hidrossanitaria: RedeDaPrancha`,
  `climatizacao`); `modeloDoPavimento` em `utils/blueprintPranchas.ts`; `enquadrar` em `blueprintExport.ts`.
- Já existe um `Desenhista` que produz SVG: a classe `DesenhistaSvg` DENTRO de `components/blueprint/PainelUnifilar.tsx`.
- As pendências (`PendenciaDoPpci = { grupo, texto }`, tipo compartilhado com o PPCI) saem AGREGADAS por contagem, mas a
  origem tem o local: `conflitosDoModelo` (trechoId, outroId), `marcasDeVerificacao` (levelId, at), o programa e as
  regras (ambientes). São 98 pontos de `pendencias.push` em `utils/blueprintCasaAutomatica.ts`.
- O editor seleciona por id (`selecionar(ids)`), mas a navegação do canvas (`AcaoDeNavegacao`) só enquadra o desenho
  inteiro — não há enquadrar-na-seleção.
- O motor: 3.674 linhas; `planejarComPavimentos` (~l.1575–3769) é uma função só de ~2.200 linhas com as etapas em
  fechamentos que compartilham o modelo, as pendências e as hipóteses. O motor é determinístico (mesmo pedido → mesmo
  plano). Os testes da casa não rodam inteiros nesta máquina (memória do projeto): a CI é o portão.

## Etapas e itens

Ordem A → B → C → D. Uma publicação (PR → CI verde → merge → produção conferida) por etapa. Conferência no app real com
planta descartável (conta de teste, arquivada no fim) em cada etapa com tela.

### Etapa A — pequenos (itens 8, 9, 10)

**A1. Programa inválido avisado no campo (item 8).**
O que muda: `TelaCasaAutomatica` chama `normalizarProgramaCurto(p.curto)` a cada render e lista os `avisos` abaixo da
grade do Programa (âmbar, um por linha), antes de gerar. O formulário continua aceitando o valor digitado (o motor
corrige do mesmo jeito); o aviso diz para quanto ele vai.
Pronto quando: teste da tela — 4 suítes com 2 dormitórios mostra "Suítes: 4 → 2 (no máximo uma por dormitório)."; com o
programa válido, nenhum aviso.

**A2. Cartão "Dados do Empreendimento" só na aba Programa (item 9).**
O que muda: o cartão passa a renderizar dentro do painel da aba Programa; a mensagem do último "Construir"
(`peloEmpreendimento.mensagem`) passa para a faixa de estado abaixo das abas (vale em todas).
Pronto quando: teste da tela — com prévia e aba Resultado, o cartão não está; na aba Programa, está; a mensagem do
Construir aparece com a aba Resultado aberta.

**A3. Acessibilidade e rótulos (item 10).**
O que muda: os botões dos grupos do Relatório ganham `aria-expanded` e `aria-controls`, e ícones `ChevronRight`/
`ChevronDown` (lucide) no lugar de "▸"/"▾"; "Alternativas tentadas" → "Arranjos testados", com `title` explicando
("quantos arranjos da planta o gerador experimenta antes de escolher o de menos problemas").
Pronto quando: teste da tela — o grupo aberto tem `aria-expanded="true"`, o fechado `"false"`; o rótulo novo existe; o
texto "▸" não aparece mais.

Fechamento da etapa A: tsc, `check-ui-standard.sh` na tela, testes da tela, conferência no app (avisos do programa,
cartão só no Programa, relatório abre/fecha), PR → CI → merge → `conferir-producao.sh`.

### Etapa B — a planta da prévia (item 6)

**B1. `DesenhistaSvg` em arquivo próprio.**
O que muda: a classe sai de `PainelUnifilar.tsx` para `components/blueprint/DesenhistaSvg.tsx` (exportada, mesmo
comportamento); o `PainelUnifilar` importa de lá.
Pronto quando: os testes do unifilar passam sem mudança.

**B2. `PlantaDaPrevia` (componente novo).**
O que muda: `components/blueprint/PlantaDaPrevia.tsx` recebe o modelo da prévia (`plano.resultado`), a lista de
pavimentos, o pavimento e a disciplina escolhidos e, opcionalmente, marcas `{ levelId, ponto }[]` (etapa C). Desenha
`desenharPlanta(DesenhistaSvg, modeloDoPavimento(resultado, levelId), opcoes da disciplina, enquadrar(...))` num `<svg>`
com `viewBox` (escala ajustada ao espaço da tela, sem rolagem horizontal). Disciplinas: Arquitetura (planta técnica),
Humanizada (`humanizada`), Hidrossanitária (`hidrossanitaria` com a rede — as redes que a prancha lista para o pavimento),
Elétrica (`eletrica`), Climatização (`climatizacao`); disciplina sem nada no pavimento não aparece no seletor (§19.5).
Pronto quando: teste do componente — com uma prévia de 2 pavimentos, troca de pavimento muda o desenho; o seletor só
lista disciplinas com conteúdo; o SVG tem `role="img"` e `aria-label` com pavimento e disciplina.

**B3. A planta na aba Resultado.**
O que muda: `TelaCasaAutomatica` mostra `PlantaDaPrevia` na aba Resultado, abaixo do resumo; o seletor de pavimento e de
disciplina fica no próprio cartão; pavimento padrão = o térreo da prévia.
Pronto quando: teste da tela — com prévia, a planta está na aba Resultado; sem prévia, não. Conferência no app: a casa
gerada aparece desenhada por pavimento e disciplina, com print anexado ao relatório.

Fechamento da etapa B: como a A, mais um print de cada disciplina na conferência.

### Etapa C — a pendência leva ao local (item 7; depende da B)

**C1. `locais` na pendência.**
O que muda: `PendenciaDoPpci` ganha `locais?: { levelId: ObjectId; ids: ObjectId[]; ponto: Point | null }[]` (opcional:
o PPCI segue sem ele e sem mudança). No motor da casa, as pendências agregadas guardam os locais de origem: conflitos
(trecho + peça, ponto médio do trecho no pavimento dele), trechos em porta/janela, marcas de verificação de rede
(levelId + at), programa/regras quando a origem traz o ambiente. Inventário dos 98 `pendencias.push` registrado neste
plano: quais ganharam local e quais ficam texto (e por quê).
Pronto quando: teste do motor com fixture pequena — uma pendência de conflito traz os ids dos dois lados e o pavimento;
o PPCI compila e passa sem tocar nele.

**C2. Clicar a pendência marca na planta da prévia.**
O que muda: no Relatório, pendência com `locais` vira botão; o clique vai à aba Resultado, escolhe o pavimento do 1º local
e a disciplina da pendência (rede de água → Hidrossanitária/água, eletroduto → Elétrica…; sem disciplina → Arquitetura) e
passa as marcas para `PlantaDaPrevia` (círculo destacado em cada ponto). Pendência sem local continua texto.
Pronto quando: teste da tela — clique leva ao Resultado com o pavimento e a disciplina certos e as marcas desenhadas.

**C3. "Ver no editor" com a casa lançada.**
O que muda: `AcaoDeNavegacao` ganha o enquadrar-nos-ids (a caixa dos elementos + folga); com a casa lançada (os ids do
lote estão no desenho — conferido pela presença deles no modelo), a pendência mostra "Ver no editor →": fecha a tela,
abre o pavimento, seleciona os ids e enquadra.
Pronto quando: teste do canvas/editor — a ação enquadra a caixa dos ids; teste da tela — o atalho só aparece com a casa
lançada. Conferência no app: lançar a casa, clicar uma pendência, o editor abre com os elementos selecionados.

### Etapa D — dividir o motor por etapa (item 11)

**D1. O marco das casas de referência (antes de mexer).**
O que muda: teste novo `__tests__/casaAutomaticaMarco.test.ts` que gera as casas de referência (as da sonda: 12×30 térrea
e sobrado, 15×25, 10×30 com 2 e com 4 dormitórios, 15×30 4 dormitórios, R1-B, R1-A — uma por caso, com tempo próprio) e
compara com `__tests__/fixtures/casaAutomaticaMarco.json` (por casa: `snapshotHash(plano.resultado)`, `plano.criados`,
`plano.pendencias`). O arquivo é gravado UMA vez a partir do `main` antes da divisão e não se regrava na etapa D.
Pronto quando: o marco passa na CI no código atual (sem divisão).

**D2. A divisão.**
O que muda: `utils/casaAutomatica/` — `contexto.ts` (`ContextoDaCasa`: o estado que os fechamentos de
`planejarComPavimentos` compartilham), `implantacao.ts`, `forroEPressao.ts`, um arquivo por etapa (estrutura, telhado,
âncoras, mobiliário, hidráulica, elétrica, climatização, verificação), `pedido.ts` (worker, assinatura, conferir) e
`index.ts` com o roteiro. `utils/blueprintCasaAutomatica.ts` vira reexportação — nenhum import do app muda. Um commit por
extração, cada um com o marco verde.
Pronto quando: o marco passa SEM regravar o fixture; `blueprintCasaAutomatica.ts` só reexporta; nenhum arquivo novo
passa de ~600 linhas; tsc e a suíte da CI verdes.

## Execução da etapa A

Aprovação do plano: "ok" (11/11/2026). Execução nesta sessão, por mim (tarefas pequenas, quase tudo em
`components/blueprint/TelaCasaAutomatica.tsx`); testes em `__tests__/components/TelaCasaAutomatica.test.tsx`, escritos
antes do código (falham primeiro).

- **A1.** Testes: `avisos do programa no formulário` — premissas `{ dormitorios: 2, suites: 4 }` → o texto
  "Suítes: 4 → 2 (no máximo uma por dormitório)." dentro de `data-testid="avisos-do-programa"`; `PREMISSAS_DA_CASA_PADRAO`
  → o bloco não existe. Código: `const avisosDoPrograma = normalizarProgramaCurto(p.curto).avisos` (o motor chama com as
  hipóteses padrão: `programaDaCasa(entrada.curto, hip.programa)` e as premissas não as mudam); lista `<ul role="status">`
  âmbar, `text-xs`, abaixo da grade do Programa. Fica de fora o aviso das vagas descobertas, que só existe em
  `programaDaCasa`.
- **A2.** Testes: `cartão do Empreendimento só no Programa` — com prévia, aba Resultado: sem `casa-pelo-empreendimento`;
  aba Programa: com ele; `mensagem-do-construir` visível com a aba Resultado. Código: o `<section>` vai para dentro do
  painel da aba Programa (primeira seção do card, §30); a mensagem vai para a faixa de estado abaixo das abas.
- **A3.** Testes: `relatório: grupo com aria-expanded e seta em ícone` — o grupo aberto (VERIFICACAO) tem
  `aria-expanded="true"` e `aria-controls` apontando para a lista; clicar fecha (`"false"`); o texto do botão não contém
  "▸"/"▾"; `getByLabelText('Arranjos testados')` existe com `title`. Código: `ChevronRight`/`ChevronDown` (lucide), `id`
  da lista por grupo.
- Fechamento: `npx tsc --noEmit -p .`, `bash scripts/check-ui-standard.sh components/blueprint/TelaCasaAutomatica.tsx`,
  os testes da tela; conferência no app (roteiro `c:/tmp/pwtest/conferencia-casa-etapa-a.cjs`, planta descartável); PR
  → CI → merge → `conferir-producao.sh`.

## Estado

| Item | Situação |
|---|---|
| A1 | feito — teste da tela; conferido no app (aviso "Suítes: 4 → 2…" no formulário, some com o programa válido) |
| A2 | feito — teste da tela; no app NÃO conferido (a planta descartável não tem Empreendimento ligado, o cartão não aparece) |
| A3 | feito — testes da tela; conferido no app (4 grupos com `aria-expanded`, troca no clique, sem "▸", "Arranjos testados") |
| B1 | a fazer |
| B2 | a fazer |
| B3 | a fazer |
| C1 | a fazer |
| C2 | a fazer |
| C3 | a fazer |
| D1 | a fazer |
| D2 | a fazer |
