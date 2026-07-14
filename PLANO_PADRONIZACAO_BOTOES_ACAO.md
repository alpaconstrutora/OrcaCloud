# PLANO — Padronização dos Botões de Ação (só-ícone)

> Objetivo: um único padrão visual e um único componente para os botões-ícone de
> ação em linha de tabela/card — começando pelos 4 pedidos (**Excluir, Editar,
> Download, Histórico**) e deixando o componente pronto para os demais
> (Compartilhar, QR Code, Mover, Duplicar, Ver).
>
> Tela de referência (o "print"): aba **Projetos** de `OpuraDocsModule.tsx`
> (`components/OpuraDocsModule.tsx:1953-1998`).

---

## Decisões já tomadas (não reabrir)

1. **Estilo canônico = o do print** (compacto):
   `p-1.5 bg-white border border-gray-200 text-gray-500 hover:text-blue-600 hover:border-blue-200 rounded-[6px] shadow-sm transition-all active:scale-95`.
   Destrutivo: `border-red-100 text-red-500 hover:bg-red-50`.
   Atenção (Compartilhar): `hover:text-orange-600 hover:border-orange-200`.
   → O guia `docs/ui_ux_standard_guide.md` §9.2 (que hoje descreve `p-2.5 rounded-xl slate-200`) **será atualizado para este estilo**.

2. **Abordagem = componente compartilhado + migração incremental** (não big-bang,
   não find-replace cru). Espelha o que já foi feito com `TableUtils`, `useConfirm`,
   `Sheet`.

---

## Alcance (levantado no código)

- `<Trash2 …>`: **239 ocorrências em 156 arquivos**.
- Botões com `title="Excluir|Editar|Download|Baixar|Histórico|Remover"`: **81 em 42 arquivos**.
- **Não existe** primitiva compartilhada hoje — cada tela copia o `className` à mão,
  com dezenas de variações (`rounded-lg` vs `rounded-xl` vs `rounded-[6px]`,
  `p-1` vs `p-1.5` vs `p-2` vs `p-2.5`, `gray-*` vs `slate-*`, com/sem `shadow-sm`).
- Nem todo `<Trash2>` é botão de linha (há uso em headers, empty-states, ícones
  decorativos). A migração é **por botão de ação de linha**, não por ocorrência de ícone.

---

## Fase 0 — Primitiva `ActionIconButton` (base de tudo)

**Arquivo novo:** `components/ui/ActionIconButton.tsx`

API proposta:

```tsx
type ActionKind =
  | 'download' | 'edit' | 'history' | 'delete'      // os 4 pedidos
  | 'view' | 'share' | 'qrcode' | 'move' | 'duplicate' | 'annotate';

interface ActionIconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  kind: ActionKind;
  title?: string;          // default por kind ("Excluir", "Editar"…)
  icon?: React.ReactNode;  // override do ícone default do kind
  tone?: 'neutral' | 'attention' | 'danger'; // override do tom default
  size?: 'md' | 'sm';      // 'sm' = p-1 + w-3.5 h-3.5, p/ linhas já compactas
                           // (adicionado no Lote B, achado em BankReconciliation)
}
```

Mapa padrão (kind → ícone lucide + title + tom):

| kind      | ícone      | title         | tom        |
|-----------|------------|---------------|------------|
| download  | Download   | Download      | neutral    |
| edit      | Pencil     | Editar        | neutral    |
| history   | History    | Histórico     | neutral    |
| delete    | Trash2     | Excluir       | danger     |
| view      | Eye        | Ver detalhes  | neutral    |
| share     | Share2     | Compartilhar  | attention  |
| qrcode    | QrCode     | Etiqueta QR   | neutral    |
| move      | CornerDownRight | Mover    | neutral    |
| duplicate | Copy       | Duplicar      | neutral    |
| annotate  | Pencil     | Anotar        | neutral    |

Regras internas:
- Aplica o className canônico (Decisão 1) conforme `tone`.
- `title` sempre presente (acessibilidade / tooltip) — cai no default do kind.
- Ícone sempre `w-4 h-4`.
- Repassa `onClick`, `disabled`, `aria-*`, etc. via `...props`.
- **Não** embute `stopPropagation` nem `confirm` — quem chama decide (algumas
  linhas são clicáveis, outras não; exclusão usa `useConfirm` da própria tela).

