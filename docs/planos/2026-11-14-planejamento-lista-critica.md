# Engenharia › Planejamento (lista) — correções da crítica de design

## Pedido original

Sessão 98868220 (Claude Code), 14/11/2026, ~20h50 (Brasília):

> /impeccable critique engenharia > planejamento

Respostas às perguntas do fim da crítica (mesma sessão):

> Por onde começamos? → **"Corrigir o que mente"**
> Sobre "Importar Excel" nesta tela → **"Importar cronograma de verdade"**
> Quanto quer resolver agora? → **"Tudo, incluindo menores"**

E logo depois:

> um de cada vez

Crítica registrada em `.impeccable/critique/2026-11-14T23-46-23Z__components-planningdashboard-tsx.md`
(feita na frente `critica-planejamento`, não versionada): 16/40, três P1.

## Itens

Ordem combinada: um de cada vez, primeiro o que mente.

### 1. KPIs que mentem → recortes clicáveis com a conta da Central de Comando — ✅ feito (este PR)

**O que muda**
- `PlanningDashboard` sai. "Progresso Médio 5.4%" era o default fixo `obraProgress`
  (`constants.ts`), nunca recalculado; "Atividades Críticas" contava itens órfãos do
  cronograma (Divino: 132 itens de cronograma × 37 itens vivos do orçamento);
  "Próximo Vencimento" virava "atraso" eterno; nenhum card filtrava nem seguia a busca.
- Quatro recortes no `ProjectList` (contexto PLANEJAMENTO), botões com `aria-pressed`, que
  filtram a lista e contam sobre a lista já buscada/filtrada: *Com tarefa atrasada*,
  *Terminam em 30 dias*, *Com tarefa crítica em aberto*, *Sem cronograma*.
- Conta única em `utils/planejamentoIndicadores.ts`, extraída da Central de Comando
  (`CommandCenterPanel` passa a usá-la): avanço físico ponderado pelo orçado, EV/PV/SPI,
  atrasadas, críticas, término previsto, desvio da linha de base. "Hoje" passa a ser o dia
  local (antes UTC: depois das 21h o painel já contava o dia seguinte).
- `useIndicadoresDosPlanejamentos`: busca leve `id, budget` dos planejamentos da lista (a
  lista não carrega `budget`); estados calculando / falhou (clique tenta de novo) / pronto.
- Rota `eng-planejamento` passa `isExternalLoading` (antes mostrava "Cadastre o primeiro"
  enquanto sincronizava).

**Como sei que terminou**
- `__tests__/planejamentoIndicadores.test.ts` verde (7 testes).
- `tsc --noEmit` 0 erros; `check-ui-standard.sh` limpo em ProjectList, AppRouter e
  CommandCenterPanel; `orgContextGuard` verde.
- Tela local (14/11, escrita bloqueada, 0 tentativas): cards 2 / 1 / 2 / 0 de 2; Divino na
  Central = 33 de 37 atrasadas, término 02/12/2026 (entra em "Terminam em 30 dias"); Garden =
  2 de 2 atrasadas, término 15/04/2026; cada recorte filtra; busca "garden" recorta os cards
  para "de 1"; Enter no card liga/desliga.

### 2. "Importar Excel" cria ORÇAMENTO → importação de cronograma de verdade — ⏳ planejar (`/impeccable shape`)

**O que muda:** importação de EAP com datas (planilha e/ou MS Project) que grava
`classification: 'PLANEJAMENTO'` e a organização do seletor do topo; modal no Dialog do app
(`role="dialog"`, Esc, foco preso, arquivo pelo teclado). Até lá, o botão não pode seguir
criando orçamento invisível nesta lista.
**Como sei que terminou:** importar um arquivo de teste numa org descartável cria um
planejamento que aparece nesta lista, com as datas do arquivo; nada nasce como ORCAMENTO.

### 3. Tabela com forma de cronograma — ⏳

**O que muda:** colunas Início, Término, Avanço real × previsto (`SegmentedProgress`, §29),
Atraso/SPI — da mesma conta do item 1; Status do orçamento, Pedidos e Tipo de Obra fora do
padrão em PLANEJAMENTO; Ações 152 px.
**Como sei que terminou:** em 1440 px as colunas de prazo cabem sem rolar; "Em andamento ×
Não Iniciado" não aparece mais na mesma linha.

### 4. O que Orçamentos ganhou em 14/11 também em Planejamento — ⏳

**O que muda:** colunas fixas, Agrupar e o subtítulo próprio (hoje escondido por
`hideHeader`) deixam de depender de `isOrcamentoContext`; cabeçalho duplicado do AppRouter sai.
**Como sei que terminou:** rolando a tabela na horizontal o nome do planejamento fica visível;
Agrupar aparece na toolbar.

### 5. Acessibilidade — ⏳

**O que muda:** Esc nos modais Novo/Importar; foco volta à linha ao voltar do planejamento;
contrastes do subtítulo (2,5:1), traço "-" (2,6:1) e "Com pedidos" (3,2:1); rótulo na busca;
`aria-label` nos botões só de ícone; `aria-expanded` no Filtro avançado; h2 no vazio.
**Como sei que terminou:** roteiro de teclado + medição de contraste na tela, todos ≥ 4,5:1.

### 6. Textos — ⏳

"5.4%"/vírgula (some com o item 1), subtítulo de marketing, modal Novo ("01/2025",
"ESCOPO TEMPORAL", "dados dinâmicos"), nomes da janela de colunas = cabeçalho, "FILTROS",
motivo do "Salvar como…", código "001" sugerido repetido.

### 7. Celular — ⏳

KPIs compactos (hoje os 4 cards empilhados ocupam a tela de 390 px inteira), alvos de 44 px,
coluna sem rótulo de largura 0.

### 8. Passada final (`/impeccable polish`) — ⏳
