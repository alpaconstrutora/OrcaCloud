// components/condominio/PortalCondominoAdmin.tsx
// Portais › Portal do Condômino — a visão INTERNA do que o morador vê.
// Plano: docs/planos/2026-08-31-portal-condomino-visao-interna.md
//
// POR QUE ESTA TELA EXISTE: o portal do condômino é rota por CAMINHO
// (`/portal-condomino?token=`), resolvida em App.tsx antes de o <Layout> montar.
// Não havia como alcançá-lo pelo menu, e para ver o que o morador vê era preciso
// gerar um link em Ocupações e abrir noutro navegador.
//
// ⚠️ A prévia é SOMENTE LEITURA, e isso não é limitação a contornar depois: o
// portal tem duas ações de escrita, e a aba Comunicação conta `leituras` por
// aviso. Sem o modo, só de abrir a prévia os avisos daquele morador seriam
// marcados como lidos — e o número que diz ao síndico se a comunicação chegou
// viraria ficção.
//
// NÃO administra nada: publicar aviso e documento segue na aba Comunicação,
// gerar e revogar link segue em Ocupações (onde a ocupação mora). Duas portas
// para o mesmo gesto é como nasce divergência.
import React from 'react';
import { Building2, Search, RefreshCw, Eye, Link as LinkIcon, AlertCircle } from 'lucide-react';
import {
    ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState,
} from '../ui/TableUtils';
import { KpiCard } from '../ui/KpiCard';
import ActionIconButton from '../ui/ActionIconButton';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import CondominoPortal from './CondominoPortal';
import { empreendimentoService } from '../../services/empreendimentoService';
import { unitOccupancyService } from '../../services/unitOccupancyService';
import {
    condominoAccessService, linkDoPortal, type AcessoCondomino,
} from '../../services/condominoPortalService';
import { useOrgContext } from '../../hooks/useOrgContext';
import type { Empreendimento } from '../../types/empreendimento';

const COLUMNS: ColumnConfig[] = [
    { key: 'unidade', label: 'Unidade', sortable: true },
    { key: 'pessoa', label: 'Pessoa', sortable: true },
    { key: 'papel', label: 'Papel', sortable: true },
    { key: 'estado', label: 'Acesso', sortable: true },
    { key: 'actions', label: 'Ações', sortable: false },
];

const ROLE_LABEL: Record<string, string> = {
    PROPRIETARIO: 'Proprietário', INQUILINO: 'Inquilino',
    MORADOR: 'Morador', RESPONSAVEL_FINANCEIRO: 'Responsável financeiro',
};

/** Mesma leitura de estado da aba Ocupações — revogado, expirado e sem acesso
 *  são coisas diferentes, e a diferença muda o que o síndico faz. */
function estadoDoPortal(a?: AcessoCondomino): { texto: string; cor: string; ativo: boolean } {
    if (!a) return { texto: 'Sem acesso', cor: 'text-gray-400', ativo: false };
    if (!a.is_active) return { texto: 'Revogado', cor: 'text-gray-500', ativo: false };
    const expira = new Date(a.expires_at);
    if (expira.getTime() < Date.now()) return { texto: 'Expirado', cor: 'text-amber-600', ativo: false };
    const dias = Math.ceil((expira.getTime() - Date.now()) / 86400000);
    return { texto: `Ativo · ${dias} dia${dias === 1 ? '' : 's'}`, cor: 'text-emerald-600', ativo: true };
}

interface Linha {
    key: string;
    unidade: string;
    pessoa: string;
    papel: string;
    acesso?: AcessoCondomino;
}