**Container padrão** (documentar, opcional como `<ActionRow>`): 
`<div className="flex items-center justify-end gap-1.5">` dentro de
`<td className="px-6 py-2.5 text-right whitespace-nowrap">`.

**Entregável Fase 0:** componente + refatorar a **tela de referência**
(`OpuraDocsModule.tsx`) para consumi-lo — prova de que o componente cobre 100%
do print sem regressão visual. Serve de "golden sample".

---

## Fase 1 — Atualizar o guia (fonte da verdade)

- Reescrever **§9.2** do `docs/ui_ux_standard_guide.md`:
  - estilo canônico = o compacto do print (substitui o `p-2.5 rounded-xl`);
  - apontar `ActionIconButton` como **forma oficial** (className manual passa a
    ser exceção documentada, não regra);
  - manter a estrutura da §9 (texto azul "Ver Detalhes" + ícones + kebab).
- Atualizar `scripts/check-ui-standard.sh` **se** for viável detectar botão-ícone
  hand-rolled fora do padrão (heurística: `border-slate-200`/`rounded-xl` em botão
  de ação, ou `<Trash2` sem `ActionIconButton` na mesma linha). Se a heurística
  gerar muito falso-positivo, deixar como aviso, não erro.

> Guia atualizado **antes** de migrar em massa — senão a auditoria futura brigaria
> com o padrão novo.

---

## Fase 2 — Migração incremental (por lotes de telas)

Ordem por impacto/visibilidade (telas de lista mais usadas primeiro). Cada lote:
substituir botões hand-rolled por `ActionIconButton`, rodar
`bash scripts/check-ui-standard.sh <arquivo>`, conferir visualmente.

