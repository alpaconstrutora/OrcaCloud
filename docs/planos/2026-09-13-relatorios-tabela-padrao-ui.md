# ÒPURA · Relatórios — StandardTable + TabsBar + padrão de UI (§ do guia)

## Pedido original

Sessão 2e718847, 2026-09-13, depois de a aba Centro de Custo passar a agrupar
como Organização › Centro de Custo:

> Transformar em tabela e aplicar o padrão ui_ux_guia_unificado.md no toolbar de abas + botão de ajuste de colunas

Executado pela skill `apply-ui-standard` (protocolo da REGRA OBRIGATÓRIA #1):
guia lido inteiro, auditoria seção por seção antes de editar, script mecânico,
typecheck, e conferência **visual** no navegador (preview local + Playwright,
login com o usuário de leitura).

## Decisões (§ opcionais, explícitas para esta tela)

- **§5**: escopo (período por / de / até / Direção / Status) e ações (Comparar,
  CSV, Atualizar) na **toolbar de botões §5.3**; busca + colunas + autofit na
  **toolbar acoplada §5.2** (embutida no `StandardTable`). Direção e Status
  viraram `FilterPopover` (§5.4) — eram `<select>` nativos.
- **§6.1 adotar** via `StandardTable` (§6.10): 5 colunas, a 1ª com nome livre
  (fornecedor, contrato, centro) que estoura sem redimensionar. §6.1.1/§6.1.2
  vêm embutidos.
- **§6.2** sentence case; **§16** compacta; **§17** `Button` md (já §17).
- **§6.3 exceção documentada**: em Centro de Custo (árvore) nenhuma coluna
  ordena — a ordem é a hierarquia do cadastro; ordenar por valor a desmontaria.
- **§19.1**: as 16 dimensões viraram `TabsBar` (eram pílulas "Agrupar por" com
  ativa em azul sólido). O subtítulo muda com a aba (§20).
- **§3**: dimensão, período, direção, status e modo comparar persistem
  (`usePersistedState`), como a busca.
- **§6.9**: extrato no `Sheet` com `px-3`/`px-4` + `border-r` + thead sentence case.
- **§4 KPI**: não adicionado — os totais moram no rodapé do card
  (`footer` do `StandardTable`), como antes no `<tfoot>`.

## Itens

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1 | `components/OpuraReports.tsx` | reescrita: `TabsBar` + barra §5.3 + `StandardTable` (pivot e comparar) + `Sheet` §6.9 | `check-ui-standard.sh` limpo; typecheck 0; prints |
| 2 | `__tests__/components/OpuraReportsCentroDeCusto.test.tsx` | aba por `role="tab"`; rodapé novo; **regressão**: modo Comparar troca as colunas (a tabela remonta por `key`) | verde |

## Bug encontrado só no print

Ao entrar no modo Comparar a tabela mostrava só a coluna do rótulo: os dois
`<StandardTable>` ocupam a mesma posição na árvore React e, sem `key`, o React
reaproveitava a instância — o estado interno de colunas do pivot
(qtd/realizado/…) vazava para a tabela de comparação (o localStorage
`opuraReports:compare:columns` guardou as colunas do pivot). Correção: `key`
= `storageKey` nas duas (e entre `pivot` × `pivotTree`). Teste de regressão em 2.
Também: `fBRLshort` saía `R$ -34k` ao lado de `-R$ 54,04` — sinal agora antes do `R$`.

## Estado

- [x] 1, 2 — suíte completa verde; publicado (commit desta frente).
- Fora de escopo, registrado: o CSV continua plano ("Pai › Nome").