const PortalCondominoAdmin: React.FC = () => {
    // REGRA #5 — a org vem do contexto, nunca de prop. `null` = "Todas", e não
    // pode esconder a tela: o service só aplica `.eq()` quando há org.
    const { orgId } = useOrgContext();

    const [searchTerm, setSearchTerm] = usePersistedState<string>('portalCondomino:search', '');
    const [condominioId, setCondominioId] = usePersistedState<string>('portalCondomino:condominio', '');
    const tableColumns = useTableColumns(COLUMNS, 'portalCondominoColumns');
    const v = tableColumns.visibleColumns;

    const [condominios, setCondominios] = React.useState<Empreendimento[]>([]);
    const [linhas, setLinhas] = React.useState<Linha[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [erro, setErro] = React.useState<string | null>(null);
    const [previa, setPrevia] = React.useState<Linha | null>(null);
    const [notification, setNotification] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    // Condomínio é o empreendimento EM_OPERACAO — sem entidade nova (decisão da
    // F0). A lista é a mesma de Comercial › Condomínios.
    React.useEffect(() => {
        empreendimentoService.list(orgId ?? undefined)
            .then(es => setCondominios((es || []).filter(e => e.status === 'EM_OPERACAO')))
            .catch(() => setCondominios([]));
    }, [orgId]);

    const carregar = React.useCallback(async () => {
        if (!condominioId) { setLinhas([]); setLoading(false); return; }
        setLoading(true);
        setErro(null);
        try {
            const units = await empreendimentoService.listAllUnitsForEmpreendimento(condominioId);
            const labels = Object.fromEntries(units.map(u => [u.id, {
                unitName: u.name, towerName: u._tower_name, fracao: u.fracao_ideal_decimal ?? null,
            }]));
            const ocupacoes = await unitOccupancyService.listByEmpreendimento(
                units.map(u => u.id), labels, { incluirEncerradas: false });
            const acessos = await condominoAccessService.listByUnits(units.map(u => u.id));
            const porOcupacao = new Map(acessos.map(a => [a.occupancy_id, a]));

            setLinhas(ocupacoes.map(o => ({
                key: o.id,
                unidade: `${o._tower_name} · ${o._unit_name}`,
                pessoa: o._client_name,
                papel: ROLE_LABEL[o.role] || o.role,
                acesso: porOcupacao.get(o.id),
            })));
        } catch (e: any) {
            setErro(e?.message || 'Erro ao carregar os acessos.');
        } finally {
            setLoading(false);
        }
    }, [condominioId]);

    React.useEffect(() => { carregar(); }, [carregar]);

    const kpis = React.useMemo(() => {
        const ativos = linhas.filter(l => estadoDoPortal(l.acesso).ativo).length;
        return { total: linhas.length, ativos, sem: linhas.length - ativos };
    }, [linhas]);

    const filtradas = React.useMemo(() => {
        const t = searchTerm.trim().toLowerCase();
        const base = t
            ? linhas.filter(l => l.unidade.toLowerCase().includes(t) || l.pessoa.toLowerCase().includes(t))
            : linhas;
        const col = tableColumns.sortColumn;
        if (!col) return base;
        const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
        const chave = (l: Linha) => col === 'estado' ? estadoDoPortal(l.acesso).texto : (l as any)[col] ?? '';
        return [...base].sort((a, b) => String(chave(a)).localeCompare(String(chave(b)), 'pt-BR') * dir);
    }, [linhas, searchTerm, tableColumns.sortColumn, tableColumns.sortDirection]);

    const copiarLink = async (l: Linha) => {
        if (!l.acesso) return;
        const link = linkDoPortal(l.acesso.token);
        try {
            await navigator.clipboard.writeText(link);
            notify('Link copiado.');
        } catch {
            notify(`Link: ${link}`);
        }
    };

    const condominioNome = condominios.find(c => c.id === condominioId)?.name || '';

    return (
        <div className="space-y-6 pb-20">
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Portal do Condômino</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">
                    Veja o portal exatamente como o morador vê — sem gravar nada em nome dele.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
                <KpiCard label="OCUPAÇÕES VIGENTES" value={kpis.total} icon={<Building2 className="w-5 h-5" />} color="blue" />
                <KpiCard
                    label="COM ACESSO ATIVO" value={kpis.ativos}
                    icon={<Eye className="w-5 h-5" />} color={kpis.ativos > 0 ? 'emerald' : 'gray'}
                />
                <KpiCard
                    label="SEM ACESSO" value={kpis.sem}
                    sub={kpis.sem > 0 ? 'Gere o link na aba Ocupações' : undefined}
                    icon={<LinkIcon className="w-5 h-5" />} color={kpis.sem > 0 ? 'amber' : 'gray'}
                />
            </div>

            {/* §5.3 — escopo em barra própria: qual condomínio a tela está olhando. */}
            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-3 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                <select
                    value={condominioId}
                    onChange={e => setCondominioId(e.target.value)}
                    className="h-9 pl-3 pr-8 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
                >
                    <option value="">Selecione o condomínio</option>
                    {condominios.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
            </div>

            {erro && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-[10px] px-4 py-3 text-sm">{erro}</div>
            )}

            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-white">
                    <div className="flex flex-col md:flex-row gap-2.5 items-center">
                        <div className="flex-1 relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar por unidade ou pessoa..."
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
                        </div>
                    </div>
                </div>

                {!condominioId ? (
                    <div className="text-center py-12">
                        <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Escolha um condomínio</h3>
                        <p className="text-sm text-gray-500 max-w-md mx-auto">
                            A prévia é por ocupação — pessoa e unidade juntas. Cada morador vê só a
                            unidade dele, mesmo quando tem mais de uma.
                        </p>
                    </div>
                ) : loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="mt-2 text-gray-500">Carregando...</p>
                    </div>
                ) : filtradas.length === 0 ? (
                    <div className="text-center py-12">
                        <Eye className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">
                            {linhas.length === 0 ? 'Nenhuma ocupação vigente' : 'Nenhum resultado'}
                        </h3>
                        <p className="text-sm text-gray-500 max-w-md mx-auto">
                            {linhas.length === 0
                                ? 'Sem ocupação não há a quem dar acesso. Cadastre em Comercial › Condomínios › Ocupações.'
                                : 'Tente ajustar a busca.'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-auto max-h-[70vh]">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    {v.includes('unidade') && <SortableHeader colKey="unidade" label="Unidade" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />}
                                    {v.includes('pessoa') && <SortableHeader colKey="pessoa" label="Pessoa" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />}
                                    {v.includes('papel') && <SortableHeader colKey="papel" label="Papel" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />}
                                    {v.includes('estado') && <SortableHeader colKey="estado" label="Acesso" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />}
                                    {v.includes('actions') && (
                                        <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Ações</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filtradas.map(l => {
                                    const e = estadoDoPortal(l.acesso);
                                    return (
                                        <tr
                                            key={l.key}
                                            className={`transition-colors group ${e.ativo ? 'hover:bg-blue-50/50 cursor-pointer' : ''}`}
                                            onClick={e.ativo ? () => setPrevia(l) : undefined}
                                        >
                                            {v.includes('unidade') && <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">{l.unidade}</td>}
                                            {v.includes('pessoa') && <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">{l.pessoa}</td>}
                                            {v.includes('papel') && <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{l.papel}</td>}
                                            {v.includes('estado') && (
                                                <td className={`px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal whitespace-nowrap ${e.cor}`}>
                                                    {e.texto}
                                                </td>
                                            )}
                                            {v.includes('actions') && (
                                                <td className="px-6 py-2.5 text-right">
                                                    <div className="flex items-center justify-end gap-1.5" onClick={ev => ev.stopPropagation()}>
                                                        {e.ativo ? (
                                                            <>
                                                                <button
                                                                    onClick={() => setPrevia(l)}
                                                                    className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all whitespace-nowrap"
                                                                >
                                                                    Ver como o morador
                                                                </button>
                                                                <ActionIconButton
                                                                    kind="share"
                                                                    title="Copiar o link do portal"
                                                                    icon={<LinkIcon className="w-4 h-4" />}
                                                                    onClick={() => copiarLink(l)}
                                                                />
                                                            </>
                                                        ) : (
                                                            /* Sem acesso, a linha FICA — sumir esconderia a lacuna,
                                                               que é justamente a informação útil aqui. E o caminho
                                                               é dito, não subentendido. */
                                                            <span className="text-xs text-gray-400 whitespace-nowrap">
                                                                Gere o link em Ocupações
                                                            </span>
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

            {/* A prévia reusa o COMPONENTE do portal, não uma cópia: o objetivo é
                mostrar o que o morador vê, e uma segunda implementação divergiria
                no primeiro ajuste. `somenteLeitura` é o único desvio. */}
            <Sheet open={!!previa} onClose={() => setPrevia(null)} size="full">
                <SheetHeader onClose={() => setPrevia(null)}>
                    <SheetTitle>Como {previa?.pessoa} vê o portal</SheetTitle>
                    <SheetDescription>{condominioNome} · {previa?.unidade}</SheetDescription>
                </SheetHeader>
                <SheetPanel className="p-0">
                    {previa?.acesso && (
                        <CondominoPortal token={previa.acesso.token} somenteLeitura />
                    )}
                </SheetPanel>
                <SheetFooter>
                    <button onClick={() => setPrevia(null)} className="h-9 px-3.5 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all">Fechar</button>
                </SheetFooter>
            </Sheet>

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

export default PortalCondominoAdmin;
