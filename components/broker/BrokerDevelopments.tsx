import React, { useState, useMemo, useEffect } from 'react';
import { Building2, ChevronLeft, ChevronRight, Loader2, MapPin, Info } from 'lucide-react';
import { commercialPriceTableService } from '../../services/commercialPriceTableService';
import type { CommercialPriceTable, CommercialPriceTableItem } from '../../services/commercialPriceTableService';
import { brokerPortalService } from '../../services/brokerPortalService';
import { formatMoney } from '../ui/Format';
import { SortableHeader } from '../ui/TableUtils';
import type { BrokerUnit } from '../../types';

interface BrokerDevelopmentsProps {
    /** Empreendimentos (commercial_properties com type='BUILDING') — já carregados pelo portal. */
    buildings: BrokerUnit[];
    /** Estoque completo, usado para contar unidades por empreendimento e resolver a unidade
     *  ao clicar numa linha (a proposta é feita com o objeto completo, não só o item de preço). */
    units: BrokerUnit[];
    /** Presente no modo de link público (sem login) — dados vêm por RPC anon. */
    portalToken?: string;
    organizationId?: string;
    /** Reusa exatamente o fluxo que a aba Estoque já usa: abre o plano de vendas
     *  (BrokerProposalSimulator) com a unidade preenchida. */
    onMakeProposal: (unit: BrokerUnit) => void;
}

// Status da unidade — mesmas labels/cores de PriceTableManager.tsx e PropertyUnitMap.tsx.
const UNIT_STATUS_LABEL: Record<string, string> = {
    AVAILABLE: 'Disponível',
    RESERVED: 'Reservado',
    SOLD: 'Vendido',
    RENTED: 'Alugado',
    WAITING_PAYMENT: 'Aguardando pagamento',
    BLOCKED: 'Bloqueado',
    EXCHANGED: 'Permutado',
};
const UNIT_STATUS_COLOR: Record<string, string> = {
    AVAILABLE: 'text-emerald-700',
    RESERVED: 'text-amber-700',
    SOLD: 'text-red-600',
    RENTED: 'text-blue-700',
    WAITING_PAYMENT: 'text-amber-700',
    BLOCKED: 'text-gray-600',
    EXCHANGED: 'text-violet-700',
};

// §8 Status Badge — texto simples colorido, sem pílula/fundo/uppercase.
const UnitStatusBadge: React.FC<{ status?: string }> = ({ status }) => {
    if (!status) return <span className="text-sm font-normal text-gray-400">—</span>;
    return (
        <span className={`text-sm font-normal ${UNIT_STATUS_COLOR[status] || 'text-gray-600'}`}>
            {UNIT_STATUS_LABEL[status] || status}
        </span>
    );
};

const num = (v: number | null | undefined) => (v != null ? String(v) : '—');
const areaFmt = (v: number | null | undefined) => (v != null ? `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m²` : '—');

type SortKey = 'unit' | 'status' | 'area' | 'bedrooms' | 'parking' | 'price';
type BuildingSortKey = 'name' | 'units';

