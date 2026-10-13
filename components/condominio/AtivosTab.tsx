// components/condominio/AtivosTab.tsx
// Ativos instalados do edifício e a garantia do FORNECEDOR — F2.
// Plano: docs/planos/2026-08-13-opura-condominios-avaliacao.md
//
// A garantia daqui não é a de `warranty_terms`: aquela é da CONSTRUTORA ao
// comprador, com prazo contado da entrega do imóvel. Esta é do FORNECEDOR do
// equipamento, corre da instalação e é contra quem vendeu a bomba. Confundi-las
// faz o condomínio cobrar da parte errada e descobrir tarde que o prazo da
// certa já venceu — por isso a coluna de garantia mostra os dias, não só a data.
import React from 'react';
import { Package, ShieldCheck, ShieldAlert, Search, RefreshCw, Plus, AlertCircle, MoveHorizontal, Pencil, X } from 'lucide-react';
import {
    ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState, useResizableColumns,
} from '../ui/TableUtils';
import { larguraTabela } from './larguraTabela';
import { KpiCard } from '../ui/KpiCard';
import { InlineDisclosureMenu } from '../ui/inline-disclosure-menu';
import ActionIconButton from '../ui/ActionIconButton';
import AtivosEdicaoEmLoteSheet, { type AtivoLotePatch } from './AtivosEdicaoEmLoteSheet';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { useConfirm } from '../ui/confirm';
import {
    buildingAssetService, diasAte, type BuildingAsset, type BuildingAssetRow,
} from '../../services/buildingAssetService';
import { maintenanceService } from '../../services/maintenanceService';
import type { BuildingSystem } from '../../types/condominio';
import type { Empreendimento } from '../../types/empreendimento';

const COLUMNS: ColumnConfig[] = [
    { key: 'codigo', label: 'Código', sortable: true },
    { key: 'nome', label: 'Equipamento', sortable: true },
    { key: 'sistema', label: 'Sistema', sortable: true },
    { key: 'localizacao', label: 'Localização', sortable: true },
    { key: 'marca', label: 'Marca / modelo', sortable: true },
    { key: 'serie', label: 'Nº de série', sortable: true },
    { key: 'instalacao', label: 'Instalação', sortable: true },
    { key: 'garantia', label: 'Garantia do fornecedor', sortable: true },
    { key: 'actions', label: 'Ações', sortable: false },
];

