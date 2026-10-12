# Cabeçalhos sem cinza no app

## Pedido original

Sessão de 12/10/2026 (Claude Code, VS Code), transcrito literalmente (acompanhado de um print
do cabeçalho do Gantt do Planejamento — fundo cinza claro nas colunas e nas datas):

> hearder em cinza. Vamos eleminar isso do app de uma vez por todas.
> cores cinzas são pessimos do ponto de vista do User experience.
> Nenhum header deve estar na cor cinza!

Perguntado sobre a cor substituta e o alcance, o usuário respondeu:

> Qual cor deve substituir o cinza nos cabeçalhos? — "Use a mesma cor já usada no app"
> Qual o alcance desta rodada? — "Componentes centrais + Gantt + trava (Recomendado)"

## Decisões

- **Cor = azul-claro que o app já usa em cabeçalhos** (`bg-blue-50`, hoje em 42 `thead`/`tr`
  de cabeçalho, ex. colunas ES/EF), com a mesma família do azul de ação (botões, aba ativa):
  fundo `bg-blue-50`, linha de baixo `border-blue-200`, divisórias `border-blue-100`, texto
  `text-blue-800` (contraste de leitura AA sobre o fundo; o texto cinza antigo não passava).
  Fonte única: `components/ui/cabecalhoDeTabela.ts`.
- **O que muda:** `StandardTable` (~70 telas), `SortableHeader`, grade do Planejamento
  (`ScheduleGridView`), cabeçalho do Gantt (linha de mês, colunas fixas, datas) e a trava.
- **O que NÃO muda:** barras do Gantt (barras de resumo cinza são dado, não cabeçalho);
  trilho de abas (§19.1) e barra de opções do ribbon — são barras de ferramentas, não
  cabeçalho de tabela; as ~75 telas com `thead` escrito à mão (entram na trava como
  dívida herdada, que só diminui).
- **Trava (catraca)**, nos moldes de `orgContextGuard`: `__tests__/cabecalhoSemCinzaGuard.test.ts`
  varre `components/` atrás de `<thead>`/linha de cabeçalho com fundo `gray|slate|zinc|neutral|stone`.
  `BASELINE` = a dívida herdada de 12/10/2026; só pode diminuir; arquivo novo com violação quebra
  o build.

## Itens

### 1. Componentes centrais
- **Muda:** `StandardTable`, `SortableHeader` (texto e ícones), `ScheduleGridView`.
- **Pronto quando:** teste de componente confirma as classes azuis no `thead` do
  `StandardTable` e nenhuma `gray` no cabeçalho; print do harness do Planejamento.
- **Estado:** ✅ feito (12/10). `StandardTable`, `SortableHeader` e `ScheduleGridView` em azul; tokens em `components/ui/cabecalhoDeTabela.ts`. Medido no navegador (`docs/spikes/cabecalhos-sem-cinza/medir.mjs`, cor renderizada de cada elemento): `StandardTable` 1 → 0 elementos cinza no cabeçalho.

### 2. Cabeçalho do Gantt
- **Muda:** bloco `Gantt Header` de `ScheduleGantt.tsx` (linha macro de mês, colunas fixas da
  esquerda, datas, fim de semana do cabeçalho, divisórias).
- **Pronto quando:** harness mede o fundo computado de TODOS os elementos do cabeçalho do
  Gantt e nenhum é cinza (R≈G≈B), e o print confere; medido também em produção.
- **Estado:** ✅ feito (12/10). Linha de mês, colunas fixas, datas e fim de semana do cabeçalho em azul. Medido: 512 → 0 elementos cinza dos 1.220 do cabeçalho (a medição foi provada contra o código antigo; o 1º limiar descartava `gray-50` e deu 0 falso — corrigido). Medição em produção: pendente da publicação.

### 3. Trava no CI
- **Muda:** `__tests__/cabecalhoSemCinzaGuard.test.ts` + baseline.
- **Pronto quando:** a trava falha ao reintroduzir `bg-gray-50` num `thead` novo e passa no
  estado atual; roda na suíte (o CI já roda `vitest run`).
- **Estado:** ✅ feito (12/10). `__tests__/cabecalhoSemCinzaGuard.test.ts`, BASELINE = 180 arquivos / 273 linhas escritos à mão (bem mais que o ~75 estimado antes: a 1ª contagem era mais estreita). Provada nos dois sentidos: devolver `bg-gray-50` ao `StandardTable` reprova ("StandardTable.tsx: 1 (baseline 0)"). Achado: as regex perdiam as barras invertidas ao gravar por heredoc (trava cega) — reescrita pela ferramenta de escrita.

### 4. Guia de UI e publicação
- **Muda:** `docs/ui_ux_guia_unificado.md` (§6/§6.2: cabeçalho de tabela é azul, nunca cinza).
- **Pronto quando:** typecheck, XSS, build e suíte completa com a conta fechando; publicado só
  com autorização; conferido em produção com o usuário de leitura.
- **Estado:** guia ✅ (§6.11 nova, 4 snippets corrigidos, item 7b no checklist). Typecheck, XSS, build, check de UI e suíte (8628 + 34 pulados = 8662, conta fechando) verdes. **Publicação: pendente de autorização.**
