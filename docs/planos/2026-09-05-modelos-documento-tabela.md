# Modelos de Documento — drawer vira tabela + padrão de UI

## Pedido original

> 11.	Comercial < gestão de locação < Gestão de Unidades < Gerenciar Negociação < Aba contratos < aba documentos: transformar drawer Modelos de Documento em tabela e aplicar o padrão ui_ux_guia_unificado.md + botão de ajuste automático de largura de colunas

Sessão: `3f1e69b4-db7a-4953-8ccf-a27bf8920a1b` · 2026-09-05

### Pedido posterior, que mudou o rumo — 2026-09-05, depois da 1ª publicação

> não existe tela cheia em nosso app. transforma em tela conforme ja usado no proprio módulo.
> nunca mais use tela cheia se nao for expressamente solicitado

Rejeita a decisão de largura tomada mais cedo nesta mesma sessão (`Sheet size="full"`)
e fecha uma regra geral. Registrado em memória como 3ª rejeição de tela cheia.

## Onde fica a tela

`AppRouter.tsx` (`case 'rentals'`) → `RentalsModule.tsx:1927` ("Gestão de Unidades", quando há
`selectedBuildingId`) → botão **Negociação** na linha da unidade (`RentalsModule.tsx:2653-2667`) →
`DealModal` (`RentalsModule.tsx:3207`) → aba **Contrato** (`DealModal.tsx:2084`) → sub-aba
**Documentos** (`DealModal.tsx:3499-3514`) → botão **"Modelos de documento"**
(`DealModal.tsx:1161-1168`) → `components/DocxTemplateManager.tsx`.

⚠️ **O mesmo componente é usado por `ContractDetailView.tsx`** (import em `:115`, botão em `:1271`,
montagem em `:3507-3513`). Toda alteração aqui atinge as duas telas.

## O que estava fora do padrão

| Item | Antes | Seção |
|---|---|---|
| Geometria do painel | `fixed inset-0` artesanal, colado na borda com `border-l`, sem respiro nem cantos | §26 |
| Lista | pilha de cards `rounded-xl border p-3` — sem busca, ordenação, seletor de colunas ou redimensionamento | §5.2/§6/§7 |
| Dados escondidos | `description`, `created_at`, `updated_at` existem na tabela e não apareciam | §2 |
| Exclusão | `window.confirm()` nativo | §14 |
| Cabeçalho | `font-extrabold`, pílula `DOC` em `font-mono font-bold`, chip `font-black uppercase` | §16/§21 |
| Formulário | `rounded-lg`/`rounded-xl`, rótulos `text-form-label font-medium`, `<Button>` pesado | §16/§17/§21 |
| Pós-ação | `load()` (recarga completa) depois de salvar e de excluir | §22 |
| Salvar | salvar uma edição fechava o formulário | §25 |

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 2026-09-05 | Largura do painel depois de virar tabela | `Sheet` com `size="full"` — **revertida** pelo pedido posterior |
| 2026-09-05 | Depois de ver no ar: não existe tela cheia no app | Vira **tela in-flow**, no padrão do `ContractDetailView` |
| 2026-09-05 | Colunas da tabela | Nome · Descrição · Arquivo · Marcadores · Atualizado em · Criado em · Ações |
| 2026-09-05 | O padrão alcança também o formulário de criar/editar? | Sim — o painel inteiro |

