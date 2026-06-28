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

## 🔗 Arquivos

- **Utilitários**: `components/ui/TableUtils.tsx`
- **Exemplo**: `components/ProjectList.tsx` (linhas 1-100 do hook)
