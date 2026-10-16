# Torre de Controle — Fluxo P2P como processo visual (canvas)

## Pedido original

> suprimentos < Torre de Controle — Fluxo P2P: implementar processo visual como os prints
>
> [dois prints anexados: (1) editor de workflow "Standart Warehouse" — sidebar
> "Trigger & Conditions" à esquerda com lista de gatilhos/condições e botões
> "+ Custom Trigger"/"+ Custom Conditions", canvas com fundo pontilhado, cartões
> "Trigger"/"Conditions" com cabeçalho colorido, linhas chave→valor e botão no
> rodapé, ligados por linhas ortogonais azuis com um chip ("BOL updated") no
> meio; (2) "Data Processing & Machine Learning Pipeline" — canvas com cartões
> de etapa (status + título + descrição), chips "Split"/"Group", caixas de grupo
> com borda colorida, zoom +/− no canto inferior esquerdo e painel direito
> "Pipeline Metrics & Insights" com gráfico de barras e tabela "Details".]
>
> Sessão: 90990005-64af-45a4-962f-9833d6690565 · 2026-10-16

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 2026-10-16 | Escopo: monitor só-leitura ou também editor de gatilhos no canvas? | **Monitor + editor de gatilhos.** O editor NÃO é novo: é o `TemplateEditorModal` do módulo Processos, extraído para arquivo próprio e aberto pré-preenchido com o evento da transição. |
| 2026-10-16 | Onde ficam os 4 KPIs de saúde das integrações? | **Faixa acima do canvas** (§4 do guia), com o drawer do KPI preservado. |
| 2026-10-16 | A topologia pode deixar de ser linear? | **Ramificar**: Recebimento → {Estoque, Nota Fiscal} → Contas a Pagar. A costura passa a viver na **aresta**; o nó herda `inboundSeam` da sua entrada (KPIs continuam por nó). |

## Contexto

A Torre (`components/P2PFlowBoard.tsx` + `services/p2pFlowService.ts`, view `fluxo-p2p`,
menu Suprimentos › "Fluxo Integrado (P2P)") era uma fila de 8 cartões ligados por setinhas,
com 4 KPIs e drawer ao clicar num nó. Desde 28/09 lia o motor de Processos (costura
`orquestrada` quando a org tem modelo `EVENTO` ativo para o evento do nó anterior).

Mudança de regra registrada aqui (B.1): até 16/10 "o nó SEGUINTE ao emissor fica
orquestrado". Com a ramificação, isso pintaria `recebimento→estoque` (entrada automática,
custo médio) como conduzida pelo processo de aprovação de pagamento — falso. Agora
`EDGE_EVENT_KEYS` diz qual transição cada evento conduz: `purchase_order.approved` →
pedido→recebimento; `received`/`divergence`/`receipt.divergence` → recebimento→fiscal;
`nfe.linked` → fiscal→financeiro; `internal_transaction.paid` → financeiro→pagamento. O
teste `p2pFlowServiceCosturaOrquestrada` mudou de intenção por isso (Nota Fiscal, não
Estoque, fica orquestrada com template em `purchase_order.received`).

Sem dependência nova: SVG + HTML posicionado com `transform`. Moldes: linhas ortogonais +
`<marker>` do Gantt (`components/schedule/ScheduleGantt.tsx`); roda sem rolar a página
(`hooks/useRodaNaoPassiva.ts`). ⚠️ `Sheet`/`Modal` são `fixed` **sem portal**: drawers,
editor e `orgTargetModal` ficam no `P2PFlowBoard`, irmãos da grade, nunca dentro da camada
com `transform` do canvas.

## Plano — um item por arquivo (o que muda · como sei que terminou)

### A. Frente e plano
- [x] **A.1** `bash scripts/nova-frente.sh torre-p2p-canvas` → `C:\D\frentes\torre-p2p-canvas` a partir de `origin/main` 564c8b37, `node_modules` real.
- [x] **A.2** este arquivo.

