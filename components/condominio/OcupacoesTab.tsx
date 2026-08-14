// components/empreendimento/OcupacoesTab.tsx
// Ocupações da unidade — ÒPURA Pós-Entrega, F0.
// Plano: docs/planos/2026-08-13-opura-condominios-avaliacao.md
//
// Esta aba responde três perguntas que o Espelho de Vendas NÃO responde: quem é
// DONO, quem MORA e quem PAGA. São relações distintas, e por isso a tabela lista
// ocupações (uma linha por papel), não unidades.
//
// UI: ui_ux_guia_unificado.md — §5.2 toolbar acoplada, §6.6 px-6 + border-r,
// §7 tipografia, §8 status como texto, §9 ações, §14 useConfirm, §22 estado local.
import React from 'react';
import { Users, UserCheck, Home, Wallet, Search, RefreshCw, Plus, DoorOpen, Download } from 'lucide-react';
import {
    ColumnConfig,
    useTableColumns,
    ColumnConfigButton,
    SortableHeader,
    usePersistedState,
} from '../ui/TableUtils';
import { KpiCard } from '../ui/KpiCard';
import ActionIconButton from '../ui/ActionIconButton';
import { InlineDisclosureMenu } from '../ui/inline-disclosure-menu';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { useConfirm } from '../ui/confirm';
import { unitOccupancyService } from '../../services/unitOccupancyService';
import {
    occupancyImportService,
    type ImportPreview,
} from '../../services/occupancyImportService';
import { empreendimentoService } from '../../services/empreendimentoService';
import { clientService } from '../../services/clientService';
import type {
    Empreendimento,
    OccupancyRole,
    UnitOccupancyRow,
} from '../../types/empreendimento';

const COLUMNS: ColumnConfig[] = [
    { key: 'unidade', label: 'Unidade', sortable: true },
    { key: 'torre', label: 'Torre', sortable: true },
    { key: 'pessoa', label: 'Pessoa', sortable: true },
    { key: 'documento', label: 'CPF/CNPJ', sortable: true },
    { key: 'papel', label: 'Papel', sortable: true },
    { key: 'entrada', label: 'Entrada', sortable: true },
    { key: 'saida', label: 'Saída', sortable: true },
    { key: 'fracao', label: 'Fração ideal', sortable: true },
    { key: 'actions', label: 'Ações', sortable: false },
];

const ROLE_LABELS: Record<OccupancyRole, string> = {
    PROPRIETARIO: 'Proprietário',
    INQUILINO: 'Inquilino',
    MORADOR: 'Morador',
    RESPONSAVEL_FINANCEIRO: 'Responsável financeiro',
};

// Texto colorido, sem pílula/fundo/uppercase (§8).
const ROLE_TEXT_COLOR: Record<OccupancyRole, string> = {
    PROPRIETARIO: 'text-blue-600',
    INQUILINO: 'text-indigo-600',
    MORADOR: 'text-gray-600',
    RESPONSAVEL_FINANCEIRO: 'text-emerald-600',
};

const ROLE_HINTS: Record<OccupancyRole, string> = {
    PROPRIETARIO: 'É dono da unidade. Pode não morar nela.',
    INQUILINO: 'Ocupa por contrato de locação.',
    MORADOR: 'Mora sem ser dono nem locatário (dependente, familiar).',
    RESPONSAVEL_FINANCEIRO: 'Recebe a cobrança do condomínio. Só um por unidade.',
};

/** Data vem do banco como 'YYYY-MM-DD'. Nunca `new Date(iso)` — o fuso come um dia. */
function formatarData(iso?: string | null): string {
    if (!iso) return '—';
    const [ano, mes, dia] = iso.slice(0, 10).split('-');
    return dia && mes && ano ? `${dia}/${mes}/${ano}` : '—';
}

