// components/settings/BrandsSettings.tsx — Configurações › Marcas e Modelos › Marcas
//
// Plano: docs/planos/2026-10-13-marcas-e-modelos.md. Catálogo product_brands,
// usado por Gestão de Ativos, Condomínio › Ativos do edifício e Almoxarifado.
//
// REGRA #5: lê com o org do topo (null = "Todas", RLS recorta); criar passa por
// resolveWriteOrg('all-allowed') — em "Todas" replica em cada organização do
// usuário (a que já tem a marca falha no UNIQUE e as outras seguem).
// Editar/inativar/excluir agem na linha, que já tem dona.
//
// Excluir só sem uso: marca com modelo ou com ativo/item vinculado se INATIVA
// (UI_PATTERNS §6.3) — some dos campos de escolha e mantém os vínculos.
import React from 'react';
import { AlertCircle, Plus, Tags } from 'lucide-react';
import StandardTable, { StandardTableColumn } from '../ui/StandardTable';
import ActionIconButton from '../ui/ActionIconButton';
import { useConfirm } from '../ui/confirm';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { useOrgContext, useOrgWriteTarget, forEachTargetOrg, partialFailureNote, errorMessage } from '../../hooks/useOrgContext';
import { useStore } from '../../store/useStore';
import { brandModelService } from '../../services/brandModelService';
import type { CatalogUsage, ProductBrand } from '../../types/brandModel';
import { normalizarNome } from '../../utils/catalogoNome';

const COLUMNS: StandardTableColumn[] = [
    { key: 'name', label: 'Marca', sortable: true, width: 260 },
    { key: 'models', label: 'Modelos', sortable: true, width: 110, align: 'right' },
    { key: 'inUse', label: 'Em uso', sortable: true, width: 170 },
    { key: 'status', label: 'Situação', sortable: true, width: 110 },
];
const ORG_COLUMN: StandardTableColumn = { key: 'org', label: 'Organização', sortable: true, width: 200 };

const USO_VAZIO: CatalogUsage = { models: 0, assets: 0, stockItems: 0 };
const emUso = (u: CatalogUsage) => u.assets + u.stockItems;

export function descreverUso(u: CatalogUsage): string {
    const partes: string[] = [];
    if (u.assets) partes.push(`${u.assets} ativo${u.assets === 1 ? '' : 's'}`);
    if (u.stockItems) partes.push(`${u.stockItems} ite${u.stockItems === 1 ? 'm' : 'ns'} de estoque`);
    return partes.join(' · ') || '—';
}

const INPUT = 'w-full h-9 px-3 bg-gray-50 border border-gray-100 rounded-[6px] text-sm font-normal text-gray-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all';

interface Props {
    /** "Ver modelos" desta marca — o Settings troca de folha com o filtro aplicado. */
    onVerModelos?: (brandId: string) => void;
}

