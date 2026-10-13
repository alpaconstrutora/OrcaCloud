// components/settings/BrandsSettings.tsx — Configurações › Marcas e Modelos
//
// Plano: docs/planos/2026-10-13-marcas-e-modelos.md. Catálogo product_brands +
// product_models, usado por Gestão de Ativos, Condomínio › Ativos do edifício e
// Almoxarifado.
//
// UMA tela (pedido de 13/10: "modelo deve ser fundido com marca. no proprio
// cadastro de marca, habilite cadastro de modelo"): pode existir marca sem
// modelo, nunca modelo sem marca. A lista é de marcas; o painel da marca traz os
// modelos dela e cadastra/edita cada um ali mesmo — o painel TROCA de conteúdo
// para o formulário do modelo (ProductModelForm) e volta; não abre um segundo
// drawer (UI_PATTERNS §4.4).
//
// REGRA #5: lê com o org do topo (null = "Todas", RLS recorta); criar marca
// passa por resolveWriteOrg('all-allowed') — em "Todas" replica em cada
// organização do usuário. O modelo herda a org da marca: nunca se pergunta.
//
// Excluir só sem uso: marca com modelo ou com ativo/item vinculado se INATIVA
// (UI_PATTERNS §6.3) — some dos campos de escolha e mantém os vínculos.
import React from 'react';
import { AlertCircle, ArrowLeft, Boxes, Download, Plus, Tags, Upload } from 'lucide-react';
import { saveAs } from 'file-saver';
import StandardTable, { StandardTableColumn } from '../ui/StandardTable';
import ActionIconButton from '../ui/ActionIconButton';
import { useConfirm } from '../ui/confirm';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { useOrgContext, useOrgWriteTarget, forEachTargetOrg, partialFailureNote, errorMessage } from '../../hooks/useOrgContext';
import { useStore } from '../../store/useStore';
import { brandModelService } from '../../services/brandModelService';
import type { CatalogUsage, ProductBrand, ProductModel } from '../../types/brandModel';
import { ITEM_TYPE_LABELS } from '../../types/brandModel';
import { normalizarNome } from '../../utils/catalogoNome';
import { ProductModelForm } from './ProductModelForm';
import { BrandModelImportSheet } from './BrandModelImportSheet';
import { linhasParaExportar } from '../../utils/catalogoPlanilha';
import { gerarPlanilhaCatalogo } from '../../utils/catalogoPlanilhaExcel';

const COLUMNS: StandardTableColumn[] = [
    { key: 'name', label: 'Marca', sortable: true, width: 260 },
    { key: 'models', label: 'Modelos', sortable: true, width: 110, align: 'right' },
    { key: 'inUse', label: 'Em uso', sortable: true, width: 170 },
    { key: 'status', label: 'Situação', sortable: true, width: 110 },
];
const ORG_COLUMN: StandardTableColumn = { key: 'org', label: 'Organização', sortable: true, width: 200 };

// Tabela de modelos DENTRO do painel (§6.9, `dense`). Soma ~580px — cabe nos
// ~620px úteis do Sheet 2xl (medido na tela em 13/10: com 6 colunas "Tipo"
// cortava e "Ações" encostava na borda). "Em uso" e vida útil começam ocultas
// (engrenagem de colunas); o uso aparece no motivo do Excluir desligado.
const MODEL_COLUMNS: StandardTableColumn[] = [
    { key: 'name', label: 'Modelo', sortable: true, width: 170 },
    { key: 'type', label: 'Tipo', sortable: true, width: 110 },
    { key: 'code', label: 'Código do fabricante', sortable: true, width: 130 },
    { key: 'life', label: 'Vida útil padrão', sortable: true, width: 110, align: 'right', defaultHidden: true },
    { key: 'inUse', label: 'Em uso', sortable: true, width: 90, defaultHidden: true },
    { key: 'status', label: 'Situação', sortable: true, width: 90 },
];

const USO_VAZIO: CatalogUsage = { models: 0, assets: 0, stockItems: 0 };
const emUso = (u: CatalogUsage) => u.assets + u.stockItems;

