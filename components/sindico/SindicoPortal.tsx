import React from 'react';
import {
    AlertTriangle, Building, CalendarClock, CheckCircle2, ChevronDown, ClipboardList, FileText, Home,
    Loader2, LogOut, Megaphone, Package, ShieldCheck, Wallet, Wrench,
} from 'lucide-react';
import {
    KpiStrip, PortalCard, CardHeader, DetailField, fmtBRLCents, fmtDate, type KpiItem,
} from '../portal/PortalKit';
import {
    PainelDocumentos, PainelEquipamentos, PainelManutencao, competencia,
} from '../client/CondominioTab';
import { usePersistedState } from '../ui/TableUtils';
import PainelUnidadesDoPredio from './PainelUnidadesDoPredio';
import PainelAvisosDoSindico from './PainelAvisosDoSindico';
import PainelChamadosDoSindico from './PainelChamadosDoSindico';
import PainelFinanceiroDoSindico from './PainelFinanceiroDoSindico';
import { useSindicoPortal } from './useSindicoPortal';
import { sindicoPortalService, type IdentidadeDoSindico, type PortalSindico } from '../../services/sindicoPortalService';
import {
    SINDICO_PORTAL_TAB_IDS, SINDICO_PORTAL_TAB_LABELS, resolverAbaDoSindico, type SindicoPortalTabId,
} from '../../utils/sindicoPortalTabs';
import { inadimplenciaDoPredio } from '../../utils/situacaoDaCota';
import { hojeEmBrasilia } from '../../utils/mandatoSindico';

/**
 * Portal do Síndico — /portal-sindico (link com token ou login por e-mail, que
 * entrega o mesmo token) e, em Portais › Portal do Condomínio, a administradora
 * abrindo o mesmo portal por clientId. Pedido de 25/10/2026: "nao faz o menor
 * sentido bloquear o portal do condominio na visão do app. Deve ter a mesma
 * funcionalidade da visão do sindico." — ela grava tudo o que o síndico grava
 * (o banco registra quem foi); só aprovar/devolver rateio fica com ele.
 *
 * Pedido de 20/10/2026: "Vamos implementar portal do sindico em [portais >
 * portal do condominio". Plano: docs/planos/2026-10-20-portal-do-sindico.md
 *
 * Casca própria, FORA do <Layout> (molde: components/training/TrainingPortal.tsx):
 * o síndico não é membro da organização. Tudo vem da RPC `sindico_portal_dados`,
 * que recorta pelos prédios onde ele é síndico com mandato vigente — trocar o
 * síndico na Ficha derruba este acesso sozinho, sem ninguém revogar.
 *
 * Os painéis de Avisos, Documentos, Prestação de contas, Manutenção e
 * Equipamentos são os MESMOS da aba Condomínio do Portal do Cliente (o payload
 * tem o mesmo formato); o que só o síndico vê entra por prop opcional.
 *
 * Financeiro (24/10/2026, docs/planos/2026-10-24-portal-sindico-financeiro.md):
 * o caixa do condomínio — resumo do mês, contas a pagar (lançar, pagar, editar,
 * cancelar, com login), contas a receber e a prestação de contas de antes.
 * Identidade: sky (o cartão do LoginGateway); conteúdo no PortalKit (§24).
 */

interface Props {
    token?: string;
    clientId?: string;
    /** A administradora pelo app (por clientId): opera, com uma faixa dizendo isso. */
    comoAdministradora?: boolean;
    /** Só no login por e-mail ("Sair" no menu de conta). Pelo link não há sessão. */
    onLogout?: () => void;
    /** Dentro de outra tela (app): altura do contêiner, não da janela. */
    embutido?: boolean;
}

const TAB_ICONS: Record<SindicoPortalTabId, React.ComponentType<{ className?: string }>> = {
    visao: Home,
    unidades: Building,
    chamados: ClipboardList,
    financeiro: Wallet,
    avisos: Megaphone,
    documentos: FileText,
    manutencao: Wrench,
    equipamentos: Package,
};

