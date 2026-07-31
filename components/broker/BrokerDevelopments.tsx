import React, { useState, useMemo, useEffect } from 'react';
import { Building2, ChevronLeft, ChevronRight, Loader2, MapPin, Info, Image as ImageIcon } from 'lucide-react';
import { commercialPriceTableService } from '../../services/commercialPriceTableService';
import type { CommercialPriceTable, CommercialPriceTableItem } from '../../services/commercialPriceTableService';
import { rentalPriceTableService } from '../../services/rentalPriceTableService';
import { brokerPortalService } from '../../services/brokerPortalService';
import { formatMoney } from '../ui/Format';
import { SortableHeader, ColumnConfigButton, useTableColumns } from '../ui/TableUtils';
import type { ColumnConfig } from '../ui/TableUtils';
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
    /**
     * Cesta compartilhada com a aba Estoque — permite montar apto + vaga + box
     * daqui também. Opcionais: sem elas a tabela funciona como antes (clique =
     * proposta de uma unidade).
     */
    selectedUnitIds?: string[];
    onToggleUnit?: (unit: BrokerUnit) => void;
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

// position_type (commercial_properties) — mesmas labels de PriceTableManager.tsx/PropertyModal.tsx.
const POSITION_LABEL: Record<string, string> = { FRONT: 'Frente', LATERAL: 'Lateral', BACK: 'Fundos' };

const num = (v: number | null | undefined) => (v != null ? String(v) : '—');
const areaFmt = (v: number | null | undefined) => (v != null ? `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m²` : '—');

// Espelho EXATO das colunas de PriceTableManager.tsx (Comercial › Venda de
// Ativos › Tabela de Preços) — mesmas chaves, mesma ordem, todas as 12. O que
// varia é só a apresentação: aqui "Preço nesta versão" e "Visível p/ Corretor"
// são leitura, não campo editável (a edição continua sendo lá).
// Os labels de preço mudam com o eixo Venda/Locação, como no MODE_CONFIG de lá.
const buildColumns = (priceMode: 'sale' | 'rental'): ColumnConfig[] => [
    // Foto de capa da unidade — não ordenável (imagem não tem valor comparável).
    { key: 'photo',           label: 'Foto',               sortable: false },
    { key: 'unit',            label: 'Unidade',            sortable: true },
    { key: 'status',          label: 'Status',             sortable: true },
    { key: 'privArea',        label: 'Área privativa',     sortable: true },
    { key: 'bedrooms',        label: 'Dormitórios',        sortable: true },
    { key: 'parking',         label: 'Vagas',              sortable: true },
    { key: 'bathrooms',       label: 'Banheiros',          sortable: true },
    { key: 'floor',           label: 'Pavimento',          sortable: true },
    { key: 'position',        label: 'Posição',            sortable: true },
    { key: 'current',         label: priceMode === 'rental' ? 'Aluguel vigente' : 'Preço vigente', sortable: true },
    { key: 'price',           label: priceMode === 'rental' ? 'Aluguel nesta versão' : 'Preço nesta versão', sortable: true },
    { key: 'delta',           label: 'Δ',                  sortable: true },
    { key: 'visibleToBroker', label: 'Visível p/ Corretor', sortable: true },
    { key: 'showPrice',       label: 'Exibir Preço',        sortable: true },
];
const COLUMN_KEYS = buildColumns('sale').map(c => c.key);

// Colunas criadas DEPOIS que a preferência do portal passou a ser gravada no
// banco (20270825000010). A preferência salva só guarda o que estava visível na
// época, então uma coluna nova nunca entraria nela e ficaria invisível para
// sempre — o oposto do `knownColumns` de useTableColumns, que já trata isso.
// Estas entram ligadas por padrão até o admin desmarcar e a lista ser regravada.
// Ao criar uma coluna nova aqui no futuro, acrescente a chave nesta lista.
const COLUMNS_ADDED_AFTER_PREFS = ['photo'];

// Δ da unidade: variação % entre o preço desta versão e o vigente. Mesma
// fórmula de itemDelta() em PriceTableManager.tsx.
// "Exibir Preço" (commercial_properties.show_price_to_broker): unidade continua
// listada, mas sem o valor. Default true — unidade antiga/sem o flag mostra preço.
const showPrice = (i: CommercialPriceTableItem) => (i.show_price_to_broker ?? true);

const itemDelta = (i: CommercialPriceTableItem) => {
    const cur = i.current_price ?? i.price;
    return cur > 0 ? ((i.price - cur) / cur) * 100 : 0;
};

