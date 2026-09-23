# Diário de Obras — versão mobile (com prévia)

## Pedido original

> operacional < diario de obras: implemente versao mobile com prévia

Sessão de 23/09/2026. Menu: **Operacional › Diário de Obra** (`activeView =
'project-diary'`, `components/Layout.tsx:934`).

"com prévia" = o mesmo arranjo já usado em Minhas Tarefas: a tela desktop ganha
um botão **Mobile** que abre o app dentro de `MobilePreviewFrame` (iframe de
390px, viewport próprio — media queries resolvem de verdade), e num celular de
verdade (`innerWidth < 768`) a tela já entra direto no app mobile.

## Estado de partida

| Peça | Onde |
|---|---|
| Lista de diários (desktop) | `components/DiaryProjectsList.tsx` |
| Diário aberto (desktop) | `components/ProjectDiaryManager.tsx` (1472 linhas) |
| Onde os registros moram | `projects.settings.diaryEntries` (`types/diary.ts`) |
| Precedente de mobile+prévia | `components/TasksModule.tsx` + `TasksMobileApp.tsx` + `MobilePreviewFrame.tsx` |

Não há tabela própria de diário: `DiaryEntry[]` é JSONB dentro de `settings`. O
app mobile lê/grava pelo `projectService.loadProject/saveProject`, como a tela
desktop.

## Itens — 4 de 4 concluídos em 23/09/2026

### 1. ✅ `components/DiaryMobileApp.tsx` (novo)
App mobile autocontido, três telas:
- **Escolher diário** — busca + cards (registros, último registro, situação).
- **Registros** — lista cronológica com filtro Todos / Rascunhos / Impedimentos,
  KPIs compactos e FAB de novo registro.
- **Registro (criar/editar)** — folha cheia: data, status, clima dos 3 turnos,
  efetivo, atividades (com evolução %), fotos por câmera, impedimentos,
  observações.

**Pronto quando:** abre pelo preview, cria um registro, ele aparece na lista e
persiste após recarregar (mesma chave `settings.diaryEntries` que a tela desktop
lê).

### 2. ✅ `components/DiaryProjectsList.tsx`
- `isMobile` → renderiza `DiaryMobileApp` no lugar da tela.
- Botão **Mobile** (`hidden md:flex`) na linha do título abre a prévia.

**Pronto quando:** `bash scripts/check-ui-standard.sh components/DiaryProjectsList.tsx` sai 0
e o botão aparece ao lado de "Análise de equipes".

### 3. ✅ `components/ProjectDiaryManager.tsx`
- `isMobile` → renderiza `DiaryMobileApp` com o diário atual já aberto.
- Botão **Mobile** na barra de ações do cabeçalho.

**Pronto quando:** a prévia aberta de dentro de um diário já cai na lista de
registros daquele diário, sem passar pela escolha.

### 4. ✅ Verificação
- `npm run typecheck`
- `bash scripts/check-ui-standard.sh` nos dois arquivos tocados
- `bash scripts/check-system-projects.sh` / `check-project-classification.sh` nos
  arquivos tocados (o app lista diários — REGRA #2 e #3)
- `npx vitest run __tests__/orgContextGuard.test.ts` (REGRA #5)

## Como foi verificado (23/09/2026)

- `tsc --noEmit` limpo; `check-ui-standard.sh` limpo nos três arquivos (o
  `ProjectDiaryManager` tinha 2 violações pré-existentes — §7 `font-bold
  uppercase` no toggle Praticável/Impraticável e §8 pílula `rounded-full`
  na situação da atividade — corrigidas porque o arquivo foi tocado);
  `check-system-projects.sh` e `check-project-classification.sh` limpos;
  `orgContextGuard.test.ts` 14/14.
- Tela vista de verdade: harness isolado (`__ui_harness.*`, apagado antes do
  commit) + Playwright com PostgREST interceptado por stub (nada gravado):
  28 verificações — picker respeita REGRA #3 (obra sem diário e orçamento não
  aparecem), filtros, resumo, criar/editar/excluir registro com o PATCH
  conferido campo a campo, `initialProjectId` fixa o diário, sem scroll
  horizontal a 390px.
- Três defeitos só apareceram nos PNGs, não no log, e foram corrigidos:
  toast por cima da confirmação de exclusão, toast cobrindo o FAB, e a
  folha de registro sem barra de status (o notch da prévia cobria o título).

## Decisões

- Registros continuam JSONB em `settings.diaryEntries` — o app mobile grava o
  projeto inteiro pelo `projectService.saveProject`, igual ao desktop. Fotos
  seguem como data URL (mesmo formato do desktop).
- A confirmação de exclusão é própria do app: `useConfirm()` renderiza no
  documento pai e não apareceria dentro do iframe da prévia.
- Busca do seletor de diário não persiste (§3.1 — busca de seletor é transitória).
