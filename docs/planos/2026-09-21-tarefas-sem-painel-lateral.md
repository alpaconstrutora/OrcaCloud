# Tarefas — mover o painel lateral (rail de espaços) para a toolbar acoplada

## Pedido original
> mover funcionalidades do painel lateral para o toolbar acoplada a fim de remover o painel lateral.
>
> Sessão: 62d4f507-b4ab-4368-a7bb-e902f0ed2be1 · 2026-09-21 (mesma sessão do plano
> `2026-09-21-tarefas-toolbar-acoplada-filtro-espaco.md`, que criou a toolbar §5.2)

## O que o painel lateral (`TaskSpaceRail.tsx`) fazia — e para onde cada coisa vai
| Função do rail | Destino |
|---|---|
| Inbox: Hoje (n) · Atrasadas (n) · Todas as minhas | `FilterPopover` **Prazo** na toolbar (Todas · Hoje (n) · Atrasadas (n)) |
| Sem espaço (n) | opção **Sem espaço (n)** do popover **Espaço** (já existia sem contador) |
| Selecionar espaço / pasta | popover **Espaço** (agora controlado pelo módulo, vale para Lista E Kanban) + popover **Pasta** (aparece quando o espaço escolhido tem pastas: Todas · Sem pasta · cada pasta) |
| Criar espaço (input inline) | painel **Espaços** (`TaskSpacesSheet`, `Sheet` §26) — campo "Novo espaço" |
| Reordenar espaços (arrastar) | painel **Espaços** — botões ↑/↓ por linha (`reorderSpaces`) |
| Gerenciar espaço (nome, cor, pastas, membros, excluir) | painel **Espaços** → engrenagem → `TaskSpaceManager` (já existia, inalterado) |
| Criar / renomear pasta inline | `TaskSpaceManager` › aba Pastas (já existia) |
| Reordenar pastas / mover pasta para outro espaço (arrastar) | **removido** — não há equivalente no manager; renomear/recriar cobre o caso raro. Registrado como pendência abaixo |
| Arrastar tarefa para uma pasta | **removido** — mover tarefa de espaço/pasta continua pelo formulário da tarefa (campos Espaço → Pasta) |
| Largura do rail arrastável | some junto com o rail |

Também saem, por ficarem sem função com os popovers na toolbar: `TaskSpaceFolderView`
(grade de pastas ao escolher um espaço — o popover Pasta substitui), `TaskSpaceBottomSheet`
e as abas Hoje/Atrasadas/Todas + botão "Espaços" do cabeçalho em telas estreitas (a toolbar
é `flex-col md:flex-row`, cobre todas as larguras), e o título contextual `h2` com ✕ (o
gatilho do popover já mostra a escolha).

## Decisões de implementação
- Estado de Prazo/Espaço/Pasta vive no **`TasksModule`** (persistido via `usePersistedState`:
  `tasksModule:view`, `tasksListFilters:space`, `tasksListFilters:folder`) e recorta `visible`
  — assim Lista e Kanban obedecem ao mesmo recorte e "Nova" nasce no espaço/pasta filtrado.
  `TasksList` recebe os controles por um slot `filters` (não conhece mais `spaces`).
- Os contadores de Hoje/Atrasadas são calculados **depois** do recorte de espaço/pasta, para
  o número do popover bater com o que a tabela mostra. "Sem espaço (n)" é sobre a org inteira.
- Espaço persistido que não existe na org atual é descartado ao carregar (senão a tela
  abriria vazia com o gatilho sem rótulo).
- No Kanban os mesmos controles vão numa barra própria acima do quadro (§5.3), porque o
  quadro não tem toolbar acoplada.
- `TasksMobileApp` (celular real) não muda.

## Plano
| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1 | `components/TaskSpacesSheet.tsx` (novo) | Sheet "Espaços": novo espaço, lista com ↑/↓ e engrenagem (abre `TaskSpaceManager`) | `tsc` limpo; harness/prova abre o painel, cria e reordena |
| 2 | `components/TasksModule.tsx` | Sai rail/bottom sheet/folder view/título contextual/abas mobile; entram os 3 popovers + botão Espaços via `filters`; `visible` recortado por espaço/pasta; Kanban com barra §5.3 | `tsc` limpo; sem referência aos 3 componentes removidos |
| 3 | `components/TasksList.tsx` | Sai `spaces`/`fSpace`; entra slot `filters` | `check-ui-standard.sh` limpo |
| 4 | `components/TaskSpaceRail.tsx`, `TaskSpaceBottomSheet.tsx`, `TaskSpaceFolderView.tsx` | Excluídos | `grep` sem ocorrências fora dos próprios arquivos |
| 5 | `docs/spikes/tarefas-toolbar/main.tsx` | Harness passa `filters` em vez de `spaces` | harness abre sem erro |

