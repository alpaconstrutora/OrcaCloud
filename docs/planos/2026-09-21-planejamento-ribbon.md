# Gestão de Planejamento — ribbon e ícones no estilo da Planta Inteligente

## Pedido original

Sessão de 21/09/2026 (~17h):

> se inspire na implementacao de ícones e organizacao de menu bar utilizado em
> incoporação < planta inteligente e aplique em Gestão de Planejamento

Duas decisões do usuário na mesma sessão, perguntadas antes do plano:

1. *Como tratar as 12 vistas (Tabela, Gantt, Rede, Curva S, …)?* →
   **Seletor de vista à esquerda** do ribbon, como na Planta; as abas do ribbon
   são de comandos.
2. *COLUNAS / NÍVEIS / Natureza / "+ Novo Grupo" ficam dentro do cabeçalho das
   grades — puxar para o ribbon?* → **Sim, tudo no ribbon.**

## Diagnóstico

A tela é o editor "Planejamento Físico-Financeiro" (`FinancialSchedule.tsx`,
view `planning-view`, aberta a partir da lista "Gestão de Planejamento"). O
cromo se empilhava em cinco níveis:

| nível | o que tinha |
|---|---|
| título §20 | h1 + subtítulo (ok, intocado) |
| abas §19.1 | 12 abas de VISTA, três com emoji (⚡ 🛒 🏗️) |
| toolbar §5.3 | escala Dia/Sem/Mês/Ano, Início, Término, Expandir/Recolher, Sincronizar (âmbar), Versões (índigo), Nivelar (índigo), Configurações, Tela cheia, menu `···`, Auto Programar |
| menu `···` | Baseline, What-If, PDF, Excel, CSV, Auto Equipe, Classificação de Cargos, Limpar tudo — oito comandos escondidos |
| cabeçalho da grade | COLUNAS ▾ e NÍVEIS ▾ (com Natureza) dentro de `ScheduleGantt`/`ScheduleGridView`, cada um com o próprio dropdown; "+ Novo Grupo" como última linha |

A Planta Inteligente resolveu o mesmo problema em 13/09 (`docs/planos/2026-09-13-planta-ribbon-painel-enxuto-dock.md`,
guia §19.5): `components/blueprint/Ribbon.tsx` — que é **100 % genérico**
(importa só React) — com seletor de vista à esquerda, abas por disciplina,
grupos com rótulo em caixa alta embaixo, botões com ícone lucide `h-4 w-4`,
barra de opções da ferramenta ativa.

**Decisões de reuso:**

- `Ribbon`, `GrupoDoRibbon`, `BotaoDoRibbon`, `BarraDeOpcoes`, `abaEfetiva`
  importados de `components/blueprint/Ribbon.tsx`. **Não** movido para
  `components/ui/`: mudaria o import em `BlueprintEditor.tsx` (14.5k linhas),
  com ~20 frentes abertas em cima — conflito para trabalho alheio.
- `blueprint/SeletorDeVista.tsx` é acoplado a `VistaBlueprint`; nasceu um
  `components/ui/MenuDeVistas.tsx` genérico (mesma mecânica, com grupos). A
  consolidação da Planta sobre ele fica como pendência futura.
- `components/ui/MenuDoRibbon.tsx` genérico (menu de itens ligáveis) substitui
  os três dropdowns feitos à mão das grades.

## Desenho

```
┌ ← Planejamento Físico-Financeiro                                                    ┐
│   Plano · Orçamento vinculado: …                                                    │  título §20, intocado
│ [▦ Gantt ▾] │ Estrutura │ Cronograma │ Orçamento │ Exportar │ Vista │  [⛶] [✨ Auto Programar] │  linha 1
│ [+ Novo grupo][Expandir][Recolher] │ [Níveis ▾][Natureza ▾] │ [Limpar tudo]        │  linha 2: painel da aba
│ Gantt   Escala [Dia][Sem][Mês][Ano]   Início [__/__/____]   Término [__/__/____]     │  linha 3: só Tabela/Gantt
└──────────────────────────────────────────────────────────────────────────────────────┘
```

| aba | grupos → botões | só em Tabela/Gantt? |
|---|---|---|
| Estrutura | Estrutura: Novo grupo · Expandir · Recolher — Filtro: Níveis ▾ · Natureza ▾ — Zerar: Limpar tudo (perigo) | sim |
| Cronograma | Programar: Recalcular — Recursos: Nivelar · Auto Equipe (contagem, aria-pressed) · Cargos — Linha de base: Baseline (nome da ativa) · What-If (aria-pressed) — Calendário: Configurações | não |
| Orçamento | Integração: Sincronizar (contagem) · Versões (contagem) | não |
| Exportar | PDF · Excel · CSV | não |
| Vista | Colunas ▾ (contagem de ocultas; rodapé "Ver todas" e, no Gantt, "Focar Gantt") | sim |

