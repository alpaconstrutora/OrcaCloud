import React, { useEffect, useMemo, useState } from 'react';
import { Trophy, TrendingUp, TrendingDown, Minus, Loader2, Info } from 'lucide-react';
import { brokerService } from '../../services/brokerService';
import { brokerPortalService } from '../../services/brokerPortalService';

/**
 * Ranking do Portal do Corretor — dado REAL desde 17/10/2026 (antes era um
 * gerador fixo no componente). Plano: docs/planos/2026-10-17-portal-corretor-pendencias.md (F2).
 *
 * Decisão do usuário (P3): o corretor vê SÓ a própria posição ("3º de 12"), as
 * próprias vendas, volume e propostas, e as vendas do 1º colocado como meta — sem
 * nomes nem números de colegas. O gestor (visão interna) vê a lista completa.
 *
 * Fonte: propostas APROVADAS no período (fn_broker_portal_get_ranking pelo token;
 * fn_broker_ranking_da_organizacao para o gestor). Sem token (prévia do gestor /
 * impersonação), a visão do corretor sai da lista do gestor filtrada pelo e-mail.
 */

type Periodo = 'MES' | 'TRIMESTRE' | 'ANO';

interface BrokerRankingProps {
    brokerEmail: string;
    portalToken?: string;
    organizationId?: string;
    /** 'gestor' = lista completa (visão interna do admin); 'corretor' = só a própria posição. */
    visao?: 'corretor' | 'gestor';
    compacto?: boolean;
}

interface MinhaPosicao {
    posicao: number | null;
    posicao_anterior: number | null;
    total_corretores: number;
    com_venda: number;
    vendas: number;
    volume: number;
    enviadas: number;
    vendas_do_lider: number;
}

interface LinhaRanking {
    email: string;
    nome: string | null;
    vendas: number;
    volume: number;
    enviadas: number;
    posicao: number | null;
    posicao_anterior: number | null;
}

const PERIODOS: { id: Periodo; label: string }[] = [
    { id: 'MES', label: 'Mês' },
    { id: 'TRIMESTRE', label: 'Trimestre' },
    { id: 'ANO', label: 'Ano' },
];

const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(Number(v) || 0);

/** Visão do corretor a partir da lista completa (prévia do gestor, sem token). */
export const minhaPosicaoDaLista = (lista: LinhaRanking[], email: string): MinhaPosicao => {
    const eu = lista.find(l => l.email === (email || '').toLowerCase());
    return {
        posicao: eu?.posicao ?? null,
        posicao_anterior: eu?.posicao_anterior ?? null,
        total_corretores: Math.max(lista.length, eu ? lista.length : lista.length + 1),
        com_venda: lista.filter(l => Number(l.vendas) > 0).length,
        vendas: Number(eu?.vendas) || 0,
        volume: Number(eu?.volume) || 0,
        enviadas: Number(eu?.enviadas) || 0,
        vendas_do_lider: lista.reduce((m, l) => Math.max(m, Number(l.vendas) || 0), 0),
    };
};

const Tendencia: React.FC<{ atual: number | null; anterior: number | null; claro?: boolean }> = ({ atual, anterior, claro }) => {
    if (!atual || !anterior) return null;
    const diff = anterior - atual;
    if (diff > 0) return <span className={`inline-flex items-center gap-1 text-xs font-semibold ${claro ? 'text-emerald-300' : 'text-emerald-600'}`}><TrendingUp className="w-3.5 h-3.5" />subiu {diff}</span>;
    if (diff < 0) return <span className={`inline-flex items-center gap-1 text-xs font-semibold ${claro ? 'text-rose-300' : 'text-rose-600'}`}><TrendingDown className="w-3.5 h-3.5" />caiu {-diff}</span>;
    return <span className={`inline-flex items-center gap-1 text-xs ${claro ? 'text-indigo-200' : 'text-gray-400'}`}><Minus className="w-3.5 h-3.5" />manteve</span>;
};