## Estado
- [x] 1 · [x] 2 · [x] 3 · [x] 4 · [x] 5 (2026-09-21)
- [x] Extra: com o rail fora, a área útil passou de ~1016px para ~1290px — Obra e Origem
      voltaram a nascer visíveis em `TasksList` (soma 1288 ≤ 1290); Data inicial e Alerta
      continuam `defaultHidden`.
- [x] `__tests__/orgContextGuard.test.ts`: baseline de `TasksModule.tsx` desceu de 10 para 8
      (duas ocorrências de `|| ''` saíram junto com o rail — catraca só desce).
- [x] Verificação mecânica: `tsc --noEmit` limpo; `check-ui-standard.sh` limpo nos 3 arquivos;
      `check-system-projects.sh` e `check-xss-sinks.sh` limpos; suíte completa — ver commit.
- [x] Verificação visual (Playwright, harness `docs/spikes/tarefas-modulo/` = `TasksModule`
      inteiro com leituras dubladas e escritas abortadas; 0 escritas, 0 erros): sem rail;
      gatilhos iniciais `Prazo · Hoje (1)` e `Espaço`; Prazo lista Todas/Hoje (1)/Atrasadas (1);
      Espaço lista Todos/Sem espaço (1)/Engenharia (2)/Financeiro (1); Engenharia → 2 linhas e
      surge `Pasta`; Pasta › Projetos → 1 linha; Atrasadas + Engenharia → 1 linha; painel
      Espaços lista os dois com "N abertas · N pastas", ↑/↓ e engrenagem; Kanban mostra a
      mesma barra (Prazo · Atrasadas (1) / Espaço · Engenharia (2) / Pasta).

## Pendências registradas (fora deste pedido)
- Reordenar pastas e mover pasta entre espaços perderam a interação de arrastar do rail; se
  fizer falta, entra na aba Pastas do `TaskSpaceManager` (↑/↓ + "Mover para").
- `TaskSpaceManager` ainda usa `window.confirm()` (§14) e rótulos `font-black uppercase` (§21)
  — legado anterior a este pedido, não tocado aqui.

## Verificação
1. Tarefas › Lista: toolbar mostra Prazo · Espaço · Pasta (quando há pastas) · botão Espaços;
   não há mais coluna à esquerda.
2. Prazo › Hoje mostra só vencendo hoje; Atrasadas só vencidas; Todas tudo — os contadores
   do popover batem com as linhas.
3. Espaço › escolher um espaço recorta Lista e Kanban; Pasta aparece e recorta mais; "Nova"
   já nasce nesse espaço/pasta.
4. Botão Espaços abre o painel: criar espaço, ↑/↓, engrenagem abre o gerenciador.

## Pedido posterior — 2026-09-21 (mesma sessão)
> veja print. ainda persiste um seletor de organizacao. remover e manter apenas o seletor no topo da tela

### O que mudou (`components/TasksModule.tsx`) — REGRA #5
- Sai o `<select>` "Todas as organizações" da tela e o aviso amarelo "Selecione uma
  organização para criar tarefas"; sai o estado `filterOrg`.
- Leitura: `useOrgContext().orgId` (null = Todas) recorta tarefas, colaboradores, status,
  obras e espaços. Colaboradores em "Todas" passam a vir sem `.eq` (a RLS recorta) — antes a
  lista era esvaziada por um `if (!orgId) return`.
- Escrita: "Nova", "+ Adicionar Tarefa", "Status" (gerenciador) e "Novo espaço" resolvem a
  organização por `resolveWriteOrg('single')` — com o topo numa organização não perguntam
  nada; em "Todas" com mais de uma organização gravável, o modal padrão pergunta uma vez.
  O formulário recebe **uma** organização (o topo já decidiu) e por isso não mostra mais
  o seletor interno. Editar/subtarefa usam a organização da própria tarefa;
  `TaskSpaceManager` usa `space.org_id`.
- `orgContextGuard`: `TasksModule.tsx` saiu do baseline (10 → 8 → 0 ocorrências de `|| ''`,
  e o `orgsOptions[0]` também foi embora).
- Prova (harness `docs/spikes/tarefas-modulo/?org=o1|all`, store dirigindo o topo): sem
  seletor e sem aviso nos dois cenários; `org=o1` → Nova abre o formulário direto, sem
  campo Organização; `org=all` → modal "Selecionar organização" (Alpa / SPE Horizonte) →
  formulário sem campo Organização; leitura de `employees` em "Todas" sem filtro de org;
  0 escritas, 0 erros.
