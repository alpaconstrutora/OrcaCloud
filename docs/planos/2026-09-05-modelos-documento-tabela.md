# Modelos de Documento — drawer vira tabela + padrão de UI

## Pedido original

> 11.	Comercial < gestão de locação < Gestão de Unidades < Gerenciar Negociação < Aba contratos < aba documentos: transformar drawer Modelos de Documento em tabela e aplicar o padrão ui_ux_guia_unificado.md + botão de ajuste automático de largura de colunas

Sessão: `3f1e69b4-db7a-4953-8ccf-a27bf8920a1b` · 2026-09-05

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
| 2026-09-05 | Largura do painel depois de virar tabela | `Sheet` com `size="full"` |
| 2026-09-05 | Colunas da tabela | Nome · Descrição · Arquivo · Marcadores · Atualizado em · Criado em · Ações |
| 2026-09-05 | O padrão alcança também o formulário de criar/editar? | Sim — o painel inteiro |

> Ressalva registrada na hora da decisão: `sizeClasses.full` é `sm:max-w-full`
> (`components/ui/sheet.tsx:36`); com a `variant: 'floating'` default o painel fica a 16px de cada
> borda, ou seja visualmente quase tela cheia. Se ficar largo demais, a correção é de uma linha:
> acrescentar `'4xl': 'sm:max-w-4xl'` (896px) ao `sizeClasses` e trocar o `size`.

## Plano

### 1. `docs/planos/2026-09-05-modelos-documento-tabela.md` (este arquivo)
Registrar o pedido literal e as decisões. **Pronto quando:** existe, versionado, com o pedido não parafraseado.

### 2. `components/DocxTemplateManager.tsx` — reescrita da apresentação
A lógica de negócio (`load`, `handleFile`/`detectTokens`, `setMapping`, `save`, `remove`, a resolução
de `orgId`) não muda. O que muda:

- **Casca (§26/§20):** `Sheet`/`SheetHeader`/`SheetTitle`/`SheetDescription`/`SheetPanel`/`SheetFooter`
  em lugar do `fixed inset-0`. Como os dois consumidores montam o componente condicionalmente, um
  frame com `open=false` (via `requestAnimationFrame`) devolve a animação de entrada sem exigir
  mudança nas duas telas.
  **Pronto quando:** o painel flutua com respiro nos 4 lados e nenhum `font-extrabold`/`font-mono`/
  `font-black`/`uppercase` sobra no cabeçalho.
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
  `rounded-[6px]`/`rounded-[10px]`; rodapé no `SheetFooter` com `SaveStatus` + Voltar/Cancelar +
  primário compacto; `useUnsavedChanges` para dirty-tracking e guarda de saída (o `Sheet` recebe
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
- [x] `components/DocxTemplateManager.tsx` reescrito
- [x] `components/ui/sheet.tsx` — `size="full"` flutuante deixava 32px fora da tela
- [x] `bash scripts/check-ui-standard.sh` nos dois arquivos — exit 0
- [x] `npx tsc --noEmit` — exit 0
- [x] `npx vitest run` — 140 arquivos, 2523 testes, exit 0
- [x] Verificação visual nas duas telas (Playwright, `serviceWorkers: 'block'`)

### O que a verificação visual provou (prints em `c:/tmp/pwtest/saida-modelos`)

| Item | Resultado |
|---|---|
| Geometria §26 | `top 16 · right 16 · bottom 16 · radius 10px`, largura 1568 em viewport 1600 |
| Tabela | colunas `Nome · Descrição · Arquivo · Marcadores · Atualizado em · Criado em · Ações` |
| Botão de autofit | presente; larguras mudaram de `260/300/220/150/140/140/90` para `413/133/451/139/158/128/96` |
| Ordenação | clique no cabeçalho reordena e persiste (`sortColumn: "name"`) |
| Busca | filtra e cai no empty state de "nenhum modelo encontrado" |
| Persistência §3 | `docxTemplates:search`, `docxTemplatesColumns`, `docxTemplatesColWidths` gravados |
| Rodapé §25 | `Voltar` + `Salvar modelo`; "Alterações não salvas" aparece ao editar; Voltar com pendência pede confirmação; primário desabilitado sem pendência |
| Segundo consumidor | `ContractDetailView` › aba Emissão › "Modelos de Documento" — mesma tabela, mesma geometria |
| Console / rede | nenhum erro de JS e nenhum 4xx/5xx do PostgREST atribuível a este módulo |

**Não exercitado contra produção:** gravar (criar/substituir arquivo/excluir). A conta usada é
de leitura e o dado é real — a edição foi aberta, suja e descartada, sem `save`.

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