type SortKey = 'unit' | 'status' | 'privArea' | 'bedrooms' | 'parking' | 'bathrooms' | 'floor'
    | 'position' | 'current' | 'price' | 'delta' | 'visibleToBroker' | 'showPrice';
type BuildingSortKey = 'name' | 'units';

const BrokerDevelopments: React.FC<BrokerDevelopmentsProps> = ({ buildings, units, portalToken, organizationId, onMakeProposal, selectedUnitIds, onToggleUnit }) => {
    const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
    // Eixo de preço exibido: venda (price) ou locação (rental_price). Toggle no
    // detalhe do empreendimento — o mesmo prédio pode ter as duas tabelas.
    const [priceMode, setPriceMode] = useState<'sale' | 'rental'>('sale');
    const [loading, setLoading] = useState(false);
    const [activeTable, setActiveTable] = useState<Pick<CommercialPriceTable, 'id' | 'version_label' | 'effective_date' | 'status' | 'activated_at'> | null>(null);
    const [items, setItems] = useState<CommercialPriceTableItem[]>([]);

    // Sort local (não persistido) — lista embutida numa aba do portal, não a tela
    // principal de gestão de preços (essa já existe em PriceTableManager, com
    // colunas configuráveis). Ver ui_ux_guia_unificado.md §6.3: mesmo aqui, toda
    // coluna de valor único continua ordenável — só a persistência é dispensada.
    const [buildingSort, setBuildingSort] = useState<{ col: BuildingSortKey; dir: 'asc' | 'desc' }>({ col: 'name', dir: 'asc' });
    const [itemSort, setItemSort] = useState<{ col: SortKey; dir: 'asc' | 'desc' }>({ col: 'unit', dir: 'asc' });

    const selectedBuilding = useMemo(() => buildings.find(b => b.id === selectedBuildingId) || null, [buildings, selectedBuildingId]);

    // REGRA #5: com o seletor em "Todas as organizações" o `organizationId` chega
    // null. A org sai do empreendimento aberto (ele é de uma só) — assim a
    // configuração de colunas nunca fica indisponível sem explicação.
    const effectiveOrgId = organizationId || selectedBuilding?.organization_id || buildings[0]?.organization_id;

    // Colunas visíveis. Diferente do resto do sistema, aqui a escolha NÃO é
    // preferência de tela: o que o admin marca na visão do app é o que o
    // corretor passa a ver no link público. Por isso a fonte da verdade é o
    // banco (broker_portal_price_columns, por organização) — o localStorage do
    // useTableColumns fica só como cache otimista até a leitura chegar.
    const columns = useMemo(() => buildColumns(priceMode), [priceMode]);
    const tableColumns = useTableColumns(buildColumns('sale'), 'brokerDevelopments:priceColumns');
    const { visibleColumns, setVisibleColumns } = tableColumns;
    const isCol = (key: string) => visibleColumns.includes(key);
    const [prefsLoaded, setPrefsLoaded] = useState(false);
    const [savingColumns, setSavingColumns] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const cols = portalToken
                    ? await brokerPortalService.getPriceColumnsByToken(portalToken)
                    : effectiveOrgId ? await brokerPortalService.getPriceColumns(effectiveOrgId) : null;
                // Filtra chave desconhecida: se uma coluna for renomeada/removida no
                // código, a preferência antiga no banco não deve ressuscitá-la.
                if (!cancelled && cols) {
                    const known = cols.filter(k => COLUMN_KEYS.includes(k));
                    const novas = COLUMNS_ADDED_AFTER_PREFS.filter(k => !cols.includes(k));
                    setVisibleColumns([...known, ...novas]);
                }
            } catch (err) {
                console.error('[BrokerDevelopments] Erro ao carregar colunas do portal:', err);
            } finally {
                if (!cancelled) setPrefsLoaded(true);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [portalToken, effectiveOrgId, setVisibleColumns]);

    // Grava a escolha assim que o admin mexe (é o que faz o link refletir).
    // Só na visão do app: o corretor no link nunca escreve.
    useEffect(() => {
        if (!prefsLoaded || portalToken || !effectiveOrgId) return;
        setSavingColumns(true);
        const t = setTimeout(async () => {
            try {
                await brokerPortalService.savePriceColumns(effectiveOrgId, visibleColumns);
            } catch (err) {
                console.error('[BrokerDevelopments] Erro ao salvar colunas do portal:', err);
            } finally {
                setSavingColumns(false);
            }
        }, 500);
        return () => clearTimeout(t);
    }, [visibleColumns, prefsLoaded, portalToken, effectiveOrgId]);

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
                    const res = priceMode === 'rental'
                        ? await brokerPortalService.getRentalPriceTableByToken(portalToken, selectedBuildingId)
                        : await brokerPortalService.getPriceTableByToken(portalToken, selectedBuildingId);
                    if (!cancelled) { setActiveTable(res.table); setItems(res.items.filter(i => i.visible_to_broker !== false)); }
                } else {
                    const svc = priceMode === 'rental' ? rentalPriceTableService : commercialPriceTableService;
                    const table = await svc.getActiveTable(selectedBuildingId);
                    const tableItems = table ? await svc.getTableItems(table.id) : [];
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
    }, [selectedBuildingId, portalToken, priceMode]);

    // Sem tabela ativa: cai nas unidades filhas com o preço vigente (nunca fica vazio
    // só porque o admin ainda não publicou uma versão da tabela de preços).
    const fallbackRows: CommercialPriceTableItem[] = useMemo(() => {
        if (activeTable || loading || !selectedBuildingId) return [];
        // Locação usa rental_price (fallback ao price/"aluguel base" antigo enquanto
        // não preenchido); venda usa price.
        const unitValue = (u: BrokerUnit) => priceMode === 'rental'
            ? ((u as any).rental_price ?? u.price ?? 0)
            : (u.price ?? 0);
        return units
            .filter(u => u.parent_id === selectedBuildingId)
            .map(u => ({
                id: u.id,
                price_table_id: '',
                property_id: u.id,
                price: unitValue(u),
                created_at: '',
                property_name: u.name || u.number,
                current_price: unitValue(u),
                property_status: u.status,
                private_area: u.private_area ?? null,
                bedrooms: u.specs?.bedrooms ?? null,
                bathrooms: u.specs?.bathrooms ?? null,
                parking_spaces: u.specs?.parkingSpaces ?? null,
                // Pavimento e Posição moram na COLUNA de commercial_properties (é lá que
                // o publish do espelho grava — EspelhoVendasTab.handlePublish), ao
                // contrário de dormitórios/banheiros/vagas, que caem em specs. Ler de
                // specs (ou fixar null, no caso da posição) deixava as duas sempre
                // vazias — mesmo com o dado preenchido no Empreendimento e no Comercial.
                // `?? ` e não `||`: pavimento 0 é térreo, valor legítimo.
                floor: u.floor ?? u.specs?.floor ?? null,
                position_type: u.position_type ?? null,
                // Foto de capa — mesma origem do photo_url das RPCs/service: images[0].
                photo_url: u.images?.[0] ?? null,
                visible_to_broker: (u as any).visible_to_broker ?? true,
                show_price_to_broker: (u as any).show_price_to_broker ?? true,
            }));
    }, [activeTable, loading, units, selectedBuildingId, priceMode]);

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
                case 'privArea': return (n(a.private_area) - n(b.private_area)) * dir;
                case 'bedrooms': return (n(a.bedrooms) - n(b.bedrooms)) * dir;
                case 'parking': return (n(a.parking_spaces) - n(b.parking_spaces)) * dir;
                case 'bathrooms': return (n(a.bathrooms) - n(b.bathrooms)) * dir;
                case 'floor': return (n(a.floor) - n(b.floor)) * dir;
                case 'position': return (a.position_type || '').localeCompare(b.position_type || '', 'pt-BR') * dir;
                case 'current': return (n(a.current_price ?? a.price) - n(b.current_price ?? b.price)) * dir;
                case 'price': return (n(a.price) - n(b.price)) * dir;
                case 'delta': return (itemDelta(a) - itemDelta(b)) * dir;
                case 'visibleToBroker': return (Number(a.visible_to_broker ?? true) - Number(b.visible_to_broker ?? true)) * dir;
                case 'showPrice': return (Number(a.show_price_to_broker ?? true) - Number(b.show_price_to_broker ?? true)) * dir;
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
                <div className="flex items-center gap-3">
                    {/* Toggle Venda/Locação — o mesmo prédio pode ter as duas tabelas. */}
                    <div className="flex items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1">
                        <button
                            onClick={() => setPriceMode('sale')}
                            className={`h-7 px-3 rounded-[6px] text-sm font-medium transition-all whitespace-nowrap ${priceMode === 'sale' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            Venda
                        </button>
                        <button
                            onClick={() => setPriceMode('rental')}
                            className={`h-7 px-3 rounded-[6px] text-sm font-medium transition-all whitespace-nowrap ${priceMode === 'rental' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            Locação
                        </button>
                    </div>
                    {activeTable && (
                        <span className="text-xs font-medium text-gray-500 bg-gray-50 border border-gray-200 rounded-[6px] px-3 py-1.5">
                            Tabela vigente: {activeTable.version_label}
                        </span>
                    )}
                    {/* Só na visão do app: a escolha vale para a organização inteira e é
                        o que o corretor enxerga no link — o corretor não a edita.
                        REGRA #5: NÃO condicionar a `organizationId` (com o seletor em
                        "Todas as organizações" ele vem null e o botão sumiria) — a org
                        sai do empreendimento aberto, que é sempre de uma só. */}
                    {!portalToken && (
                        <div className="flex items-center gap-1.5">
                            {savingColumns && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
                            <ColumnConfigButton
                                columns={columns}
                                visibleColumns={visibleColumns}
                                showColumnConfig={tableColumns.showColumnConfig}
                                onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                                onToggleColumn={tableColumns.toggleColumn}
                                onReset={tableColumns.resetColumns}
                            />
                        </div>
                    )}
                </div>
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
                                    {isCol('photo') && <th className="px-6 py-2 border-r border-gray-100 w-16">Foto</th>}
                                    {isCol('unit') && <SortableHeader colKey="unit" label="Unidade" uppercase={false}
                                        sortColumn={itemSort.col} sortDirection={itemSort.dir} onSort={handleItemSort}
                                        className="px-6 py-2 border-r border-gray-100" />}
                                    {isCol('status') && <SortableHeader colKey="status" label="Status" uppercase={false}
                                        sortColumn={itemSort.col} sortDirection={itemSort.dir} onSort={handleItemSort}
                                        className="px-6 py-2 border-r border-gray-100" />}
                                    {isCol('privArea') && <SortableHeader colKey="privArea" label="Área privativa" uppercase={false}
                                        sortColumn={itemSort.col} sortDirection={itemSort.dir} onSort={handleItemSort}
                                        className="px-6 py-2 border-r border-gray-100 text-right whitespace-nowrap" />}
                                    {isCol('bedrooms') && <SortableHeader colKey="bedrooms" label="Dormitórios" uppercase={false}
                                        sortColumn={itemSort.col} sortDirection={itemSort.dir} onSort={handleItemSort}
                                        className="px-6 py-2 border-r border-gray-100 text-right whitespace-nowrap" />}
                                    {isCol('parking') && <SortableHeader colKey="parking" label="Vagas" uppercase={false}
                                        sortColumn={itemSort.col} sortDirection={itemSort.dir} onSort={handleItemSort}
                                        className="px-6 py-2 border-r border-gray-100 text-right whitespace-nowrap" />}
                                    {isCol('bathrooms') && <SortableHeader colKey="bathrooms" label="Banheiros" uppercase={false}
                                        sortColumn={itemSort.col} sortDirection={itemSort.dir} onSort={handleItemSort}
                                        className="px-6 py-2 border-r border-gray-100 text-right whitespace-nowrap" />}
                                    {isCol('floor') && <SortableHeader colKey="floor" label="Pavimento" uppercase={false}
                                        sortColumn={itemSort.col} sortDirection={itemSort.dir} onSort={handleItemSort}
                                        className="px-6 py-2 border-r border-gray-100 text-right whitespace-nowrap" />}
                                    {isCol('position') && <SortableHeader colKey="position" label="Posição" uppercase={false}
                                        sortColumn={itemSort.col} sortDirection={itemSort.dir} onSort={handleItemSort}
                                        className="px-6 py-2 border-r border-gray-100" />}
                                    {isCol('current') && <SortableHeader colKey="current" label={priceMode === 'rental' ? 'Aluguel vigente' : 'Preço vigente'} uppercase={false}
                                        sortColumn={itemSort.col} sortDirection={itemSort.dir} onSort={handleItemSort}
                                        className="px-6 py-2 border-r border-gray-100 text-right whitespace-nowrap" />}
                                    {isCol('price') && <SortableHeader colKey="price" label={priceMode === 'rental' ? 'Aluguel nesta versão' : 'Preço nesta versão'} uppercase={false}
                                        sortColumn={itemSort.col} sortDirection={itemSort.dir} onSort={handleItemSort}
                                        className="px-6 py-2 border-r border-gray-100 text-right whitespace-nowrap" />}
                                    {isCol('delta') && <SortableHeader colKey="delta" label="Δ" uppercase={false}
                                        sortColumn={itemSort.col} sortDirection={itemSort.dir} onSort={handleItemSort}
                                        className="px-6 py-2 border-r border-gray-100 text-right" />}
                                    {isCol('visibleToBroker') && <SortableHeader colKey="visibleToBroker" label="Visível p/ Corretor" uppercase={false}
                                        sortColumn={itemSort.col} sortDirection={itemSort.dir} onSort={handleItemSort}
                                        className="px-6 py-2 border-r border-gray-100 text-center whitespace-nowrap" />}
                                    {isCol('showPrice') && <SortableHeader colKey="showPrice" label="Exibir Preço" uppercase={false}
                                        sortColumn={itemSort.col} sortDirection={itemSort.dir} onSort={handleItemSort}
                                        className="px-6 py-2 text-center whitespace-nowrap" />}
                                    {/* Coluna de seleção da cesta — fora do config de colunas
                                        por org (broker_portal_price_columns), que espelha as 13
                                        colunas de dados da tabela de preços. */}
                                    {onToggleUnit && <th className="px-4 py-2 w-10" />}
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
                                            {isCol('photo') && <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                <div className="w-10 h-10 rounded-lg border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center shrink-0">
                                                    {item.photo_url
                                                        ? <img src={item.photo_url} alt="" className="w-full h-full object-cover" />
                                                        : <ImageIcon className="w-4 h-4 text-gray-300" />}
                                                </div>
                                            </td>}
                                            {isCol('unit') && <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">
                                                <span className="group-hover:text-blue-700 flex items-center gap-1.5">
                                                    {item.property_name || '—'}
                                                    {clickable && <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-blue-500 transition-colors" />}
                                                </span>
                                            </td>}
                                            {isCol('status') && <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                <UnitStatusBadge status={item.property_status} />
                                            </td>}
                                            {isCol('privArea') && <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right text-sm font-normal text-gray-600 whitespace-nowrap">
                                                {areaFmt(item.private_area)}
                                            </td>}
                                            {isCol('bedrooms') && <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right text-sm font-normal text-gray-600">
                                                {num(item.bedrooms)}
                                            </td>}
                                            {isCol('parking') && <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right text-sm font-normal text-gray-600">
                                                {num(item.parking_spaces)}
                                            </td>}
                                            {isCol('bathrooms') && <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right text-sm font-normal text-gray-600">
                                                {num(item.bathrooms)}
                                            </td>}
                                            {isCol('floor') && <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right text-sm font-normal text-gray-600">
                                                {num(item.floor)}
                                            </td>}
                                            {isCol('position') && <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                                                {item.position_type ? (POSITION_LABEL[item.position_type] || item.position_type) : '—'}
                                            </td>}
                                            {/* Switch "Exibir Preço" desligado na unidade: valor não aparece para o
                                                corretor (o corte principal é no servidor — RPCs do portal devolvem
                                                price/current_price NULL; aqui é a segunda barreira). */}
                                            {isCol('current') && <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right text-sm font-medium text-gray-800 whitespace-nowrap">
                                                {showPrice(item) ? formatMoney(item.current_price ?? item.price) : '—'}
                                            </td>}
                                            {isCol('price') && <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right text-sm font-medium text-gray-800 whitespace-nowrap">
                                                {showPrice(item) ? formatMoney(item.price) : '—'}
                                            </td>}
                                            {isCol('delta') && (() => {
                                                const diff = itemDelta(item);
                                                return <td className={`px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right text-sm font-medium ${diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-rose-600' : 'text-gray-300'}`}>
                                                    {diff !== 0 ? `${diff > 0 ? '+' : ''}${diff.toFixed(1)}%` : '—'}
                                                </td>;
                                            })()}
                                            {/* Leitura: o switch que edita este flag vive em PriceTableManager.tsx. */}
                                            {isCol('visibleToBroker') && <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-center text-sm font-normal text-gray-600">
                                                {(item.visible_to_broker ?? true) ? 'Sim' : 'Não'}
                                            </td>}
                                            {isCol('showPrice') && <td className="px-6 py-2.5 text-center text-sm font-normal text-gray-600">
                                                {showPrice(item) ? 'Sim' : 'Não'}
                                            </td>}
                                            {onToggleUnit && (
                                                <td className="px-4 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                                                    <input
                                                        type="checkbox"
                                                        checked={!!selectedUnitIds?.includes(item.property_id)}
                                                        disabled={!clickable}
                                                        onChange={() => {
                                                            const u = units.find(x => x.id === item.property_id);
                                                            if (u) onToggleUnit(u);
                                                        }}
                                                        title="Incluir esta unidade na proposta"
                                                        className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-400 cursor-pointer disabled:cursor-not-allowed"
                                                    />
                                                </td>
                                            )}
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