### B. Dados — a costura vive na aresta
- [x] **B.1 `services/p2pFlowService.ts`** — `P2PEdge`, `P2PGroup`, `P2PTemplateAtivo` (id/nome/org/evento); `DEFINICAO_DAS_ARESTAS` (7 transições, notas migradas dos nós), `EDGE_EVENT_KEYS`, `P2P_GROUPS`, `montarArestas` (motor sobrepõe o retrato estático); snapshot devolve `edges` e `groups`; `lerMotor` seleciona `id, name, trigger_event_key, organization_id`; o nó herda `inboundSeam/inboundNote` da única aresta de entrada. Terminou: `__tests__/p2pFlowServiceCosturaOrquestrada.test.ts` (5 casos, caso 1 reescrito) verde.
- [x] **B.2 `utils/p2pLayout.ts`** — posições fixas por id (coluna × linha; Estoque/Nota Fiscal na mesma coluna), grade de reserva para id desconhecido, `caixaDoGrupo`, `tamanhoDoDesenho`, `caminhoOrtogonal` (`M H` ou `M H V H`, `meio` para o rótulo), `enquadrarDesenho`. Terminou: `__tests__/p2pLayout.test.ts` (9 casos) verde.

### C. Canvas
- [x] **C.1 `hooks/usePanZoom.ts`** — escala 0,5–2 (passo ×1,2) ancorada no cursor, roda via `useRodaNaoPassiva`, pan por arraste no fundo (limiar 4 px; `data-no-pan` em nós/rótulos/controles), `enquadrar`. Terminou: `__tests__/usePanZoom.test.ts` (3 casos) verde.
- [x] **C.2 `components/p2p/P2PEdges.tsx` + `P2PEdgeLabel.tsx`** — `<path data-edge>` 2 px por costura com `<marker>` por cor + caminho transparente de 14 px para o clique; rótulo HTML em `meio` (chip `rounded-[6px]`, sem caixa alta), "+ Gatilho" quando aceita evento e ninguém escuta, nome do modelo quando orquestrada (clique = editar). Modo "escolher transição" traceja e pulsa as arestas com evento.
- [x] **C.3 `components/p2p/P2PNodeCard.tsx`** — cartão 240×148 com cabeçalho (ícone, rótulo, dono), linhas Registros/Pendentes/Processos/Entrada (texto §8) e rodapé "Ver no módulo"; sem `inboundNote`. `components/p2p/p2pSeam.ts` é a fonte única das cores das costuras.
- [x] **C.4 `components/p2p/P2PCanvas.tsx`** — fundo pontilhado que acompanha pan/zoom (`backgroundSize`/`Position` por `style`), caixas de grupo tracejadas, camada com `transform`, controles +/%/−/enquadrar, faixa do modo de escolha (Esc cancela), `ResizeObserver` guardado para o jsdom.
- [x] **C.5 `__tests__/components/P2PFlowBoardCanvas.test.tsx`** (4 casos) — 8 cartões, 7 linhas, 3 grupos; clicar na transição mostra a costura e a nota no painel; zoom muda o `transform`; roda sai `defaultPrevented`; abaixo de `lg` a lista vertical substitui o canvas (desktop × celular por `matchMedia`, não por CSS). `P2PFlowBoardDrawer.test.tsx` ganhou os mocks de `useOrgContext`/`useStore`/`processService` e clica no nó dentro de `[data-canvas]`.

