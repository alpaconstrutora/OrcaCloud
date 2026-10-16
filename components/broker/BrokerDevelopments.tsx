import React, { useState, useMemo, useEffect } from 'react';
import { Building2, Check, ChevronLeft, ChevronRight, Loader2, MapPin, Info, Image as ImageIcon, Plus, X } from 'lucide-react';
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
    /**
     * Celular (BrokerPortalMobile): empreendimentos e unidades em CARTÕES, sem
     * <table>. As colunas que o gestor liberou para o corretor
     * (broker_portal_price_columns) continuam mandando no que o cartão mostra.
     * Plano: docs/planos/2026-10-16-portal-corretor-mobile.md (F2, item 4).
     */
    compacto?: boolean;
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

// Metadados de header por coluna — usados para renderizar o <thead> a partir de
// `tableColumns.orderedVisibleColumns` (ordem que o usuário arrasta), em vez de
// uma sequência fixa de JSX. Mesmos label/className que já estavam hardcoded em
// cada <SortableHeader>/<th> abaixo. 'current'/'price' mudam de label com o eixo
// Venda/Locação (mesmo texto de buildColumns), por isso é função, não const.
const buildPriceColumnHeaders = (priceMode: 'sale' | 'rental'): Record<string, { label: string; sortable?: boolean; className: string }> => ({
    photo: { label: 'Foto', sortable: false, className: 'px-6 py-2 border-r border-gray-100 w-16' },
    unit: { label: 'Unidade', className: 'px-6 py-2 border-r border-gray-100' },
    status: { label: 'Status', className: 'px-6 py-2 border-r border-gray-100' },
    privArea: { label: 'Área privativa', className: 'px-6 py-2 border-r border-gray-100 text-right whitespace-nowrap' },
    bedrooms: { label: 'Dormitórios', className: 'px-6 py-2 border-r border-gray-100 text-right whitespace-nowrap' },
    parking: { label: 'Vagas', className: 'px-6 py-2 border-r border-gray-100 text-right whitespace-nowrap' },
    bathrooms: { label: 'Banheiros', className: 'px-6 py-2 border-r border-gray-100 text-right whitespace-nowrap' },
    floor: { label: 'Pavimento', className: 'px-6 py-2 border-r border-gray-100 text-right whitespace-nowrap' },
    position: { label: 'Posição', className: 'px-6 py-2 border-r border-gray-100' },
    current: { label: priceMode === 'rental' ? 'Aluguel vigente' : 'Preço vigente', className: 'px-6 py-2 border-r border-gray-100 text-right whitespace-nowrap' },
    price: { label: priceMode === 'rental' ? 'Aluguel nesta versão' : 'Preço nesta versão', className: 'px-6 py-2 border-r border-gray-100 text-right whitespace-nowrap' },
    delta: { label: 'Δ', className: 'px-6 py-2 border-r border-gray-100 text-right' },
    visibleToBroker: { label: 'Visível p/ Corretor', className: 'px-6 py-2 border-r border-gray-100 text-center whitespace-nowrap' },
    showPrice: { label: 'Exibir Preço', className: 'px-6 py-2 text-center whitespace-nowrap' },
});

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

