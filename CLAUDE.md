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
2. **Depois de editar**: rodar os greps de autoverificação abaixo **nos arquivos
   que você tocou**, não em amostra, não "por cima":

   ```bash
   # 1) Nenhum TD de dado comum pode ter font-bold/font-black/font-mono
   #    (inclui selects/LazySelect dentro da célula — não só o texto solto)
   grep -n "font-bold\|font-black\|font-mono" <arquivo_editado>.tsx

   # 2) StatusBadge não pode ter pílula/fundo/uppercase
   grep -n "rounded-full\|uppercase" <arquivo_editado>.tsx | grep -i status

   # 3) Toda busca de tabela deve usar usePersistedState, nunca useState puro
   grep -n "useState.*[Ss]earch" <arquivo_editado>.tsx
   ```

   Qualquer resultado nos itens 1–3 que não seja uma exceção **documentada no
   próprio guia** (seção 7.1 cobre editáveis inline) é não-conformidade e deve
   ser corrigida antes de reportar a tarefa como concluída.
3. **Ao reportar ao usuário**: não basta dizer "apliquei o padrão". Listar
   explicitamente quais itens do `CHECKLIST DE APLICAÇÃO` (topo do guia) foram
   verificados, incluindo o item de campos editáveis inline. Se algo do guia não
   se aplica à tela (ex: não tem toggle grade/lista), dizer isso explicitamente —
   não apenas omitir.
4. Se encontrar um padrão visual que o guia **não cobre** (ex: um tipo de célula
   novo), a saída correta é **atualizar o guia** com uma seção nova (como a 7.1
   foi criada), não inventar um estilo ad-hoc e seguir em frente.

### Por que isso existe

2026-07-07: a aba Extrato (`BankReconciliation.tsx`) foi corrigida para o padrão
do guia (KPI cards, busca persistida, ColumnConfigButton), mas os `LazySelect`
dentro das colunas Cliente/Fornecedor, Categoria, Obra e Centro de Custo
continuaram com `text-xs font-bold uppercase` — fora do padrão — porque a
verificação não olhou para dentro dos componentes das células. O usuário teve
que apontar isso pelo print. Ver `docs/ui_ux_standard_guide.md` §7.1.

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