- **Lote A — listas núcleo:** `ClientList`, `SupplierList`, `ProjectList`,
  `InvestorList`, `BrokerList`, `PlanningList`. ✅ **Concluído (2026-07-14).**
  Migrados: `SupplierList` (card: Editar+Excluir), `ProjectList` (tabela+card:
  Editar), `PlanningList` (tabela+card: Duplicar+Configurações+Excluir — era a
  assinatura antiga exata do §9.2 pré-2026-07-14). **Não migrados, com motivo:**
  `BrokerList` não tem Editar/Excluir/Download/Histórico na lista (só "Acessar
  Portal"/"Link de Acesso", fora do vocabulário de `kind`). `ClientList` e
  `InvestorList` têm, no footer do **card**, uma barra de 4–6 botões
  multicoloridos (Portal indigo, Link esmeralda, Comunicado laranja, Editar/
  Excluir cinza) com preenchimento sólido no hover — um estilo próprio,
  diferente do padrão de borda da §9.2. Migrar só Editar/Excluir quebraria a
  consistência visual dentro da própria barra, então ficou **decidido (usuário,
  2026-07-14): deixar como está por agora** — dívida registrada, não
  esquecimento. Retomar só com decisão dedicada (criar `kind`s novos como
  `portal`/`link`/`comunicado`, ou documentar a barra multicor como exceção
  visual legítima do guia).
- **Lote B — financeiro:** `BankReconciliation`, `BoletoManager`,
  `ContasPagarManager`, `InvoiceManager`, `FinancialCategoriesManager`,
  `PayrollRunList`. ✅ **Concluído (2026-07-14).**
  Migrados: `BankReconciliation` (5 pontos: 2× Editar+Excluir de regra de
  automação, 1× Excluir de extrato padrão, 2× Editar+Excluir em modo
  compacto — motivou adicionar `size="sm"` ao componente, ver abaixo),
  `InvoiceManager` (2× Excluir, mantendo "Visualizar" como `<a>` de verdade —
  não virou botão), `FinancialCategoriesManager` (Renomear+Excluir por
  categoria, `size="sm"`), `PayrollRunList` (Duplicar+Excluir; **nota:** o
  ícone original de "Duplicar" já era `History` em vez de `Copy` — bug
  pré-existente de ícone trocado, preservado tal como estava via override
  explícito de `icon`, não "corrigido" silenciosamente).
  **Não migrados, com motivo:** `BoletoManager` e `ContasPagarManager` não têm
  coluna de ações com botão-ícone solto (ações são texto+ícone — "Excel",
  "Pagar via Asaas" — ou um `<a>` de "Ver documento", fora do vocabulário
  ícone-único de `ActionIconButton`). Em `BankReconciliation` ficaram de fora,
  por padrão de julgamento já estabelecido no Lote A: (a) duas fileiras de 3
  botões multicoloridos (Renomear azul/Duplicar roxo/Excluir vermelho) — só
  "Excluir" bateria com um `kind`, fragmentaria a fileira; (b) dois botões de
  **fechar modal** que usam por engano o ícone `Trash2` em vez de `X` — bug
  pré-existente de ícone, fora de escopo de uma migração só-visual (não é uma
  ação de exclusão real).
  **Extensão ao componente:** `ActionIconButton` ganhou prop `size?: 'md'|'sm'`
  (`sm` = `p-1` + ícone `w-3.5 h-3.5`, para linhas de tabela já deliberadamente
  compactas) — sem mudar o default (`md`), então nenhuma tela já migrada foi
  afetada.
- **Lote C — contratos/comercial:** `ContractDetailView`, `ContractTemplateManager`,
  `ContractIndexManager`, `SalesModule`, `RentalsModule`, `CommercialModule`.
  ✅ **Concluído (2026-07-14).**
  Migrados: `ContractDetailView` (4 pontos: Editar Item Avulso+Remover Item,
  editor de unidades em modal — `size="sm"`, Editar nome+Excluir versão com
  ícone condicional `Lock` quando emitida, Editar fatura de concessionária
  isolado), `ContractTemplateManager` (Editar+Desativar, `size="sm"`),
  `ContractIndexManager` (Excluir isolado, `size="sm"`), `SalesModule`/
  `RentalsModule`/`CommercialModule` (mesmo padrão nos 3: Editar+Excluir de
  imóvel na tabela + Editar+Excluir de negociação em grid/tabela — ~4 pares
  por arquivo).
  **Não migrados, com motivo:** nos 3 módulos comerciais (Sales/Rentals/
  Commercial), o par Editar+Excluir que fica **sobreposto à foto do card**
  (`bg-white/90 backdrop-blur-md`) ficou de fora — a translucidez existe para
  manter legibilidade sobre fotos de imóveis variadas; nosso componente só
  tem fundo opaco, então forçar o canônico ali reduziria contraste real, não
  é só estética. Em `ContractDetailView`, um botão "Editar medição" (`w-8 h-8`)
  ficou de fora por estar emparelhado com um `<a>` "Ver Nota Fiscal" do
  mesmíssimo tamanho — convertê-lo sozinho quebraria o pareamento visual dos
  dois ícones lado a lado.
- **Lote D — RH (Labor*):** ~25 telas `Labor*` (muitas com 1 botão cada → rápido).
  ✅ **Concluído (2026-07-14).** 26 arquivos auditados, 22 migrados (30+ pontos):
  `LaborValeRefeicao`, `LaborEncargos`, `LaborAbsences`, `LaborTrainings`,
  `LaborPortal`, `LaborContractors`, `LaborEPIs`, `LaborDiary`,
  `LaborBIAnalytics`, `LaborTimeTracking`, `LaborTimeBank`, `LaborAllocations`,
  `LaborTermination`, `LaborCargos` (4 pares), `LaborSST` (2 pares),
  `LaborTeams`, `LaborRubrics`, `LaborProductivity`, `LaborEvaluation`
  (2 pares), `LaborFiscalSettings` (2 pontos), `LaborDocuments` (2 blocos,
  trio Editar+Download+Excluir — os 3 kinds de uma vez), `LaborATS` (2 pontos).
  **Não migrados, com motivo:** `LaborEmployeeList` e `LaborIncentivos` têm
  fileiras de 3–4 botões com cor **semântica** (violeta=compartilhado,
  vermelho/verde=ativar-inativar, indigo=ambos "editar" e "ativar/desativar")
  — converter só 2 quebraria o agrupamento visual. `LaborComunicacao` tem
  Editar+Enviar+Excluir com 3 propósitos distintos igualmente estilizados —
  mesmo risco. `LaborDocumentModal` não tinha botão algum, era um ícone
  decorativo de cabeçalho de modal (Pencil/Upload conforme o modo).
- **Lote E — suprimentos/estoque/qualidade:** `SupplyChain*`, `InventoryModule`,
  `quality/*`, `ProcessosModule`. ✅ **Concluído (2026-07-14).**
  Migrados: `SupplyChainContractList` (trio Editar+Duplicar+Excluir via
  `Button` compartilhado → `ActionIconButton`, + 1 ponto isolado),
  `SupplyChainOrderDetails` (Duplicar+Excluir do cabeçalho + par Editar/
  Excluir por item), `SupplyChainOrderList` (2 pontos), `SupplyChainReceiptManager`
  (1 ponto condicional), `SupplyChainOrderForm` (2 pares — um com
  `tone="attention"` para manter o laranja de "item avulso"),
  `SupplyChainQuotationForm` (1 ponto), `InventoryModule` (Editar+Desativar
  de armazém via `Button` compartilhado + 2 "remover item" de formulário),
  `ProcessosModule` (1 ponto), `quality/ConditionDetailPanel` (Editar
  isolado), `quality/RequestActionModal` e `quality/ReviseActionPlanModal`
  ("remover etapa" — atenção: preservar `shrink-0` do container flex ao
  converter, perdi e corrigi na hora). Os outros 8 arquivos de `quality/`
  não tinham nenhum botão-ícone correspondente aos kinds do componente.
  **Não migrados, com motivo:** nenhum — todos os candidatos encontrados
  neste lote foram pares/trios limpos, sem risco de fileira multicolor.
- **Lote F — resto (empreendimento, investor, structural, schedule, offices…).**

Regras da migração (para não introduzir bug):
- Preservar exatamente o `onClick` existente (incl. `stopPropagation`,
  `await confirm(...)`, guards de permissão `isOrgAdmin`, `disabled`).
- Onde a exclusão ainda usa `window.confirm`, **não** trocar aqui — é escopo da
  migração `useConfirm` (memória `project-ui-patterns`); só padronizar o visual.
- Botão que hoje NÃO é de linha (header/empty-state/decorativo) fica fora — não
  forçar `ActionIconButton` onde não é ação de linha.
- Não empacotar trabalho em andamento de outra sessão no commit (só os arquivos
  do lote).

---

## Fase 3 — Fechamento

- Varredura final: `grep` por `rounded-xl`/`rounded-lg` + `Trash2/Pencil/Download/History`
  em botões de linha ainda não migrados → lista de resíduos legítimos vs pendentes.
- Atualizar a memória de UI (`project_ui_patterns.md` / `MEMORY.md`) com o novo
  componente e o novo §9.2.

---

## Riscos / armadilhas

- **`tsc --noEmit` quebra deploy** — rodar local antes de cada push (build remoto
  faz typecheck de todos os arquivos).
- **PWA/service worker** pode dar tela branca pós-deploy → `Ctrl+Shift+R`.
- **"Editar" ≠ um ícone só:** em Documentos, "Editar" (metadados) é a engrenagem
  (`Settings`) e `Pencil` é "Anotar". No resto do sistema "Editar" é `Pencil`.
  O componente usa `Pencil` como default de `edit`; onde a semântica for
  "configurar", usar `kind="edit"` com `icon={<Settings/>}` ou criar `kind="settings"`.
- **Falso-positivo no linter** se a heurística de §9.2 for agressiva — preferir
  aviso a erro no `check-ui-standard.sh`.
- Migração é grande (156 arquivos): fazer em lotes commitáveis, nunca `git add -A`.

---

## Sequência sugerida de execução

1. Fase 0 — criar `ActionIconButton` + refatorar `OpuraDocsModule` (golden sample). ⭐ começar aqui
2. Fase 1 — reescrever §9.2 do guia + ajustar linter.
3. Fase 2 — Lotes A→F, um commit por lote, com checagem visual e `tsc`.
4. Fase 3 — varredura de resíduos + atualizar memória.
