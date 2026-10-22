# RH › Desligamentos — tabela padrão, toolbar de abas e ajuste de colunas

## Pedido original

Sessão de 22/10/2026 (Claude Code, VS Code):

> recursos humanos > desligamentos: Transformar em tabela e aplicar o padrão ui_ux_guia_unificado.md no toolbar de abas + botão de ajuste de colunas

## Estado de partida

`components/LaborTermination.tsx` (origin/main `b5249711`): lista de cards (`divide-y`, um `<div>` por
processo com pílulas `rounded-full` de tipo/status e barra de progresso contínua), um card de controles
feito à mão (título "Processos de Desligamento" + busca `rounded-xl` + botão rosa "Iniciar Desligamento"),
sem abas, sem `ColumnConfigButton`, sem autofit. KPIs via `kpiColorFromClass`.

## Decisões

- **Abas = situação do processo**: Em andamento · Concluídos · Todos, com contador. A tela não tinha
  abas; o recorte por status é o único eixo com poucos valores e uma escolha por vez, e já existia nos KPIs.
  Título e subtítulo não mudam com a aba (o assunto é o mesmo — §19.1 só pede troca quando muda o assunto).
- **Ordem do guia (ANATOMIA): título → abas → KPIs → tabela.** As telas irmãs do RH ainda estão em
  KPIs → abas (commit `0729a356`, 24/07, anterior à correção do guia de 02/08); não copiar a irmã.
- **Ação primária §17** ("Iniciar desligamento", azul compacto) no slot da `TabsBar`; desligada sem
  colaborador elegível, com o motivo num `<span title>` em volta (botão desabilitado não mostra dica em
  todo navegador).
- **Tabela = `StandardTable` (§6.10)**: busca persistida, engrenagem de colunas, autofit `MoveHorizontal`,
  redimensionar/arrastar, espaçador antes de Ações, cabeçalho branco sentence case, Agrupar §6.12.
- Colunas: Colaborador · Cargo · Tipo · Data · Aviso prévio · Checklist (`SegmentedProgress` §29) ·
  Entrevista (oculta por padrão) · Status; Organização só em "Todas". Soma das visíveis 1070 + Ações 140
  = 1210 px (≤ ~1270).
- Excluir tira a linha do cache (§22), sem recarregar a lista.
- **Fora do escopo:** o assistente (wizard) de desligamento — modal central com estilo antigo
  (`font-black uppercase`, `rounded-3xl`, `alert()`). Fica como está.

## Itens

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1 | `components/LaborTermination.tsx` | lista de cards → `StandardTable`; card de controles → `TabsBar` com ação primária; KPIs com `KpiCard` + ícone + cor; ordem título → abas → KPIs → tabela | `check-ui-standard.sh` limpo no arquivo; `tsc` sem erro |
| 2 | `__tests__/components/LaborTerminationTabela.test.tsx` | teste montando a tela: abas recortam linhas, contadores, autofit e engrenagem presentes, botão desligado com motivo, excluir tira a linha sem refazer a consulta | teste verde |
| 3 | verificação visual | abrir RH › Desligamentos no navegador | print conferido |

## Andamento

- [x] 1 — `check-ui-standard.sh` ✅ sem violação; tipos dos arquivos tocados pela API do TS: 0 erros (o `tsc`
  inteiro cai nesta máquina com crash do V8 — a prova completa é a CI do PR).
- [x] 2 — 6 testes verdes; com os vizinhos (Agrupar RH/StandardTable, guardas de org, cabeçalho e valor de
  campo): 42/42 em 6 arquivos, conta fechando.
- [ ] 3
