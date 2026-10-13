// components/settings/ProductModelsSettings.tsx — Configurações › Marcas e Modelos › Modelos
//
// Plano: docs/planos/2026-10-13-marcas-e-modelos.md. Catálogo product_models.
// Lê com a org do topo (null = "Todas"). Criar NÃO pergunta organização: o
// modelo herda a da marca escolhida no painel (ProductModelSheet).
import React from 'react';
import { AlertCircle, Boxes, ExternalLink, Plus } from 'lucide-react';
import StandardTable, { StandardTableColumn } from '../ui/StandardTable';
import ActionIconButton from '../ui/ActionIconButton';
import { FilterPopover } from '../ui/FilterPopover';
import { usePersistedState } from '../ui/TableUtils';
import { useConfirm } from '../ui/confirm';
import { useOrgContext, errorMessage } from '../../hooks/useOrgContext';
import { useStore } from '../../store/useStore';
import { brandModelService } from '../../services/brandModelService';
import type { CatalogUsage, ProductBrand, ProductItemType, ProductModel } from '../../types/brandModel';
import { ITEM_TYPE_LABELS, ITEM_TYPES } from '../../types/brandModel';
import { ASSET_CATEGORY_LABELS } from '../../utils/assetToStockItemRow';
import { ProductModelSheet } from './ProductModelSheet';
import { descreverUso } from './BrandsSettings';

// Larguras somam ~950px com "Ações" — o que cabe no card da folha em 1600px com a
// árvore lateral aberta (verificado na tela em 13/10/2026: com as 9 colunas
// visíveis "Ações" nascia fora da vista). Os padrões do ativo (categoria, vida
// útil) começam ocultos e entram pela engrenagem de colunas.
const COLUMNS: StandardTableColumn[] = [
    { key: 'brand', label: 'Marca', sortable: true, width: 150 },
    { key: 'name', label: 'Modelo', sortable: true, width: 150 },
    { key: 'type', label: 'Tipo', sortable: true, width: 110 },
    { key: 'code', label: 'Código do fabricante', sortable: true, width: 130 },
    { key: 'category', label: 'Categoria padrão', sortable: true, width: 150, defaultHidden: true },
    { key: 'life', label: 'Vida útil padrão', sortable: true, width: 140, align: 'right', defaultHidden: true },
    { key: 'datasheet', label: 'Ficha técnica', sortable: true, width: 100 },
    { key: 'inUse', label: 'Em uso', sortable: true, width: 120 },
    { key: 'status', label: 'Situação', sortable: true, width: 90 },
];
const ORG_COLUMN: StandardTableColumn = { key: 'org', label: 'Organização', sortable: true, width: 180 };

const TYPE_OPTIONS: { value: ProductItemType | ''; label: string }[] = [
    { value: '', label: 'Todos' },
    ...ITEM_TYPES.map(t => ({ value: t, label: ITEM_TYPE_LABELS[t] })),
];

const USO_VAZIO: CatalogUsage = { models: 0, assets: 0, stockItems: 0 };

interface Props {
    /** Filtro de marca vindo de "Ver modelos" na folha Marcas. */
    brandFilter?: string | null;
    onBrandFilterChange?: (brandId: string | null) => void;
}

