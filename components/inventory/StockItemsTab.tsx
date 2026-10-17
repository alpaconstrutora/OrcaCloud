// components/inventory/StockItemsTab.tsx — aba "Itens" do Gestão de Almoxarifado
//
// Catálogo de insumos (stock_items). É a peça que faltava para o cadastro de
// item existir de verdade — antes, o item nascia digitado em texto livre em
// cada movimento. Ver docs/planos/2026-08-21-almoxarifado-cadastro-de-itens.md.
import React from 'react';
import { Landmark, Package, Plus, Upload } from 'lucide-react';
import ActionIconButton from '../ui/ActionIconButton';
import { useConfirm } from '../ui/confirm';
import { useTableColumns, SortableHeader, ColumnConfig } from '../ui/TableUtils';
import { inventoryService } from '../../services/inventoryService';
import type { StockItem, StockItemSource } from '../../types/inventory';
import { agruparLinhas, chavePorNome, entradasDaPagina, type ChaveDeGrupo, type EntradaDaTela } from '../../utils/agruparLinhas';
import { useAgrupamento } from '../../hooks/useAgrupamento';
import { AgruparControles, LinhaDeGrupo } from '../ui/Agrupamento';

export const STOCK_ITEMS_COLUMNS: ColumnConfig[] = [
    { key: 'inputCode', label: 'Código', sortable: true },
    { key: 'inputDescription', label: 'Descrição', sortable: true },
    { key: 'inputUnit', label: 'Unidade', sortable: false },
    { key: 'category', label: 'Categoria', sortable: true },
    // Configurações › Marcas e Modelos (13/10/2026)
    { key: 'brandModel', label: 'Marca / modelo', sortable: true },
    { key: 'defaultSupplierName', label: 'Fornecedor padrão', sortable: true },
    { key: 'source', label: 'Origem', sortable: true },
    { key: 'isActive', label: 'Situação', sortable: true },
    { key: 'actions', label: 'Ações', sortable: false },
];

const SOURCE_LABELS: Record<StockItemSource, string> = {
    avulso: 'Avulso',
    catalogo: 'Base de dados',
    orcamento: 'Orçamento',
    planilha: 'Planilha',
    recebimento: 'Recebimento',
    ativos: 'Gestão de Ativos',
};

/** "Marca Modelo" do item — o texto que o banco espelha do catálogo. */
export const marcaModelo = (i: Pick<StockItem, 'brand' | 'model'>) => [i.brand, i.model].filter(v => v && v.trim()).join(' ');

// "Agrupar" — guia de UI §6.12. Chave = o MESMO texto que a coluna mostra. Catálogo
// sem valor em dinheiro: o cabeçalho do grupo mostra só a contagem.
type CampoAgrupar = 'categoria' | 'marca_modelo' | 'fornecedor' | 'origem' | 'situacao';
const OPCOES_AGRUPAR: { value: CampoAgrupar; label: string }[] = [
    { value: 'categoria', label: 'Categoria' },
    { value: 'marca_modelo', label: 'Marca / modelo' },
    { value: 'fornecedor', label: 'Fornecedor padrão' },
    { value: 'origem', label: 'Origem' },
    { value: 'situacao', label: 'Situação' },
];
const SEM_GRUPO: Record<CampoAgrupar, string> = {
    categoria: 'Sem categoria', marca_modelo: 'Sem marca / modelo', fornecedor: 'Sem fornecedor padrão', origem: 'Sem origem', situacao: 'Sem situação',
};

interface Props {
    items: StockItem[];
    tableItems: ReturnType<typeof useTableColumns>;
    onEdit: (item: StockItem) => void;
    onNew: () => void;
    onImport: () => void;
    onChanged: () => void;
    /** Itens que SÃO um ativo patrimonial (stock_item_id → ativo). */
    assetLinks?: Map<string, { assetId: string; code: string; name: string }>;
    /** Transformar unidades do item em ativos patrimoniais (PatrimoniarItemSheet). */
    onPatrimoniar?: (item: StockItem) => void;
}

