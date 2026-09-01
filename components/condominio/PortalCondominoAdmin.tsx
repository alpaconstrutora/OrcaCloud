// components/condominio/PortalCondominoAdmin.tsx
// Portais › Portal do Condômino — a visão INTERNA do que o morador vê.
// Plano: docs/planos/2026-08-31-portal-condomino-visao-interna.md
//
// POR QUE ESTA TELA EXISTE: o portal do condômino é rota por CAMINHO
// (`/portal-condomino?token=`), resolvida em App.tsx antes de o <Layout> montar.
// Não havia como alcançá-lo pelo menu, e para ver o que o morador vê era preciso
// gerar um link em Ocupações e abrir noutro navegador.
//
// LISTA → DETALHE, não seletor. É o padrão dos outros portais — `InvestorModule`
// faz `InvestorList` → `InvestorDashboard` com barra de voltar — e o da própria
// lista de Condomínios em Comercial. O dropdown que existia aqui obrigava a
// escolher antes de ver qualquer coisa, e a primeira tela não dizia nada.
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
import {
    Building2, Search, RefreshCw, Eye, Link as LinkIcon, AlertCircle, ArrowLeft,
} from 'lucide-react';
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
import { useStore } from '../../store/useStore';
import type { Empreendimento } from '../../types/empreendimento';

const COLUNAS_LISTA: ColumnConfig[] = [
    { key: 'code', label: 'Código', sortable: true },
    { key: 'name', label: 'Condomínio', sortable: true },
    { key: 'cidade', label: 'Cidade', sortable: true },
    { key: 'actions', label: 'Ações', sortable: false },
];

