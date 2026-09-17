# Engenharia › Composições — tabela padrão, barra de abas e ajuste de colunas

## Pedido original

> engenharia < Composições: Transformar em tabela e aplicar o padrão ui_ux_guia_unificado.md no toolbar de abas + botão de ajuste de colunas
> Sessão: 591b297c-86e9-42b7-97b8-dfb8997e2c4f · 2026-09-17

## Leitura do pedido

A tela é `components/DatabaseExplorer.tsx` (item "Composições" do grupo Engenharia
em `Layout.tsx`, `case 'explorer'` do `AppRouter`). Hoje ela tem:

- um card único com 2 fileiras de filtros em formulário (labels em caixa alta),
  uma faixa cinza com "Base de Dados / Selecione / Referência / Favoritos /
  toggle grade-lista / engrenagem / Estado / Encargos" e os contadores;
- resultado em **grade de cards** ou em tabela hand-rolled (`w-full`, `thead`
  em caixa alta, `font-mono font-bold` no código, pílulas de natureza,
  `font-black` no preço, sem redimensionar coluna, sem autofit);
- não tem barra de abas nem toolbar de escopo.

"Transformar em tabela" = o resultado passa a ser a tabela padrão (§6.10,
`StandardTable`), única visão — a grade de cards sai. "Toolbar de abas" = §19.1
(`TabsBar`) com o eixo natural da tela, **SINAPI × Base própria** (hoje um
`<select>` "Base de Dados"). "Botão de ajuste de colunas" = autofit
`MoveHorizontal` + redimensionar (§6.1.2), que vem embutido no `StandardTable`
ao lado da engrenagem.

## Decisões tomadas

| Data | Pergunta | Resposta |
|---|---|---|
| 2026-09-17 | Manter a grade de cards como modo alternativo? | Não — o pedido é "transformar em tabela". Se o usuário quiser a grade de volta, é pedido novo. |
| 2026-09-17 | Quais são as abas? | SINAPI · Base própria (o antigo select "Base de Dados"). Título/subtítulo mudam com a aba (§19.1, `VIEW_HEADERS`). |
| 2026-09-17 | Onde ficam Referência / Estado / Encargos / seletor de base / Importar / Exportar? | Barra de escopo §5.3, abaixo das abas: definem QUAL conjunto de dados está sendo consultado. Ação primária (Nova composição) + Novo insumo à direita dessa barra (§17). |
| 2026-09-17 | Onde ficam Código / Tipo / Natureza / Grupo / Escopo / Modo / Favoritos? | Toolbar acoplada da tabela (§5.2): são recorte, não escopo. Escolha única com ≤ 4 opções → `FilterPopover` (§5.4); Grupo (lista longa) → `<select>` h-9; Código → input h-9; Favoritos → toggle h-9. |
| 2026-09-17 | A busca do `StandardTable` filtra no cliente — e a busca desta tela é no servidor (modo "Palavras" casa palavras em qualquer ordem)? | `StandardTable` ganha: busca controlada (`search`/`onSearchChange`) **sem** `searchText` mostra o campo e NÃO filtra localmente. Documentado no componente e no §6.10 do guia. |
| 2026-09-17 | Modal de detalhe do item (`absolute inset-0`) e `GroupManagerModal` | Fora do escopo do pedido (não é tabela/abas/colunas). Só o que o `check-ui-standard.sh` acusa no arquivo inteiro (§14 `confirm()` nativo) é corrigido, porque o script roda no arquivo. |

## Plano

### `components/ui/StandardTable.tsx`
- **O que muda:** o campo de busca aparece quando há `searchText` OU busca
  controlada (`search !== undefined`); o filtro local só roda quando há
  `searchText`.
- **Como sei que terminou:** com `search`/`onSearchChange` e sem `searchText`,
  o input aparece e `rows` chega inteiro ao `<tbody>`. `tsc` limpo; telas que
  já usam o componente (RH, Relatórios, Planta) não mudam de comportamento
  (todas passam `searchText`).

