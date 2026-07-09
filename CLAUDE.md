# CLAUDE.md — ORÇACLOUD / ÒPURA

> Este arquivo é carregado automaticamente em toda sessão. As regras abaixo
> **substituem qualquer atalho de conveniência** — não são sugestões.

---

## REGRA OBRIGATÓRIA #1 — Padrão de UI (`docs/ui_ux_standard_guide.md`)

**Gatilho:** qualquer edição que toque tabela, KPI card, toolbar, busca, badge de
status, coluna de ações, modal de confirmação, toast, ou **qualquer célula com
campo editável inline (select/dropdown/LazySelect dentro de `<td>`)**.

Isso já foi "aplicado" mais de uma vez de forma incompleta — a auditoria parou nos
elementos estruturais (thead/cards/busca) e não desceu ao nível dos componentes
internos das células (selects inline com `font-bold text-xs uppercase`, fora do
padrão, passaram despercebidos). **Não pode se repetir.** Por isso o protocolo
abaixo não é opcional e não é "boa vontade" — é passo obrigatório do trabalho.

### Protocolo (sem pular etapa, sem exceção)

1. **Antes de editar**: ler `docs/ui_ux_standard_guide.md` inteiro (não só a seção
   que parece relevante — o documento é curto o suficiente para ler completo).
2. **Depois de editar**: rodar `scripts/check-ui-standard.sh` **nos arquivos
   que você tocou**, não em amostra, não "por cima":

   ```bash
   bash scripts/check-ui-standard.sh <arquivo_editado>.tsx
   ```

   Ele checa mecanicamente (exit code ≠ 0 se achar algo): §3 busca sem
   `usePersistedState`, §7 `font-bold`/`font-black`/`font-mono` dentro de
   `<td>` (inclui selects/LazySelect dentro da célula — não só o texto
   solto), §8 pílula `rounded-full`+`uppercase` (badge/status), §14
   `confirm()`/`window.confirm()` nativo em vez de `useConfirm()`. Qualquer
   resultado que não seja uma exceção **documentada no próprio guia** (seção
   7.1 cobre editáveis inline) é não-conformidade e deve ser corrigida antes
   de reportar a tarefa como concluída.
3. **Ao reportar ao usuário**: não basta dizer "apliquei o padrão". Listar
   explicitamente quais itens do `CHECKLIST DE APLICAÇÃO` (topo do guia) foram
   verificados, incluindo o item de campos editáveis inline. Se algo do guia não
   se aplica à tela (ex: não tem toggle grade/lista), dizer isso explicitamente —
   não apenas omitir.
4. Se encontrar um padrão visual que o guia **não cobre** (ex: um tipo de célula
   novo), a saída correta é **atualizar o guia** com uma seção nova (como a 7.1
   foi criada), não inventar um estilo ad-hoc e seguir em frente.

### Quando o pedido for "liste/audite 100% do padrão"

O protocolo de cima é pra quando você está editando uma tela. Quando o pedido
é um **levantamento** ("liste o que está e o que não está implementado",
"audite 100%", "confere se bate com o guia"), use o
**`CHECKLIST DE AUDITORIA COMPLETA`** que fica dentro do próprio
`docs/ui_ux_standard_guide.md` (logo após o `CHECKLIST DE APLICAÇÃO`) — ele
lista todas as seções do guia e exige veredito + evidência (`arquivo:linha`)
para cada uma, sem pular nenhuma, mesmo as que "obviamente não se aplicam".
Só é permitido declarar "100% auditado" depois dessa lista existir por
escrito na resposta.

### Por que isso existe

2026-07-07: a aba Extrato (`BankReconciliation.tsx`) foi corrigida para o padrão
do guia (KPI cards, busca persistida, ColumnConfigButton), mas os `LazySelect`
dentro das colunas Cliente/Fornecedor, Categoria, Obra e Centro de Custo
continuaram com `text-xs font-bold uppercase` — fora do padrão — porque a
verificação não olhou para dentro dos componentes das células. O usuário teve
que apontar isso pelo print. Ver `docs/ui_ux_standard_guide.md` §7.1.

2026-07-09: pedido explícito de "listar 100% do padrão" em `ClientList.tsx` foi
respondido com uma auditoria por amostragem (focada nos problemas mais óbvios),
não seção-por-seção do índice do guia. Resultado: §6.1 e §17 ficaram de fora da
primeira lista; quando o usuário perguntou diretamente "auditou 100%?", a
resposta consertou o §17 mas ainda não recontou §6.1/§6.2 do zero — e mesmo
assim foi declarado "18/18 auditado". O usuário perdeu a confiança no relatório
de conformidade por causa disso. Ver `CHECKLIST DE AUDITORIA COMPLETA` em
`docs/ui_ux_standard_guide.md`.

---

## REGRA OBRIGATÓRIA #2 — Layout de interação (`UI_PATTERNS.md`)

Antes de decidir entre modal, painel lateral (`Sheet`) ou página dedicada para
qualquer nova interação, ler `UI_PATTERNS.md`. Painel lateral é o padrão para
70–80% dos casos — modal central só para interrupções críticas.

---

## Outros documentos de referência do projeto

- `GUIA_TABLE_UTILS.md` — `useTableColumns`/`ColumnConfigButton`/`SortableHeader`
- `RUNBOOK_DEPLOY.md` — processo de deploy
- `PLANO_MODULO_*.md` — PRDs de módulos em desenvolvimento (não implica que já
  estejam implementados — conferir estado real no código antes de assumir)
