# Minhas Tarefas › Painel de análise

## Pedido original

> "minhas tarefas: cria tela com dashboard para analise das minhas tarefas"
>
> Sessão: 6c0adccf-b0a9-4fb9-8f72-0d2151bc86c4 · 15/11/2026

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 15/11/2026 | Quais tarefas o painel analisa? Hoje o contador do menu conta "criei ou sou responsável", mas a lista mostra também as que o proprietário ou administrador supervisiona. | **"Tudo o que vejo na lista"**: o mesmo conjunto da Lista e do Kanban. |
| 15/11/2026 | Que perguntas o painel precisa responder? | **As quatro:** Estou dando conta? · O que está atrasando? · Quem está com o quê? · Onde está a carga? |
| 15/11/2026 | Onde o painel entra na tela? | **Terceira visão à parte:** Lista \| Kanban \| Painel. |
| 15/11/2026 | Abordagem: calcular no banco, no navegador, ou num item próprio da barra lateral? | No navegador, sobre o mesmo array da Lista (plano aprovado no plan mode). |

**Decisões minhas, registradas no plano aprovado e que o usuário pode mudar:**
- As subtarefas entram na conta. Das 31 subtarefas, 29 têm um responsável diferente do da tarefa-mãe.
- O painel não aparece no celular: lá continua o `TasksMobileApp`.

### Mudança de rumo, 16/11/2026: o desenho segue o §4.5 e o §4.5.1 do guia