function formatarData(iso?: string | null): string {
    if (!iso) return '—';
    const [a, m, d] = iso.slice(0, 10).split('-');
    return d && m && a ? `${d}/${m}/${a}` : '—';
}
function hojeISO(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Coluna do checkbox de seleção — estrutural, sem `data-col-key` (o autoFit a desconta). */
const LARGURA_CHECKBOX = 40;

/** A garantia é o dado que a tela existe para vigiar — a cor carrega o sentido. */
function textoGarantia(dias: number | null, ate?: string | null): { texto: string; cor: string } {
    if (dias == null) return { texto: 'Não informada', cor: 'text-gray-400' };
    if (dias < 0) return { texto: `${formatarData(ate)} · vencida`, cor: 'text-red-600' };
    if (dias <= 90) return { texto: `${formatarData(ate)} · vence em ${dias}d`, cor: 'text-amber-600' };
    return { texto: formatarData(ate), cor: 'text-emerald-600' };
}

interface FormAtivo {
    name: string;
    building_system_id: string;
    location: string;
    brand: string;
    model: string;
    serial_number: string;
    purchase_date: string;
    supplier_warranty_until: string;
    notes: string;
}

const formVazio = (): FormAtivo => ({
    name: '', building_system_id: '', location: '', brand: '', model: '', serial_number: '',
    purchase_date: hojeISO(), supplier_warranty_until: '', notes: '',
});

function formDoAtivo(a: BuildingAsset): FormAtivo {
    return {
        name: a.name || '',
        building_system_id: a.building_system_id || '',
        location: a.location || '',
        brand: a.brand || '',
        model: a.model || '',
        serial_number: a.serial_number || '',
        purchase_date: (a.purchase_date || '').slice(0, 10),
        supplier_warranty_until: (a.supplier_warranty_until || '').slice(0, 10),
        notes: a.notes || '',
    };
}

// §6.1 — larguras iniciais por coluna. Soma 1245 + 40 do checkbox = 1285 ≈ contêiner
// de 1600px com a barra lateral aberta, para "Ações" nascer visível; "Ajustar
// largura" mede o dado real.
const LARGURAS_ATIVOS: Record<string, number> = {
    codigo: 115, nome: 160, sistema: 140, localizacao: 140, marca: 130,
    serie: 110, instalacao: 110, garantia: 180, actions: 160,
};

const CAMPO = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none';
const ROTULO = 'text-xs font-semibold text-slate-500';

interface Props { empreendimento: Empreendimento }

const AtivosTab: React.FC<Props> = ({ empreendimento }) => {
    const confirm = useConfirm();
    const orgId = empreendimento.organization_id;

    const [searchTerm, setSearchTerm] = usePersistedState<string>('condominio:ativos:search', '');
    const tableColumns = useTableColumns(COLUMNS, 'ativosPrediaisColumns');
    const cols = useResizableColumns(LARGURAS_ATIVOS, 'condominio:ativos:larguras');

    const [ativos, setAtivos] = React.useState<BuildingAssetRow[]>([]);
    const [sistemas, setSistemas] = React.useState<BuildingSystem[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [erro, setErro] = React.useState<string | null>(null);
    const [sheetAberto, setSheetAberto] = React.useState(false);
    const [salvando, setSalvando] = React.useState(false);
    // Seleção para a edição em lote (§10). Ids, não linhas: a linha muda a cada
    // gravação e a seleção tem de sobreviver a isso.
    const [selecionados, setSelecionados] = React.useState<Set<string>>(new Set());
    const [ancora, setAncora] = React.useState<number | null>(null);
    const [loteAberto, setLoteAberto] = React.useState(false);
    const [notification, setNotification] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    // O mesmo drawer cria e edita. `editando` nulo = cadastro novo.
    const [editando, setEditando] = React.useState<BuildingAssetRow | null>(null);
    // Equipamento de que o cadastro novo está sendo copiado (botão Duplicar).
    // Só rotula o drawer: salvar é um `create` comum.
    const [duplicandoDe, setDuplicandoDe] = React.useState<BuildingAssetRow | null>(null);
    const [form, setForm] = React.useState<FormAtivo>(formVazio);
    // Retrato do form ao abrir a edição: é contra ele que se sabe se há pendência.
    const [formInicial, setFormInicial] = React.useState<FormAtivo>(formVazio);
    // Rascunho do cadastro novo, guardado à parte: abrir uma edição não pode
    // apagá-lo, e editar não pode vazar para o próximo "Novo equipamento".
    // Sobrevive entre cadastros (sistema, marca, data) como já sobrevivia antes
    // — cadastrar os 4 elevadores da torre não pede redigitar tudo.
    const rascunhoNovo = React.useRef<FormAtivo>(formVazio());
    const alterado = editando != null && JSON.stringify(form) !== JSON.stringify(formInicial);

    const set = <K extends keyof FormAtivo>(campo: K, valor: FormAtivo[K]) =>
        setForm(f => ({ ...f, [campo]: valor }));

    const abrirNovo = () => {
        setEditando(null);
        setDuplicandoDe(null);
        setForm(rascunhoNovo.current);
        setSheetAberto(true);
    };

    /** Duplicar = "Novo equipamento" já preenchido com os dados deste. O nº de
     *  série fica de fora de propósito: é único por aparelho, copiá-lo cadastraria
     *  dois equipamentos com a mesma identidade. O resto o usuário ajusta. */
    const abrirDuplicacao = (a: BuildingAssetRow) => {
        setEditando(null);
        setDuplicandoDe(a);
        setForm({ ...formDoAtivo(a), serial_number: '' });
        setSheetAberto(true);
    };

    const abrirEdicao = (a: BuildingAssetRow) => {
        const f = formDoAtivo(a);
        setDuplicandoDe(null);
        setEditando(a);
        setForm(f);
        setFormInicial(f);
        setSheetAberto(true);
    };

    /** Fecha sem perguntar — o Sheet já confirma sozinho no ESC/backdrop quando `dirty`. */
    const fecharSheet = () => {
        // Cópia não vira rascunho: senão o próximo "Novo equipamento" abriria
        // com os dados do equipamento que foi duplicado.
        if (!editando && !duplicandoDe) rascunhoNovo.current = form;
        setSheetAberto(false);
        setEditando(null);
        setDuplicandoDe(null);
    };

    /** X e Cancelar não passam pelo `requestClose` do Sheet — guarda própria (§25). */
    const fecharComGuarda = async () => {
        if (alterado) {
            const ok = await confirm({
                title: 'Sair sem salvar?',
                message: 'Há alterações não salvas. Se sair agora, elas serão perdidas.',
                variant: 'warning',
                confirmLabel: 'Sair e descartar',
                cancelLabel: 'Continuar editando',
            });
            if (!ok) return;
        }
        fecharSheet();
    };

    const comoLinha = (a: BuildingAsset): BuildingAssetRow => ({
        ...a,
        _system_name: sistemas.find(s => s.id === a.building_system_id)?.name || '—',
        _dias_garantia: diasAte(a.supplier_warranty_until),
    });

    const carregar = React.useCallback(async () => {
        setLoading(true);
        setErro(null);
        try {
            const sys = await maintenanceService.listSystems(orgId);
            setSistemas(sys);
            setAtivos(await buildingAssetService.listByEmpreendimento(empreendimento.id, sys));
            setSelecionados(new Set());
            setAncora(null);
        } catch (e: any) {
            setErro(e?.message || 'Erro ao carregar os ativos.');
        } finally {
            setLoading(false);
        }
    }, [empreendimento.id, orgId]);

    React.useEffect(() => { carregar(); }, [carregar]);

    const kpis = React.useMemo(() => ({
        total: ativos.length,
        vencidas: ativos.filter(a => a._dias_garantia != null && a._dias_garantia < 0).length,
        vencendo: ativos.filter(a => a._dias_garantia != null && a._dias_garantia >= 0 && a._dias_garantia <= 90).length,
        semGarantia: ativos.filter(a => !a.supplier_warranty_until).length,
    }), [ativos]);

    const filtrados = React.useMemo(() => {
        const t = searchTerm.trim().toLowerCase();
        const base = t
            ? ativos.filter(a =>
                a.name.toLowerCase().includes(t)
                || a.code.toLowerCase().includes(t)
                || a._system_name.toLowerCase().includes(t)
                || (a.location || '').toLowerCase().includes(t)
                || (a.brand || '').toLowerCase().includes(t)
                || (a.serial_number || '').toLowerCase().includes(t))
            : ativos;

        const valor = (a: BuildingAssetRow, col: string): string | number => {
            switch (col) {
                case 'codigo': return a.code;
                case 'nome': return a.name;
                case 'sistema': return a._system_name;
                case 'localizacao': return a.location || '';
                case 'marca': return `${a.brand || ''} ${a.model || ''}`.trim();
                case 'serie': return a.serial_number || '';
                case 'instalacao': return a.purchase_date || '';
                case 'garantia': return a._dias_garantia ?? 999999;
                default: return '';
            }
        };

        return [...base].sort((a, b) => {
            if (tableColumns.sortColumn) {
                const va = valor(a, tableColumns.sortColumn);
                const vb = valor(b, tableColumns.sortColumn);
                const cmp = typeof va === 'number' && typeof vb === 'number'
                    ? va - vb
                    : String(va).localeCompare(String(vb), 'pt-BR');
                return tableColumns.sortDirection === 'desc' ? -cmp : cmp;
            }
            return a.name.localeCompare(b.name, 'pt-BR', { numeric: true });
        });
    }, [ativos, searchTerm, tableColumns.sortColumn, tableColumns.sortDirection]);

    const salvar = async () => {
        if (!form.name.trim()) { notify('Informe o nome do equipamento.', 'error'); return; }
        const campos = {
            name: form.name.trim(),
            building_system_id: form.building_system_id || null,
            location: form.location.trim() || null,
            brand: form.brand.trim() || null,
            model: form.model.trim() || null,
            serial_number: form.serial_number.trim() || null,
            purchase_date: form.purchase_date || null,
            supplier_warranty_until: form.supplier_warranty_until || null,
            notes: form.notes.trim() || null,
        };
        setSalvando(true);
        try {
            if (editando) {
                const salvo = await buildingAssetService.update(editando.id, campos);
                // §22 — troca só a linha editada, sem recarregar a aba.
                setAtivos(prev => prev.map(a => (a.id === salvo.id ? comoLinha(salvo) : a)));
                setSheetAberto(false);
                setEditando(null);
                notify(`${salvo.name} atualizado.`);
            } else {
                const criado = await buildingAssetService.create({
                    organization_id: orgId,
                    empreendimento_id: empreendimento.id,
                    ...campos,
                });
                // §22 — atualiza o array local, sem recarregar a aba. `diasAte`
                // compara data pura; o `Date.parse` que estava aqui lia a data
                // como UTC e, conforme a hora, errava a garantia em 1 dia (fuso).
                setAtivos(prev => [comoLinha(criado), ...prev]);
                if (!duplicandoDe) {
                    rascunhoNovo.current = { ...form, name: '', location: '', serial_number: '', supplier_warranty_until: '' };
                }
                setSheetAberto(false);
                setDuplicandoDe(null);
                notify(`${criado.name} cadastrado como ${criado.code}.`);
            }
        } catch (e: any) {
            notify(e?.message || (editando ? 'Erro ao atualizar o ativo.' : 'Erro ao cadastrar o ativo.'), 'error');
        } finally {
            setSalvando(false);
        }
    };

    const excluir = async (a: BuildingAssetRow) => {
        const ok = await confirm({
            title: 'Excluir o equipamento?',
            message: `${a.name} (${a.code}) sai do cadastro do edifício. O histórico técnico dele — manutenções e ordens ligadas — perde a âncora.`,
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        try {
            await buildingAssetService.remove(a.id);
            setAtivos(prev => prev.filter(x => x.id !== a.id));
            setSelecionados(prev => { const n = new Set(prev); n.delete(a.id); return n; });
            notify('Equipamento excluído.');
        } catch (e: any) {
            notify(e?.message || 'Erro ao excluir.', 'error');
        }
    };

    // ── Seleção (§10 / §10.1) ─────────────────────────────────────────────
    const todosVisiveisMarcados = filtrados.length > 0 && filtrados.every(a => selecionados.has(a.id));
    const algumVisivelMarcado = filtrados.some(a => selecionados.has(a.id));

    /** Clique define a âncora; Shift+clique marca o intervalo até ela (§10.1). */
    const marcarLinha = (id: string, indice: number, shift: boolean) => {
        if (shift && ancora !== null) {
            const [ini, fim] = ancora < indice ? [ancora, indice] : [indice, ancora];
            const faixa = filtrados.slice(ini, fim + 1).map(a => a.id);
            setSelecionados(prev => new Set([...prev, ...faixa]));
            return;
        }
        setSelecionados(prev => {
            const n = new Set(prev);
            if (n.has(id)) n.delete(id); else n.add(id);
            return n;
        });
        setAncora(indice);
    };

    /** Cabeçalho marca/desmarca só o que está VISÍVEL — a busca recorta o lote. */
    const marcarVisiveis = () => {
        setSelecionados(prev => {
            const n = new Set(prev);
            if (todosVisiveisMarcados) filtrados.forEach(a => n.delete(a.id));
            else filtrados.forEach(a => n.add(a.id));
            return n;
        });
        setAncora(null);
    };

    const desmarcar = () => { setSelecionados(new Set()); setAncora(null); };

    const ativosDoLote = React.useMemo(
        () => ativos.filter(a => selecionados.has(a.id)),
        [ativos, selecionados],
    );

    const aplicarLote = async (patch: AtivoLotePatch) => {
        const ids = ativosDoLote.map(a => a.id);
        const gravados = await buildingAssetService.updateMany(ids, patch);
        // §22 — troca só as linhas gravadas, sem recarregar a aba.
        const porId = new Map(gravados.map(g => [g.id, comoLinha(g)]));
        setAtivos(prev => prev.map(a => porId.get(a.id) ?? a));
        if (gravados.length < ids.length) {
            // RLS barrou parte: o UPDATE não dá erro, só devolve menos linhas.
            // Ficam selecionados os que faltaram, para o usuário ver quais.
            setSelecionados(new Set(ids.filter(id => !porId.has(id))));
            throw new Error(
                `Só ${gravados.length} de ${ids.length} equipamentos foram atualizados — `
                + 'os demais não puderam ser alterados com a sua permissão.',
            );
        }
        desmarcar();
        notify(`${gravados.length} equipamento${gravados.length !== 1 ? 's' : ''} atualizado${gravados.length !== 1 ? 's' : ''}.`);
    };

    const v = tableColumns.visibleColumns;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-3">
                <KpiCard label="EQUIPAMENTOS" value={kpis.total} icon={<Package className="w-5 h-5" />} color="blue" />
                <KpiCard
                    label="GARANTIA VENCIDA" value={kpis.vencidas}
                    sub={kpis.vencidas > 0 ? 'Conserto passa a ser custo do condomínio' : undefined}
                    icon={<ShieldAlert className="w-5 h-5" />}
                    color={kpis.vencidas > 0 ? 'red' : 'gray'}
                />
                <KpiCard
                    label="VENCE EM 90 DIAS" value={kpis.vencendo}
                    icon={<ShieldAlert className="w-5 h-5" />}
                    color={kpis.vencendo > 0 ? 'amber' : 'gray'}
                />
                <KpiCard
                    label="SEM GARANTIA INFORMADA" value={kpis.semGarantia}
                    icon={<ShieldCheck className="w-5 h-5" />}
                    color={kpis.semGarantia > 0 ? 'indigo' : 'gray'}
                />
            </div>

            {erro && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-[10px] px-4 py-3 text-sm">{erro}</div>
            )}

            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-2 border-b border-gray-100 bg-white">
                    <div className="flex flex-col md:flex-row gap-2.5 items-center">
                        <div className="flex-1 relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar por equipamento, código, sistema, localização, marca ou série..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                            />
                        </div>
                        <button
                            onClick={carregar}
                            className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95"
                            title="Recarregar"
                        >
                            <RefreshCw className="w-4 h-4" />
                        </button>
                        <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0"></div>
                        <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                            <ColumnConfigButton
                                columns={COLUMNS.filter(c => c.key !== 'actions')}
                                visibleColumns={tableColumns.visibleColumns}
                                showColumnConfig={tableColumns.showColumnConfig}
                                onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                                onToggleColumn={tableColumns.toggleColumn}
                                onReset={tableColumns.resetColumns}
                            />
                            {/* §6.1.2 — sob comando explícito, nunca automático. */}
                            <div className="w-px h-5 bg-gray-200 mx-0.5"></div>
                            <button
                                type="button"
                                onClick={() => cols.autoFit()}
                                className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all"
                                title="Ajustar largura das colunas ao conteúdo"
                            >
                                <MoveHorizontal className="w-4 h-4" />
                            </button>
                        </div>
                        <button
                            onClick={abrirNovo}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
                        >
                            <Plus className="w-[15px] h-[15px]" /> Novo equipamento
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="mt-2 text-gray-500">Carregando...</p>
                    </div>
                ) : filtrados.length === 0 ? (
                    <div className="text-center py-12">
                        <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">
                            {ativos.length === 0 ? 'Nenhum equipamento cadastrado' : 'Nenhum resultado'}
                        </h3>
                        <p className="text-sm text-gray-500 max-w-md mx-auto">
                            {ativos.length === 0
                                ? 'Elevador, bomba, gerador e portão são ativos do edifício. Cadastrá-los é o que dá ao plano de manutenção um alvo concreto — e o que faz a garantia do fornecedor ser cobrável.'
                                : 'Tente ajustar a busca.'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-auto max-h-[70vh]">
                        <table
                                ref={cols.tableRef}
                                className="text-left border-collapse"
                                style={{ tableLayout: 'fixed', width: LARGURA_CHECKBOX + larguraTabela(cols, ['codigo', 'nome', 'sistema', 'localizacao', 'marca', 'serie', 'instalacao', 'garantia', 'actions'], v), minWidth: '100%' }}
                            >
                            <colgroup>
                                    <col style={{ width: `${LARGURA_CHECKBOX}px` }} />
                                    {v.includes('codigo') && <col data-col-key="codigo" style={{ width: `${cols.getWidth('codigo')}px` }} />}
                                    {v.includes('nome') && <col data-col-key="nome" style={{ width: `${cols.getWidth('nome')}px` }} />}
                                    {v.includes('sistema') && <col data-col-key="sistema" style={{ width: `${cols.getWidth('sistema')}px` }} />}
                                    {v.includes('localizacao') && <col data-col-key="localizacao" style={{ width: `${cols.getWidth('localizacao')}px` }} />}
                                    {v.includes('marca') && <col data-col-key="marca" style={{ width: `${cols.getWidth('marca')}px` }} />}
                                    {v.includes('serie') && <col data-col-key="serie" style={{ width: `${cols.getWidth('serie')}px` }} />}
                                    {v.includes('instalacao') && <col data-col-key="instalacao" style={{ width: `${cols.getWidth('instalacao')}px` }} />}
                                    {v.includes('garantia') && <col data-col-key="garantia" style={{ width: `${cols.getWidth('garantia')}px` }} />}
                                    {/* §6.1.1 — espaçador ANTES de "Ações": absorve a folga */}
                                    <col />
                                    {v.includes('actions') && <col data-col-key="actions" style={{ width: `${cols.getWidth('actions')}px` }} />}
                                </colgroup>
                                <thead>
                                <tr className="sticky top-0 z-10 bg-white text-gray-700 font-semibold text-xs border-b border-gray-200">
                                    <th className="w-10 px-4 py-2 border-r border-gray-100 text-center">
                                        <input
                                            type="checkbox"
                                            aria-label="Marcar todos os equipamentos visíveis"
                                            title={todosVisiveisMarcados ? 'Desmarcar os visíveis' : 'Marcar todos os visíveis'}
                                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                            checked={todosVisiveisMarcados}
                                            ref={el => { if (el) el.indeterminate = algumVisivelMarcado && !todosVisiveisMarcados; }}
                                            onChange={marcarVisiveis}
                                        />
                                    </th>
                                    {v.includes('codigo') && <SortableHeader colKey="codigo" label="Código" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 overflow-hidden"><cols.ResizeHandle colKey="codigo" /></SortableHeader>}
                                    {v.includes('nome') && <SortableHeader colKey="nome" label="Equipamento" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 overflow-hidden"><cols.ResizeHandle colKey="nome" /></SortableHeader>}
                                    {v.includes('sistema') && <SortableHeader colKey="sistema" label="Sistema" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 overflow-hidden"><cols.ResizeHandle colKey="sistema" /></SortableHeader>}
                                    {v.includes('localizacao') && <SortableHeader colKey="localizacao" label="Localização" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 overflow-hidden"><cols.ResizeHandle colKey="localizacao" /></SortableHeader>}
                                    {v.includes('marca') && <SortableHeader colKey="marca" label="Marca / modelo" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 overflow-hidden"><cols.ResizeHandle colKey="marca" /></SortableHeader>}
                                    {v.includes('serie') && <SortableHeader colKey="serie" label="Nº de série" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 overflow-hidden"><cols.ResizeHandle colKey="serie" /></SortableHeader>}
                                    {v.includes('instalacao') && <SortableHeader colKey="instalacao" label="Instalação" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 overflow-hidden"><cols.ResizeHandle colKey="instalacao" /></SortableHeader>}
                                    {v.includes('garantia') && <SortableHeader colKey="garantia" label="Garantia do fornecedor" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 overflow-hidden"><cols.ResizeHandle colKey="garantia" /></SortableHeader>}
                                    <th aria-hidden="true" className="border-r border-gray-100"></th>
                                    {v.includes('actions') && <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Ações</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filtrados.map((a, indice) => {
                                    const g = textoGarantia(a._dias_garantia, a.supplier_warranty_until);
                                    const marcado = selecionados.has(a.id);
                                    return (
                                        <tr key={a.id} className={`hover:bg-blue-50/50 transition-colors group ${marcado ? 'bg-blue-50/60' : ''}`}>
                                            <td className="w-10 px-4 py-2.5 border-r border-gray-100 text-center">
                                                <input
                                                    type="checkbox"
                                                    aria-label={`Selecionar ${a.name}`}
                                                    title="Dica: segure Shift e clique para selecionar um intervalo"
                                                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                    checked={marcado}
                                                    onChange={e => marcarLinha(a.id, indice, (e.nativeEvent as MouseEvent).shiftKey)}
                                                />
                                            </td>
                                            {v.includes('codigo') && <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{a.code}</td>}
                                            {v.includes('nome') && <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">{a.name}</td>}
                                            {v.includes('sistema') && <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{a._system_name}</td>}
                                            {v.includes('localizacao') && <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{a.location || '—'}</td>}
                                            {v.includes('marca') && <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{[a.brand, a.model].filter(Boolean).join(' ') || '—'}</td>}
                                            {v.includes('serie') && <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{a.serial_number || '—'}</td>}
                                            {v.includes('instalacao') && <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{formatarData(a.purchase_date)}</td>}
                                            {v.includes('garantia') && (
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                    <span className={`text-sm font-normal ${g.cor}`}>{g.texto}</span>
                                                </td>
                                            )}
                                            <td aria-hidden="true"></td>
                                            {v.includes('actions') && (
                                                <td className="px-6 py-2.5 text-right">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <ActionIconButton kind="edit" title="Editar equipamento" onClick={() => abrirEdicao(a)} />
                                                        <ActionIconButton kind="duplicate" title="Duplicar equipamento" onClick={() => abrirDuplicacao(a)} />
                                                        <InlineDisclosureMenu showDelete onDelete={() => excluir(a)} />
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <Sheet open={sheetAberto} onClose={fecharSheet} size="lg" dirty={alterado}>
                <SheetHeader onClose={fecharComGuarda}>
                    <SheetTitle>{editando ? 'Editar equipamento' : duplicandoDe ? 'Duplicar equipamento' : 'Novo equipamento'}</SheetTitle>
                    <SheetDescription>
                        {editando
                            ? `${editando.code} · ${empreendimento.name}`
                            : duplicandoDe
                                ? `Cópia de ${duplicandoDe.code} · ${empreendimento.name}`
                                : empreendimento.name}
                    </SheetDescription>
                </SheetHeader>
                <SheetPanel className="p-6">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                        <div className="col-span-2 space-y-1.5">
                            <label className={ROTULO}>Equipamento</label>
                            <input
                                type="text" value={form.name}
                                onChange={e => set('name', e.target.value)}
                                placeholder="Ex: Elevador social — torre A"
                                className={CAMPO}
                            />
                        </div>

                        <div className="col-span-2 space-y-1.5">
                            <label className={ROTULO}>Localização</label>
                            <input
                                type="text" value={form.location}
                                onChange={e => set('location', e.target.value)}
                                placeholder="Ex: Casa de máquinas — cobertura, torre A"
                                className={CAMPO}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className={ROTULO}>Sistema predial</label>
                            <select
                                value={form.building_system_id}
                                onChange={e => set('building_system_id', e.target.value)}
                                className={CAMPO}
                            >
                                <option value="">Sem sistema definido</option>
                                {sistemas.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO}>Nº de série</label>
                            <input
                                type="text" value={form.serial_number}
                                onChange={e => set('serial_number', e.target.value)}
                                className={CAMPO}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className={ROTULO}>Marca</label>
                            <input
                                type="text" value={form.brand}
                                onChange={e => set('brand', e.target.value)}
                                className={CAMPO}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO}>Modelo</label>
                            <input
                                type="text" value={form.model}
                                onChange={e => set('model', e.target.value)}
                                className={CAMPO}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className={ROTULO}>Instalação</label>
                            <input
                                type="date" value={form.purchase_date}
                                onChange={e => set('purchase_date', e.target.value)}
                                className={CAMPO}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO}>Garantia do fornecedor até</label>
                            <input
                                type="date" value={form.supplier_warranty_until}
                                onChange={e => set('supplier_warranty_until', e.target.value)}
                                className={CAMPO}
                            />
                        </div>
                        <p className="col-span-2 -mt-2 text-xs text-gray-400">
                            Esta é a garantia de quem VENDEU o equipamento, contada da instalação —
                            diferente da garantia da construtora ao comprador, que corre da entrega do imóvel.
                        </p>

                        <div className="col-span-2 space-y-1.5">
                            <label className={ROTULO}>Observações</label>
                            <textarea
                                value={form.notes} rows={3}
                                onChange={e => set('notes', e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            />
                        </div>
                    </div>
                </SheetPanel>
                <SheetFooter>
                    <button onClick={fecharComGuarda} className="h-9 px-3.5 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all">
                        {editando ? 'Voltar' : 'Cancelar'}
                    </button>
                    <button
                        onClick={salvar}
                        disabled={salvando || (editando != null && !alterado)}
                        title={editando != null && !alterado ? 'Nada foi alterado neste equipamento' : undefined}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
                    >
                        {salvando ? 'Salvando...' : editando ? 'Salvar alterações' : 'Salvar equipamento'}
                    </button>
                </SheetFooter>
            </Sheet>

            {/* §10 — barra de lote fixa no rodapé, fora do fluxo da lista. */}
            {selecionados.size > 0 && !loteAberto && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 p-4 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-900/20">
                    <span className="text-sm font-bold whitespace-nowrap">
                        {selecionados.size} selecionado{selecionados.size !== 1 ? 's' : ''}
                    </span>
                    <button
                        onClick={() => setLoteAberto(true)}
                        className="flex items-center gap-1.5 h-9 px-3 bg-white text-blue-700 rounded-[6px] text-sm font-medium hover:bg-blue-50 transition-all"
                    >
                        <Pencil className="w-3.5 h-3.5" /> Editar em lote
                    </button>
                    <button
                        onClick={desmarcar}
                        className="flex items-center gap-1.5 h-9 px-3 bg-blue-500 rounded-[6px] text-sm font-medium hover:bg-blue-400 transition-all"
                    >
                        <X className="w-3.5 h-3.5" /> Desmarcar
                    </button>
                </div>
            )}

            <AtivosEdicaoEmLoteSheet
                open={loteAberto}
                ativos={ativosDoLote}
                sistemas={sistemas}
                onClose={() => setLoteAberto(false)}
                onApply={aplicarLote}
            />

            {notification && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
                    notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {notification.message}
                </div>
            )}
        </div>
    );
};

export default AtivosTab;