const StockItemsTab: React.FC<Props> = ({ items, tableItems, onEdit, onNew, onImport, onChanged, assetLinks, onPatrimoniar }) => {
    const confirm = useConfirm();
    const agrupamento = useAgrupamento<CampoAgrupar>('inventory-itens:groupBy');

    const sorted = React.useMemo(() => {
        if (!tableItems.sortColumn) return items;
        const col = tableItems.sortColumn as keyof StockItem;
        const dir = tableItems.sortDirection === 'asc' ? 1 : -1;
        const valor = (i: StockItem) => (tableItems.sortColumn === 'brandModel' ? marcaModelo(i) : i[col]);
        return [...items].sort((a, b) => {
            const av = String(valor(a) ?? '').toLowerCase();
            const bv = String(valor(b) ?? '').toLowerCase();
            return av.localeCompare(bv) * dir;
        });
    }, [items, tableItems.sortColumn, tableItems.sortDirection]);

    const groupBy = agrupamento.campo;
    const grupos = React.useMemo(() => {
        if (groupBy === 'none') return [];
        const chave = (i: StockItem): ChaveDeGrupo => {
            switch (groupBy) {
                case 'categoria': return chavePorNome(i.category);
                case 'marca_modelo': return chavePorNome(marcaModelo(i));
                case 'fornecedor': return chavePorNome(i.defaultSupplierName);
                // Mesma regra da célula: item que é ativo aparece como "Ativo patrimonial".
                case 'origem': return chavePorNome(assetLinks?.get(i.id) ? 'Ativo patrimonial' : i.source ? SOURCE_LABELS[i.source] : null);
                case 'situacao': return i.isActive ? { key: 'ativo', label: 'Ativo' } : { key: 'inativo', label: 'Inativo' };
            }
        };
        return agruparLinhas(sorted, { chave, semRotulo: SEM_GRUPO[groupBy], ordem: groupBy === 'situacao' ? ['ativo', 'inativo'] : 'aparicao' });
    }, [groupBy, sorted, assetLinks]);
    const entradas: EntradaDaTela<StockItem>[] = React.useMemo(
        () => (groupBy !== 'none' ? entradasDaPagina(grupos, agrupamento.recolhidos) : sorted.map((item, indice) => ({ tipo: 'linha' as const, item, indice }))),
        [groupBy, grupos, agrupamento.recolhidos, sorted],
    );

    const handleToggleActive = async (item: StockItem) => {
        if (item.isActive) {
            const ok = await confirm({
                title: `Desativar "${item.inputDescription}"?`,
                message: 'O item some das buscas de novos lançamentos. O histórico de movimentos e saldos não é afetado.',
                variant: 'warning',
                confirmLabel: 'Desativar',
            });
            if (!ok) return;
        }
        await inventoryService.setStockItemActive(item.id, !item.isActive);
        onChanged();
    };

    return (
        <div className="bg-white rounded-[1.5rem] shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                <div>
                    <p className="text-sm text-gray-900 font-medium">Catálogo de Itens</p>
                    <p className="text-xs text-gray-500 mt-1">Cadastro mestre de insumos usado por Entrada, Saída, Transferência e Requisições.</p>
                </div>
                <div className="flex items-center gap-2">
                    {/* Agrupar — guia de UI §6.12 */}
                    <AgruparControles
                        opcoes={OPCOES_AGRUPAR}
                        campo={groupBy}
                        onCampo={agrupamento.setCampo}
                        chavesDosGrupos={grupos.map(g => g.key)}
                        algumRecolhido={agrupamento.recolhidos.size > 0}
                        onAlternarTodos={agrupamento.alternarTodos}
                        title="Agrupar os itens"
                    />
                    <button
                        onClick={onImport}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 transition-all font-medium text-[13px] active:scale-95"
                    >
                        <Upload className="w-[15px] h-[15px]" />
                        Importar
                    </button>
                    <button
                        onClick={onNew}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 transition-all font-medium text-[13px] active:scale-95"
                    >
                        <Plus className="w-[15px] h-[15px]" />
                        Novo Item
                    </button>
                </div>
            </div>

            {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-400 bg-gray-50/50">
                    <Package className="w-12 h-12 mb-4 text-gray-300" />
                    <h3 className="text-lg font-medium text-gray-900 mb-1">Nenhum item cadastrado</h3>
                    <p className="text-sm text-gray-500 max-w-sm text-center mb-6">
                        Cadastre um item avulso ou importe de uma obra, da base de dados ou de uma planilha.
                    </p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left border-collapse">
                        <thead>
                            <tr className="bg-white text-gray-700 font-semibold text-xs border-b border-gray-200">
                                {tableItems.orderedVisibleColumns.map(key => {
                                    const def = STOCK_ITEMS_COLUMNS.find(c => c.key === key);
                                    if (!def) return null;
                                    if (key === 'actions') {
                                        return <th key={key} className="px-6 py-2 text-right text-gray-500 font-semibold">Ações</th>;
                                    }
                                    return (
                                        <SortableHeader
                                            key={key} colKey={key} label={def.label} uppercase={false}
                                            sortable={def.sortable !== false}
                                            sortColumn={tableItems.sortColumn} sortDirection={tableItems.sortDirection}
                                            onSort={tableItems.handleColumnSort}
                                            onMoveColumn={tableItems.moveColumn}
                                            className="px-6 py-2 border-r border-gray-100"
                                        />
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {entradas.map(e => {
                                if (e.tipo === 'grupo') return (
                                    <LinhaDeGrupo key={`grupo:${e.grupo.key}`} grupo={e.grupo} recolhido={e.recolhido} continua={e.continua}
                                        colSpan={tableItems.orderedVisibleColumns.filter(k => STOCK_ITEMS_COLUMNS.some(c => c.key === k)).length}
                                        onAlternar={agrupamento.alternar} semTotal />
                                );
                                const item = e.item;
                                return (
                                <tr key={item.id} className="hover:bg-blue-50/50 transition-colors group">
                                    {tableItems.orderedVisibleColumns.map(key => {
                                        const ativo = assetLinks?.get(item.id);
                                        if (key === 'actions') {
                                            // O botão desligado tem `pointer-events-none`: o motivo
                                            // fica no <span> em volta, que recebe o hover.
                                            const motivoPatrimoniar = ativo
                                                ? `Este item já é o ativo patrimonial ${ativo.code}`
                                                : !item.isActive ? 'Item inativo — reative antes' : '';
                                            return (
                                                <td key={key} className="px-6 py-2.5 text-right">
                                                    <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                                                        <ActionIconButton kind="edit" onClick={() => onEdit(item)} />
                                                        {onPatrimoniar && (
                                                            <span title={motivoPatrimoniar || undefined}>
                                                                <ActionIconButton
                                                                    kind="move"
                                                                    title="Transformar em ativo patrimonial"
                                                                    icon={<Landmark className="w-4 h-4" />}
                                                                    disabled={!!motivoPatrimoniar}
                                                                    onClick={() => onPatrimoniar(item)}
                                                                />
                                                            </span>
                                                        )}
                                                        <ActionIconButton
                                                            kind={item.isActive ? 'lock' : 'unlock'}
                                                            title={item.isActive ? 'Desativar' : 'Reativar'}
                                                            onClick={() => handleToggleActive(item)}
                                                        />
                                                    </div>
                                                </td>
                                            );
                                        }
                                        if (key === 'inputCode') {
                                            return <td key={key} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{item.inputCode}</td>;
                                        }
                                        if (key === 'inputDescription') {
                                            return <td key={key} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">{item.inputDescription}</td>;
                                        }
                                        if (key === 'inputUnit') {
                                            return <td key={key} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{item.inputUnit}</td>;
                                        }
                                        if (key === 'category') {
                                            return <td key={key} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{item.category || '—'}</td>;
                                        }
                                        if (key === 'brandModel') {
                                            const mm = marcaModelo(item);
                                            return <td key={key} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600" title={mm || undefined}>{mm || '—'}</td>;
                                        }
                                        if (key === 'defaultSupplierName') {
                                            return <td key={key} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{item.defaultSupplierName || '—'}</td>;
                                        }
                                        if (key === 'source') {
                                            if (ativo) {
                                                return (
                                                    <td key={key} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600" title={`Ativo ${ativo.code} — ${ativo.name}. O saldo acompanha o ativo (Gestão de Ativos).`}>
                                                        Ativo patrimonial
                                                    </td>
                                                );
                                            }
                                            return <td key={key} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{item.source ? SOURCE_LABELS[item.source] : '—'}</td>;
                                        }
                                        if (key === 'isActive') {
                                            return (
                                                <td key={key} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal">
                                                    <span className={item.isActive ? 'text-green-700' : 'text-gray-400'}>{item.isActive ? 'Ativo' : 'Inativo'}</span>
                                                </td>
                                            );
                                        }
                                        return null;
                                    })}
                                </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default StockItemsTab;
