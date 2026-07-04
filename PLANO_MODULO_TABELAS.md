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
| Formatação BR de moeda | `ContasPagarManager.tsx:68` `toLocaleString('pt-BR', BRL)` | #7 (duplicado por arquivo) |
| Formatação BR de data sem bug de fuso | `ContasPagarManager.tsx:73` `new Date(d+'T00:00:00')` | #7 (duplicado por arquivo) |
| Drawer lateral / confirmação | `Sheet` + `useConfirm` (ver `UI_PATTERNS.md`) | #3, #10, #36 |

Componentes já migrados p/ `TableUtils`: ProjectList, ClientList, BoletoManager, ContasPagarManager.

## Não fazer (over-engineering rejeitado)

- **6 "tipos oficiais" de tabela (#52)** → manter 1 base + variações por slots.
- **Server-side sort/filter/paginação como regra (#46)** → só onde o volume exige:
  extrato bancário, lançamentos fiscais, insumos SINAPI, EAP. Client-side segue ok
  para a maioria (centenas de linhas).
- **Densidade global ajustável (#17)** → 1 densidade fixa por tipo de tela.

## Fases (ordem de ROI)

### F1 — Primitivas de célula (extração, não invenção)
- `<Money>` (alinhado à direita) — extrair o `fmt` duplicado. #6/#7.
- `<DateBR>` — extrair o formatador. **Nascer com split de string / `T00:00:00`**,
  nunca `new Date('YYYY-MM-DD')` cru (bug de fuso já documentado na memória).
- Util de alinhamento (texto=esq, número=dir, ações=dir). #6.
- Marcador visual de origem manual×importado×calculado (#25) — ícone discreto de célula.
- **Meta:** substituir formatadores locais em ProjectList/ClientList/Boleto/ContasPagar.

### F2 — Memória completa da tabela (#34)
- `useTableColumns` passa a persistir também **ordenação, filtros e página**
  (hoje só colunas). Mesmo `storageKey`.
- Avaliar persistência por-usuário no servidor (hoje só localStorage/por-browser).

### F3 — Ação em massa (#11)
- Coluna de checkbox + barra de seleção ("N selecionados | Aprovar | Exportar | …").
- Regra de clique fixa (resolve conflito #35×#10×#11):
  **linha abre drawer; checkbox seleciona; botão/menu NÃO propaga (stopPropagation).**
- Primeiro alvo: ContasPagarManager (aprovar/enviar p/ pagamento em lote).

### F4 — Totalizadores padronizados (#21)
- Rodapé de resumo reutilizável (respeita filtro) — generalizar o que já existe
  em ContasPagar para BoletoManager e demais financeiros/fiscais.

### F5 (reservado) — Volume alto
- Virtualização + eventual server-side apenas nas 4 telas citadas em "Não fazer".

## Lacunas do documento (específicas do ÒPURA)
- Escopo multi-tenant/org refletido na UI (RLS) — o doc ignora; recorrente aqui.
- Manual×importado×calculado (#25) é **estrutural** no ÒPURA (XML NF-e, Asaas, DRE),
  não observação — por isso virou primitiva na F1.
