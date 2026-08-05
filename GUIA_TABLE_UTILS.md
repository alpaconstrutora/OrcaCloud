# Guia: Implementar Ordenação + Configuração de Colunas

## 📍 Componentes Reutilizáveis
- **`components/ui/TableUtils.tsx`** - Hook + Componentes prontos para usar

## 🚀 Como Usar em Qualquer Lista

### 1️⃣ Defina as Colunas

```tsx
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader } from '../ui/TableUtils';

const COLUMNS: ColumnConfig[] = [
  { key: 'name', label: 'Nome', sortable: true },
  { key: 'email', label: 'Email', sortable: true },
  { key: 'phone', label: 'Telefone', sortable: false },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'created', label: 'Criado em', sortable: true },
];
```

### 2️⃣ Use o Hook

```tsx
const YourList = () => {
  const [items, setItems] = useState([]);
  
  // Usar o hook
  const {
    visibleColumns,
    sortColumn,
    sortDirection,
    showColumnConfig,
    setShowColumnConfig,
    handleColumnSort,
    toggleColumn,
    resetColumns,
  } = useTableColumns(COLUMNS);

  // Ordenação: aplicar ao array
  const sortedItems = useMemo(() => {
    if (!sortColumn) return items;
    
    return [...items].sort((a, b) => {
      const val1 = a[sortColumn];
      const val2 = b[sortColumn];
      
      // Comparação genérica
      if (typeof val1 === 'string') {
        return sortDirection === 'asc'
          ? val1.localeCompare(val2)
          : val2.localeCompare(val1);
      }
      if (typeof val1 === 'number') {
        return sortDirection === 'asc'
          ? val1 - val2
          : val2 - val1;
      }
      return 0;
    });
  }, [items, sortColumn, sortDirection]);

  return (
    <>
      {/* Botão de Configuração */}
      <ColumnConfigButton
        columns={COLUMNS}
        visibleColumns={visibleColumns}
        showColumnConfig={showColumnConfig}
        onToggleShow={() => setShowColumnConfig(!showColumnConfig)}
        onToggleColumn={toggleColumn}
        onReset={resetColumns}
      />

      {/* Tabela */}
      <table>
        <thead>
          <tr>
            {COLUMNS.map(col => 
              visibleColumns.includes(col.key) && (
                <SortableHeader
                  key={col.key}
                  label={col.label}
                  colKey={col.key}
                  sortable={col.sortable}
                  sortColumn={sortColumn}
                  sortDirection={sortDirection}
                  onSort={handleColumnSort}
                />
              )
            )}
          </tr>
        </thead>
        <tbody>
          {sortedItems.map(item => (
            <tr key={item.id}>
              {COLUMNS.map(col =>
                visibleColumns.includes(col.key) && (
                  <td key={col.key}>
                    {/* Seu conteúdo aqui */}
                  </td>
                )
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
};
```

## 📋 Componentes Sugeridos para Implementar

**Priority Alta** (muito usados):
- [ ] ClientList.tsx
- [ ] InvoiceManager.tsx
- [ ] ContasPagarManager.tsx
- [ ] ContasReceberManager.tsx
- [ ] BoletoManager.tsx
- [ ] LaborEmployeeList.tsx

**Priority Média**:
- [ ] BrokerList.tsx
- [ ] InvestorList.tsx
- [ ] ContractTemplateManager.tsx
- [ ] FinancialRegistryManager.tsx

**Priority Baixa**:
- [ ] DocxTemplateManager.tsx
- [ ] ObraTypesManager.tsx
- [ ] AutomationManager.tsx

## ✨ Exemplo Pronto: ProjectList.tsx

Já implementado com essas funcionalidades. Use como referência!

## 💡 Dicas

1. **Ordenação Numérica**: Use `parseInt()` para códigos/números
2. **Ordenação de Data**: Use `new Date(val).getTime()`
3. **Sem Sorteio em Coluna**: Deixe `sortable: false` na ColumnConfig
4. **Customizar Operação Sort**: Sobrescreva a lógica no `.sort()`
5. **Persistir Preferências**: Salve `visibleColumns` + `sortColumn` no localStorage ou banco

## 🖱️ Reordenar colunas por arraste (estilo ClickUp)

Padrão do sistema (pedido em 2026-08-04): o usuário pode clicar e segurar o
cabeçalho de uma coluna e soltar sobre outra para trocar de posição. O
mecanismo já existe em `useTableColumns`/`SortableHeader` — cada tela precisa
de duas mudanças:

1. **Renderizar `<col>`/`<th>`/`<td>` mapeando `orderedVisibleColumns`**, em vez
   de uma sequência fixa de `visibleColumns.includes(key) && (...)` no JSX.
   Isso é o que faz a ordem arrastada realmente aparecer na tela — sem isso, o
   header fica arrastável mas a posição visual não muda.

   ```tsx
   const tableColumns = useTableColumns(COLUMNS, 'minhaTelaColunas');

   // colgroup
   {tableColumns.orderedVisibleColumns.map(key => (
     <col key={key} data-col-key={key} style={{ width: `${cols.getWidth(key)}px` }} />
   ))}

   // thead
   {tableColumns.orderedVisibleColumns.map(key => {
     const def = COLUMN_HEADERS[key]; // label/sortable/className por coluna
     return (
       <SortableHeader key={key} colKey={key} label={def.label} sortable={def.sortable}
         sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
         onSort={tableColumns.handleColumnSort}
         onMoveColumn={tableColumns.moveColumn}
         className={def.className}>
         <cols.ResizeHandle colKey={key} />
       </SortableHeader>
     );
   })}

   // tbody
   {tableColumns.orderedVisibleColumns.map(key => (
     <td key={key} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
       {renderCell(key, item)} {/* função pura por coluna, extraída do bloco antigo */}
     </td>
   ))}
   ```

2. **Passar `onMoveColumn={tableColumns.moveColumn}` ao `SortableHeader`** — é o
   que liga o `draggable`/`onDrop` do header ao estado de ordem. Sem essa prop,
   o header continua exatamente como antes (aditivo, não quebra tela nenhuma
   que ainda não migrou).

A ordem persiste junto com visibilidade/sort no mesmo `storageKey` de
`useTableColumns` (localStorage) e é restaurada por "Restaurar Padrão"
(`ColumnConfigButton`/`resetColumns`).

**Piloto implementado em `ClientList.tsx`** (2026-08-04) — referência completa
de como extrair a função `renderCell` por coluna e o mapa `COLUMN_HEADERS`.
Rollout nas demais ~81 telas que usam `useTableColumns` é trabalho futuro,
tela por tela, sempre com o passo 1 acima (a maioria ainda renderiza colunas em
sequência fixa, não por `orderedVisibleColumns`).

Teste automatizado do mecanismo (sem UI): `__tests__/components/TableUtilsColumnDrag.test.tsx`.

## 🔗 Arquivos

- **Utilitários**: `components/ui/TableUtils.tsx`
- **Exemplo**: `components/ProjectList.tsx` (linhas 1-100 do hook)
- **Exemplo de drag-and-drop de colunas**: `components/ClientList.tsx`