const ProductModelsSettings: React.FC<Props> = ({ brandFilter = null, onBrandFilterChange }) => {
    const { orgId } = useOrgContext();
    const organizations = useStore(s => s.organizations);
    const confirm = useConfirm();

    const [models, setModels] = React.useState<ProductModel[]>([]);
    const [brands, setBrands] = React.useState<ProductBrand[]>([]);
    const [usage, setUsage] = React.useState<Map<string, CatalogUsage>>(new Map());
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [toast, setToast] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [typeFilter, setTypeFilter] = usePersistedState<ProductItemType | ''>('settings:catalogo:modelos:tipo', '');
    const [sheet, setSheet] = React.useState<{ open: boolean; model: ProductModel | null }>({ open: false, model: null });

    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4500);
    };

    const load = React.useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [m, b, u] = await Promise.all([
                brandModelService.listModels(orgId),
                brandModelService.listBrands(orgId),
                brandModelService.usage(orgId),
            ]);
            setModels(m);
            setBrands(b);
            setUsage(u.models);
        } catch (e) {
            setError(errorMessage(e, 'Falha ao carregar os modelos.'));
        } finally {
            setLoading(false);
        }
    }, [orgId]);

    React.useEffect(() => { void load(); }, [load]);

    const orgName = React.useCallback((id: string) => organizations.find(o => o.id === id)?.name ?? '—', [organizations]);
    const brandName = (id: string) => brands.find(b => b.id === id)?.name ?? '—';
    const usoDe = (id: string) => usage.get(id) ?? USO_VAZIO;
    const columns = React.useMemo(() => (orgId ? COLUMNS : [...COLUMNS, ORG_COLUMN]), [orgId]);

    const brandOptions = React.useMemo(() => {
        const repetidos = new Set(brands.map(b => b.name.toLowerCase()).filter((n, i, arr) => arr.indexOf(n) !== i));
        return [
            { value: '', label: 'Todas' },
            ...brands
                .map(b => ({ value: b.id, label: repetidos.has(b.name.toLowerCase()) ? `${b.name} · ${orgName(b.organization_id)}` : b.name }))
                .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')),
        ];
    }, [brands, orgName]);

    // Recorte (tipo/marca) fora; busca e ordenação dentro do StandardTable.
    const rows = React.useMemo(
        () => models.filter(m => (!typeFilter || m.item_type === typeFilter) && (!brandFilter || m.brand_id === brandFilter)),
        [models, typeFilter, brandFilter],
    );

    const salvo = (m: ProductModel, criado: boolean) => {
        setModels(prev => (criado ? [...prev, m] : prev.map(x => (x.id === m.id ? m : x))));   // §22
        setSheet({ open: false, model: null });
        notify(criado ? 'Modelo criado.' : 'Modelo salvo — ativos e itens vinculados já refletem a mudança.');
    };

    const excluir = async (m: ProductModel) => {
        const ok = await confirm({
            title: 'Excluir modelo?',
            message: `"${brandName(m.brand_id)} ${m.name}" sai do catálogo. Nenhum ativo ou item usa este modelo.`,
            variant: 'danger',
            confirmLabel: 'Excluir modelo',
        });
        if (!ok) return;
        try {
            await brandModelService.deleteModel(m.id);
            setModels(prev => prev.filter(x => x.id !== m.id));
            notify('Modelo excluído.');
        } catch (e) {
            notify(errorMessage(e, 'Não foi possível excluir o modelo.'), 'error');
        }
    };

    const semMarcas = !loading && brands.length === 0;

    return (
        <div className="bg-white rounded-[10px] shadow-sm border border-gray-100 p-6">
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                    <div className="p-3 bg-blue-50 rounded-[10px]">
                        <Boxes className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-gray-800">Modelos</h2>
                        <p className="text-sm text-gray-500 mt-1">
                            Modelos de cada marca, com part number, padrões para o ativo e ficha técnica.
                        </p>
                    </div>
                </div>
                <span title={semMarcas ? 'Cadastre uma marca antes (folha Marcas)' : undefined}>
                    <button
                        onClick={() => setSheet({ open: true, model: null })}
                        disabled={semMarcas}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Plus className="w-[15px] h-[15px]" />
                        Novo modelo
                    </button>
                </span>
            </div>

            <div className="mt-6 border-t border-gray-100 pt-6 space-y-3">
                {error && (
                    <div className="flex items-center gap-2 p-3 rounded-[10px] bg-red-50 border border-red-100 text-sm text-red-700">
                        <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                    </div>
                )}
                <StandardTable<ProductModel>
                    storageKey="settings:catalogo:modelos"
                    columns={columns}
                    rows={rows}
                    rowKey={m => m.id}
                    loading={loading}
                    searchText={m => `${brandName(m.brand_id)} ${m.name} ${m.manufacturer_code ?? ''} ${m.technical_spec ?? ''}`}
                    searchPlaceholder="Buscar por marca, modelo, part number ou especificação..."
                    filters={
                        <>
                            <FilterPopover<ProductItemType | ''> label="Tipo" value={typeFilter} onChange={setTypeFilter} options={TYPE_OPTIONS} />
                            <FilterPopover<string> label="Marca" value={brandFilter ?? ''} onChange={v => onBrandFilterChange?.(v || null)} options={brandOptions} />
                        </>
                    }
                    onRowClick={m => setSheet({ open: true, model: m })}
                    sortValue={(key, m) => {
                        switch (key) {
                            case 'brand': return brandName(m.brand_id).toLocaleLowerCase('pt-BR');
                            case 'type': return ITEM_TYPE_LABELS[m.item_type];
                            case 'code': return m.manufacturer_code ?? '';
                            case 'category': return m.default_asset_category ? ASSET_CATEGORY_LABELS[m.default_asset_category] : '';
                            case 'life': return m.default_useful_life_months ?? -1;
                            case 'datasheet': return m.datasheet_url ? 0 : 1;
                            case 'inUse': return usoDe(m.id).assets + usoDe(m.id).stockItems;
                            case 'status': return m.is_active ? 0 : 1;
                            case 'org': return orgName(m.organization_id);
                            default: return m.name.toLocaleLowerCase('pt-BR');
                        }
                    }}
                    renderCell={(key, m) => {
                        const texto = (v: string, cor = 'text-gray-700') => <span className={`block truncate text-sm font-normal ${cor}`} title={v}>{v}</span>;
                        switch (key) {
                            case 'brand': return texto(brandName(m.brand_id));
                            case 'type': return texto(ITEM_TYPE_LABELS[m.item_type], 'text-gray-600');
                            case 'code': return texto(m.manufacturer_code || '—', 'text-gray-600');
                            case 'category': return texto(m.default_asset_category ? ASSET_CATEGORY_LABELS[m.default_asset_category] : '—', 'text-gray-600');
                            case 'life': return <span className="text-sm font-normal text-gray-600">{m.default_useful_life_months != null ? `${m.default_useful_life_months} meses` : '—'}</span>;
                            case 'datasheet': return m.datasheet_url
                                ? (
                                    <a href={m.datasheet_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                                        className="inline-flex items-center gap-1 text-sm font-normal text-blue-600 hover:text-blue-800">
                                        Abrir <ExternalLink className="w-3.5 h-3.5" />
                                    </a>
                                )
                                : <span className="text-sm font-normal text-gray-400">—</span>;
                            case 'inUse': return texto(descreverUso(usoDe(m.id)), 'text-gray-600');
                            case 'status': return <span className={`text-sm font-normal ${m.is_active ? 'text-green-700' : 'text-gray-500'}`}>{m.is_active ? 'Ativo' : 'Inativo'}</span>;
                            case 'org': return texto(orgName(m.organization_id));
                            default: return texto(m.name);
                        }
                    }}
                    actions={{
                        width: 100,
                        render: m => {
                            const u = usoDe(m.id);
                            const usado = u.assets + u.stockItems > 0;
                            return (
                                <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                                    <ActionIconButton kind="edit" onClick={() => setSheet({ open: true, model: m })} />
                                    <span title={usado ? `Em uso por ${descreverUso(u)} — inative em vez de excluir` : 'Excluir modelo'}>
                                        <ActionIconButton kind="delete" disabled={usado} onClick={() => void excluir(m)} />
                                    </span>
                                </div>
                            );
                        },
                    }}
                    empty={{
                        icon: <Boxes className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                        title: semMarcas ? 'Cadastre uma marca primeiro' : 'Nenhum modelo encontrado',
                        subtitle: semMarcas
                            ? 'Todo modelo pertence a uma marca — comece pela folha Marcas.'
                            : 'Cadastre aqui, ou direto no campo Modelo de um ativo ou item de estoque.',
                    }}
                />
            </div>

            <ProductModelSheet
                open={sheet.open}
                model={sheet.model}
                brands={brands}
                defaultBrandId={brandFilter}
                orgName={orgName}
                onClose={() => setSheet({ open: false, model: null })}
                onSaved={salvo}
            />

            {toast && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
                    toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {toast.message}
                </div>
            )}
        </div>
    );
};

export default ProductModelsSettings;