const iniciaisDe = (nome: string | undefined) =>
    (nome || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('') || '?';

const SindicoPortal: React.FC<Props> = ({ token, clientId, comoAdministradora = false, onLogout, embutido = false }) => {
    const identidade = React.useMemo<IdentidadeDoSindico>(
        () => (token ? { token } : { clientId: clientId ?? '' }), [token, clientId]);
    const { dados, carregando, erro, recarregar } = useSindicoPortal(identidade);
    const [toast, setToast] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const notify = React.useCallback((message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4500);
    }, []);
    const [abaSalva, setAba] = usePersistedState<string>('sindicoPortal:aba', 'visao');
    const aba = resolverAbaDoSindico(abaSalva);
    const [menuConta, setMenuConta] = React.useState(false);
    const menuRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (!menuConta) return;
        const fechar = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuConta(false);
        };
        document.addEventListener('mousedown', fechar);
        return () => document.removeEventListener('mousedown', fechar);
    }, [menuConta]);

    const multi = (dados?.condominios.length ?? 0) > 1;
    const titulo = !dados ? '' : multi ? `${dados.condominios.length} condomínios` : (dados.condominios[0]?.nome ?? '');

    const resolverDocumento = React.useCallback(
        (documentoId: string) => sindicoPortalService.abrirDocumento(identidade, documentoId), [identidade]);
    const resolverComprovantes = React.useCallback(
        (rateioId: string) => sindicoPortalService.comprovantesDoRateio(identidade, rateioId), [identidade]);

    return (
        <div className={`flex flex-col ${embutido ? 'h-full' : 'h-screen'} bg-white overflow-hidden font-sans`}>
            <header className="h-16 border-b border-gray-100 bg-white flex items-center justify-between px-4 md:px-6 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="flex items-center gap-2 px-2.5 py-1 bg-sky-600 text-white rounded-lg text-xs font-black uppercase tracking-wider shrink-0">
                        <Building className="w-4 h-4" />
                        <span className="hidden sm:inline">Portal do Síndico</span>
                        <span className="sm:hidden">Síndico</span>
                    </div>
                    <h1 className="text-base font-bold text-gray-900 tracking-tight truncate">{titulo}</h1>
                </div>
                {dados?.sindico && (
                    <div className="relative" ref={menuRef}>
                        <button
                            type="button"
                            onClick={() => setMenuConta(o => !o)}
                            className="flex items-center gap-2 text-sm bg-gray-50 hover:bg-gray-100 px-2 md:px-3 py-1.5 rounded-full border border-gray-200 transition-colors"
                            aria-haspopup="menu"
                            aria-expanded={menuConta}
                        >
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-600 text-xs font-bold text-white">{iniciaisDe(dados.sindico.nome)}</span>
                            <span className="hidden md:inline font-semibold text-gray-600 max-w-[200px] truncate">{dados.sindico.nome}</span>
                            <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${menuConta ? 'rotate-180' : ''}`} />
                        </button>
                        {menuConta && (
                            <div className="absolute right-0 top-full z-[1000] mt-2 w-[280px] overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl" role="menu">
                                <div className="border-b border-gray-100 px-4 py-3">
                                    <div className="truncate text-sm font-bold text-gray-900">{dados.sindico.nome}</div>
                                    <div className="truncate text-xs text-gray-500">{dados.sindico.email || '—'}</div>
                                    <div className="text-xs text-gray-400 mt-1">Síndico</div>
                                </div>
                                {onLogout && (
                                    <div className="p-2">
                                        <button
                                            type="button"
                                            onClick={() => { setMenuConta(false); onLogout(); }}
                                            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                                            role="menuitem"
                                        >
                                            <LogOut className="h-4 w-4" />
                                            <span className="flex-1">Sair</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </header>

            {comoAdministradora && (
                <div className="flex items-start gap-2 px-4 md:px-6 py-2 bg-sky-50 border-b border-sky-100 text-sm text-sky-800 shrink-0">
                    <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>Você está no portal do síndico como administradora: o que gravar aqui vale e fica registrado com o seu nome. Aprovar ou devolver rateio continua com o síndico.</span>
                </div>
            )}

            <div className="flex flex-1 overflow-hidden">
                <aside className="hidden md:flex w-64 border-r border-gray-100 bg-gray-50 p-4 flex-col gap-1.5 shrink-0">
                    {SINDICO_PORTAL_TAB_IDS.map(id => {
                        const Icon = TAB_ICONS[id];
                        const ativa = aba === id;
                        return (
                            <button
                                key={id}
                                type="button"
                                onClick={() => setAba(id)}
                                className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150
                                    ${ativa ? 'bg-sky-50 border border-sky-100 text-sky-800 font-semibold' : 'text-gray-500 hover:text-gray-900 hover:bg-white'}`}
                            >
                                <Icon className="w-4 h-4" />
                                <span>{SINDICO_PORTAL_TAB_LABELS[id]}</span>
                            </button>
                        );
                    })}
                </aside>

                {/* Fora do <main> do <Layout>: gutter §20.2 reaplicado aqui. */}
                <main className={`flex-1 bg-[#F2F2F4] overflow-y-auto p-4 md:p-6 ${embutido ? '' : 'pb-24'} md:pb-6 relative`}>
                    {carregando ? (
                        <div className="min-h-[300px] flex items-center justify-center">
                            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                        </div>
                    ) : erro || !dados ? (
                        <div className="min-h-[400px] flex items-center justify-center">
                            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 max-w-md text-center">
                                <AlertTriangle className="w-9 h-9 text-amber-500 mx-auto mb-4" />
                                <h3 className="text-base font-semibold text-gray-900 mb-1.5">Acesso não disponível</h3>
                                <p className="text-sm text-gray-500 leading-relaxed">{erro || 'Não foi possível carregar o portal.'}</p>
                            </div>
                        </div>
                    ) : (
                        <div className="max-w-6xl mx-auto space-y-6">
                            {aba === 'visao' && <PainelVisaoGeral dados={dados} onIr={setAba} />}
                            {aba === 'unidades' && (
                                <PainelUnidadesDoPredio condominios={dados.condominios} unidades={dados.unidades} rateios={dados.rateios} />
                            )}
                            {aba === 'chamados' && (
                                <PainelChamadosDoSindico identidade={identidade} chamados={dados.chamados ?? []} multi={multi}
                                    onAlterado={recarregar} notify={notify} />
                            )}
                            {aba === 'avisos' && (
                                <PainelAvisosDoSindico identidade={identidade} avisos={dados.avisos} condominios={dados.condominios}
                                    onAlterado={recarregar} notify={notify} />
                            )}
                            {aba === 'financeiro' && (
                                // Operar exige LOGIN (`onLogout` só existe na entrada por e-mail e senha)
                                // ou a administradora pelo app; decidir rateio é só do síndico.
                                <PainelFinanceiroDoSindico identidade={identidade} dados={dados} comoAdministradora={comoAdministradora}
                                    logado={!!onLogout || comoAdministradora} notify={notify} onAlteradoPortal={recarregar}
                                    resolverComprovantes={resolverComprovantes} />
                            )}
                            {(aba === 'documentos' || aba === 'manutencao' || aba === 'equipamentos') && (
                                <PortalCard className="p-4 md:p-6">
                                    {aba === 'documentos' && (
                                        <PainelDocumentos documentos={dados.documentos} multi={multi} onResolverDocumento={resolverDocumento} marcarInternos />
                                    )}
                                    {aba === 'manutencao' && (
                                        <PainelManutencao manutencao={dados.manutencao} ordens={dados.ordens} multi={multi} mostrarCusto />
                                    )}
                                    {aba === 'equipamentos' && <PainelEquipamentos ativos={dados.ativos} multi={multi} />}
                                </PortalCard>
                            )}
                        </div>
                    )}
                </main>
            </div>

            {/* Barra inferior no celular. `z-40`, ABAIXO dos painéis laterais
                (Sheet = z-50): no mesmo z-50 ela vinha depois no DOM e cobria o
                rodapé do painel — "Salvar" sumia no celular (print de 24/10).
                Embutida no app ela fica no pé do quadro, não da janela: sem ela
                a administradora no celular não saía da Visão geral (25/10). */}
            <div className={`md:hidden ${embutido ? 'shrink-0' : 'fixed bottom-0 left-0 right-0 z-40'} bg-white border-t border-gray-100 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] overflow-x-auto`}>
                <div className="flex min-w-max">
                    {SINDICO_PORTAL_TAB_IDS.map(id => {
                        const Icon = TAB_ICONS[id];
                        const ativa = aba === id;
                        return (
                            <button
                                key={id}
                                type="button"
                                onClick={() => setAba(id)}
                                className={`flex flex-col items-center justify-center gap-1 min-w-[72px] py-3 px-2 relative ${ativa ? 'text-sky-700' : 'text-gray-400'}`}
                            >
                                {ativa && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-sky-600 rounded-full" />}
                                <Icon className="w-4 h-4" />
                                <span className="text-[10px] font-medium leading-none whitespace-nowrap">{SINDICO_PORTAL_TAB_LABELS[id]}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {toast && (
                // No TOPO: embaixo ele cobria o botão principal do painel lateral
                // aberto em seguida (Financeiro, 24/10/2026).
                <div className={`fixed top-20 right-4 md:right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium ${
                    toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                    {toast.message}
                </div>
            )}
        </div>
    );
};

// ── Visão geral ─────────────────────────────────────────────────────────────
const PainelVisaoGeral: React.FC<{ dados: PortalSindico; onIr: (aba: SindicoPortalTabId) => void }> = ({ dados, onIr }) => {
    const hoje = hojeEmBrasilia();
    const ocupadas = dados.unidades.filter(u => u.ocupacoes.length > 0).length;
    const atraso = inadimplenciaDoPredio(dados.rateios, hoje);
    const avisosVigentes = dados.avisos.filter(a => a.vigente).length;
    const chamadosAbertos = (dados.chamados ?? []).filter(c => c.status !== 'Resolvido' && c.status !== 'Cancelado').length;
    const ultimo = [...dados.rateios].filter(r => r.status === 'FECHADO').sort((a, b) => b.competencia.localeCompare(a.competencia))[0];

    const kpis: KpiItem[] = [
        { label: 'Unidades', value: String(dados.unidades.length), hint: `${ocupadas} com ocupante`, onClick: () => onIr('unidades') },
        { label: 'Em atraso', value: fmtBRLCents(atraso.valor), hint: atraso.unidades === 0 ? 'Nenhuma unidade' : `${atraso.unidades} ${atraso.unidades === 1 ? 'unidade' : 'unidades'}`, onClick: () => onIr('unidades') },
        { label: 'Chamados em aberto', value: String(chamadosAbertos), onClick: () => onIr('chamados') },
        { label: 'Último rateio fechado', value: ultimo ? fmtBRLCents(Number(ultimo.totalRateado) || 0) : '—', hint: ultimo ? competencia(ultimo.competencia) : 'Nenhum fechado', onClick: () => onIr('financeiro') },
        { label: 'Avisos vigentes', value: String(avisosVigentes), onClick: () => onIr('avisos') },
    ];

    return (
        <>
            <KpiStrip items={kpis} />
            {dados.condominios.map(c => (
                <PortalCard key={c.id}>
                    <CardHeader title={c.nome} subtitle={c.codigo ? `Código ${c.codigo}` : undefined} />
                    <div className="px-5 pb-4 grid md:grid-cols-2 gap-x-10">
                        <div>
                            <DetailField label="Razão social">{c.razaoSocial || '—'}</DetailField>
                            <DetailField label="CNPJ">{c.cnpj || '—'}</DetailField>
                            <DetailField label="Cidade">{c.cidade || '—'}</DetailField>
                        </div>
                        <div>
                            <DetailField label="Seu mandato">
                                {c.mandatoInicio || c.mandatoFim
                                    ? `${c.mandatoInicio ? fmtDate(c.mandatoInicio) : 'sem início'} a ${c.mandatoFim ? fmtDate(c.mandatoFim) : 'sem prazo'}`
                                    : 'Sem prazo definido'}
                            </DetailField>
                            <DetailField label="Unidades">{dados.unidades.filter(u => u.condominioId === c.id).length}</DetailField>
                        </div>
                    </div>
                </PortalCard>
            ))}
            <div className="grid md:grid-cols-2 gap-6">
                <PortalCard>
                    <CardHeader title="Avisos recentes" right={<Megaphone className="w-4 h-4 text-gray-300" />} />
                    <ul className="px-5 pb-4 space-y-2">
                        {dados.avisos.slice(0, 4).map(a => (
                            <li key={a.id} className="text-sm">
                                <span className="text-[#1F2430]">{a.titulo}</span>
                                <span className="block text-xs text-gray-400">
                                    {a.publicadoEm ? fmtDate(a.publicadoEm) : ''}{a.vigente ? '' : ' · encerrado'} · {a.leituras} {a.leituras === 1 ? 'leitura' : 'leituras'}
                                </span>
                            </li>
                        ))}
                        {dados.avisos.length === 0 && <li className="text-sm text-gray-400">Nenhum aviso publicado.</li>}
                    </ul>
                </PortalCard>
                <PortalCard>
                    <CardHeader title="Próximas manutenções" right={<CalendarClock className="w-4 h-4 text-gray-300" />} />
                    <ul className="px-5 pb-4 space-y-2">
                        {dados.manutencao.filter(m => m.proximoVencimento).slice(0, 4).map(m => (
                            <li key={m.id} className="text-sm flex items-start justify-between gap-3">
                                <span className="text-[#1F2430]">{m.descricao}</span>
                                <span className="text-xs text-gray-500 whitespace-nowrap">{fmtDate(m.proximoVencimento)}</span>
                            </li>
                        ))}
                        {!dados.manutencao.some(m => m.proximoVencimento) && <li className="text-sm text-gray-400">Nenhuma manutenção programada.</li>}
                    </ul>
                </PortalCard>
            </div>
        </>
    );
};

export default SindicoPortal;