const COLUNAS_ACESSOS: ColumnConfig[] = [
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

    const [aberto, setAberto] = React.useState<Empreendimento | null>(null);
    const [condominios, setCondominios] = React.useState<Empreendimento[]>([]);
    const [carregandoLista, setCarregandoLista] = React.useState(true);
    const [notification, setNotification] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    // Condomínio é o empreendimento EM_OPERACAO — sem entidade nova (decisão da
    // F0). A lista é a mesma de Comercial › Condomínios.
    React.useEffect(() => {
        setCarregandoLista(true);
        empreendimentoService.list(orgId ?? undefined)
            .then(es => setCondominios((es || []).filter(e => e.status === 'EM_OPERACAO')))
            .catch(() => setCondominios([]))
            .finally(() => setCarregandoLista(false));
    }, [orgId]);

    const toast = notification && (
        <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
            notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
            <AlertCircle className="w-4 h-4 shrink-0" />
            {notification.message}
        </div>
    );

    if (aberto) {
        return (
            <>
                <AcessosDoCondominio condominio={aberto} onBack={() => setAberto(null)} notify={notify} />
                {toast}
            </>
        );
    }

    return (
        <>
            <ListaCondominios condominios={condominios} loading={carregandoLista} onAbrir={setAberto} />
            {toast}
        </>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// Primeira tela: os condomínios. Clicar abre os acessos daquele prédio.
// ═══════════════════════════════════════════════════════════════════════════
const ListaCondominios: React.FC<{
    condominios: Empreendimento[];
    loading: boolean;
    onAbrir: (e: Empreendimento) => void;
}> = ({ condominios, loading, onAbrir }) => {
    const [searchTerm, setSearchTerm] = usePersistedState<string>('portalCondomino:buscaLista', '');
    const tableColumns = useTableColumns(COLUNAS_LISTA, 'portalCondominoListaColumns');
    const v = tableColumns.visibleColumns;

    const filtrados = React.useMemo(() => {
        const t = searchTerm.trim().toLowerCase();
        const base = t
            ? condominios.filter(c => (c.name || '').toLowerCase().includes(t)
                || (c.code || '').toLowerCase().includes(t)
                || (c.endereco_city || '').toLowerCase().includes(t))
            : condominios;
        const col = tableColumns.sortColumn;
        if (!col) return base;
        const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
        // Mapa explícito em vez de indexar o tipo: `cidade` é rótulo de coluna,
        // a coluna do banco é `endereco_city` — e um cast genérico esconderia
        // justamente esse descasamento.
        const chave = (e: Empreendimento): string => {
            switch (col) {
                case 'code': return e.code || '';
                case 'name': return e.name || '';
                case 'cidade': return e.endereco_city || '';
                default: return '';
            }
        };
        return [...base].sort((a, b) => chave(a).localeCompare(chave(b), 'pt-BR') * dir);
    }, [condominios, searchTerm, tableColumns.sortColumn, tableColumns.sortDirection]);

    return (
        <div className="space-y-6 pb-20">
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Portal do Condômino</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">
                    Veja o portal exatamente como o morador vê — sem gravar nada em nome dele.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                <KpiCard label="CONDOMÍNIOS EM OPERAÇÃO" value={condominios.length} icon={<Building2 className="w-5 h-5" />} color="teal" />
                <KpiCard
                    label="COMO O CONDÔMINO ENTRA" value="Link com token"
                    sub="Sem login e sem senha — o link vale 90 dias"
                    icon={<LinkIcon className="w-5 h-5" />} color="gray"
                />
            </div>

            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-white">
                    <div className="flex flex-col md:flex-row gap-2.5 items-center">
                        <div className="flex-1 relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar por condomínio, código ou cidade..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                            />
                        </div>
                        <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0"></div>
                        <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                            <ColumnConfigButton
                                columns={COLUNAS_LISTA.filter(c => c.key !== 'actions')}
                                visibleColumns={tableColumns.visibleColumns}
                                showColumnConfig={tableColumns.showColumnConfig}
                                onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                                onToggleColumn={tableColumns.toggleColumn}
                                onReset={tableColumns.resetColumns}
                            />
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="mt-2 text-gray-500">Carregando...</p>
                    </div>
                ) : filtrados.length === 0 ? (
                    <div className="text-center py-12">
                        <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">
                            {condominios.length === 0 ? 'Nenhum condomínio em operação' : 'Nenhum resultado'}
                        </h3>
                        <p className="text-sm text-gray-500 max-w-md mx-auto">
                            {condominios.length === 0
                                ? 'Um condomínio é o empreendimento em operação. Traga um em Comercial › Condomínios.'
                                : 'Tente ajustar a busca.'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-auto max-h-[70vh]">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    {v.includes('code') && <SortableHeader colKey="code" label="Código" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />}
                                    {v.includes('name') && <SortableHeader colKey="name" label="Condomínio" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />}
                                    {v.includes('cidade') && <SortableHeader colKey="cidade" label="Cidade" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />}
                                    {v.includes('actions') && (
                                        <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Ações</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filtrados.map(c => (
                                    <tr
                                        key={c.id}
                                        className="hover:bg-blue-50/50 transition-colors cursor-pointer group"
                                        onClick={() => onAbrir(c)}
                                    >
                                        {v.includes('code') && <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{c.code || '—'}</td>}
                                        {v.includes('name') && <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">{c.name}</td>}
                                        {v.includes('cidade') && <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{c.endereco_city || '—'}</td>}
                                        {v.includes('actions') && (
                                            <td className="px-6 py-2.5 text-right">
                                                <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                                                    <button
                                                        onClick={() => onAbrir(c)}
                                                        className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all whitespace-nowrap"
                                                    >
                                                        Ver acessos
                                                    </button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// Segunda tela: os acessos de UM condomínio, e a prévia.
// ═══════════════════════════════════════════════════════════════════════════
const AcessosDoCondominio: React.FC<{
    condominio: Empreendimento;
    onBack: () => void;
    notify: (m: string, t?: 'success' | 'error') => void;
}> = ({ condominio, onBack, notify }) => {
    const [searchTerm, setSearchTerm] = usePersistedState<string>('portalCondomino:search', '');
    const tableColumns = useTableColumns(COLUNAS_ACESSOS, 'portalCondominoColumns');
    const v = tableColumns.visibleColumns;

    const [linhas, setLinhas] = React.useState<Linha[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [erro, setErro] = React.useState<string | null>(null);
    const [previa, setPrevia] = React.useState<Linha | null>(null);

    // Gerar acesso continua morando em Ocupações — esta tela não duplica o
    // gesto (ver cabeçalho). O que ela pode fazer é LEVAR até lá, já com o
    // condomínio aberto na aba certa, em vez de mandar o usuário procurar.
    // Usa o deep-link que o app já tem (`viewFocus`), não uma rota nova.
    const navigateToFocus = useStore(s => s.navigateToFocus);
    const irParaOcupacoes = () =>
        navigateToFocus('condominios', condominio.id, 'CONDOMINIO_OCUPACOES');

    const carregar = React.useCallback(async () => {
        setLoading(true);
        setErro(null);
        try {
            const units = await empreendimentoService.listAllUnitsForEmpreendimento(condominio.id);
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
    }, [condominio.id]);

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
        const chave = (l: Linha): string => {
            switch (col) {
                case 'estado': return estadoDoPortal(l.acesso).texto;
                case 'unidade': return l.unidade;
                case 'pessoa': return l.pessoa;
                case 'papel': return l.papel;
                default: return '';
            }
        };
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

    return (
        <div className="space-y-6 pb-20">
            {/* §23 — 1 salto de profundidade: "Voltar", não migalha de pão. A
                IDENTIDADE (qual condomínio) desce para o subtítulo, como em
                CondominioDetail: saber "acessos" sem saber "de qual prédio" é
                pior que o problema original. */}
            <div>
                <button
                    type="button"
                    onClick={onBack}
                    className="flex items-center gap-1.5 h-8 px-2.5 -ml-2.5 rounded-[6px] text-sm font-medium text-gray-500 hover:bg-gray-100 transition-all mb-3"
                >
                    <ArrowLeft className="w-4 h-4" /> Voltar
                </button>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Acessos ao portal</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">
                    {condominio.name} · quem já tem link, e como cada um vê o portal
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
                                columns={COLUNAS_ACESSOS.filter(c => c.key !== 'actions')}
                                visibleColumns={tableColumns.visibleColumns}
                                showColumnConfig={tableColumns.showColumnConfig}
                                onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                                onToggleColumn={tableColumns.toggleColumn}
                                onReset={tableColumns.resetColumns}
                            />
                        </div>
                    </div>
                </div>

                {loading ? (
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
                                                               que é justamente a informação útil aqui.
                                                               E o caminho é ANDADO, não só dito: como texto
                                                               cinza isto parecia um botão desabilitado, que é
                                                               a pior das duas coisas — nem informa nem leva. */
                                                            <button
                                                                onClick={() => irParaOcupacoes()}
                                                                className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all whitespace-nowrap"
                                                            >
                                                                Gerar link em Ocupações
                                                            </button>
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
                    <SheetDescription>{condominio.name} · {previa?.unidade}</SheetDescription>
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
        </div>
    );
};

export default PortalCondominoAdmin;