### `components/DatabaseExplorer.tsx`
- **O que muda:**
  1. Cabeçalho §20: `<h1 text-3xl font-black>` + `<p mt-1.5>`, raiz `space-y-6`,
     título/subtítulo por aba.
  2. `TabsBar` (§19.1) com SINAPI · Base própria; à direita, contadores
     ("N encontrados · X itens catalogados").
  3. Barra §5.3: SINAPI → Referência, Estado, Encargos, "Nova competência"
     (admin); Base própria → seletor de base, Gerenciar bases, Gerenciar grupos,
     Importar, Exportar. À direita: "Novo insumo" (secundário) + "Nova
     composição" (§17).
  4. `StandardTable` (§6.10): busca controlada (descrição, servidor), filtros
     Código / Tipo / Natureza (só SINAPI) / Grupo / Escopo / Modo / Favoritos;
     colunas Item, Tipo, Natureza, Descrição, Unid., Preço unitário, Grupo
     (oculta por padrão); `sortValue`; células §7 (sem `font-mono`/`font-bold`,
     sem pílula §8, `block truncate` + `title` na descrição); ações §9: "Ver
     detalhes" + `ActionIconButton kind="delete"` quando permitido; clique na
     linha abre o detalhe; loading §11 só quando não há resultado ainda; empty
     §12 ("Pronto para buscar" × "Nenhum item encontrado").
  5. Grade de cards e toggle grade/lista removidos (`viewMode` some).
  6. §14: `window.confirm`/`confirm` → `useConfirm()` (3 ocorrências, incluindo
     `GroupManagerModal`); `alert()` da exportação → `notify`.
  7. Toast §13 (`font-medium`, `rounded-2xl`).
- **Como sei que terminou:** `bash scripts/check-ui-standard.sh
  components/DatabaseExplorer.tsx` sem violação; `tsc --noEmit` limpo; tela
  aberta no navegador com abas, barra de escopo, toolbar acoplada com
  engrenagem + autofit, colunas redimensionáveis; trocar aba muda o subtítulo
  e a barra de escopo; autofit ajusta as larguras.

### `docs/ui_ux_guia_unificado.md`
- **O que muda:** §6.10 ganha a nota sobre busca controlada sem `searchText`
  (busca no servidor).
- **Como sei que terminou:** a nota está no §6.10.

## Estado
- [x] `StandardTable.tsx` — busca controlada sem filtro local (e0ee1444)
- [x] `DatabaseExplorer.tsx` — reescrita da tela de lista (e0ee1444)
- [x] guia §6.10 (e0ee1444)
- [x] `check-ui-standard.sh` + `tsc` + `check-xss-sinks` + `npm run build` limpos —
      única linha restante do check é a busca interna do `GroupManagerModal`
      (§3.1: busca de modal, filtra a lista do próprio modal — fora do escopo)
- [x] verificação visual no navegador (`c:/tmp/pwtest/composicoes-tabela.js`, preview em 127.0.0.1:5317) — 500 linhas, autofit 150→134/136/143/500/111/172, engrenagem, aba Base própria, sem erro JS; larguras iniciais ajustadas em 98a19e9e
- [ ] push em `main`

## Verificação
1. Engenharia › Composições: aba SINAPI, digitar "concreto" → tabela com
   Item/Tipo/Natureza/Descrição/Unid./Preço; cabeçalho em sentence case com
   ícone de ordenação; arrastar borda de coluna redimensiona; botão
   `MoveHorizontal` ajusta ao conteúdo; engrenagem oculta/mostra colunas.
2. Aba Base própria: barra de escopo troca para seletor de base + gerenciar +
   importar/exportar; "Nova composição" cria item; excluir pede `useConfirm`.
3. Favoritos, Tipo, Natureza, Grupo, Escopo e Modo continuam filtrando a busca
   (mesma requisição de antes — só a casca mudou).
