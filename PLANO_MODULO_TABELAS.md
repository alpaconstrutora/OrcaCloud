# PLANO — Evolução do Design System de Tabelas (ÒPURA)

> Fonte: avaliação do documento "52 boas práticas de tabela em SaaS/ERP" (2026-07-04)
> confrontado com o que já existe no ÒPURA. **Regra-mãe:** evoluir a base única
> (`components/ui/TableUtils.tsx`), NÃO fragmentar em 6 componentes-tipo.

## Estado atual (o que JÁ existe — não recriar)

| Recurso | Onde | Cobre item do doc |
|---|---|---|
| Mostrar/ocultar colunas + persistência (localStorage por `storageKey`) | `useTableColumns`/`ColumnConfigButton` em `components/ui/TableUtils.tsx` | #20 (parcial), #34 (parcial) |
| Ordenação por coluna com indicador (chevron) | `SortableHeader` | #9 |
| Restaurar padrão de colunas | `resetColumns` | #20 |
| Labels humanos | `ColumnConfig.label` (texto livre) | #47 |
| Totalizador que respeita o filtro | `ContasPagarManager.tsx:527` (`filtered...reduce`) | #21 (só nesse componente) |
| **Primitivas de formato BR (F1 CONCLUÍDA)** | `components/ui/Format.tsx` (`Money`/`DateBR`/`formatMoney`/`formatDateBR`/`formatPercent`) | #6/#7 |
| **Ação em massa (F3, 2 de N telas)** | ContasPagarManager e ContasReceberManager: checkbox + barra de seleção + total selecionado + ação em lote | #11 |
| Drawer lateral / confirmação | `Sheet` + `useConfirm` (ver `UI_PATTERNS.md`) | #3, #10, #36 |

Componentes já migrados p/ `TableUtils`: ProjectList, ClientList, BoletoManager, ContasPagarManager.
Componentes já migrados p/ `Format.tsx` (primitivas): ContasPagarManager, BoletoManager, BoletoFormModal (`formatBRL` delega), ContasReceberManager, FinancialApprovalModule, ClientChargesModule, DunningModule (HistoricoTab).
Componentes com ação em massa (F3): ContasPagarManager (marcar pago em lote), ContasReceberManager (baixar/receber em lote), ClientChargesModule (cancelar cobrança em lote).

**Exceção conhecida:** ContasReceberManager tem ordenação própria (`handleSort`/`SortIcon`), não usa `SortableHeader`/`useTableColumns` para sort — decisão já registrada (refatoração considerada complexa, custo/benefício baixo). F1/F3 foram aplicados por cima sem tocar nisso.

## Não fazer (over-engineering rejeitado)

- **6 "tipos oficiais" de tabela (#52)** → manter 1 base + variações por slots.
- **Server-side sort/filter/paginação como regra (#46)** → só onde o volume exige:
  extrato bancário, lançamentos fiscais, insumos SINAPI, EAP. Client-side segue ok
  para a maioria (centenas de linhas).
- **Densidade global ajustável (#17)** → 1 densidade fixa por tipo de tela.

## Fases (ordem de ROI)

### F1 — Primitivas de célula (extração, não invenção) — ✅ CONCLUÍDA
- `<Money>`/`formatMoney`, `<DateBR>`/`formatDateBR`, `formatPercent` em `components/ui/Format.tsx`.
  `formatDateBR` nasceu com split de string, nunca `new Date('YYYY-MM-DD')` cru (bug de
  fuso já documentado na memória).
- **Aplicado em:** ContasPagarManager, BoletoManager, BoletoFormModal (`formatBRL` agora
  delega), ContasReceberManager, FinancialApprovalModule (todos via import com alias
  `fmt`/`fmtDate` p/ menor diff).
- **Não aplicado propositalmente:** ProjectList/ClientList — datas lá são `created_at`/
  `updated_at`/`expires_at` (timestamptz com hora real), não `vencimento`/`dueDate` (DATE
  puro). Usar `formatDateBR` (que ignora timezone e só lê o prefixo `YYYY-MM-DD`) nesses
  campos **introduziria o bug inverso**. Não têm duplicação de formatação de moeda.
  InvoiceManager (upload de NFe/recibos): também descartado — sem coluna de valor
  monetário e a única data é `createdAt` (timestamp de upload, não DATE de negócio).
- DunningModule tem duas famílias de data distintas: `fmtDate` (topo do arquivo,
  timestamp completo com hora, usado no `sent_at` de eventos) ficou intocado — é
  timestamptz de verdade, não DATE; já `fmtBRL`/`fmtDue` do `HistoricoTab` migraram
  para as primitivas (mesmo padrão DATE-only de vencimento).
- Pendente: util de alinhamento genérico (#6) e marcador visual de origem
  manual×importado×calculado (#25) — ainda não extraídos como primitiva.

### F2 — Memória completa da tabela (#34)
- `useTableColumns` passa a persistir também **ordenação, filtros e página**
  (hoje só colunas). Mesmo `storageKey`.
- Avaliar persistência por-usuário no servidor (hoje só localStorage/por-browser).

### F3 — Ação em massa (#11) — EM ANDAMENTO (2/N telas)
- Coluna de checkbox + barra de seleção ("N selecionados | Ação | Limpar").
- Regra de clique fixa (resolve conflito #35×#10×#11):
  **linha abre drawer; checkbox seleciona; botão/menu NÃO propaga (stopPropagation).**
- ✅ ContasPagarManager — marcar pago em lote.
- ✅ ContasReceberManager — baixar (receber) em lote; critério de seleção espelha o botão
  "Baixar" por linha (`effective_status !== 'RECEBIDO'`).
- ✅ ClientChargesModule — cancelar cobrança (boleto/PIX Asaas) em lote; critério espelha
  `handleCancel` por linha (`status !== 'CANCELLED' && !PAID.includes(status) &&
  transaction_id` presente); confirmação única antes do lote (mesmo padrão do botão
  individual, que já pedia `confirm()`).
- BoletoManager já tinha seleção em massa própria (pré-existente, não migrada para o
  padrão comum — avaliar unificação depois).
- **Avaliado e descartado:** FinancialApprovalModule — fila mistura 3 entidades
  (transaction/contract/purchase_order) com dispatch e nível de aprovação calculados
  por item, e rejeição exige motivo obrigatório individual. Bulk sem modal por item
  perderia esse contexto; precisaria de desenho próprio (ex.: bulk só para "aprovar
  sem observação", nunca para rejeitar) — não faz sentido forçar o padrão genérico aqui.
- **Avaliado e descartado:** DunningModule — `ReguaTab` é config de regras (não
  transacional); `HistoricoTab` é log de auditoria de disparos, sem ação por item
  (doc §12: auditoria é para rastrear, não para agir em lote).
- Próximo candidato a avaliar: PayrollRunList / LaborBIAnalytics ou fila de Suprimentos
  (ProcurementModule/ThreeWayMatchPanel).

### F4 — Totalizadores padronizados (#21)
- Rodapé de resumo reutilizável (respeita filtro) — generalizar o que já existe
  em ContasPagar para BoletoManager e demais financeiros/fiscais.

### F5 (reservado) — Volume alto
- Virtualização + eventual server-side apenas nas 4 telas citadas em "Não fazer".

## Lacunas do documento (específicas do ÒPURA)
- Escopo multi-tenant/org refletido na UI (RLS) — o doc ignora; recorrente aqui.
- Manual×importado×calculado (#25) é **estrutural** no ÒPURA (XML NF-e, Asaas, DRE),
  não observação — por isso virou primitiva na F1.