- Vistas no seletor, em três grupos: Cronograma (Tabela, Gantt, Rede, EAP
  Física) · Análise (Curva S, Riscos, Cenários, Comando) · Execução (Recursos,
  Restrições, Last Planner, Suprimentos). Ícone lucide por vista; os emojis
  somem. `localStorage['schedule-view-mode']` continua.
- Acesso rápido (slot `direita`): Tela cheia (ícone, `aria-pressed`) e Auto
  Programar (primário emerald, §17) — sempre visíveis.
- Aba persistida em `schedule:abaDoRibbon`; fora de Tabela/Gantt somem
  Estrutura e Vista e a salva cai em Cronograma (`abaEfetiva`, preferida).
- Barra de opções (`BarraDeOpcoes`) só em Tabela/Gantt: nome da vista, escala,
  Início, Término — "o que a vista ativa pergunta".
- Sem aba contextual "Modificar": a grade não tem seleção de linha; as ações
  por linha continuam no `OutlineRowMenu`. Possível fatia futura.
- Ribbon dentro de um card `rounded-[10px] border shadow-sm` **sem
  `overflow-hidden`** (os menus são `absolute`); o `border-b` do ribbon só
  existe quando há barra de opções abaixo.

## Itens

| arquivo | o que muda | como sei que terminou |
|---|---|---|
| `components/ui/MenuDeVistas.tsx` (novo) | seletor de vista genérico com grupos, `role=menu`/`menuitemradio`, Esc e mousedown fora fecham | `ScheduleRibbon.test` "trocar a vista pelo menu" |
| `components/ui/MenuDoRibbon.tsx` (novo) | menu de itens ligáveis (`menuitemcheckbox`), contagem no gatilho, cabeçalho e rodapé | `ScheduleRibbon.test` Colunas / Níveis / Natureza |
| `components/schedule/scheduleColumns.ts` (novo) | `COLUNAS_DA_TABELA`, `COLUNAS_DO_GANTT`, `NIVEIS_DO_RESUMO` — lista única | as grades importam daqui (F2) |
| `components/schedule/ScheduleHeader.tsx` | cromo abaixo do título vira `Ribbon` + `BarraDeOpcoes`; some `VIEW_TABS`, a toolbar §5.3 e o menu `···`; 16 props novas para colunas/níveis/natureza/novo grupo; sai `onLoadProject` (morta) | `ScheduleHeaderTelaCheia.test` + `ScheduleRibbon.test` verdes; `check-ui-standard.sh` exit 0 |
| `components/FinancialSchedule.tsx` | passa as props novas ao header; deixa de passar colunas/níveis/natureza/novo grupo às grades (F2) | `tsc` sem prop órfã |
| `components/schedule/ScheduleGantt.tsx` (F2) | saem COLUNAS ▾, NÍVEIS ▾, "+ Novo Grupo", `showColsDropdown`/`showLevelsDropdown`, `COL_LABELS` local | `tsc`; screenshot do Gantt sem o cromo no cabeçalho |
| `components/schedule/ScheduleGridView.tsx` (F2) | idem; estado vazio aponta para Estrutura › Novo grupo | idem |
| `__tests__/components/ScheduleHeaderTelaCheia.test.tsx` | props novas; "em toda aba" → "em toda vista" | verde |
| `__tests__/components/ScheduleRibbon.test.tsx` (novo) | 10 casos: toolbar com seletor e acesso rápido; 5 abas + barra em Tabela/Gantt; fora da grade somem 2 e a salva cai em Cronograma; persistência; menu de vistas; Colunas fala com a grade ativa; Níveis/Natureza; Estrutura; What-If/contagens; escala | verde |
| `docs/ui_ux_guia_unificado.md` §19.5 (F3) | Planejamento como 2ª tela do ribbon; `MenuDeVistas`/`MenuDoRibbon`; acesso rápido em `acessoRapido` ou `direita` | texto atualizado |

## Status

| fatia | estado | onde |
|---|---|---|
| F1 header | ✅ 21/09 | `MenuDeVistas`, `MenuDoRibbon`, `scheduleColumns.ts`, `ScheduleHeader` reescrito, `FinancialSchedule` passando as props; 20 testes verdes (`ScheduleHeaderTelaCheia` 6, `ScheduleRibbon` 10, `Ribbon` 4); `check-ui-standard.sh` exit 0 nos três arquivos |
| F2 grades | ⏳ | — |
| F3 guia + memória | ⏳ | — |