A leitura completa do guia (REGRA #1.1), feita depois da aprovação, mostrou que painel analítico tem regra própria. Com isso, o desenho aprovado mudou nestes pontos (o conteúdo e as quatro perguntas continuam os mesmos):

1. **Indicadores.** Saem os cinco KPIs coloridos. Entram KPIs `destaque` neutros, em que a cor só aparece por limiar escrito (`LIMIAR`) (§4.5).
2. **Duas faixas.** A tela se divide em **Hoje** (retrato atual, que não depende do período) e **Resultado do período**, cada uma com o seu `<h2>` (§4.5.1).
3. **Seletor de período.** Sai da barra de escopo e vai para a linha do `<h2>` do período, à direita. Assim fica claro que ele não mexe na faixa Hoje.
4. **Concluídas por responsável.** "N concluídas no período" saiu de "Quem está com o quê", que está na faixa Hoje, e virou o cartão próprio "Concluídas por responsável" na faixa do período. Nenhum número da faixa Hoje muda com o seletor.
5. **Opções de período.** Passam a ser 8, 12 ou 26 semanas, com padrão de 12. A janela de 4 semanas dava 4 colunas, curta demais para ler tendência (§4.5.1 pede série com vários pontos).

## Desenho

```
Tarefas                               [Lista][Kanban][Painel]  Status  Mobile  [+ Nova]
Como estão as tarefas que você vê: o que está aberto hoje e o que foi feito no período.
┌ Espaço ▾ · Pasta ▾ · ⚙ ┐                                  (barra §5.3, a mesma do Kanban, sem "Prazo")

Hoje · 16/11/2026
[Abertas 24] [Atrasadas 6 ⚠ · Ver na lista →] [Vencem em 7 dias 3] [Sem prazo 13]
┌ Atraso das abertas ───────────────┐ ┌ Atrasadas mais antigas ───────────────┐
│ no prazo / 1–7 / 8–30 / 31–90 / +90│ │ Renovar contrato · Ana · 42 dias      │
└────────────────────────────────────┘ └───────────────────────────────────────┘
┌ Quem está com o quê ──────────────┐ ┌ Onde está a carga [Espaço|Obra|Origem|Prior.]┐
│ Ana ████▓▓░░ 5                     │ │ Compras ██████ 10 · 3 atrasadas         │
└────────────────────────────────────┘ └───────────────────────────────────────┘

Resultado do período                                       [8 sem.|12 sem.|26 sem.]
[Concluídas 46] [Criadas 50] [No prazo 71 %] [Tempo até concluir 4 dias]   (sm, gray)
┌ Criadas × concluídas por semana (3/5) ────────┐ ┌ Concluídas por responsável (2/5) ┐
└───────────────────────────────────────────────┘ └──────────────────────────────────┘
```

**Regras de conta**, para que os números batam com a Lista:
- "Aberta" é `status !== 'done'`.
- "Atrasada" é decidida por dia local, com `daysUntil` / `dayOf` de `utils/tasksMobileAgenda.ts`.
- **Recorte:** org do topo → espaço/pasta nas tarefas-raiz → mais os descendentes. É o mesmo da Lista com Prazo "Todas".
- **Concluída no período:** `status === 'done'` e `completed_at` dentro da janela.
- **No prazo:** o dia local da conclusão é igual ou anterior ao dia do prazo. Mostra `—` quando nenhuma concluída tinha prazo.
- **Tempo até concluir:** mediana de `completed_at − created_at`.
- **Semana:** começa na segunda-feira. A janela vai da segunda-feira de (semanas − 1) semanas atrás até hoje.

## Plano

| Arquivo | O que muda | Como sei que terminou |
|---|---|---|
| `docs/planos/2026-11-15-tarefas-painel-analise.md` | Este plano | Vai no mesmo PR |
| `utils/tarefaRotulos.ts` (novo) | `PRIORIDADE_TAREFA` e `ORIGEM_TAREFA` saem do `TasksList`. A origem ganha os módulos que já geram tarefa e não tinham rótulo: `suprimentos`, `processos`, `services`, `comercial`. Inclui `rotuloOrigem()` | `TasksList` importa daqui, sem cópia local |
| `components/TasksList.tsx` | Usa os rótulos compartilhados. Origem desconhecida mostra o próprio nome em vez de "Manual" | Tarefa de Suprimentos aparece como "Suprimentos" na coluna Origem |
| `utils/tarefasPainel.ts` (novo) | `montarPainelTarefas(tarefas, opções)` → `{ hoje, periodo }` | Os testes passam |
| `__tests__/tarefasPainel.test.ts` (novo) | Casos: prazo hoje não é atrasada; faixas de atraso; no prazo × fora do prazo; `—` sem base; semana vazia = 0; subtarefa conta; responsável inativo; obra fora da lista; período corta pela conclusão; mediana | `npx vitest run __tests__/tarefasPainel.test.ts` verde |
| `components/TasksDashboard.tsx` (novo) | A tela acima, com `KpiCard` e `components/analysis/chartKit.tsx` | Aberta no app local e conferida contra §4.5, §4.5.1 e §28 |
| `components/TasksModule.tsx` | `ViewMode` ganha `'dashboard'` e o botão "Painel". `scopeControls` se divide em Prazo + Espaço/Pasta. Novo `escopo`. `loadError`. "Agrupar" fica escondido no Painel. Subtítulo próprio do Painel | Lista e Kanban iguais. O Painel obedece ao topo e a Espaço/Pasta |
| `docs/ui_ux_guia_unificado.md` §28.4 | Nova linha na tabela de paletas: "Situação do prazo" (em dia / atrasada / sem prazo), com o resultado do validador | A linha existe |

## Estado

- [x] Plano em `docs/planos/`
- [x] `utils/tarefaRotulos.ts` + `TasksList`. Origem "Suprimentos" conferida na Lista do harness.
- [x] Testes de `tarefasPainel`: 17 casos.
- [x] `utils/tarefasPainel.ts`
- [x] `components/TasksDashboard.tsx` + `__tests__/components/TasksDashboard.test.tsx` (5 casos)
- [x] Ligação no `TasksModule`
- [x] Guia §28.4: linha "Situação do prazo" + nota da barra empilhada
- [x] Verificação mecânica:
  - `tsc` sem erros.
  - `check-ui-standard`, `check-system-projects`, `check-project-classification` e `check-xss-sinks` limpos.
  - 17 arquivos de teste, 151 casos.
- [x] Verificação na tela, pelo harness `docs/spikes/tarefas-modulo` com o `TasksModule` de produção a 1600 px (área útil de 1290 px), roteiro `c:/tmp/pwtest/tarefas_painel.cjs`:
  - claro e escuro do sistema iguais;
  - 0 erro, 0 aviso `width(-1)`, 0 escrita, sem rolagem lateral.
- [ ] Verificação no app real com login (depende do usuário entrar na janela)
- [ ] PR, CI, merge e conferência em produção

### Ajustes que a conferência na tela pediu (16/11/2026)

- **"Atrasadas" 7 no Painel × "Atrasadas (6)" na Lista.** A contagem da Lista é só de tarefas-raiz, e o painel conta subtarefas. O cartão passou a dizer "inclui 1 subtarefa" (`subtarefasAtrasadas`).
- **Total sumindo na barra empilhada.** O total na ponta sumia quando o último segmento era zero (a linha só com atrasadas). Agora cada segmento desenha o total só se for o último não-vazio da sua linha.
- **Linhas reorganizadas pela altura.** Os dois gráficos de barra ficam na mesma linha ("Atraso das abertas" | "Quem está com o quê"), e a lista ao lado da carga.
- **"Atrasadas mais antigas" com 5 itens.** Eram 8. No pé do cartão entrou "Ver as N atrasadas na lista", com o mesmo destino do KPI.
- **Rótulo direto nas 26 semanas.** As colunas semanais passaram a ter rótulo direto também com 26 semanas: valor de coluna visível nunca só no tooltip (§28.3).

## Verificação

- `npx vitest run __tests__/tarefasPainel.test.ts __tests__/tasksMobileAgenda.test.ts __tests__/taskServiceMinhasTarefas.test.ts __tests__/orgContextGuard.test.ts __tests__/rotuloSemCaixaAltaGuard.test.ts __tests__/rotuloPadraoGuard.test.ts`
- `tsc --noEmit`, com o exit lido por grep.
- `bash scripts/check-ui-standard.sh components/TasksDashboard.tsx components/TasksModule.tsx components/TasksList.tsx`, mais `check-system-projects.sh` e `check-project-classification.sh`.
- `validate_palette.js` para a paleta "Situação do prazo".
- **Na tela, com a barra lateral e a 1600 px (é tudo leitura):**
  - Abrir com o topo em "Todas" e em uma organização.
  - Conferir que "Atrasadas" bate com "Atrasadas (n)" da Lista.
  - Trocar o Espaço e ver os números mudarem.
  - Trocar o período e ver só a faixa do período mudar.
  - Clicar numa atrasada abre o formulário.
  - Conferir que não há `width(-1)` no console.
  - Conferir que o sistema em modo escuro deixa a tela igual.