const BrandsSettings: React.FC<Props> = ({ onVerModelos }) => {
    const { orgId } = useOrgContext();
    const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();
    const organizations = useStore(s => s.organizations);
    const confirm = useConfirm();

    const [brands, setBrands] = React.useState<ProductBrand[]>([]);
    const [usage, setUsage] = React.useState<Map<string, CatalogUsage>>(new Map());
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [toast, setToast] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);

    // Sheet: null = fechado; { id: null } = nova marca
    const [editing, setEditing] = React.useState<{ id: string | null; name: string; is_active: boolean } | null>(null);
    const [original, setOriginal] = React.useState<{ name: string; is_active: boolean } | null>(null);
    const [saving, setSaving] = React.useState(false);

    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4500);
    };

    const load = React.useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [b, u] = await Promise.all([brandModelService.listBrands(orgId), brandModelService.usage(orgId)]);
            setBrands(b);
            setUsage(u.brands);
        } catch (e) {
            setError(errorMessage(e, 'Falha ao carregar as marcas.'));
        } finally {
            setLoading(false);
        }
    }, [orgId]);

    React.useEffect(() => { void load(); }, [load]);

    const orgName = (id: string) => organizations.find(o => o.id === id)?.name ?? '—';
    const usoDe = (id: string) => usage.get(id) ?? USO_VAZIO;
    const columns = React.useMemo(() => (orgId ? COLUMNS : [...COLUMNS, ORG_COLUMN]), [orgId]);

    const abrirNova = () => { setEditing({ id: null, name: '', is_active: true }); setOriginal({ name: '', is_active: true }); };
    const abrirEdicao = (b: ProductBrand) => { setEditing({ id: b.id, name: b.name, is_active: b.is_active }); setOriginal({ name: b.name, is_active: b.is_active }); };
    const fechar = () => { setEditing(null); setOriginal(null); };
    const dirty = !!editing && !!original && (editing.name !== original.name || editing.is_active !== original.is_active);

    const salvar = async () => {
        if (!editing) return;
        const nome = normalizarNome(editing.name);
        if (!nome) return;
        setSaving(true);
        try {
            if (editing.id) {
                const salvo = await brandModelService.updateBrand(editing.id, { name: nome, is_active: editing.is_active });
                setBrands(prev => prev.map(b => (b.id === salvo.id ? salvo : b)));   // §22
                notify(nome !== original?.name ? 'Marca renomeada — os ativos e itens vinculados já mostram o nome novo.' : 'Marca salva.');
                fechar();
            } else {
                const target = await resolveWriteOrg('all-allowed');
                if (!target) return;
                const criadas: ProductBrand[] = [];
                const { ok, failed } = await forEachTargetOrg(target, async org => {
                    const b = await brandModelService.createBrand(org, nome);
                    criadas.push(b);
                    return b;
                });
                if (ok > 0) {
                    setBrands(prev => [...prev, ...criadas].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
                    const nota = partialFailureNote(failed);
                    notify(ok > 1 ? `Marca criada em ${ok} organizações${nota ? ` (${nota})` : ''}.` : `Marca criada${nota ? ` (${nota})` : ''}.`);
                    fechar();
                } else {
                    notify(errorMessage(failed[0]?.error, 'Não foi possível criar a marca.'), 'error');
                }
            }
        } catch (e) {
            notify(errorMessage(e, 'Não foi possível salvar a marca.'), 'error');
        } finally {
            setSaving(false);
        }
    };

    const excluir = async (b: ProductBrand) => {
        const ok = await confirm({
            title: 'Excluir marca?',
            message: `"${b.name}" sai do catálogo. Nenhum ativo ou item usa esta marca.`,
            variant: 'danger',
            confirmLabel: 'Excluir marca',
        });
        if (!ok) return;
        try {
            await brandModelService.deleteBrand(b.id);
            setBrands(prev => prev.filter(x => x.id !== b.id));
            notify('Marca excluída.');
        } catch (e) {
            notify(errorMessage(e, 'Não foi possível excluir a marca.'), 'error');
        }
    };

    const motivoNaoExcluir = (b: ProductBrand): string | null => {
        const u = usoDe(b.id);
        if (u.models > 0) return `Tem ${u.models} modelo${u.models === 1 ? '' : 's'} — exclua os modelos ou inative a marca`;
        if (emUso(u) > 0) return `Em uso por ${descreverUso(u)} — inative em vez de excluir`;
        return null;
    };

    return (
        <div className="bg-white rounded-[10px] shadow-sm border border-gray-100 p-6">
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                    <div className="p-3 bg-blue-50 rounded-[10px]">
                        <Tags className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-gray-800">Marcas</h2>
                        <p className="text-sm text-gray-500 mt-1">
                            Fabricantes de equipamentos, componentes e materiais — escolhidos na Gestão de Ativos, nos Ativos do edifício e no Almoxarifado.
                        </p>
                    </div>
                </div>
                <button
                    onClick={abrirNova}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
                >
                    <Plus className="w-[15px] h-[15px]" />
                    Nova marca
                </button>
            </div>

            <div className="mt-6 border-t border-gray-100 pt-6 space-y-3">
                {error && (
                    <div className="flex items-center gap-2 p-3 rounded-[10px] bg-red-50 border border-red-100 text-sm text-red-700">
                        <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                    </div>
                )}
                <StandardTable<ProductBrand>
                    storageKey="settings:catalogo:marcas"
                    columns={columns}
                    rows={brands}
                    rowKey={b => b.id}
                    loading={loading}
                    searchText={b => `${b.name} ${orgId ? '' : orgName(b.organization_id)}`}
                    searchPlaceholder="Buscar marca..."
                    onRowClick={abrirEdicao}
                    sortValue={(key, b) => {
                        if (key === 'models') return usoDe(b.id).models;
                        if (key === 'inUse') return emUso(usoDe(b.id));
                        if (key === 'status') return b.is_active ? 0 : 1;
                        if (key === 'org') return orgName(b.organization_id);
                        return b.name.toLocaleLowerCase('pt-BR');
                    }}
                    renderCell={(key, b) => {
                        const u = usoDe(b.id);
                        switch (key) {
                            case 'models':
                                return <span className="text-sm font-normal text-gray-600">{u.models}</span>;
                            case 'inUse':
                                return <span className="block truncate text-sm font-normal text-gray-600" title={descreverUso(u)}>{descreverUso(u)}</span>;
                            case 'status':
                                return <span className={`text-sm font-normal ${b.is_active ? 'text-green-700' : 'text-gray-500'}`}>{b.is_active ? 'Ativa' : 'Inativa'}</span>;
                            case 'org':
                                return <span className="block truncate text-sm font-normal text-gray-700" title={orgName(b.organization_id)}>{orgName(b.organization_id)}</span>;
                            default:
                                return <span className="block truncate text-sm font-normal text-gray-700" title={b.name}>{b.name}</span>;
                        }
                    }}
                    actions={{
                        width: 120,
                        render: b => {
                            const motivo = motivoNaoExcluir(b);
                            return (
                                <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                                    {onVerModelos && (
                                        <ActionIconButton kind="view" title="Ver modelos desta marca" onClick={() => onVerModelos(b.id)} />
                                    )}
                                    <ActionIconButton kind="edit" onClick={() => abrirEdicao(b)} />
                                    {/* Botão desligado sempre diz o motivo — o title vai no wrapper porque
                                        botão disabled não dispara hover */}
                                    <span title={motivo ?? 'Excluir marca'}>
                                        <ActionIconButton kind="delete" disabled={!!motivo} onClick={() => void excluir(b)} />
                                    </span>
                                </div>
                            );
                        },
                    }}
                    empty={{
                        icon: <Tags className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                        title: 'Nenhuma marca cadastrada',
                        subtitle: 'Cadastre aqui, ou direto no campo Marca de um ativo ou item de estoque.',
                    }}
                />
            </div>

            <Sheet open={!!editing} onClose={fechar} size="sm" dirty={dirty}>
                {editing && (
                    <>
                        <SheetHeader onClose={fechar}>
                            <SheetTitle>{editing.id ? 'Editar marca' : 'Nova marca'}</SheetTitle>
                            <SheetDescription>
                                {editing.id
                                    ? 'Renomear atualiza o nome em todos os ativos e itens vinculados.'
                                    : orgId ? 'A marca nasce na organização selecionada no topo.' : 'Com "Todas as organizações" no topo, você escolhe onde criar.'}
                            </SheetDescription>
                        </SheetHeader>
                        <SheetPanel className="px-6 py-5 space-y-4">
                            <div className="space-y-1.5">
                                <label htmlFor="marca-nome" className="text-xs font-semibold text-slate-500">Nome da marca</label>
                                <input
                                    id="marca-nome"
                                    autoFocus
                                    maxLength={100}
                                    value={editing.name}
                                    onChange={e => setEditing(prev => (prev ? { ...prev, name: e.target.value } : prev))}
                                    onKeyDown={e => { if (e.key === 'Enter') void salvar(); }}
                                    placeholder="Ex.: Mitsubishi, WEG, DeWalt"
                                    className={INPUT}
                                />
                            </div>
                            {editing.id && (
                                <label className="flex items-start gap-2.5 text-sm text-gray-700 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={editing.is_active}
                                        onChange={e => setEditing(prev => (prev ? { ...prev, is_active: e.target.checked } : prev))}
                                        className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span>
                                        Marca ativa
                                        <span className="block text-xs text-gray-400">Inativa some dos campos de escolha; o que já está vinculado continua.</span>
                                    </span>
                                </label>
                            )}
                        </SheetPanel>
                        <SheetFooter>
                            <button onClick={fechar} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px]">
                                Cancelar
                            </button>
                            <button
                                onClick={() => void salvar()}
                                disabled={saving || !normalizarNome(editing.name) || (!!editing.id && !dirty)}
                                title={!normalizarNome(editing.name) ? 'Informe o nome da marca' : editing.id && !dirty ? 'Nada foi alterado' : undefined}
                                className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {saving ? 'Salvando...' : editing.id ? 'Salvar marca' : 'Criar marca'}
                            </button>
                        </SheetFooter>
                    </>
                )}
            </Sheet>

            {toast && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
                    toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {toast.message}
                </div>
            )}

            {orgTargetModal}
        </div>
    );
};

export default BrandsSettings;