const BrokerRanking: React.FC<BrokerRankingProps> = ({ brokerEmail, portalToken, organizationId, visao = 'corretor', compacto = false }) => {
    const [periodo, setPeriodo] = useState<Periodo>('MES');
    const [minha, setMinha] = useState<MinhaPosicao | null>(null);
    const [lista, setLista] = useState<LinhaRanking[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);

    useEffect(() => {
        let cancelado = false;
        (async () => {
            setCarregando(true);
            setErro(null);
            try {
                if (portalToken) {
                    const r = await brokerPortalService.getRankingByToken(portalToken, periodo);
                    if (!cancelado) { setMinha(r); setLista([]); }
                } else if (organizationId) {
                    const l = await brokerService.rankingDaOrganizacao(organizationId, periodo);
                    if (!cancelado) { setLista(l); setMinha(minhaPosicaoDaLista(l, brokerEmail)); }
                } else if (!cancelado) {
                    setMinha(null); setLista([]);
                }
            } catch (e) {
                console.error('[BrokerRanking]', e);
                if (!cancelado) setErro('Não foi possível carregar o ranking agora.');
            } finally {
                if (!cancelado) setCarregando(false);
            }
        })();
        return () => { cancelado = true; };
    }, [portalToken, organizationId, brokerEmail, periodo]);

    const lider = minha?.vendas_do_lider ?? 0;
    const pctMeta = useMemo(() => (lider > 0 ? Math.min(100, ((minha?.vendas ?? 0) / lider) * 100) : 0), [minha, lider]);

    const seletor = (
        <div className="flex bg-gray-100 rounded-xl p-1" role="group" aria-label="Período do ranking">
            {PERIODOS.map(p => (
                <button
                    key={p.id}
                    type="button"
                    onClick={() => setPeriodo(p.id)}
                    aria-pressed={periodo === p.id}
                    className={`${compacto ? 'flex-1' : ''} px-4 h-8 rounded-lg text-sm font-medium transition-all ${periodo === p.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}
                >
                    {p.label}
                </button>
            ))}
        </div>
    );

    if (carregando) {
        return (
            <div className="space-y-4">
                {seletor}
                <div className="py-16 text-center"><Loader2 className="w-7 h-7 animate-spin text-indigo-600 mx-auto" /></div>
            </div>
        );
    }

    if (erro) {
        return (
            <div className="space-y-4">
                {seletor}
                <p className="text-sm text-gray-500 bg-white rounded-2xl border border-gray-100 p-6 text-center">{erro}</p>
            </div>
        );
    }

    // ── Gestor: ranking completo ────────────────────────────────────────────
    if (visao === 'gestor' && !portalToken) {
        return (
            <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-bold text-gray-900">Ranking dos corretores</h3>
                    {seletor}
                </div>
                <p className="text-xs text-gray-500 flex items-start gap-1.5">
                    <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
                    Conta as propostas aprovadas no período. Cada corretor vê só a própria posição, sem nomes de colegas.
                </p>
                {lista.length === 0 ? (
                    <p className="text-sm text-gray-500 bg-white rounded-2xl border border-gray-100 p-8 text-center">
                        Nenhum corretor com proposta nesta organização ainda.
                    </p>
                ) : (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-100">
                        {lista.map(l => (
                            <div key={l.email} className="flex items-center justify-between gap-4 p-4">
                                <div className="flex items-center gap-4 min-w-0">
                                    <span className={`w-10 text-center text-xl font-black ${l.posicao && l.posicao <= 3 ? 'text-amber-500' : 'text-gray-400'}`}>
                                        {l.posicao ? `${l.posicao}º` : '—'}
                                    </span>
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-gray-900 truncate">{l.nome || l.email}</p>
                                        <Tendencia atual={l.posicao} anterior={l.posicao_anterior} />
                                    </div>
                                </div>
                                <div className="flex items-center gap-6 text-right shrink-0">
                                    <div><p className="text-xs text-gray-500">Vendas</p><p className="text-sm font-semibold text-gray-900">{l.vendas}</p></div>
                                    <div className="hidden md:block"><p className="text-xs text-gray-500">Volume</p><p className="text-sm font-medium text-gray-900">{formatCurrency(l.volume)}</p></div>
                                    <div className="hidden md:block"><p className="text-xs text-gray-500">Propostas</p><p className="text-sm font-semibold text-gray-900">{l.enviadas}</p></div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    // ── Corretor: só a própria posição ──────────────────────────────────────
    const m = minha;
    return (
        <div className="space-y-4">
            {seletor}
            <div className={`bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-700 rounded-2xl text-white shadow-xl shadow-indigo-500/20 ${compacto ? 'p-5' : 'p-6'}`} data-tour="ranking-posicao">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <p className="text-indigo-200 text-xs font-bold uppercase tracking-widest">Minha posição</p>
                        {m?.posicao ? (
                            <>
                                <p className="mt-1"><span className="text-5xl font-black">{m.posicao}º</span><span className="text-indigo-200 text-sm ml-2">de {m.total_corretores}</span></p>
                                <div className="mt-1"><Tendencia atual={m.posicao} anterior={m.posicao_anterior} claro /></div>
                            </>
                        ) : (
                            <p className="mt-2 text-lg font-bold">Ainda sem venda neste período</p>
                        )}
                    </div>
                    <Trophy className="w-14 h-14 text-amber-400/30 shrink-0" />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
                    <div className="bg-white/10 rounded-xl p-3">
                        <p className="text-xs text-indigo-200 font-bold uppercase">Vendas</p>
                        <p className="text-xl font-black">{m?.vendas ?? 0}{lider > 0 && <span className="text-sm font-bold text-indigo-300">/{lider}</span>}</p>
                        {lider > 0 && (
                            <div className="mt-1.5 bg-white/20 rounded-full h-1.5" title={`Meta: as ${lider} vendas do 1º colocado`}>
                                <div className="bg-emerald-400 rounded-full h-1.5" style={{ width: `${pctMeta}%` }} />
                            </div>
                        )}
                    </div>
                    <div className="bg-white/10 rounded-xl p-3">
                        <p className="text-xs text-indigo-200 font-bold uppercase">Volume</p>
                        <p className="text-xl font-black truncate">{formatCurrency(m?.volume ?? 0)}</p>
                    </div>
                    <div className="bg-white/10 rounded-xl p-3">
                        <p className="text-xs text-indigo-200 font-bold uppercase">Propostas</p>
                        <p className="text-xl font-black">{m?.enviadas ?? 0}</p>
                    </div>
                    <div className="bg-white/10 rounded-xl p-3">
                        <p className="text-xs text-indigo-200 font-bold uppercase">Com venda</p>
                        <p className="text-xl font-black">{m?.com_venda ?? 0}<span className="text-sm font-bold text-indigo-300"> corretores</span></p>
                    </div>
                </div>
            </div>
            <p className="text-xs text-gray-500 flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
                Conta as propostas aprovadas pela incorporadora no período. A meta é o número de vendas do 1º colocado; os nomes dos colegas não aparecem.
            </p>
        </div>
    );
};

export default BrokerRanking;