function hojeISO(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface Props {
    empreendimento: Empreendimento;
}

/**
 * Uma linha da tabela. `ocupacao: null` é uma unidade SEM ninguém — ela existe
 * na lista de propósito: o espelho do condomínio tem de mostrar todas as
 * unidades, senão a lacuna de cadastro fica invisível.
 */
interface LinhaExibida {
    key: string;
    unitId: string;
    unitName: string;
    towerName: string;
    fracao: number | null;
    ocupacao: UnitOccupancyRow | null;
}

interface ClienteOpcao { id: string; name: string; document?: string | null }

const OcupacoesTab: React.FC<Props> = ({ empreendimento }) => {
    const confirm = useConfirm();

    const [searchTerm, setSearchTerm] = usePersistedState<string>('ocupacoes:search', '');
    const [incluirEncerradas, setIncluirEncerradas] = usePersistedState<boolean>('ocupacoes:encerradas', false);
    const tableColumns = useTableColumns(COLUMNS, 'ocupacoesColumns');

    const [linhas, setLinhas] = React.useState<UnitOccupancyRow[]>([]);
    /**
     * TODAS as unidades do empreendimento, sempre — ocupadas ou não. A tabela é
     * ancorada nelas, não nas ocupações: unidade vazia precisa APARECER, senão
     * "nenhuma ocupação cadastrada" e "nenhuma unidade cadastrada" viram a mesma
     * tela em branco, e a lacuna fica invisível.
     */
    const [unidades, setUnidades] = React.useState<
        { id: string; label: string; unitName: string; towerName: string; fracao: number | null }[]
    >([]);
    const [clientes, setClientes] = React.useState<ClienteOpcao[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [erro, setErro] = React.useState<string | null>(null);
    const [notification, setNotification] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const [sheetAberto, setSheetAberto] = React.useState(false);
    const [salvando, setSalvando] = React.useState(false);

    // Importação de Locações — prévia antes de gravar: ninguém desfaz 40
    // ocupações à mão, então a escrita direta seria irreversível na prática.
    const [importOpen, setImportOpen] = React.useState(false);
    const [preview, setPreview] = React.useState<ImportPreview | null>(null);
    const [carregandoPreview, setCarregandoPreview] = React.useState(false);
    const [importando, setImportando] = React.useState(false);
    const [form, setForm] = React.useState<{
        unit_id: string; client_id: string; role: OccupancyRole; started_at: string; notes: string;
    }>({ unit_id: '', client_id: '', role: 'PROPRIETARIO', started_at: hojeISO(), notes: '' });

    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    // A org sai da entidade aberta, não do seletor do topo — "Todas as
    // organizações" não pode esconder esta tela (CLAUDE.md regra #5).
    const orgId = empreendimento.organization_id;

    const carregar = React.useCallback(async () => {
        setLoading(true);
        setErro(null);
        try {
            const units = await empreendimentoService.listAllUnitsForEmpreendimento(empreendimento.id);
            const labels = Object.fromEntries(units.map(u => [u.id, {
                unitName: u.name,
                towerName: u._tower_name,
                fracao: u.fracao_ideal_decimal ?? null,
            }]));
            setUnidades(units.map(u => ({
                id: u.id,
                label: `${u._tower_name} · ${u.name}`,
                unitName: u.name,
                towerName: u._tower_name,
                fracao: u.fracao_ideal_decimal ?? null,
            })));

            const dados = await unitOccupancyService.listByEmpreendimento(
                units.map(u => u.id),
                labels,
                { incluirEncerradas },
            );
            setLinhas(dados);
        } catch (e: any) {
            setErro(e?.message || 'Erro ao carregar as ocupações.');
        } finally {
            setLoading(false);
        }
    }, [empreendimento.id, incluirEncerradas]);

    React.useEffect(() => { carregar(); }, [carregar]);

    React.useEffect(() => {
        clientService.listClients(orgId)
            .then(cs => setClientes((cs || []).map((c: any) => ({ id: c.id, name: c.name, document: c.document }))))
            .catch(() => setClientes([]));
    }, [orgId]);

    const filtradas = React.useMemo(() => {
        // A tabela parte das UNIDADES. Cada ocupação vira uma linha; unidade sem
        // ninguém vira uma linha própria, com `ocupacao: null`. Assim o espelho
        // do condomínio está sempre completo, e a lacuna é visível.
        const porUnidade = new Map<string, UnitOccupancyRow[]>();
        for (const l of linhas) {
            if (!porUnidade.has(l.unit_id)) porUnidade.set(l.unit_id, []);
            porUnidade.get(l.unit_id)!.push(l);
        }

        const todas: LinhaExibida[] = [];
        for (const u of unidades) {
            const ocupacoes = porUnidade.get(u.id) || [];
            if (ocupacoes.length === 0) {
                todas.push({
                    key: `vazia:${u.id}`, unitId: u.id, unitName: u.unitName,
                    towerName: u.towerName, fracao: u.fracao, ocupacao: null,
                });
            } else {
                for (const o of ocupacoes) {
                    todas.push({
                        key: o.id, unitId: u.id, unitName: u.unitName,
                        towerName: u.towerName, fracao: u.fracao ?? o._fracao_ideal ?? null,
                        ocupacao: o,
                    });
                }
            }
            porUnidade.delete(u.id);
        }
        // Ocupação cujo unidade não veio na lista (excluída, ou fora do recorte):
        // aparece mesmo assim, senão some sem explicação.
        for (const restantes of porUnidade.values()) {
            for (const o of restantes) {
                todas.push({
                    key: o.id, unitId: o.unit_id, unitName: o._unit_name,
                    towerName: o._tower_name, fracao: o._fracao_ideal ?? null, ocupacao: o,
                });
            }
        }

        const termo = searchTerm.trim().toLowerCase();
        const base = termo
            ? todas.filter(l =>
                (l.ocupacao?._client_name || '').toLowerCase().includes(termo)
                || l.unitName.toLowerCase().includes(termo)
                || l.towerName.toLowerCase().includes(termo)
                || (l.ocupacao?._client_document || '').toLowerCase().includes(termo)
                || (l.ocupacao ? ROLE_LABELS[l.ocupacao.role].toLowerCase().includes(termo) : false))
            : todas;

        const valor = (l: LinhaExibida, col: string): string | number => {
            switch (col) {
                case 'unidade': return l.unitName;
                case 'torre': return l.towerName;
                case 'pessoa': return l.ocupacao?._client_name || '';
                case 'documento': return l.ocupacao?._client_document || '';
                case 'papel': return l.ocupacao ? ROLE_LABELS[l.ocupacao.role] : '';
                case 'entrada': return l.ocupacao?.started_at || '';
                case 'saida': return l.ocupacao?.ended_at || '';
                case 'fracao': return l.fracao ?? -1;
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
            // Sem coluna escolhida: agrupa por unidade, que é como se lê um espelho.
            return a.unitName.localeCompare(b.unitName, 'pt-BR', { numeric: true });
        });
    }, [linhas, unidades, searchTerm, tableColumns.sortColumn, tableColumns.sortDirection]);

    const kpis = React.useMemo(() => {
        const vigentes = linhas.filter(l => !l.ended_at);
        const unidadesComOcupacao = new Set(vigentes.map(l => l.unit_id));
        return {
            total: vigentes.length,
            proprietarios: vigentes.filter(l => l.role === 'PROPRIETARIO').length,
            ocupadas: unidadesComOcupacao.size,
            semResponsavel: unidades.length - new Set(
                vigentes.filter(l => l.role === 'RESPONSAVEL_FINANCEIRO').map(l => l.unit_id),
            ).size,
        };
    }, [linhas, unidades.length]);

    // Uma prévia só: a âncora é a unidade, e ela resolve locatário e
    // proprietário na mesma passagem. Não há mais eixo a escolher.
    const abrirImportacao = async () => {
        setImportOpen(true);
        setCarregandoPreview(true);
        setPreview(null);
        try {
            setPreview(await occupancyImportService.previewImport(empreendimento.id, orgId));
        } catch (e: any) {
            notify(e?.message || 'Erro ao montar a prévia da importação.', 'error');
            setImportOpen(false);
        } finally {
            setCarregandoPreview(false);
        }
    };

    const alternarLinha = (unitId: string) => {
        setPreview(p => p && ({
            ...p,
            rows: p.rows.map(r => (r.unitId === unitId ? { ...r, selected: !r.selected } : r)),
        }));
    };

    const aplicarImportacao = async () => {
        if (!preview) return;
        setImportando(true);
        try {
            const r = await occupancyImportService.applyImport(preview.rows);
            // §22 — costura no array local em vez de recarregar a aba inteira.
            if (r.novas.length > 0) {
                const porUnidade = Object.fromEntries(unidades.map(u => [u.id, u.label]));
                setLinhas(prev => [
                    ...r.novas.map(o => {
                        const [torre, nome] = (porUnidade[o.unit_id] || ' · ').split(' · ');
                        const linha = preview.rows.find(x => x.unitId === o.unit_id);
                        const pessoa = linha?.pessoas.find(pp => pp.clientId === o.client_id);
                        return {
                            ...o,
                            _client_name: pessoa?.clientName || '—',
                            _client_document: null,
                            _client_email: null,
                            _unit_name: nome || '—',
                            _tower_name: torre || '—',
                            _fracao_ideal: null,
                        };
                    }),
                    ...prev,
                ]);
            }
            setImportOpen(false);
            const resumo = [
                `${r.criadas} criada${r.criadas === 1 ? '' : 's'}`,
                r.puladas > 0 ? `${r.puladas} pulada${r.puladas === 1 ? '' : 's'}` : null,
            ].filter(Boolean).join(' · ');
            notify(r.erros.length > 0 ? `${resumo}. ${r.erros[0]}` : resumo, r.erros.length > 0 ? 'error' : 'success');
        } catch (e: any) {
            notify(e?.message || 'Erro ao importar.', 'error');
        } finally {
            setImportando(false);
        }
    };

    const abrirNova = () => {
        setForm({ unit_id: '', client_id: '', role: 'PROPRIETARIO', started_at: hojeISO(), notes: '' });
        setSheetAberto(true);
    };

    const salvar = async () => {
        if (!form.unit_id || !form.client_id) {
            notify('Escolha a unidade e a pessoa antes de salvar.', 'error');
            return;
        }
        setSalvando(true);
        try {
            const criada = await unitOccupancyService.create({
                unit_id: form.unit_id,
                client_id: form.client_id,
                role: form.role,
                started_at: form.started_at,
                notes: form.notes || null,
                ended_at: null,
            });
            // §22 — atualiza o array local em vez de recarregar a aba inteira.
            const unidade = unidades.find(u => u.id === criada.unit_id);
            const [torre, nome] = (unidade?.label || ' · ').split(' · ');
            const cliente = clientes.find(c => c.id === criada.client_id);
            setLinhas(prev => [{
                ...criada,
                _client_name: cliente?.name || '—',
                _client_document: cliente?.document ?? null,
                _client_email: null,
                _unit_name: nome || '—',
                _tower_name: torre || '—',
                _fracao_ideal: null,
            }, ...prev]);
            setSheetAberto(false);
            notify('Ocupação registrada.');
        } catch (e: any) {
            notify(e?.message || 'Erro ao salvar a ocupação.', 'error');
        } finally {
            setSalvando(false);
        }
    };

    const encerrar = async (linha: UnitOccupancyRow) => {
        const ok = await confirm({
            title: 'Encerrar ocupação?',
            message: `${linha._client_name} deixa de constar como ${ROLE_LABELS[linha.role].toLowerCase()} da unidade ${linha._unit_name}. O registro é mantido no histórico — não é exclusão.`,
            variant: 'warning',
            confirmLabel: 'Encerrar ocupação',
        });
        if (!ok) return;
        try {
            const atualizada = await unitOccupancyService.encerrar(linha.id, hojeISO());
            setLinhas(prev => incluirEncerradas
                ? prev.map(l => (l.id === linha.id ? { ...l, ...atualizada } : l))
                : prev.filter(l => l.id !== linha.id));
            notify('Ocupação encerrada. O histórico foi preservado.');
        } catch (e: any) {
            notify(e?.message || 'Erro ao encerrar a ocupação.', 'error');
        }
    };

    const excluir = async (linha: UnitOccupancyRow) => {
        const ok = await confirm({
            title: 'Excluir o registro?',
            message: 'Isso apaga a ocupação de vez, sem deixar histórico. Use só para corrigir um cadastro errado — para registrar a saída de alguém, encerre a ocupação.',
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        try {
            await unitOccupancyService.remove(linha.id);
            setLinhas(prev => prev.filter(l => l.id !== linha.id));
            notify('Registro excluído.');
        } catch (e: any) {
            notify(e?.message || 'Erro ao excluir o registro.', 'error');
        }
    };

    const visiveis = tableColumns.visibleColumns;

    return (
        <div className="space-y-6">
            {/* KPIs — §4, cor semântica por indicador */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-3">
                <KpiCard label="OCUPAÇÕES ATIVAS" value={kpis.total} icon={<Users className="w-5 h-5" />} color="blue" />
                <KpiCard label="PROPRIETÁRIOS" value={kpis.proprietarios} icon={<UserCheck className="w-5 h-5" />} color="indigo" />
                <KpiCard
                    label="UNIDADES OCUPADAS"
                    value={`${kpis.ocupadas} / ${unidades.length}`}
                    icon={<Home className="w-5 h-5" />}
                    color="emerald"
                />
                <KpiCard
                    label="SEM RESPONSÁVEL"
                    value={kpis.semResponsavel}
                    sub={kpis.semResponsavel > 0 ? 'Unidades sem quem receba a cobrança' : undefined}
                    icon={<Wallet className="w-5 h-5" />}
                    color={kpis.semResponsavel > 0 ? 'amber' : 'gray'}
                />
            </div>

            {/* Banner de erro fica FORA do card acoplado (§5.2) */}
            {erro && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-[10px] px-4 py-3 text-sm">
                    {erro}
                </div>
            )}

            {/* Card acoplado: toolbar + tabela lendo como um bloco só (§5.2) */}
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-white">
                    <div className="flex flex-col md:flex-row gap-2.5 items-center">
                        <div className="flex-1 relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar por pessoa, unidade, torre, documento ou papel..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                            />
                        </div>

                        <button
                            onClick={() => setIncluirEncerradas(v => !v)}
                            className={`flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] text-sm font-medium transition-all active:scale-95 whitespace-nowrap ${
                                incluirEncerradas ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-600 hover:bg-amber-500 hover:text-white'
                            }`}
                            title="Ocupação encerrada é histórico: some da lista por padrão, mas nunca é apagada"
                        >
                            <DoorOpen className="w-4 h-4" />
                            Incluir encerradas
                        </button>

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
                        </div>

                        <button
                            onClick={abrirImportacao}
                            className="flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all active:scale-95 shrink-0 whitespace-nowrap"
                            title="Traz quem já está declarado nos contratos de locação e de venda"
                        >
                            <Download className="w-4 h-4" />
                            Importar do Comercial
                        </button>

                        {/* Ação primária — §17, variante compacta */}
                        <button
                            onClick={abrirNova}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
                        >
                            <Plus className="w-[15px] h-[15px]" />
                            Nova ocupação
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="mt-2 text-gray-500">Carregando...</p>
                    </div>
                ) : filtradas.length === 0 ? (
                    <div className="text-center py-12">
                        <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        {/* A tabela agora parte das UNIDADES, então vazia só quando o
                            empreendimento não tem nenhuma — "sem ocupação" deixou de
                            ser tela em branco e virou linha rotulada. */}
                        <h3 className="text-lg font-bold text-gray-900 mb-2">
                            {unidades.length === 0 ? 'Nenhuma unidade cadastrada' : 'Nenhum resultado'}
                        </h3>
                        <p className="text-sm text-gray-500 max-w-md mx-auto">
                            {unidades.length === 0
                                ? 'As unidades vêm do Empreendimento, na aba Torres e Unidades. Sem elas não há o que ocupar.'
                                : 'Tente ajustar a busca.'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-auto max-h-[70vh]">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    {visiveis.includes('unidade') && (
                                        <SortableHeader colKey="unidade" label="Unidade" uppercase={false}
                                            sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                            onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                    )}
                                    {visiveis.includes('torre') && (
                                        <SortableHeader colKey="torre" label="Torre" uppercase={false}
                                            sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                            onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                    )}
                                    {visiveis.includes('pessoa') && (
                                        <SortableHeader colKey="pessoa" label="Pessoa" uppercase={false}
                                            sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                            onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                    )}
                                    {visiveis.includes('documento') && (
                                        <SortableHeader colKey="documento" label="CPF/CNPJ" uppercase={false}
                                            sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                            onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                    )}
                                    {visiveis.includes('papel') && (
                                        <SortableHeader colKey="papel" label="Papel" uppercase={false}
                                            sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                            onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                    )}
                                    {visiveis.includes('entrada') && (
                                        <SortableHeader colKey="entrada" label="Entrada" uppercase={false}
                                            sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                            onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                    )}
                                    {visiveis.includes('saida') && (
                                        <SortableHeader colKey="saida" label="Saída" uppercase={false}
                                            sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                            onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                    )}
                                    {visiveis.includes('fracao') && (
                                        <SortableHeader colKey="fracao" label="Fração ideal" uppercase={false}
                                            sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                            onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                    )}
                                    {visiveis.includes('actions') && (
                                        <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Ações</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filtradas.map(l => {
                                    const o = l.ocupacao;
                                    return (
                                    <tr key={l.key} className={`hover:bg-blue-50/50 transition-colors group ${o?.ended_at ? 'opacity-60' : ''}`}>
                                        {visiveis.includes('unidade') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">{l.unitName}</td>
                                        )}
                                        {visiveis.includes('torre') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{l.towerName}</td>
                                        )}
                                        {visiveis.includes('pessoa') && (
                                            /* Unidade sem ocupante aparece rotulada, não em branco:
                                               vazio sem rótulo lê como dado faltando por descuido. */
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">
                                                {o ? o._client_name : <span className="text-gray-400">Sem ocupante</span>}
                                            </td>
                                        )}
                                        {visiveis.includes('documento') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{o?._client_document || '—'}</td>
                                        )}
                                        {visiveis.includes('papel') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                {o
                                                    ? <span className={`text-sm font-normal ${ROLE_TEXT_COLOR[o.role]}`}>{ROLE_LABELS[o.role]}</span>
                                                    : <span className="text-sm font-normal text-gray-400">—</span>}
                                            </td>
                                        )}
                                        {visiveis.includes('entrada') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{o ? formatarData(o.started_at) : '—'}</td>
                                        )}
                                        {visiveis.includes('saida') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                                                {!o ? '—' : o.ended_at ? formatarData(o.ended_at) : 'Vigente'}
                                            </td>
                                        )}
                                        {visiveis.includes('fracao') && (
                                            /* No piloto (retrofit) esta coluna é vazia em 100% das unidades: a fração de
                                               prédio entregue vem da CONVENÇÃO, não do motor de áreas. Por isso o vazio é
                                               rotulado, não deixado em branco como se fosse dado faltando por descuido. */
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                                                {l.fracao != null
                                                    ? `${(l.fracao * 100).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}%`
                                                    : <span className="text-gray-400">Não informada</span>}
                                            </td>
                                        )}
                                        {visiveis.includes('actions') && (
                                            <td className="px-6 py-2.5 text-right">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    {o && !o.ended_at && (
                                                        <ActionIconButton
                                                            kind="edit"
                                                            title="Encerrar ocupação"
                                                            icon={<DoorOpen className="w-4 h-4" />}
                                                            onClick={() => encerrar(o)}
                                                        />
                                                    )}
                                                    {o && (
                                                        <InlineDisclosureMenu
                                                            showDelete
                                                            onDelete={() => excluir(o)}
                                                        />
                                                    )}
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

            {/* Criar ocupação — painel lateral, o padrão para item de lista (UI_PATTERNS §3) */}
            <Sheet open={sheetAberto} onClose={() => setSheetAberto(false)} size="lg">
                <SheetHeader onClose={() => setSheetAberto(false)}>
                    <SheetTitle>Nova ocupação</SheetTitle>
                    <SheetDescription>{empreendimento.name}</SheetDescription>
                </SheetHeader>
                <SheetPanel>
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Unidade</label>
                            <select
                                value={form.unit_id}
                                onChange={e => setForm(f => ({ ...f, unit_id: e.target.value }))}
                                className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            >
                                <option value="">Selecione a unidade</option>
                                {unidades.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
                            </select>
                        </div>

                        <div>
                            <label className="text-xs font-semibold text-slate-500">Pessoa</label>
                            <select
                                value={form.client_id}
                                onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}
                                className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            >
                                <option value="">Selecione a pessoa</option>
                                {clientes.map(c => (
                                    <option key={c.id} value={c.id}>
                                        {c.name}{c.document ? ` · ${c.document}` : ''}
                                    </option>
                                ))}
                            </select>
                            <p className="text-xs text-gray-400 mt-1">
                                Morador e inquilino também são cadastrados em Clientes — é lá que mora a dedup por CPF/CNPJ.
                            </p>
                        </div>

                        <div>
                            <label className="text-xs font-semibold text-slate-500">Papel</label>
                            <select
                                value={form.role}
                                onChange={e => setForm(f => ({ ...f, role: e.target.value as OccupancyRole }))}
                                className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            >
                                {(Object.keys(ROLE_LABELS) as OccupancyRole[]).map(r => (
                                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                                ))}
                            </select>
                            <p className="text-xs text-gray-400 mt-1">{ROLE_HINTS[form.role]}</p>
                        </div>

                        <div>
                            <label className="text-xs font-semibold text-slate-500">Entrada</label>
                            <input
                                type="date"
                                value={form.started_at}
                                onChange={e => setForm(f => ({ ...f, started_at: e.target.value }))}
                                className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            />
                        </div>

                        <div>
                            <label className="text-xs font-semibold text-slate-500">Observações</label>
                            <textarea
                                value={form.notes}
                                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                                rows={3}
                                className="mt-1 w-full px-3 py-2 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            />
                        </div>
                    </div>
                </SheetPanel>
                <SheetFooter>
                    <button
                        onClick={() => setSheetAberto(false)}
                        className="h-9 px-3.5 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={salvar}
                        disabled={salvando}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
                    >
                        {salvando ? 'Salvando...' : 'Salvar ocupação'}
                    </button>
                </SheetFooter>
            </Sheet>

            {/* Prévia da importação — mostra o que SERIA criado antes de gravar */}
            <Sheet open={importOpen} onClose={() => setImportOpen(false)} size="2xl">
                <SheetHeader onClose={() => setImportOpen(false)}>
                    <SheetTitle>Importar do Comercial</SheetTitle>
                    <SheetDescription>
                        Quem já está nos contratos vira ocupação. Nada é gravado até você confirmar.
                    </SheetDescription>
                </SheetHeader>
                <SheetPanel>
                    {/* A ÂNCORA É A UNIDADE DO EMPREENDIMENTO. Uma linha por
                        unidade — inclusive as sem ninguém encontrado. Unidade que
                        some da lista vira defeito invisível: foi assim que a
                        importação de vendas pareceu quebrada em 14/08/2026. */}
                    {carregandoPreview ? (
                        <div className="text-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                            <p className="mt-2 text-gray-500">Lendo o Comercial...</p>
                        </div>
                    ) : !preview || preview.rows.length === 0 ? (
                        <div className="text-center py-12">
                            <Download className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma unidade</h3>
                            <p className="text-sm text-gray-500 max-w-md mx-auto">
                                Este condomínio não tem unidades cadastradas. Elas vêm do
                                Empreendimento, na aba Torres e Unidades.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="text-xs text-gray-500">
                                {preview.unidadesComPessoa} de {preview.unidadesTotal} unidades com pessoa encontrada
                                {preview.unidadesEmNegociacao > 0 && ` · ${preview.unidadesEmNegociacao} em negociação`}
                            </div>

                            {preview.rows.map(r => {
                                const semNada = r.pessoas.length === 0 && !r.responsavelFinanceiro;
                                return (
                                    <label
                                        key={r.unitId}
                                        className={`flex items-start gap-3 p-3 rounded-[10px] border transition-all cursor-pointer ${
                                            r.selected ? 'border-blue-200 bg-blue-50/40' : 'border-gray-200 bg-white'
                                        } ${semNada ? 'opacity-60 cursor-not-allowed' : ''}`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={r.selected}
                                            disabled={semNada}
                                            onChange={() => alternarLinha(r.unitId)}
                                            className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-40"
                                        />
                                        <div className="min-w-0 flex-1">
                                            <span className="text-sm font-medium text-gray-800">{r.unitLabel}</span>
                                            {r.pessoas.map(p => (
                                                <div key={p.role} className="text-xs text-gray-500 mt-0.5">
                                                    <span className="text-gray-700">{ROLE_LABELS[p.role]}</span>
                                                    {': '}{p.clientName}
                                                    <span className="text-gray-400">
                                                        {' · '}{p.origem}{' · desde '}{formatarData(p.startedAt)}
                                                    </span>
                                                </div>
                                            ))}
                                            {r.responsavelFinanceiro && (
                                                <div className="text-xs text-emerald-600 mt-0.5">
                                                    Também vira responsável financeiro
                                                </div>
                                            )}
                                            {r.motivo && (
                                                <p className="text-xs text-amber-600 mt-1">{r.motivo}</p>
                                            )}
                                        </div>
                                    </label>
                                );
                            })}
                        </div>
                    )}
                </SheetPanel>
                <SheetFooter>
                    <button
                        onClick={() => setImportOpen(false)}
                        className="h-9 px-3.5 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={aplicarImportacao}
                        disabled={importando || !preview || preview.rows.filter(r => r.selected).length === 0}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
                    >
                        {importando
                            ? 'Importando...'
                            /* Conta UNIDADES, não ocupações: cada unidade pode gerar até
                               três (proprietário, inquilino e responsável financeiro). */
                            : `Importar ${preview?.rows.filter(r => r.selected).length ?? 0} unidades`}
                    </button>
                </SheetFooter>
            </Sheet>

            {notification && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium ${
                    notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    {notification.message}
                </div>
            )}
        </div>
    );
};

export default OcupacoesTab;