// Conteúdo de cada <td> por coluna — extraído para função pura para que o <tbody>
// possa mapear `tableColumns.orderedVisibleColumns` (ordem arrastável) em vez de
// repetir um bloco condicional fixo por coluna. `onEnlargePhoto` é o único handler
// que a célula precisa (abre o lightbox); as demais colunas são só leitura.
function renderPriceItemCell(key: string, item: CommercialPriceTableItem, ctx: { onEnlargePhoto: (url: string) => void }): React.ReactNode {
    switch (key) {
        case 'photo':
            return (
                <div className="w-10 h-10 rounded-lg border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center shrink-0">
                    {item.photo_url
                        ? <img
                            src={item.photo_url}
                            alt={`Foto da unidade ${item.property_name || ''}`}
                            title="Clique para ampliar"
                            className="w-full h-full object-cover cursor-zoom-in transition-transform duration-300 hover:scale-105"
                            onClick={() => ctx.onEnlargePhoto(item.photo_url!)}
                        />
                        : <ImageIcon className="w-4 h-4 text-gray-300" />}
                </div>
            );
        // Sem chevron: ele sinalizava "clique na linha", que saiu em favor do
        // botão da coluna de Ações (§9).
        case 'unit':
            return <span className="text-sm font-normal text-gray-700">{item.property_name || '—'}</span>;
        case 'status':
            return <UnitStatusBadge status={item.property_status} />;
        case 'privArea':
            return <span className="block text-right text-sm font-normal text-gray-600 whitespace-nowrap">{areaFmt(item.private_area)}</span>;
        case 'bedrooms':
            return <span className="block text-right text-sm font-normal text-gray-600">{num(item.bedrooms)}</span>;
        case 'parking':
            return <span className="block text-right text-sm font-normal text-gray-600">{num(item.parking_spaces)}</span>;
        case 'bathrooms':
            return <span className="block text-right text-sm font-normal text-gray-600">{num(item.bathrooms)}</span>;
        case 'floor':
            return <span className="block text-right text-sm font-normal text-gray-600">{num(item.floor)}</span>;
        case 'position':
            return <span className="text-sm font-normal text-gray-600">{item.position_type ? (POSITION_LABEL[item.position_type] || item.position_type) : '—'}</span>;
        // Switch "Exibir Preço" desligado na unidade: valor não aparece para o
        // corretor (o corte principal é no servidor — RPCs do portal devolvem
        // price/current_price NULL; aqui é a segunda barreira).
        case 'current':
            return <span className="block text-right text-sm font-medium text-gray-800 whitespace-nowrap">{showPrice(item) ? formatMoney(item.current_price ?? item.price) : '—'}</span>;
        case 'price':
            return <span className="block text-right text-sm font-medium text-gray-800 whitespace-nowrap">{showPrice(item) ? formatMoney(item.price) : '—'}</span>;
        case 'delta': {
            const diff = itemDelta(item);
            return (
                <span className={`block text-right text-sm font-medium ${diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-rose-600' : 'text-gray-300'}`}>
                    {diff !== 0 ? `${diff > 0 ? '+' : ''}${diff.toFixed(1)}%` : '—'}
                </span>
            );
        }
        // Leitura: o switch que edita este flag vive em PriceTableManager.tsx.
        case 'visibleToBroker':
            return <span className="block text-center text-sm font-normal text-gray-600">{(item.visible_to_broker ?? true) ? 'Sim' : 'Não'}</span>;
        case 'showPrice':
            return <span className="block text-center text-sm font-normal text-gray-600">{showPrice(item) ? 'Sim' : 'Não'}</span>;
        default:
            return null;
    }
}

type SortKey = 'unit' | 'status' | 'privArea' | 'bedrooms' | 'parking' | 'bathrooms' | 'floor'
    | 'position' | 'current' | 'price' | 'delta' | 'visibleToBroker' | 'showPrice';
type BuildingSortKey = 'name' | 'units';