const BrokerDevelopments: React.FC<BrokerDevelopmentsProps> = ({ buildings, units, portalToken, onMakeProposal }) => {
    const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [activeTable, setActiveTable] = useState<Pick<CommercialPriceTable, 'id' | 'version_label' | 'effective_date' | 'status' | 'activated_at'> | null>(null);
    const [items, setItems] = useState<CommercialPriceTableItem[]>([]);

    // Sort local (não persistido) — lista embutida numa aba do portal, não a tela
    // principal de gestão de preços (essa já existe em PriceTableManager, com
    // colunas configuráveis). Ver ui_ux_standard_guide.md §6.3: mesmo aqui, toda
    // coluna de valor único continua ordenável — só a persistência é dispensada.
    const [buildingSort, setBuildingSort] = useState<{ col: BuildingSortKey; dir: 'asc' | 'desc' }>({ col: 'name', dir: 'asc' });
    const [itemSort, setItemSort] = useState<{ col: SortKey; dir: 'asc' | 'desc' }>({ col: 'unit', dir: 'asc' });

    const selectedBuilding = useMemo(() => buildings.find(b => b.id === selectedBuildingId) || null, [buildings, selectedBuildingId]);

    const unitCountByBuilding = useMemo(() => {
        const counts: Record<string, number> = {};
        units.forEach(u => {
            if (u.type !== 'BUILDING' && u.parent_id) counts[u.parent_id] = (counts[u.parent_id] || 0) + 1;
        });
        return counts;
    }, [units]);

    useEffect(() => {
        if (!selectedBuildingId) return;
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            setActiveTable(null);
            setItems([]);
            try {
                if (portalToken) {
                    const res = await brokerPortalService.getPriceTableByToken(portalToken, selectedBuildingId);
                    if (!cancelled) { setActiveTable(res.table); setItems(res.items.filter(i => i.visible_to_broker !== false)); }
                } else {
                    const table = await commercialPriceTableService.getActiveTable(selectedBuildingId);
                    const tableItems = table ? await commercialPriceTableService.getTableItems(table.id) : [];
                    // Mesmo corte de visibilidade da RPC (modo token), aplicado aqui no
                    // modo autenticado — visible_to_broker é da unidade, não da versão.
                    if (!cancelled) { setActiveTable(table); setItems(tableItems.filter(i => i.visible_to_broker !== false)); }
                }
            } catch (err) {
                console.error('[BrokerDevelopments] Erro ao carregar tabela de preços:', err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [selectedBuildingId, portalToken]);

    // Sem tabela ativa: cai nas unidades filhas com o preço vigente (nunca fica vazio
    // só porque o admin ainda não publicou uma versão da tabela de preços).
    const fallbackRows: CommercialPriceTableItem[] = useMemo(() => {
        if (activeTable || loading || !selectedBuildingId) return [];
        return units
            .filter(u => u.parent_id === selectedBuildingId)
            .map(u => ({
                id: u.id,
                price_table_id: '',
                property_id: u.id,
                price: u.price ?? 0,
                created_at: '',
                property_name: u.name || u.number,
                current_price: u.price,
                property_status: u.status,
                private_area: u.private_area ?? null,
                bedrooms: u.specs?.bedrooms ?? null,
                bathrooms: u.specs?.bathrooms ?? null,
                parking_spaces: u.specs?.parkingSpaces ?? null,
                floor: u.specs?.floor ?? null,
                position_type: null,
            }));
    }, [activeTable, loading, units, selectedBuildingId]);

    const rows = activeTable ? items : fallbackRows;

    const sortedBuildings = useMemo(() => {
        const dir = buildingSort.dir === 'asc' ? 1 : -1;
        return [...buildings].sort((a, b) => {
            if (buildingSort.col === 'units') {
                return ((unitCountByBuilding[a.id] || 0) - (unitCountByBuilding[b.id] || 0)) * dir;
            }
            return (a.name || '').localeCompare(b.name || '', 'pt-BR', { numeric: true }) * dir;
        });
    }, [buildings, buildingSort, unitCountByBuilding]);

    const sortedRows = useMemo(() => {
        const dir = itemSort.dir === 'asc' ? 1 : -1;
        const n = (v: number | null | undefined) => v ?? -Infinity;
        return [...rows].sort((a, b) => {
            switch (itemSort.col) {
                case 'status': return (a.property_status || '').localeCompare(b.property_status || '', 'pt-BR') * dir;
                case 'area': return (n(a.private_area) - n(b.private_area)) * dir;
                case 'bedrooms': return (n(a.bedrooms) - n(b.bedrooms)) * dir;
                case 'parking': return (n(a.parking_spaces) - n(b.parking_spaces)) * dir;
                case 'price': return (n(a.price) - n(b.price)) * dir;
                default: return (a.property_name || '').localeCompare(b.property_name || '', 'pt-BR', { numeric: true }) * dir;
            }
        });
    }, [rows, itemSort]);

    const handleBuildingSort = (col: string) => {
        setBuildingSort(prev => prev.col === col ? { col: col as BuildingSortKey, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col: col as BuildingSortKey, dir: 'asc' });
    };
    const handleItemSort = (col: string) => {
        setItemSort(prev => prev.col === col ? { col: col as SortKey, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col: col as SortKey, dir: 'asc' });
    };

    const handleRowClick = (propertyId: string) => {
        const unit = units.find(u => u.id === propertyId);
        if (!unit) return;
        onMakeProposal(unit);
    };

    // ── Master: lista de empreendimentos ────────────────────────────────────
    if (!selectedBuilding) {
        return (
            <div className="space-y-6">
                <div>
                    <h2 className="text-lg font-bold text-gray-900">Empreendimentos</h2>
                    <p className="text-sm text-gray-500 mt-1">Selecione um empreendimento para ver a tabela de preços vigente e iniciar uma proposta.</p>
                </div>

                {buildings.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-[10px] shadow-sm border border-gray-100">
                        <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum empreendimento encontrado</h3>
                        <p className="text-sm text-gray-500">Ainda não há empreendimentos publicados nesta organização.</p>
                    </div>
                ) : (
                    <div className="bg-white rounded-[10px] shadow-sm border border-gray-100 overflow-hidden">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    <SortableHeader colKey="name" label="Empreendimento" uppercase={false}
                                        sortColumn={buildingSort.col} sortDirection={buildingSort.dir} onSort={handleBuildingSort}
                                        className="px-6 py-2 border-r border-gray-100" />
                                    <SortableHeader colKey="address" label="Endereço" sortable={false} uppercase={false}
                                        className="px-6 py-2 border-r border-gray-100" />
                                    <SortableHeader colKey="units" label="Unidades" uppercase={false}
                                        sortColumn={buildingSort.col} sortDirection={buildingSort.dir} onSort={handleBuildingSort}
                                        className="px-6 py-2 text-right" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {sortedBuildings.map(b => (
                                    <tr key={b.id} className="hover:bg-blue-50/50 transition-colors cursor-pointer" onClick={() => setSelectedBuildingId(b.id)}>
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">
                                            <div className="flex items-center gap-2.5">
                                                <div className="w-8 h-8 rounded-[6px] bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                                                    <Building2 className="w-4 h-4" />
                                                </div>
                                                {b.name}
                                            </div>
                                        </td>
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                                            {b.address || '—'}
                                        </td>
                                        <td className="px-6 py-2.5 text-right text-sm font-normal text-gray-600">
                                            {unitCountByBuilding[b.id] || 0}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        );
    }

    // ── Detail: tabela de preços do empreendimento selecionado ──────────────
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <button
                        onClick={() => setSelectedBuildingId(null)}
                        className="flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-800 transition-colors mb-1.5"
                    >
                        <ChevronLeft className="w-4 h-4" /> Empreendimentos
                    </button>
                    <h2 className="text-lg font-bold text-gray-900">{selectedBuilding.name}</h2>
                    {selectedBuilding.address && <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />{selectedBuilding.address}</p>}
                </div>
                {activeTable && (
                    <span className="text-xs font-medium text-gray-500 bg-gray-50 border border-gray-200 rounded-[6px] px-3 py-1.5">
                        Tabela vigente: {activeTable.version_label}
                    </span>
                )}
            </div>

            {!loading && !activeTable && (
                <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-100 rounded-[10px] px-4 py-3 text-sm text-amber-800">
                    <Info className="w-4 h-4 shrink-0 mt-0.5" />
                    Este empreendimento ainda não tem uma tabela de preços ativa — exibindo o preço vigente cadastrado em cada unidade.
                </div>
            )}

            {loading ? (
                <div className="text-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto" />
                    <p className="mt-2 text-gray-500">Carregando tabela de preços...</p>
                </div>
            ) : sortedRows.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-[10px] shadow-sm border border-gray-100">
                    <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma unidade encontrada</h3>
                    <p className="text-sm text-gray-500">Este empreendimento ainda não tem unidades publicadas no comercial.</p>
                </div>
            ) : (
                <div className="bg-white rounded-[10px] shadow-sm border border-gray-100 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    <SortableHeader colKey="unit" label="Unidade" uppercase={false}
                                        sortColumn={itemSort.col} sortDirection={itemSort.dir} onSort={handleItemSort}
                                        className="px-6 py-2 border-r border-gray-100" />
                                    <SortableHeader colKey="status" label="Status" uppercase={false}
                                        sortColumn={itemSort.col} sortDirection={itemSort.dir} onSort={handleItemSort}
                                        className="px-6 py-2 border-r border-gray-100" />
                                    <SortableHeader colKey="area" label="Área privativa" uppercase={false}
                                        sortColumn={itemSort.col} sortDirection={itemSort.dir} onSort={handleItemSort}
                                        className="px-6 py-2 border-r border-gray-100 text-right whitespace-nowrap" />
                                    <SortableHeader colKey="bedrooms" label="Dormitórios" uppercase={false}
                                        sortColumn={itemSort.col} sortDirection={itemSort.dir} onSort={handleItemSort}
                                        className="px-6 py-2 border-r border-gray-100 text-right whitespace-nowrap" />
                                    <SortableHeader colKey="parking" label="Vagas" uppercase={false}
                                        sortColumn={itemSort.col} sortDirection={itemSort.dir} onSort={handleItemSort}
                                        className="px-6 py-2 border-r border-gray-100 text-right whitespace-nowrap" />
                                    <SortableHeader colKey="price" label="Preço" uppercase={false}
                                        sortColumn={itemSort.col} sortDirection={itemSort.dir} onSort={handleItemSort}
                                        className="px-6 py-2 text-right" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {sortedRows.map(item => {
                                    const clickable = units.some(u => u.id === item.property_id);
                                    return (
                                        <tr
                                            key={item.id}
                                            className={`transition-colors group ${clickable ? 'hover:bg-blue-50/50 cursor-pointer' : 'opacity-60'}`}
                                            onClick={() => clickable && handleRowClick(item.property_id)}
                                            title={clickable ? 'Clique para iniciar uma proposta com esta unidade' : 'Unidade não disponível no estoque atual'}
                                        >
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">
                                                <span className="group-hover:text-blue-700 flex items-center gap-1.5">
                                                    {item.property_name || '—'}
                                                    {clickable && <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-blue-500 transition-colors" />}
                                                </span>
                                            </td>
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                <UnitStatusBadge status={item.property_status} />
                                            </td>
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right text-sm font-normal text-gray-600 whitespace-nowrap">
                                                {areaFmt(item.private_area)}
                                            </td>
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right text-sm font-normal text-gray-600">
                                                {num(item.bedrooms)}
                                            </td>
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right text-sm font-normal text-gray-600">
                                                {num(item.parking_spaces)}
                                            </td>
                                            <td className="px-6 py-2.5 text-right text-sm font-medium text-gray-800">
                                                {formatMoney(item.price)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BrokerDevelopments;