export function descreverUso(u: CatalogUsage): string {
    const partes: string[] = [];
    if (u.assets) partes.push(`${u.assets} ativo${u.assets === 1 ? '' : 's'}`);
    if (u.stockItems) partes.push(`${u.stockItems} ite${u.stockItems === 1 ? 'm' : 'ns'} de estoque`);
    return partes.join(' · ') || '—';
}

const INPUT = 'w-full h-9 px-3 bg-gray-50 border border-gray-100 rounded-[6px] text-sm font-normal text-gray-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all';

type Rascunho = { id: string | null; name: string; is_active: boolean };

/** Aviso de sucesso/erro dentro do rodapé do painel, à esquerda dos botões (lugar do SaveStatus, §25). */
const AvisoNoRodape: React.FC<{ toast: { message: string; type: 'success' | 'error' } }> = ({ toast }) => (
    <p role="status" className={`mr-auto flex items-center gap-1.5 text-sm font-normal ${toast.type === 'success' ? 'text-emerald-700' : 'text-red-600'}`}>
        <AlertCircle className="w-4 h-4 shrink-0" />
        <span>{toast.message}</span>
    </p>
);

const BrandsSettings: React.FC = () => {
    const { orgId } = useOrgContext();
    const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();
    const organizations = useStore(s => s.organizations);
    const confirm = useConfirm();

    const [brands, setBrands] = React.useState<ProductBrand[]>([]);
    const [models, setModels] = React.useState<ProductModel[]>([]);
    const [usoMarcas, setUsoMarcas] = React.useState<Map<string, CatalogUsage>>(new Map());
    const [usoModelos, setUsoModelos] = React.useState<Map<string, CatalogUsage>>(new Map());
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [toast, setToast] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);

    // Painel: null = fechado; { id: null } = nova marca.
    const [editing, setEditing] = React.useState<Rascunho | null>(null);
    const [original, setOriginal] = React.useState<Rascunho | null>(null);
    const [saving, setSaving] = React.useState(false);
    // Dentro do painel: a marca, ou o formulário de UM modelo dela (null = novo).
    const [modeloAberto, setModeloAberto] = React.useState<{ model: ProductModel | null } | null>(null);
    const [modeloDirty, setModeloDirty] = React.useState(false);
    const [importando, setImportando] = React.useState(false);
    const [exportando, setExportando] = React.useState(false);

    // Um temporizador por vez: sem isso o aviso anterior ("Marca criada") apagava o
    // seguinte ("Modelo criado") antes da hora — visto na tela em 13/10.
    const toastTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        if (toastTimer.current) clearTimeout(toastTimer.current);
        setToast({ message, type });
        toastTimer.current = setTimeout(() => setToast(null), 4500);
    };
    React.useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

    const load = React.useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [b, m, u] = await Promise.all([
                brandModelService.listBrands(orgId),
                brandModelService.listModels(orgId),
                brandModelService.usage(orgId),
            ]);
            setBrands(b);
            setModels(m);
            setUsoMarcas(u.brands);
            setUsoModelos(u.models);
        } catch (e) {
            setError(errorMessage(e, 'Falha ao carregar as marcas.'));
        } finally {
            setLoading(false);
        }
    }, [orgId]);

    React.useEffect(() => { void load(); }, [load]);

    const orgName = React.useCallback((id: string) => organizations.find(o => o.id === id)?.name ?? '—', [organizations]);

    // Exporta o que a tela mostra: a org do topo, ou todas (com a coluna Organização).
    const exportar = async () => {
        setExportando(true);
        try {
            const blob = await gerarPlanilhaCatalogo(
                linhasParaExportar(brands, models, orgId ? undefined : orgName),
                { comOrganizacao: !orgId },
            );
            saveAs(blob, `marcas-e-modelos-${new Date().toISOString().slice(0, 10)}.xlsx`);
        } catch (e) {
            notify(errorMessage(e, 'Não foi possível gerar a planilha.'), 'error');
        } finally {
            setExportando(false);
        }
    };
    const usoDaMarca = (id: string) => usoMarcas.get(id) ?? USO_VAZIO;
    const usoDoModelo = (id: string) => usoModelos.get(id) ?? USO_VAZIO;
    // Contagem pelo estado local (§22): cadastrar um modelo no painel já muda a coluna.
    const modelosDa = React.useCallback((brandId: string) => models.filter(m => m.brand_id === brandId), [models]);
    const columns = React.useMemo(() => (orgId ? COLUMNS : [...COLUMNS, ORG_COLUMN]), [orgId]);

    const marcaAberta = editing?.id ? brands.find(b => b.id === editing.id) ?? null : null;
    const modelosDaMarcaAberta = React.useMemo(
        () => (marcaAberta ? modelosDa(marcaAberta.id) : []),
        [marcaAberta, modelosDa],
    );

    const abrirNova = () => { const r = { id: null, name: '', is_active: true }; setEditing(r); setOriginal(r); setModeloAberto(null); };
    const abrirMarca = (b: ProductBrand) => { const r = { id: b.id, name: b.name, is_active: b.is_active }; setEditing(r); setOriginal(r); setModeloAberto(null); };
    const fechar = () => { setEditing(null); setOriginal(null); setModeloAberto(null); setModeloDirty(false); };
    const marcaDirty = !!editing && !!original && (editing.name !== original.name || editing.is_active !== original.is_active);
    const dirty = marcaDirty || (!!modeloAberto && modeloDirty);

    const descartar = async (mensagem: string) => confirm({
        title: 'Sair sem salvar?', message: mensagem, variant: 'warning',
        confirmLabel: 'Sair e descartar', cancelLabel: 'Continuar editando',
    });
    // X do cabeçalho: não passa pela guarda do Sheet (§25) — pergunta aqui.
    const pedirFechar = async () => {
        if (dirty && !await descartar('Há alterações não salvas. Se sair agora, elas serão perdidas.')) return;
        fechar();
    };
    const voltarParaMarca = async () => {
        if (modeloDirty && !await descartar('O modelo tem alterações não salvas.')) return;
        setModeloAberto(null);
        setModeloDirty(false);
    };

    const salvarMarca = async () => {
        if (!editing) return;
        const nome = normalizarNome(editing.name);
        if (!nome) return;
        setSaving(true);
        try {
            if (editing.id) {
                const salvo = await brandModelService.updateBrand(editing.id, { name: nome, is_active: editing.is_active });
                setBrands(prev => prev.map(b => (b.id === salvo.id ? salvo : b)));   // §22
                const r = { id: salvo.id, name: salvo.name, is_active: salvo.is_active };
                setEditing(r);
                setOriginal(r);
                // Edição não fecha (§25): o painel segue aberto com os modelos à vista.
                notify(nome !== original?.name ? 'Marca renomeada — os ativos e itens vinculados já mostram o nome novo.' : 'Marca salva.');
            } else {
                const target = await resolveWriteOrg('all-allowed');
                if (!target) return;
                const criadas: ProductBrand[] = [];
                const { ok, failed } = await forEachTargetOrg(target, async org => {
                    const b = await brandModelService.createBrand(org, nome);
                    criadas.push(b);
                    return b;
                });
                if (ok === 0) {
                    notify(errorMessage(failed[0]?.error, 'Não foi possível criar a marca.'), 'error');
                    return;
                }
                setBrands(prev => [...prev, ...criadas].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
                const nota = partialFailureNote(failed);
                if (criadas.length === 1) {
                    // Uma marca só: o painel vira a edição dela, pronto para os modelos.
                    const r = { id: criadas[0].id, name: criadas[0].name, is_active: true };
                    setEditing(r);
                    setOriginal(r);
                    notify(`Marca criada${nota ? ` (${nota})` : ''} — cadastre os modelos abaixo.`);
                } else {
                    // Replicada em N organizações: não há UMA marca para continuar editando.
                    fechar();
                    notify(`Marca criada em ${ok} organizações${nota ? ` (${nota})` : ''}. Abra a marca de cada organização para cadastrar os modelos.`);
                }
            }
        } catch (e) {
            notify(errorMessage(e, 'Não foi possível salvar a marca.'), 'error');
        } finally {
            setSaving(false);
        }
    };

    const excluirMarca = async (b: ProductBrand) => {
        const ok = await confirm({
            title: 'Excluir marca?',
            message: `"${b.name}" sai do catálogo. Ela não tem modelos e nenhum ativo ou item a usa.`,
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

    const motivoNaoExcluirMarca = (b: ProductBrand): string | null => {
        const n = modelosDa(b.id).length;
        if (n > 0) return `Tem ${n} modelo${n === 1 ? '' : 's'} — exclua os modelos ou inative a marca`;
        const u = usoDaMarca(b.id);
        if (emUso(u) > 0) return `Em uso por ${descreverUso(u)} — inative em vez de excluir`;
        return null;
    };

    const modeloSalvo = (m: ProductModel, criado: boolean) => {
        setModels(prev => (criado ? [...prev, m] : prev.map(x => (x.id === m.id ? m : x))));   // §22
        setModeloAberto(null);
        setModeloDirty(false);
        notify(criado ? `Modelo ${m.name} criado.` : 'Modelo salvo — ativos e itens vinculados já refletem a mudança.');
    };

    const excluirModelo = async (m: ProductModel) => {
        const ok = await confirm({
            title: 'Excluir modelo?',
            message: `"${m.name}" sai do catálogo. Nenhum ativo ou item usa este modelo.`,
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

    // ── Painel ─────────────────────────────────────────────────────────────
    const tituloPainel = modeloAberto
        ? (modeloAberto.model ? 'Editar modelo' : 'Novo modelo')
        : editing?.id ? 'Editar marca' : 'Nova marca';
    const descricaoPainel = modeloAberto && marcaAberta
        ? `Marca ${marcaAberta.name}${orgId ? '' : ` · ${orgName(marcaAberta.organization_id)}`}`
        : editing?.id
            ? 'Renomear atualiza o nome em todos os ativos e itens vinculados.'
            : orgId ? 'A marca nasce na organização selecionada no topo.' : 'Com "Todas as organizações" no topo, você escolhe onde criar.';

    return (
        <div className="bg-white rounded-[10px] shadow-sm border border-gray-100 p-6">
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                    <div className="p-3 bg-blue-50 rounded-[10px]">
                        <Tags className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-gray-800">Marcas e Modelos</h2>
                        <p className="text-sm text-gray-500 mt-1">
                            Fabricantes de equipamentos, componentes e materiais. Todo modelo pertence a uma marca — abra a marca para cadastrar e editar os modelos dela.
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        onClick={() => setImportando(true)}
                        disabled={loading}
                        title={loading ? 'Aguarde o catálogo carregar' : 'Importar marcas e modelos de uma planilha Excel'}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Upload className="w-[15px] h-[15px]" /> Importar
                    </button>
                    <button
                        onClick={() => void exportar()}
                        disabled={loading || exportando}
                        title={loading ? 'Aguarde o catálogo carregar' : orgId ? 'Exportar para Excel' : 'Exportar para Excel (todas as organizações, com a coluna Organização)'}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Download className="w-[15px] h-[15px]" /> {exportando ? 'Gerando...' : 'Exportar'}
                    </button>
                    <button
                        onClick={abrirNova}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95"
                    >
                        <Plus className="w-[15px] h-[15px]" />
                        Nova marca
                    </button>
                </div>
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
                    // A busca também acha a marca pelo nome de um modelo dela.
                    searchText={b => `${b.name} ${modelosDa(b.id).map(m => `${m.name} ${m.manufacturer_code ?? ''}`).join(' ')} ${orgId ? '' : orgName(b.organization_id)}`}
                    searchPlaceholder="Buscar marca ou modelo..."
                    onRowClick={abrirMarca}
                    sortValue={(key, b) => {
                        if (key === 'models') return modelosDa(b.id).length;
                        if (key === 'inUse') return emUso(usoDaMarca(b.id));
                        if (key === 'status') return b.is_active ? 0 : 1;
                        if (key === 'org') return orgName(b.organization_id);
                        return b.name.toLocaleLowerCase('pt-BR');
                    }}
                    renderCell={(key, b) => {
                        switch (key) {
                            case 'models':
                                return <span className="text-sm font-normal text-gray-600">{modelosDa(b.id).length}</span>;
                            case 'inUse':
                                return <span className="block truncate text-sm font-normal text-gray-600" title={descreverUso(usoDaMarca(b.id))}>{descreverUso(usoDaMarca(b.id))}</span>;
                            case 'status':
                                return <span className={`text-sm font-normal ${b.is_active ? 'text-green-700' : 'text-gray-500'}`}>{b.is_active ? 'Ativa' : 'Inativa'}</span>;
                            case 'org':
                                return <span className="block truncate text-sm font-normal text-gray-700" title={orgName(b.organization_id)}>{orgName(b.organization_id)}</span>;
                            default:
                                return <span className="block truncate text-sm font-normal text-gray-700" title={b.name}>{b.name}</span>;
                        }
                    }}
                    actions={{
                        width: 100,
                        render: b => {
                            const motivo = motivoNaoExcluirMarca(b);
                            return (
                                <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                                    <ActionIconButton kind="edit" title="Abrir marca e modelos" onClick={() => abrirMarca(b)} />
                                    {/* Botão desligado sempre diz o motivo — o title vai no wrapper porque
                                        botão disabled não dispara hover */}
                                    <span title={motivo ?? 'Excluir marca'}>
                                        <ActionIconButton kind="delete" disabled={!!motivo} onClick={() => void excluirMarca(b)} />
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

            <Sheet open={!!editing} onClose={fechar} size={editing?.id ? '2xl' : 'sm'} dirty={dirty}>
                {editing && (
                    <>
                        <SheetHeader onClose={() => void pedirFechar()}>
                            {modeloAberto && (
                                <button onClick={() => void voltarParaMarca()}
                                    className="mb-1.5 inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-blue-600">
                                    <ArrowLeft className="w-3.5 h-3.5" /> {marcaAberta?.name ?? 'Marca'}
                                </button>
                            )}
                            <SheetTitle>{tituloPainel}</SheetTitle>
                            <SheetDescription>{descricaoPainel}</SheetDescription>
                        </SheetHeader>

                        {modeloAberto && marcaAberta ? (
                            <ProductModelForm
                                key={modeloAberto.model?.id ?? 'novo'}
                                brand={marcaAberta}
                                model={modeloAberto.model}
                                onBack={() => void voltarParaMarca()}
                                onSaved={modeloSalvo}
                                onDirtyChange={setModeloDirty}
                            />
                        ) : (
                            <>
                                <SheetPanel className="px-6 py-5">
                                    <div className="space-y-8">
                                        <div className="space-y-4">
                                            <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-100 pb-3">Marca</h3>
                                            <div className="space-y-1.5">
                                                <label htmlFor="marca-nome" className="text-xs font-semibold text-slate-500">Nome da marca</label>
                                                <input
                                                    id="marca-nome"
                                                    autoFocus={!editing.id}
                                                    maxLength={100}
                                                    value={editing.name}
                                                    onChange={e => setEditing(prev => (prev ? { ...prev, name: e.target.value } : prev))}
                                                    onKeyDown={e => { if (e.key === 'Enter') void salvarMarca(); }}
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
                                        </div>

                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-3">
                                                <h3 className="text-sm font-semibold text-gray-900">
                                                    Modelos{marcaAberta ? ` (${modelosDaMarcaAberta.length})` : ''}
                                                </h3>
                                                {marcaAberta && (
                                                    <button
                                                        onClick={() => { setModeloAberto({ model: null }); setModeloDirty(false); }}
                                                        className="flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 font-medium text-[13px] transition-all active:scale-95"
                                                    >
                                                        <Plus className="w-[15px] h-[15px]" /> Novo modelo
                                                    </button>
                                                )}
                                            </div>
                                            {!marcaAberta ? (
                                                <p className="text-sm text-gray-500">
                                                    Crie a marca primeiro — os modelos dela são cadastrados aqui mesmo, logo em seguida.
                                                </p>
                                            ) : (
                                                <StandardTable<ProductModel>
                                                    storageKey="settings:catalogo:modelosDaMarca"
                                                    searchScope={marcaAberta.id}
                                                    dense
                                                    maxHeight="50vh"
                                                    columns={MODEL_COLUMNS}
                                                    rows={modelosDaMarcaAberta}
                                                    rowKey={m => m.id}
                                                    searchText={m => `${m.name} ${m.manufacturer_code ?? ''} ${m.technical_spec ?? ''}`}
                                                    searchPlaceholder="Buscar modelo..."
                                                    onRowClick={m => { setModeloAberto({ model: m }); setModeloDirty(false); }}
                                                    sortValue={(key, m) => {
                                                        switch (key) {
                                                            case 'type': return ITEM_TYPE_LABELS[m.item_type];
                                                            case 'code': return m.manufacturer_code ?? '';
                                                            case 'life': return m.default_useful_life_months ?? -1;
                                                            case 'inUse': return emUso(usoDoModelo(m.id));
                                                            case 'status': return m.is_active ? 0 : 1;
                                                            default: return m.name.toLocaleLowerCase('pt-BR');
                                                        }
                                                    }}
                                                    renderCell={(key, m) => {
                                                        const texto = (v: string, cor = 'text-gray-700') => <span className={`block truncate text-sm font-normal ${cor}`} title={v}>{v}</span>;
                                                        switch (key) {
                                                            case 'type': return texto(ITEM_TYPE_LABELS[m.item_type], 'text-gray-600');
                                                            case 'code': return texto(m.manufacturer_code || '—', 'text-gray-600');
                                                            case 'life': return <span className="text-sm font-normal text-gray-600">{m.default_useful_life_months != null ? `${m.default_useful_life_months} meses` : '—'}</span>;
                                                            case 'inUse': return texto(descreverUso(usoDoModelo(m.id)), 'text-gray-600');
                                                            case 'status': return <span className={`text-sm font-normal ${m.is_active ? 'text-green-700' : 'text-gray-500'}`}>{m.is_active ? 'Ativo' : 'Inativo'}</span>;
                                                            default: return texto(m.name);
                                                        }
                                                    }}
                                                    actions={{
                                                        width: 80,
                                                        render: m => {
                                                            const u = usoDoModelo(m.id);
                                                            const usado = emUso(u) > 0;
                                                            return (
                                                                <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                                                                    <ActionIconButton kind="edit" onClick={() => { setModeloAberto({ model: m }); setModeloDirty(false); }} />
                                                                    <span title={usado ? `Em uso por ${descreverUso(u)} — inative em vez de excluir` : 'Excluir modelo'}>
                                                                        <ActionIconButton kind="delete" disabled={usado} onClick={() => void excluirModelo(m)} />
                                                                    </span>
                                                                </div>
                                                            );
                                                        },
                                                    }}
                                                    empty={{
                                                        icon: <Boxes className="w-10 h-10 text-gray-300 mx-auto mb-3" />,
                                                        title: 'Nenhum modelo nesta marca',
                                                        subtitle: 'Uma marca pode ficar sem modelos. Use "Novo modelo" para cadastrar.',
                                                    }}
                                                />
                                            )}
                                        </div>
                                    </div>
                                </SheetPanel>
                                <SheetFooter>
                                    {toast && <AvisoNoRodape toast={toast} />}
                                    <button onClick={() => void pedirFechar()} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px]">
                                        {editing.id ? 'Fechar' : 'Cancelar'}
                                    </button>
                                    <button
                                        onClick={() => void salvarMarca()}
                                        disabled={saving || !normalizarNome(editing.name) || (!!editing.id && !marcaDirty)}
                                        title={!normalizarNome(editing.name) ? 'Informe o nome da marca' : editing.id && !marcaDirty ? 'Nada foi alterado na marca' : undefined}
                                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {saving ? 'Salvando...' : editing.id ? 'Salvar marca' : 'Criar marca'}
                                    </button>
                                </SheetFooter>
                            </>
                        )}
                    </>
                )}
            </Sheet>

            {/* Com o painel aberto o aviso vai no rodapé dele (AvisoNoRodape): o toast
                fixo no canto cobria "Fechar"/"Salvar" (visto na tela em 13/10). */}
            {toast && !editing && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
                    toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {toast.message}
                </div>
            )}

            <BrandModelImportSheet
                open={importando}
                onClose={() => setImportando(false)}
                brands={brands}
                models={models}
                orgName={orgName}
                // Lote: recarrega o catálogo inteiro (§22 permite — a importação não devolve as linhas).
                onImported={() => void load()}
            />

            {orgTargetModal}
        </div>
    );
};

export default BrandsSettings;