### D. Biblioteca e editor
- [x] **D.1 `components/p2p/P2PLibrary.tsx`** — Etapas (clique seleciona), Gatilhos (um por `ProcessEventKey`, contagem de modelos, "Editar"), "+ Novo gatilho" (modo de escolha), Condições (carrega `getTemplateSteps` ao abrir; `descreverCondicao`).
- [x] **D.2 `components/processos/TemplateEditorModal.tsx`** — extraído de `ProcessosModule.tsx` (392 linhas movidas, sem mudança de comportamento; exporta também `STEP_TYPE_LABEL` e `ListaDeMarcacao`, usados fora do editor); prop nova `inicial` (`trigger_type`/`trigger_event_key`/`name`), lida só ao abrir sem `editando`. Terminou: `__tests__/components/ProcessosModeloAlcada.test.tsx` (4) verde sem alteração.
- [x] **D.3 `components/P2PFlowBoard.tsx`** — cabeçalho §20 (`h1 text-3xl` + `p mt-1.5`), filtro de obra `h-9 rounded-[6px]`, refresh §5.1, toggle "Métricas" (persistido `p2p:painel`), "Novo gatilho" §17; grade `256px | canvas | 360px`; `useOrgWriteTarget().resolveWriteOrg('single')` antes de abrir o editor (topo numa org não pergunta); editar modelo = org DO modelo; `onSaved` → `load()` + toast. Drawers/editor/`orgTargetModal` fora do canvas.
- [x] **D.4 `__tests__/components/P2PFlowBoardEditor.test.tsx`** (3 casos) — Novo gatilho → escolher pedido→recebimento → editor com `EVENTO` + `purchase_order.approved` + nome sugerido → salvar chama `createTemplate('org', …)` e `getSnapshot` 2×; "Editar" abre `editando` sem perguntar org; seção Condições lista a etapa condicionada.

### E. Painel direito
- [x] **E.1 `components/p2p/P2PMetricsPanel.tsx`** — gráfico §28 (barras horizontais, `#3b82f6` + `#94a3b8` de contexto quando há nó selecionado, rótulo na ponta em cor de texto, sem animação), `StandardTable bare dense` das etapas (sem busca: 8 linhas fixas), detalhe do nó (Ver registros) ou da transição (modelos + Editar, processos em andamento, "+ Novo gatilho"; transição sem evento diz que não emite).

### F. Guia
- [x] **F.1 `docs/ui_ux_guia_unificado.md`** — §31 "Diagrama de processo (canvas)" + linha no CHECKLIST DE AUDITORIA COMPLETA.
- [x] **F.2 `components/Layout.tsx`** — sem mudança.

## Verificação