> A ressalva que registrei na hora da decisão ("`sm:max-w-full` fica visualmente quase tela
> cheia") se confirmou, e da pior forma: eu tinha **oferecido** tela cheia como opção
> recomendada. Ter sido escolhida entre opções que eu mesmo montei não é "expressamente
> solicitado" — a lição está em `feedback_nunca_tela_cheia_para_paineis`. `Sheet size="full"`
> conta como tela cheia; não oferecer de novo.

## Plano

### 1. `docs/planos/2026-09-05-modelos-documento-tabela.md` (este arquivo)
Registrar o pedido literal e as decisões. **Pronto quando:** existe, versionado, com o pedido não parafraseado.

### 2. `components/DocxTemplateManager.tsx` — reescrita da apresentação
A lógica de negócio (`load`, `handleFile`/`detectTokens`, `setMapping`, `save`, `remove`, a resolução
de `orgId`) não muda. O que muda:

- **Casca — TELA in-flow (revisão de 05/09, 2ª volta):** nada de `Sheet`, `fixed` ou `absolute`
  dentro do próprio componente. Ele renderiza `space-y-6` com seta "voltar" + `h1 text-2xl`, o
  mesmo desenho de `ContractDetailView.tsx:1170-1179`, e **quem monta faz o early return**
  trocando o próprio conteúdo:
  - `ContractDetailView` já é in-flow → `if (docxManagerOpen) return <DocxTemplateManager …/>`;
  - `DealModal` é `absolute inset-0` sobre o `<main>` → o early return repete essa caixa
    (`absolute inset-0 z-[110] bg-gray-50 overflow-y-auto` + `p-4 md:p-6`), senão a tela apareceria
    embaixo da lista do `RentalsModule`. O `overflow-y-auto` no invólucro é obrigatório
    (`project_overlay_absolute_em_main_rolavel`).

  A raiz do componente **não** declara `px-*`: o gutter é o do `<main>` (§20.2).
  **Pronto quando:** nenhum `[role=dialog]` envolve o `h1` da tela, não há backdrop cobrindo a
  página, e a sidebar continua visível.
- **Estado (§2/§3):** `COLUMNS: ColumnConfig[]` fora do componente (sem `actions`, que é estrutural e
  sempre visível — §9); `usePersistedState('docxTemplates:search')`;
  `useTableColumns(COLUMNS, 'docxTemplatesColumns')`;
  `useResizableColumns(DEFAULT_COL_WIDTHS, 'docxTemplatesColWidths')`.
  **Pronto quando:** F5 preserva busca, colunas visíveis, ordenação e larguras (conferido no `localStorage`).
- **Toolbar (§5.2 + §6.1.2):** card único com toolbar `p-2 border-b` + tabela; busca `h-9`,
  agrupador `h-9 rounded-[10px]` com `ColumnConfigButton` + divisor + **botão de autofit**
  (`MoveHorizontal`, `title="Ajustar largura das colunas ao conteúdo"`), e "Novo modelo" na variante
  compacta do §17. Banner de erro fora do card, antes dele.
  **Pronto quando:** o botão reajusta as larguras ao conteúdo, e só sob clique — nunca ao digitar na busca.
- **Tabela (§6/§6.1/§6.1.1/§6.2/§6.3/§6.5/§6.8/§6.9/§7/§7.2):** `table-layout:fixed` com
  `width = tableTotalWidth` (soma exata, nunca `w-full`); `<colgroup>` com `<col data-col-key>` por
  coluna + `<col />` espaçador **antes** de `actions`, replicado no `<th aria-hidden>` e no
  `<td aria-hidden></td>` (tag fechada — self-closing quebra o parser do `check-ui-standard.sh`);
  `SortableHeader … uppercase={false}` com `ResizeHandle` filho e `overflow-hidden`; `sticky top-0`
  no `<tr>` do thead; padding do §6.9 (`px-3` régua, `px-4` nas colunas de texto livre), `py-2.5` em
  toda `<td>`; texto livre com `block truncate` + `title`; datas com
  `new Date(iso).toLocaleDateString('pt-BR')` — **não** `formatDateBR`, porque `created_at`/
  `updated_at` são `TIMESTAMPTZ` (`20261110000001_document_templates.sql:17-18`) e `formatDateBR` lê
  só o prefixo `YYYY-MM-DD`; "Marcadores" em `text-amber-600` quando falta mapear (§8, texto simples).
  **Pronto quando:** arrastar uma borda redimensiona aquela coluna (não a vizinha), duplo clique
  restaura, e "Ações" fica ancorada à direita sem andar durante o arraste.
- **Ações (§9.1/§9.2/§14):** clique na linha edita (ação dominante); a coluna de ações fica só com
  `InlineDisclosureMenu showDelete`, cuja confirmação inline substitui o `window.confirm()`.
  **Pronto quando:** `check-ui-standard.sh` sai 0 e excluir pede confirmação dentro do menu.
- **Loading/vazio (§11/§12):** spinner `text-center py-12`; dois estados vazios distintos (sem
  modelo × busca sem resultado), sem moldura própria dentro do card acoplado.
- **Formulário (§16/§17/§21/§22/§25):** rótulos `text-xs font-semibold text-slate-500`; radius
  `rounded-[6px]`/`rounded-[10px]`; rodapé `sticky bottom-0` no fluxo (não `fixed`) com `SaveStatus` +
  Voltar/Cancelar + primário compacto; formulário em `max-w-4xl` para o select de cada marcador
  não esticar pela largura toda; `useUnsavedChanges` para dirty-tracking e guarda de saída (o `Sheet` recebe
  `dirty`, e o X do header chama `confirmDiscard()` por conta própria); criar/editar/excluir
  atualizam o array local em vez de `load()`; **salvar uma edição mantém o painel aberto**, só criar
  fecha. O `font-mono` do token `{001}` permanece — é o literal do placeholder, exceção do §21, e
  não vive dentro de `<td>`.
  **Pronto quando:** salvar edição não devolve à lista, criar devolve, e a linha da tabela reflete a
  mudança sem nova consulta.

### 3. `services/documentTemplateService.ts` — sem mudança
`list()` já aplica `.eq('organization_id')` condicionalmente (REGRA #5) e `create`/`update` já
devolvem o registro completo, que é o que o §22 precisa.

### 4. `components/ui/sheet.tsx` — bug encontrado durante a verificação visual

`size="full"` + `variant="floating"` colocava 32px do painel **fora da tela, à
esquerda**: `sm:max-w-full` dá 100% da viewport, mas o painel é ancorado em
`sm:right-4`. Medido com Playwright em 2026-09-05: viewport 1600, painel 1600,
`left = -16`. Corrigido descontando os dois respiros só nesse par
(`sm:max-w-[calc(100%-2rem)]`); os tamanhos nomeados e o `flush` não mudam.
Atinge também `components/condominio/PortalCondominoAdmin.tsx:571`, o outro
consumidor de `size="full"`, que tinha o mesmo defeito latente.
**Depois da correção:** `left 16 · top 16 · right 16 · largura 1568 · radius 10px`.

## Estado

- [x] Plano registrado
- [x] `components/DocxTemplateManager.tsx` — drawer → tabela (1ª volta) e overlay → **tela** (2ª volta)
- [x] `components/DealModal.tsx` / `components/ContractDetailView.tsx` — early return que troca o conteúdo pela tela
- [x] `components/ui/sheet.tsx` — `size="full"` flutuante deixava 32px fora da tela; e o prop agora documenta que `'full'` é tela cheia e exige pedido expresso
- [x] `components/condominio/PortalCondominoAdmin.tsx` — a prévia do portal era o último `size="full"` do app; virou tela (`PreviaDoPortal`)
- [x] `hooks/useScrollAoTopo.ts` — tela in-flow nascia rolada na posição da anterior
- [x] `grep -rn 'size="full"' components/` — nenhuma ocorrência de código
- [x] `check-ui-standard.sh` nos três componentes — exit 0
- [x] `npx tsc --noEmit` — exit 0
- [x] `npx vitest run` — 149 arquivos, 2654 testes, exit 0
- [x] Verificação visual nas duas telas (Playwright, `serviceWorkers: 'block'`)
- [ ] Gravar (criar / substituir .docx / excluir) — não exercitado: conta de leitura sobre dado de produção

### O que a verificação visual provou, na 2ª volta

| Item | Resultado |
|---|---|
| **Não é overlay** | `[role=dialog]` envolvendo o `h1` da tela: **0** · backdrop escurecendo a página: **não** · sidebar visível: **sim** |
| Cabeçalho de tela | `h1 "Modelos de documento"` em x=338 (área de conteúdo, depois da sidebar), com seta "voltar" |
| Tabela | `Nome · Descrição · Arquivo · Marcadores · Atualizado em · Criado em · Ações` |
| Botão de autofit | presente; larguras foram de `240/260/200/130/130/130/90` para `373/131/405/144/161/135/87` |
| Ordenação / busca / colunas | persistem em `docxTemplates:search`, `docxTemplatesColumns`, `docxTemplatesColWidths` |
| Rodapé §25 | `Voltar` + `Salvar modelo`; "Alterações não salvas" aparece ao editar; Voltar com pendência pede confirmação |
| Segundo consumidor | `ContractDetailView` › Emissão › "Modelos de Documento": mesma tela, overlay 0 |
| Console / rede | nenhum erro de JS, nenhum 4xx/5xx do PostgREST |

⚠️ A soma das larguras padrão foi de 1300 para **1180px** porque 1300 estourava a área de
conteúdo (~1290px com a sidebar aberta) e a tabela nascia com barra horizontal parada.

### 4b. Varredura da regra — nenhum `Sheet size="full"` sobra no app

`components/condominio/PortalCondominoAdmin.tsx` era o outro (e último) consumidor de
`size="full"`: a prévia "Como X vê o portal", que embute o `CondominoPortal`. Virou tela também,
extraída para o componente `PreviaDoPortal`, com o mesmo "Voltar" da tela de acessos logo acima e
`h1` 2xl (é o segundo salto: condomínio → acessos → prévia). O `Sheet` saiu dos imports.

`grep -rn 'size="full"' components/` não devolve mais nenhuma ocorrência de código. Para não
voltar por descuido, o próprio `SheetProps.size` agora documenta que `'full'` **é tela cheia** e
só entra com pedido expresso — mesma convenção do `variant="flush"`, que já exigia motivo escrito.

### 4c. `hooks/useScrollAoTopo.ts` (novo) — bug que a conversão para tela revelou

Trocar o conteúdo in-flow **não mexe no scroll do container**. Com a lista "Acessos ao portal"
rolada, a prévia abria direto no meio do portal embutido, com o "Voltar" e o `h1` fora de vista —
parecia que a tela tinha perdido o cabeçalho. O hook sobe pelos ancestrais até achar quem de fato
rola (o `<main>` do Layout, ou o invólucro próprio do `DealModal`) e zera o `scrollTop` na
montagem. Aplicado nas duas telas novas.

É o inverso do §22, que preserva o scroll ao **voltar** de uma edição: aqui o destino é outra
tela, e começar no meio dela nunca é o que se quer.

## Verificação

```bash
bash scripts/check-ui-standard.sh components/DocxTemplateManager.tsx
npm run typecheck
npx vitest run          # ler a saída; não encadear em grep (mascara o exit code)
```

Na interface (skill `rodar-app`; Playwright precisa de `serviceWorkers: 'block'` por causa do PWA):

1. Comercial › Gestão de Locações › entrar num edifício › **Negociação** numa unidade › aba
   **Contrato** › sub-aba **Documentos** › **"Modelos de documento"**:
   painel flutuante; busca; ordenação por cabeçalho; `ColumnConfigButton`; arraste de borda; duplo
   clique restaura; **botão de autofit** ajusta ao conteúdo; F5 preserva tudo; criar (fecha), editar
   (permanece), excluir (confirmação inline).
2. Contratos › abrir um contrato (`ContractDetailView`) › **"Modelos de Documento"** — mesma tela.
3. Conferir console e Network por 4xx/5xx do PostgREST, não só o que aparece na tela.
