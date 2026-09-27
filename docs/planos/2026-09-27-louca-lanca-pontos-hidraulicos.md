# A louça lança os pontos hidráulicos dela

## Pedido original

Sessão de 27/09/2026 (VS Code), na ordem:

> INCOPORACAO < PLANTA INTELIGENTE < modal esgoto automatico: botao de lancar esta desabilitado. tem uma mensagem de "nenhum ponto de esgoto tipado".
> o que siginifica essa mensagem e por que o botao lancar esta desabilitado?

> 1. estou com uma planta aberta com caixa dagua vaso sanitario e caixa de inspecao. nesta condicao deveria lancar a rede automaticamente?
> 2. trocar: Um ponto de UX: a frase "nenhum ponto de esgoto tipado" diz o que falta, mas não diz o que fazer. Seria melhor algo como "Coloque os aparelhos (vaso, lavatório, ralo…) em Hidráulica › Esgoto — um ponto na rede de água fria não conta". Se quiser, eu troco o texto.

> 1. lancei agua fria e o app fez o lançamento da caixa ate o lavabo. ok
> 2. na planta tem uma vaso sanitaria. o sistema nao reconheceu?

Opções oferecidas: (a) a louça cria os pontos dela ao ser colocada; (b) o Esgoto
automático avisa e oferece criar. Resposta:

> a

## Diagnóstico (banco, planta "Planta 26/09/2026", branch `b9732de3…`)

O vaso estava em `componentes` (família LOUCA, `tipoId: VASO`), não em
`terminais`. O esgoto automático só lê `terminais` com `disciplina = 'ESGOTO'` e
`tipoHidraulico`. A louça e o ponto só se ligavam por proximidade
(`pontoHidraulicoDoComponente`, 600 mm) — e nada criava o ponto.

## Decisões

- **Quais redes:** as mesmas do kit "Distribuir pontos" (`disciplinasDaPeca`):
  as que o aparelho admite, água quente só em `HIPOTESES_PONTOS_PADRAO.aguaQuenteEm`
  (chuveiro, lavatório, pia) e o box (chuveiro) sem esgoto próprio — vai pelo
  coletor. Uma regra, dois usos.
- **Onde:** no centro da peça; todas as redes no mesmo (x, y), cota da ficha.
- **Idempotente** por (tipo, disciplina) a até 600 mm: não duplica; a rede que
  falta nasce na posição do irmão que já existe.
- **Não é `sugerida`:** a peça foi colocada pelo usuário.
- **Um Ctrl+Z** desfaz a peça e os pontos (`runBatch`).

## Itens

1. [x] `utils/blueprintEsgotoAutomatico.ts` — motivo "nenhum ponto de esgoto
   tipado" diz o que fazer. **Pronto quando:** teste com vaso só na água fria
   espera o texto novo.
2. [x] `utils/blueprintPontosHidraulicos.ts` — `pontosDaLouca(model, componente)`
   devolve os `AddTerminal` que faltam. **Pronto quando:** testes: vaso → AF +
   esgoto; lavatório → AF + AQ + esgoto; box → sem esgoto; segunda chamada → [];
   peça sem `ligaAoPonto` → [].
3. [ ] `components/blueprint/BlueprintEditor.tsx` › `adicionarComponente` — a
   peça (ou o conjunto, com os filhos) entra com os pontos num lote só.
   **Pronto quando:** teste de componente: colocar vaso → 2 terminais; Ctrl+Z → 0.
   ⚠️ O teste de componente não consegue clicar no canvas (jsdom sem Konva): a
   montagem do lote é coberta por `pontosDasLoucasCriadas` (testes puros, inclusive
   o conjunto de banheiro); o `runBatch` é o caminho de sempre do editor.
   **Em aberto:** código feito; falta ver na tela — colocar um vaso e conferir
   o painel "ligado"; Ctrl+Z e a peça some com os pontos.
4. [x] `components/blueprint/PainelComponenteSelecionado.tsx` — louça já
   desenhada sem os pontos (a planta do usuário) mostra "Lançar os pontos (N)".
   **Pronto quando:** teste de componente clica e os terminais aparecem.
5. [x] Motivo do esgoto automático conta as louças sem ponto de esgoto.
   **Pronto quando:** teste com vaso-louça + CI espera "selecione a peça".
6. [x] Suíte (505 arquivos / 5.777 testes verdes), typecheck e `check-ui-standard.sh`
   no painel: feitos em 27/09/2026. Publicado (`cee179c`, push em main) e
   conferido de fora: `conferir-producao.sh "ainda sem ponto de esgoto"
   "lancar-pontos-da-louca"` → o domínio serve exatamente origin/main.

## Fora do escopo (anotado)

- Mover a louça **não** leva os pontos junto; excluir a louça não exclui os pontos.
- O **mobiliário automático** (Analisar › Mobiliário, "aceitar") grava louças
  sugeridas SEM os pontos — elas ficam cobertas pelo botão do painel e pelo
  motivo do esgoto automático, que as aponta pelo nome.