| Prova | Resultado |
|---|---|
| `bash scripts/check-ui-standard.sh` nos 10 `.tsx` tocados | exit 0 em todos |
| `check-system-projects.sh` / `check-project-classification.sh` (`P2PFlowBoard.tsx`) | exit 0 |
| `npx vitest run` — p2pLayout (9), usePanZoom (3), costura orquestrada (5), drawer (3), canvas (4), editor (3), ProcessosModeloAlcada (4), orgContextGuard + cabecalhoSemCinzaGuard + segurancaMigrations (20) | 51 verdes, 0 falhas |
| Tipos | `tsc --noEmit` inteiro caiu 3× com exit 139 (Node/V8 desta máquina, ver memória de 16/10 — não é código); checagem pela API do TypeScript, arquivo a arquivo, com as opções do tsconfig: **0 erros nos 14 arquivos tocados** (testes ficam fora do programa, como no `tsc`). A prova completa é a CI do PR. |
| Visual (Playwright, login real, `c:\tmp\pwtest\torre-p2p-canvas.cjs`, contexto "Todas") | ✅ 16/10 13:28 — 8 cartões, 7 linhas, 3 grupos; zoom +/− e roda (a página NÃO rolou); pan por arraste; transição recebimento→fiscal lista 6 modelos (3 nomes × 2 orgs, com o nome da org) e a instância real `PC-013-013-0002` (atrasada); drawer do nó abre; "Novo gatilho" → escolher pedido→recebimento → modal "Selecionar organização" (REGRA #5, a conta é membro de 2 orgs) → editor com `EVENTO` + "Pedido de compra aprovado" (fechado sem gravar); Condições abre; celular (390px) vira lista com 8 cartões; Processos › abre. **Sem erro de console/JS nem HTTP 4xx/5xx.** Achados corrigidos na hora: (1) canvas abria a 35% ilegível → vista inicial com piso 0,7 alinhada ao início + "Enquadrar" mostra tudo; (2) rótulo da aresta com os nomes dos modelos invadia os cartões → chip curto "Orquestrada · 3", nomes no `title` e no painel; (3) `nomeDaOrg` faltava na desestruturação do painel (ReferenceError em "Todas") — o teste do editor passou a cobrir a lista de modelos. |
| Publicação | ⏳ pendente |

### Checklist de aplicação (REGRA #1) — itens verificados
- Cabeçalho §20 ✅ (`h1` solto, `p mt-1.5`, KPIs logo abaixo); raiz `space-y-6 pb-20` sem padding próprio §20.2 ✅.
- KPI Cards §4 ✅ (`KpiCard`, cor por costura). Toolbar §5: não há tabela de página; o filtro de obra e o refresh seguem §5.1/§5.3 (`h-9`, `rounded-[6px]`) ✅.
- Tabela §6.10 ✅ (`StandardTable bare dense` no painel; cabeçalho branco §6.11 herdado); tipografia §7 ✅ (`text-sm font-normal`); campos editáveis inline: **não se aplica** (nenhuma célula editável).
- StatusBadge §8 ✅ (costura = texto colorido no cartão, na tabela e nos drawers); rótulo de aresta/grupo = chip `rounded-[6px]` sem caixa alta — padrão novo documentado no §31, não é §8 nem §8.1.
- Ações §9/§9.2 ✅ (`ActionIconButton` para Editar/fechar); coluna de ações: não se aplica.
- Loading §11 / Empty §12 ✅ (drawer de registros e tabela do painel); Toast §13 ✅ (`useToast`); Confirmação §14: não há ação destrutiva.
- Radius §16 ✅ (`rounded-[10px]` containers, `rounded-[6px]` controles, `h-9`); botão primário §17 ✅ (só "Novo gatilho" e os do rodapé dos drawers/editor em azul sólido).
- Drawer §26 ✅ (`Sheet` padrão); §22: o editor recarrega o snapshot (9 contagens, não uma lista editada) — recarga é a forma certa aqui; §25: o editor cria e fecha (criação), editar é "nova versão" — comportamento do `TemplateEditorModal`, não alterado.
- Gráfico §28 ✅ (copiado de `RentalAnalysisOverview.tsx`); §30: formulário é o do editor existente.
- Toggle grade/lista, busca persistida (§3), paginação, lote: **não se aplicam** a esta tela.

### Roteiro visual (skill `rodar-app`)
1. Suprimentos › Fluxo Integrado (P2P) com o topo numa org e em "Todas": canvas com 8 cartões, 7 linhas, 3 grupos; print.
2. Zoom +/− e roda; arrastar o fundo; "Enquadrar".
3. Clicar na transição recebimento→fiscal: painel lista o modelo "Aprovação de pagamento de fornecedor" e os processos em andamento.
4. "+ Novo gatilho" → escolher transição → editor com o evento certo (**não** gravar sem combinar com o usuário).
5. Sem erro de console nem 4xx/5xx; Processos › Modelos continua abrindo o editor.

## Estado
- [x] A.1 · A.2 · B.1 · B.2 · C.1–C.5 · D.1–D.4 · E.1 · F.1 — código e testes (2026-10-16)
- [x] Verificação visual no navegador (2026-10-16 13:28, tabela acima)
- [ ] Publicação (`git push origin HEAD:main`), `conferir-producao.sh "Métricas do fluxo" "Novo gatilho"`, `fechar-frente.sh torre-p2p-canvas`

## Fora de escopo (decidido, não esquecido)
- Editor de etapas no canvas (arrastar etapas como nós); posições livres/persistidas; BPMN/gateways; webhooks; pan/zoom no celular.