const BrokerDevelopments: React.FC<BrokerDevelopmentsProps> = ({ buildings, units, portalToken, organizationId, onMakeProposal, selectedUnitIds, onToggleUnit, compacto = false }) => {
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
    // Metadados de header (label/className) por coluna, na ordem que o usuário
    // arrasta — ver buildPriceColumnHeaders acima.
    const priceColumnHeaders = useMemo(() => buildPriceColumnHeaders(priceMode), [priceMode]);
    const tableColumns = useTableColumns(buildColumns('sale'), 'brokerDevelopments:priceColumns');
    const { visibleColumns, setVisibleColumns } = tableColumns;
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
    // Disponíveis por empreendimento — o que o corretor quer saber antes de abrir.
    const availableByBuilding = useMemo(() => {
        const counts: Record<string, number> = {};
        units.forEach(u => {
            if (u.type !== 'BUILDING' && u.parent_id && u.status === 'AVAILABLE') counts[u.parent_id] = (counts[u.parent_id] || 0) + 1;
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

    // Ação da linha virou botão explícito na coluna de Ações (guia §9): desde que
    // a coluna Foto existe, a linha passou a ter duas ações prováveis (ampliar a
    // imagem × iniciar proposta), então o clique na linha inteira deixou de ser
    // inequívoco — condição que a §9.1 exige para o padrão de linha clicável.
    const handleMakeProposal = (item: CommercialPriceTableItem) => {
        const unit = units.find(u => u.id === item.property_id);
        if (!unit) return;
        onMakeProposal(comPrecoDaTabela(unit, item));
    };

    /**
     * A unidade vai para a cesta/simulador com o preço DESTA tabela (venda).
     * Pelo link, `fn_broker_portal_get_units` não devolve `current_price` — e o
     * simulador e o total da cesta liam só ele: a proposta saía sobre R$ 0
     * (visto em 16/10/2026, unidade de R$ 648.893 somando "R$ 0" na cesta).
     * Locação fica como estava: o simulador é de venda.
     */
    const comPrecoDaTabela = (unit: BrokerUnit, item: CommercialPriceTableItem): BrokerUnit =>
        priceMode === 'sale' && showPrice(item) && item.price > 0 ? { ...unit, current_price: item.price } : unit;
    const toggleComPreco = (item: CommercialPriceTableItem) => {
        const u = units.find(x => x.id === item.property_id);
        if (u && onToggleUnit) onToggleUnit(comPrecoDaTabela(u, item));
    };

    // Foto ampliada — mesmo padrão de components/investor/PhotoGallery.tsx.
    const [lightbox, setLightbox] = useState<string | null>(null);

    // ── Master no celular: um cartão por empreendimento ─────────────────────
    if (!selectedBuilding && compacto) {
        if (buildings.length === 0) {
            return (
                <div className="text-center px-6 py-12 bg-white rounded-2xl shadow-sm border border-gray-100">
                    <Building2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <h3 className="text-base font-semibold text-gray-900 mb-1">Nenhum empreendimento liberado</h3>
                    <p className="text-sm text-gray-500">A incorporadora ainda não liberou empreendimentos para você.</p>
                </div>
            );
        }
        return (
            <ul className="space-y-3">
                {sortedBuildings.map(b => {
                    const foto = b.images?.[0];
                    const total = unitCountByBuilding[b.id] || 0;
                    const livres = availableByBuilding[b.id] || 0;
                    return (
                        <li key={b.id}>
                            <button
                                type="button"
                                onClick={() => setSelectedBuildingId(b.id)}
                                className="w-full flex items-center gap-3 bg-white rounded-2xl border border-gray-100 shadow-sm p-3 text-left active:bg-gray-50"
                            >
                                <span className="w-14 h-14 rounded-xl bg-indigo-50 text-indigo-600 overflow-hidden flex items-center justify-center shrink-0">
                                    {foto ? <img src={foto} alt="" className="w-full h-full object-cover" /> : <Building2 className="w-6 h-6" />}
                                </span>
                                <span className="flex-1 min-w-0">
                                    <span className="block text-sm font-bold text-gray-900 truncate">{b.name}</span>
                                    {b.address && <span className="block text-xs text-gray-500 line-clamp-2 mt-0.5">{b.address}</span>}
                                    <span className="block text-xs mt-1">
                                        <span className={livres > 0 ? 'font-semibold text-emerald-700' : 'text-gray-500'}>
                                            {livres} {livres === 1 ? 'disponível' : 'disponíveis'}
                                        </span>
                                        <span className="text-gray-400"> de {total}</span>
                                    </span>
                                </span>
                                <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                            </button>
                        </li>
                    );
                })}
            </ul>
        );
    }

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
                                <tr className="bg-white text-gray-700 font-semibold text-xs border-b border-gray-200">
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

    // ── Detalhe no celular: cartões de unidade ──────────────────────────────
    if (compacto) {
        const ver = (k: string) => visibleColumns.includes(k);
        const ORDENS: { col: SortKey; label: string }[] = [
            { col: 'unit', label: 'Unidade' },
            { col: 'price', label: 'Preço' },
            { col: 'privArea', label: 'Área privativa' },
            { col: 'floor', label: 'Pavimento' },
            { col: 'status', label: 'Status' },
        ];
        return (
            <div className="space-y-3">
                <div>
                    <button
                        type="button"
                        onClick={() => setSelectedBuildingId(null)}
                        className="flex items-center gap-1 -ml-1 py-1 text-sm font-medium text-gray-500 active:text-gray-800"
                    >
                        <ChevronLeft className="w-4 h-4" /> Empreendimentos
                    </button>
                    <h2 className="text-lg font-bold text-gray-900 leading-tight mt-1">{selectedBuilding.name}</h2>
                    {selectedBuilding.address && (
                        <p className="text-xs text-gray-500 mt-1 flex items-start gap-1.5">
                            <MapPin className="w-3.5 h-3.5 shrink-0 mt-px" />{selectedBuilding.address}
                        </p>
                    )}
                </div>

                <div className="grid grid-cols-2 bg-gray-100 p-1 rounded-xl gap-1">
                    {([['sale', 'Venda'], ['rental', 'Locação']] as const).map(([modo, rotulo]) => (
                        <button
                            key={modo}
                            type="button"
                            onClick={() => setPriceMode(modo)}
                            aria-pressed={priceMode === modo}
                            className={`h-8 rounded-lg text-sm font-medium ${priceMode === modo ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}
                        >
                            {rotulo}
                        </button>
                    ))}
                </div>

                <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-gray-500 min-w-0 truncate">
                        {activeTable ? `Tabela vigente: ${activeTable.version_label}` : (loading ? '' : 'Sem tabela vigente')}
                    </span>
                    <label className="flex items-center gap-1.5 text-xs text-gray-500 shrink-0">
                        Ordenar
                        <select
                            value={`${itemSort.col}:${itemSort.dir}`}
                            onChange={e => { const [col, dir] = e.target.value.split(':'); setItemSort({ col: col as SortKey, dir: dir as 'asc' | 'desc' }); }}
                            className="h-8 pl-2 pr-7 bg-white border border-gray-200 rounded-lg text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        >
                            {ORDENS.flatMap(o => [
                                <option key={`${o.col}:asc`} value={`${o.col}:asc`}>{o.label} ↑</option>,
                                <option key={`${o.col}:desc`} value={`${o.col}:desc`}>{o.label} ↓</option>,
                            ])}
                        </select>
                    </label>
                </div>

                {loading ? (
                    <div className="text-center py-12">
                        <Loader2 className="w-7 h-7 animate-spin text-indigo-600 mx-auto" />
                        <p className="mt-2 text-sm text-gray-500">Carregando tabela de preços...</p>
                    </div>
                ) : sortedRows.length === 0 ? (
                    <div className="text-center px-6 py-12 bg-white rounded-2xl shadow-sm border border-gray-100">
                        <Building2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                        <h3 className="text-base font-semibold text-gray-900 mb-1">Nenhuma unidade encontrada</h3>
                        <p className="text-sm text-gray-500">Este empreendimento ainda não tem unidades publicadas.</p>
                    </div>
                ) : (
                    <ul className="space-y-3">
                        {sortedRows.map(item => {
                            const clickable = units.some(u => u.id === item.property_id);
                            const isSold = item.property_status === 'SOLD';
                            const canPropose = clickable && !isSold;
                            const motivo = isSold ? 'Unidade já vendida' : (clickable ? '' : 'Unidade fora do estoque atual');
                            const naCesta = !!selectedUnitIds?.includes(item.property_id);
                            // A cesta só aceita unidade DISPONÍVEL (handleToggleCart recusa o
                            // resto). Sem esta trava o "Adicionar" ficava ativo numa unidade
                            // alugada e o clique morria calado — o aviso da recusa mora na
                            // barra da cesta, que com a cesta vazia nem existe.
                            const disponivel = !item.property_status || item.property_status === 'AVAILABLE';
                            const podeJuntar = canPropose && (disponivel || naCesta);
                            const motivoJuntar = !motivo && !podeJuntar
                                ? `${UNIT_STATUS_LABEL[item.property_status || ''] || 'Indisponível'}: só proposta individual`
                                : '';
                            const ficha = [
                                ver('privArea') && item.private_area != null ? areaFmt(item.private_area) : null,
                                ver('bedrooms') && item.bedrooms != null ? `${item.bedrooms} dorm.` : null,
                                ver('parking') && item.parking_spaces != null ? `${item.parking_spaces} ${item.parking_spaces === 1 ? 'vaga' : 'vagas'}` : null,
                                ver('bathrooms') && item.bathrooms != null ? `${item.bathrooms} banh.` : null,
                                // `!= null` e não truthy: pavimento 0 é o térreo.
                                ver('floor') && item.floor != null ? (item.floor === 0 ? 'Térreo' : `${item.floor}º pav.`) : null,
                                ver('position') && item.position_type ? (POSITION_LABEL[item.position_type] || item.position_type) : null,
                            ].filter(Boolean);
                            const valor = ver('price') ? item.price : (ver('current') ? (item.current_price ?? item.price) : null);
                            const diff = itemDelta(item);
                            return (
                                <li key={item.id} className={`bg-white rounded-2xl border shadow-sm p-3 ${naCesta ? 'border-indigo-300 ring-1 ring-indigo-200' : 'border-gray-100'} ${clickable ? '' : 'opacity-60'}`}>
                                    <div className="flex gap-3">
                                        {ver('photo') && (
                                            <span className="w-14 h-14 rounded-xl border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center shrink-0">
                                                {item.photo_url
                                                    ? <img src={item.photo_url} alt={`Foto da unidade ${item.property_name || ''}`} className="w-full h-full object-cover" onClick={() => setLightbox(item.photo_url!)} />
                                                    : <ImageIcon className="w-5 h-5 text-gray-300" />}
                                            </span>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between gap-2">
                                                <p className="text-sm font-bold text-gray-900 truncate">{item.property_name || '—'}</p>
                                                {ver('status') && <span className="shrink-0"><UnitStatusBadge status={item.property_status} /></span>}
                                            </div>
                                            {ficha.length > 0 && <p className="text-xs text-gray-500 mt-0.5">{ficha.join(' · ')}</p>}
                                            {valor != null && (
                                                <p className="mt-1 flex items-baseline gap-2">
                                                    {/* R$ 0,00 é "sem preço" (unidade sem tabela nem valor cadastrado), não preço. */}
                                                    <span className={showPrice(item) && valor > 0 ? 'text-base font-bold text-gray-900' : 'text-sm text-gray-500'}>
                                                        {!showPrice(item) ? 'Preço sob consulta' : valor > 0 ? formatMoney(valor) : 'Preço não informado'}
                                                    </span>
                                                    {ver('delta') && showPrice(item) && diff !== 0 && (
                                                        <span className={`text-xs font-medium ${diff > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                            {diff > 0 ? '+' : ''}{diff.toFixed(1)}%
                                                        </span>
                                                    )}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    {(motivo || (onToggleUnit && motivoJuntar)) && <p className="text-xs text-gray-500 mt-2">{motivo || motivoJuntar}</p>}
                                    <div className="flex items-center gap-2 mt-3">
                                        {onToggleUnit && (
                                            <button
                                                type="button"
                                                disabled={!podeJuntar}
                                                aria-pressed={naCesta}
                                                onClick={() => toggleComPreco(item)}
                                                title={motivo || motivoJuntar || (naCesta ? 'Tirar da proposta' : 'Juntar a outras unidades numa proposta só')}
                                                className={`flex-1 h-10 flex items-center justify-center gap-1.5 rounded-xl border text-sm font-medium disabled:opacity-40 ${
                                                    naCesta ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-gray-200 text-gray-700 active:bg-gray-50'}`}
                                            >
                                                {naCesta ? <><Check className="w-4 h-4" /> Na proposta</> : <><Plus className="w-4 h-4" /> Adicionar</>}
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => handleMakeProposal(item)}
                                            disabled={!canPropose}
                                            title={motivo || undefined}
                                            className="flex-1 h-10 rounded-xl bg-indigo-600 text-white text-sm font-semibold active:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400"
                                        >
                                            Fazer proposta
                                        </button>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}

                {lightbox && (
                    <div className="fixed inset-0 z-[80] bg-black/90 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
                        <button className="absolute top-4 right-4 p-2 text-white/70 bg-white/10 rounded-xl" onClick={() => setLightbox(null)} aria-label="Fechar foto">
                            <X className="w-5 h-5" />
                        </button>
                        <img src={lightbox} alt="Foto ampliada" className="max-w-full max-h-full rounded-2xl object-contain shadow-2xl" onClick={e => e.stopPropagation()} />
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
                            className={`h-7 px-3 rounded-[6px] text-sm font-medium transition-all whitespace-nowrap ${priceMode === 'sale' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
                        >
                            Venda
                        </button>
                        <button
                            onClick={() => setPriceMode('rental')}
                            className={`h-7 px-3 rounded-[6px] text-sm font-medium transition-all whitespace-nowrap ${priceMode === 'rental' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
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
                                <tr className="bg-white text-gray-700 font-semibold text-xs border-b border-gray-200">
                                    {tableColumns.orderedVisibleColumns.map(key => {
                                        const def = priceColumnHeaders[key];
                                        if (!def) return null;
                                        return (
                                            <SortableHeader key={key} colKey={key} label={def.label} sortable={def.sortable !== false} uppercase={false}
                                                sortColumn={itemSort.col} sortDirection={itemSort.dir} onSort={handleItemSort}
                                                onMoveColumn={tableColumns.moveColumn}
                                                className={def.className} />
                                        );
                                    })}
                                    {/* Coluna de seleção da cesta — fora do config de colunas
                                        por org (broker_portal_price_columns), que espelha as 13
                                        colunas de dados da tabela de preços. */}
                                    {onToggleUnit && <th className="px-4 py-2 w-10" />}
                                    {/* Ações (§9) — sempre visível, fora do config de colunas:
                                        se o admin pudesse desmarcar, o corretor ficaria sem
                                        como iniciar uma proposta. */}
                                    <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500 whitespace-nowrap">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {sortedRows.map(item => {
                                    const clickable = units.some(u => u.id === item.property_id);
                                    // Unidade já vendida não aceita nova proposta — trava o botão
                                    // E o checkbox da cesta (senão dava pra incluí-la via cesta
                                    // mesmo com o botão da linha desabilitado).
                                    const isSold = item.property_status === 'SOLD';
                                    const canPropose = clickable && !isSold;
                                    const proposalTitle = isSold
                                        ? 'Unidade já vendida'
                                        : (clickable ? undefined : 'Unidade não disponível no estoque atual');
                                    return (
                                        <tr
                                            key={item.id}
                                            className={`transition-colors group ${clickable ? 'hover:bg-blue-50/50' : 'opacity-60'}`}
                                            title={clickable ? undefined : 'Unidade não disponível no estoque atual'}
                                        >
                                            {tableColumns.orderedVisibleColumns.map(key => (
                                                <td key={key} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                    {renderPriceItemCell(key, item, { onEnlargePhoto: setLightbox })}
                                                </td>
                                            ))}
                                            {onToggleUnit && (
                                                <td className="px-4 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                                                    <input
                                                        type="checkbox"
                                                        checked={!!selectedUnitIds?.includes(item.property_id)}
                                                        disabled={!canPropose}
                                                        onChange={() => toggleComPreco(item)}
                                                        title={isSold ? proposalTitle : 'Incluir esta unidade na proposta'}
                                                        className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-400 cursor-pointer disabled:cursor-not-allowed"
                                                    />
                                                </td>
                                            )}
                                            <td className="px-6 py-2.5 text-right">
                                                <div className="flex items-center justify-end">
                                                    <button
                                                        onClick={() => handleMakeProposal(item)}
                                                        disabled={!canPropose}
                                                        title={proposalTitle}
                                                        className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all whitespace-nowrap disabled:text-gray-300 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                                                    >
                                                        Fazer Proposta
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Foto ampliada — padrão de components/investor/PhotoGallery.tsx */}
            {lightbox && (
                <div
                    className="fixed inset-0 z-[80] bg-black/90 flex items-center justify-center p-4"
                    onClick={() => setLightbox(null)}
                >
                    <button
                        className="absolute top-4 right-4 p-2 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-xl transition-colors"
                        onClick={() => setLightbox(null)}
                    >
                        <X className="w-5 h-5" />
                    </button>
                    <img
                        src={lightbox}
                        alt="Foto ampliada"
                        className="max-w-full max-h-full rounded-2xl object-contain shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    />
                </div>
            )}
        </div>
    );
};

export default BrokerDevelopments;
