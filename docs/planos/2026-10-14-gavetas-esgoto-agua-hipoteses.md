# Gavetas Esgoto automático e Água automática — resultado primeiro, folgas editáveis, campo numérico sem salto

## Pedido original

> avalie o drawer Esgoto automático (incorporacao > planta inteligente)

Sessão Claude Code (VS Code) · 14/10/2026, manhã.

Depois da avaliação (10 itens), o usuário respondeu à pergunta "Quer que eu confira e aplique as
correções nos dois [Esgoto e Água]?":

> sim

Ao ver a frente sendo criada, interrompeu:

> mas verifique antes. pois outra sessao trabalhou nesses arquivos. vamos evitar regressoes

A verificação mostrou que a avaliação tinha sido feita sobre o checkout de integração, **642 commits
atrás** de `origin/main`; três dos dez itens já estavam resolvidos no `main` (ver "Verificação contra
regressão"). Reapresentada a lista revista com os itens 1–4 propostos e o 5 (reorganizar a gaveta) em
aberto, o usuário respondeu:

> incluir

## Verificação contra regressão (14/10/2026, antes de editar)

- `origin/main` = `9b0df700`; frente `esgoto-agua-hipoteses` criada a partir dele, limpa.
- Nenhuma das ~48 frentes tem alteração não commitada nem commit fora de `main` em
  `BlueprintEditor.tsx`, `blueprintEsgotoAutomatico.ts`, `blueprintAguaAutomatica.ts`,
  `useBlueprintHidro.ts`.
- `docs/planos/2026-10-13-hidro-ancoras-automaticas.md` está publicado inteiro (fases 1–6) — ninguém
  no meio do trabalho nessas gavetas. A frente `esgoto-motivo-texto` (27/09) é vazia e abandonada.
- Já resolvido no `main` (retirado do escopo): hipóteses no `localStorage` (E3.3, 29/09 — hoje no
  estudo, `useBlueprintHidro`); botão principal desabilitado sem motivo (tem `title` com a pendência);
  estado vazio sem saída (13/10 — caixa de inspeção e ligação nascem sozinhas).

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 14/10 | Aplicar as correções nas duas gavetas (Esgoto e Água)? | "sim" |
| 14/10 | Incluir a reorganização da gaveta (item 5)? | "incluir" |

Decisões minhas, registradas para conferir:
- As quatro folgas do esgoto (`dnTuboQuedaMm`, `dnVentilacaoMm`, `rotaMaximaVezes`, `raioDoShaftMm`)
  e as quatro da água (`rotaMaximaVezes`, `raioDoShaftMm`, `pelasParedes`, `raioDeEncaixeMm`) **são
  lidas pelo cálculo** (conferido: `blueprintEsgotoAutomatico.ts:519/525/612/615/640`,
  `blueprintAguaAutomatica.ts:322/323/361/397/482`) — expor não é enfeite. O DN do tubo de queda é
  PISO (`max(hipótese, DN da louça)`), e o texto da gaveta diz isso.
- O botão principal do esgoto continua fazendo o que faz desde 13/10 (`planejarEsgotoCompleto`: lança
  o que falta; sem nada novo, relança os sugeridos; depois coletor e ventilação). Muda o RÓTULO e o
  `title` para dizerem isso — não o comportamento.
- Bloco de hipóteses recolhido por padrão, com o resumo dos valores na linha do título (precedente:
  "Hipóteses do pré-dimensionamento", `PainelPreDimensionamento.tsx:155`). Aberto/fechado é conveniência
  de quem vê → `usePersistedState`.
- Fora do escopo (dito ao usuário): aviso automático de "hipóteses mudaram desde o lançamento" — não há
  onde guardar com que hipóteses a rede foi lançada sem mexer no kernel; o botão "Relançar sugeridos"
  com `title` explicando cobre o caso.

## Plano

**1. `components/blueprint/CampoNumericoDeHipotese.tsx` (novo)** — campo numérico com rascunho local:
digitar não grava; grava ao sair do campo ou com Enter; Esc e valor inválido/vazio voltam ao último
valor; fora da faixa → encosta no limite. Aceita vírgula.
- **Como sei que terminou:** `__tests__/components/CampoNumericoDeHipotese.test.tsx` cobre: digitar `0`
  num campo `max=0` grava 0 (o bug do `|| -150`); apagar e sair não grava nada; Esc volta; abaixo do
  mínimo grava o mínimo; Enter grava.

**2. `components/blueprint/BlocoDeHipoteses.tsx` (novo)** — cabeçalho recolhível (`aria-expanded`,
chevron) com título + resumo; corpo com as regras e os campos.
- **Como sei que terminou:** usado nas duas gavetas; teste de componente abre/fecha e o resumo aparece
  fechado.

**3. `BlueprintEditor.tsx` › gaveta Esgoto**
- ordem: aviso do último lançamento → resultado (tabela por pavimento + linha de totais + avisos) →
  hipóteses (recolhidas) → ventilação/coletor/tratamento/verificação como estão;
- campos novos: DN do tubo de queda, DN da ventilação, rota máxima, raio do shaft;
- os 3 campos numéricos passam ao `CampoNumericoDeHipotese`;
- tabela no padrão de tabela em drawer (§6.9/§6.11/§6.2 do guia): cabeçalho branco sentence case,
  `px-3 py-2.5`, `border-r`, números à direita; "Fontes" → "Pontos"; tubo de queda mostra o DN;
- rodapé: "fonte(s)" → "ponto(s)"; "Relançar" → "Relançar sugeridos" com `title` do que faz; "Refazer"
  → "Refazer tudo" com `title`; ícone do título `text-blue-700` como as demais tarefas.
- **Como sei que terminou:** testes do editor (`Hidráulica › Esgoto automático` e `SEM caixa nem
  ligação`) passam com os rótulos novos; teste novo: digitar 0 em "Sob o piso" grava 0, e mudar o DN
  do tubo de queda chega a `setHipoteses`.

**4. `BlueprintEditor.tsx` › gaveta Água** — mesma ordem (resultado → hipóteses recolhidas → painéis);
campos novos: rota máxima, raio do shaft, "ramais pelas paredes", raio de encaixe; os 2 numéricos
passam ao `CampoNumericoDeHipotese`; tabela no padrão §6.9/§6.11.
- **Como sei que terminou:** testes `Hidráulica › Água automática` e `Água e Pluvial — "Lançar tudo"`
  passam; os `aria-label` antigos continuam valendo.

**5. Verificação mecânica**
- `bash scripts/check-ui-standard.sh` nos arquivos tocados;
- tipos por arquivo nos arquivos tocados (Node 24 instável — memória `tsc` heap);
- `BlueprintEditor.test.tsx` inteiro (com `--maxWorkers=4`) + os testes novos + `blueprintMemorialHidro`/
  `useBlueprintHidro` se existirem, com a CONTA fechando no reporter JSON;
- nenhum arquivo do bundle da `planta-api` é tocado (só componentes) → Fase 6 do plano de 13/10 não se
  aplica; conferir com `git diff --name-only`.

## Estado

- [x] 1 CampoNumericoDeHipotese — `__tests__/components/CampoNumericoDeHipotese.test.tsx` 8/8 (0 → grava 0;
  vazio volta; Enter; mínimo; Esc não sobe ao documento; mesmo valor não regrava; valor externo).
- [x] 2 BlocoDeHipoteses — coberto pelos testes do editor (abre recolhido com o resumo; `aria-expanded`).
- [x] 3 gaveta Esgoto — teste novo "Esgoto automático — gaveta (14/10/2026)" + os dois antigos ajustados
  ("Refazer" → "Refazer tudo"; abrir as hipóteses antes de ler os campos).
  ⚠️ Mudança em relação ao item: a coluna "Tubo de queda" mostra "Sim"/"—", não o DN — o plano por
  pavimento não carrega o DN real do TQ (é `max(hipótese, DN da louça)`), e mostrar o da hipótese
  seria afirmar um número que pode estar errado. O DN mínimo aparece no resumo das hipóteses.
- [x] 4 gaveta Água — teste "Água automática" estendido (resumo, shaft 3000, encaixe 700, rota 1,5,
  "pelas paredes" → "traçado reto").
- [x] 5 verificação (14/10/2026):
  - `check-ui-standard.sh`: 0 violações em `CampoNumericoDeHipotese.tsx`, `BlocoDeHipoteses.tsx`,
    `BlueprintEditor.tsx` (mesma saída do `main`).
  - `tsc --noEmit` (12 GB): exit 0, 0 `error TS`.
  - Editor sozinho: 252/252 (JSON, `success: true`, sem aviso). Os 22 arquivos da hidráulica/memoriais
    + guarda de cabeçalho: 199/199. (A rodada conjunta deixou 63 do editor "pending" com "Some tests
    are still running" — sintoma conhecido; por isso o editor foi rodado sozinho.)
  - Bundle da `planta-api`: nenhum arquivo de `utils/` tocado → não se aplica.

## Publicação

14/10/2026: `f57e2a8f` empurrado para `main` (rebaseado sobre `5b7ee9d8`). Check-run `ci` = success.
`conferir-producao.sh "Relançar sugeridos" "Rota máxima do ramal de esgoto"`: os dois textos no bundle
servido; domínio = `origin/main` (`ca5397a`, que já contém o commit). Conferência VISUAL na tela ainda
não feita (só testes de componente com jsdom).

## Verificação

Abrir Incorporação › Planta Inteligente › aba Hidráulica › Esgoto automático num estudo com
aparelhos: o resultado aparece no topo; "Hipóteses do lançamento" fechada mostra os valores; abrir,
digitar 0 em "Sob o piso" e sair do campo → fica 0 (antes virava −150); trocar o DN do tubo de queda
para 150 e "Relançar sugeridos" → o TQ do sobrado sai DN 150. O mesmo para Água automática.
