import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, CalendarX, ChevronRight, Percent } from 'lucide-react';
import StandardTable, { StandardTableColumn } from '../ui/StandardTable';
import { KpiCard } from '../ui/KpiCard';
import ActionIconButton from '../ui/ActionIconButton';
import ReajusteDecisaoSheet from './ReajusteDecisaoSheet';
import RentalReajustesHistorico from './RentalReajustesHistorico';
import { ROTULO_DECISAO, fmtDate, fmtCur, fmtPct } from './reajusteFormatos';
import { usePersistedState } from '../ui/TableUtils';
import { reajusteLocacaoService, LinhaDeReajuste, RegistroDeReajuste } from '../../services/reajusteLocacaoService';
import { Client } from '../../types';
import { filaDoEmpreendimento } from '../../utils/reajusteAniversario';

/**
 * Locações › Reajustes — o reajuste do aluguel no ANIVERSÁRIO, separado da
 * renovação. Plano: docs/planos/2026-11-24-locacoes-reajustes-separados-das-renovacoes.md.
 *
 * Fila: locações ativas com índice cujo aniversário está dentro da vigência e a
 * até N dias (aviso do contrato → padrão da organização → 30); vencido fica até
 * alguém decidir. A decisão (100% do índice, outro %, valor, ou não reajustar)
 * é no ReajusteDecisaoSheet; a linha abre o histórico do contrato.
 */

const COLUMNS: StandardTableColumn[] = [
    { key: 'number', label: 'Contrato', sortable: true, width: 200 },
    { key: 'client', label: 'Locatário', sortable: true, width: 220 },
    { key: 'index', label: 'Índice', sortable: true, width: 110 },
    { key: 'data_base', label: 'Data-base', sortable: true, width: 130 },
    { key: 'proximo', label: 'Reajuste em', sortable: true, width: 130 },
    { key: 'situacao', label: 'Situação', sortable: true, width: 170 },
    { key: 'value', label: 'Aluguel atual', sortable: true, width: 140, align: 'right' },
];

type Visao = 'fila' | 'historico';

/** Dias de hoje até a data (negativo = já passou), em datas de calendário. */
const diasAte = (iso: string) => {
    const hoje = new Date();
    const h = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return Math.round((Date.UTC(y, m - 1, d) - h) / 86400000);
};
const situacao = (dias: number) =>
    dias < 0 ? { texto: `Venceu há ${Math.abs(dias)} dia(s)`, cor: 'text-red-600' }
        : dias === 0 ? { texto: 'Vence hoje', cor: 'text-amber-800' }
        : { texto: `Vence em ${dias} dia(s)`, cor: 'text-amber-800' };

interface Props {
    organizationId: string | null;
    clients?: Client[];
    /** Abre a negociação do contrato (Gerenciar Negociação). */
    onOpenContract?: (contractId: string) => void;
    onNotify: (msg: string, type: 'success' | 'error') => void;
    /**
     * Negociações do empreendimento aberto (mesma regra da aba Contratos); null =
     * fora de um empreendimento, a fila inteira da organização. Pedido de 24/11/2026.
     */
    negociacoesDoEmpreendimento?: Set<string> | null;
}

const RentalReajustes: React.FC<Props> = ({ organizationId, clients = [], onOpenContract, onNotify, negociacoesDoEmpreendimento = null }) => {
    const [fila, setFila] = useState<LinhaDeReajuste[]>([]);
    const linhas = useMemo(() => filaDoEmpreendimento(fila, negociacoesDoEmpreendimento), [fila, negociacoesDoEmpreendimento]);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState<string | null>(null);
    const [decidindo, setDecidindo] = useState<string | null>(null);
    const [aberto, setAberto] = useState<string | null>(null);
    const [historicos, setHistoricos] = useState<Record<string, RegistroDeReajuste[] | 'carregando' | 'falhou'>>({});
    // "A decidir" (a fila) × "Histórico" (todas as decisões, inclusive de quem já saiu da fila).
    const [visao, setVisao] = usePersistedState<Visao>('rentals:reajustes:visao', 'fila');
    /** Sobe a cada decisão gravada — o histórico relê. */
    const [versaoHistorico, setVersaoHistorico] = useState(0);

    const carregar = useCallback(async () => {
        setLoading(true);
        setErro(null);
        try {
            setFila(await reajusteLocacaoService.listarFila(organizationId));
        } catch (e) {
            setErro(`Não foi possível carregar os reajustes: ${e instanceof Error ? e.message : 'erro desconhecido'}`);
        } finally {
            setLoading(false);
        }
    }, [organizationId]);

    useEffect(() => { carregar(); }, [carregar]);

    const carregarHistorico = useCallback(async (contractId: string) => {
        setHistoricos(prev => ({ ...prev, [contractId]: 'carregando' }));
        try {
            const h = await reajusteLocacaoService.historico(contractId);
            setHistoricos(prev => ({ ...prev, [contractId]: h }));
        } catch {
            setHistoricos(prev => ({ ...prev, [contractId]: 'falhou' }));
        }
    }, []);

    const alternarHistorico = (contractId: string) => {
        if (aberto === contractId) { setAberto(null); return; }
        setAberto(contractId);
        if (!historicos[contractId] || historicos[contractId] === 'falhou') carregarHistorico(contractId);
    };

    const nomeDoCliente = useMemo(() => {
        const mapa = new Map(clients.map(c => [c.id, c.name]));
        return (id?: string | null) => (id && mapa.get(id)) || '—';
    }, [clients]);

    const vencidos = linhas.filter(l => diasAte(l.aniversario.aniversario) <= 0).length;
    const proximos = linhas.length - vencidos;

    // Depois de decidir: o contrato pode continuar na fila (próximo aniversário
    // também já venceu — ex.: 2017 e 2018) ou sair; relê a fila e o histórico dele.
    const aoDecidir = async (mensagem: string, contractId: string) => {
        setDecidindo(null);
        setVersaoHistorico(v => v + 1);
        onNotify(mensagem, 'success');
        await carregar();
        if (aberto === contractId || historicos[contractId]) carregarHistorico(contractId);
    };

    const seletor = (
        <div role="radiogroup" aria-label="Visão dos reajustes" className="inline-flex items-center gap-1 p-1 bg-gray-100 rounded-[8px]">
            {([['fila', `A decidir (${loading ? '…' : linhas.length})`], ['historico', 'Histórico']] as const).map(([id, rotulo]) => (
                <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={visao === id}
                    onClick={() => setVisao(id)}
                    className={`h-7 px-3 rounded-[6px] text-sm font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                        visao === id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'
                    }`}
                >
                    {rotulo}
                </button>
            ))}
        </div>
    );

    if (visao === 'historico') {
        return (
            <div className="space-y-6">
                {seletor}
                <RentalReajustesHistorico
                    organizationId={organizationId}
                    negociacoesDoEmpreendimento={negociacoesDoEmpreendimento}
                    nomeDoCliente={nomeDoCliente}
                    onOpenContract={onOpenContract}
                    versao={versaoHistorico}
                />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {seletor}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                <KpiCard size="sm" label="Reajuste vencido" value={vencidos} icon={<CalendarX className="w-4 h-4" />} color="red" />
                <KpiCard size="sm" label="Reajuste chegando" value={proximos} sub="Dentro do prazo de aviso" icon={<CalendarClock className="w-4 h-4" />} color="amber" />
            </div>

            {erro && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-100 text-red-700 rounded-[10px] p-4 text-sm">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{erro} <button type="button" onClick={carregar} className="font-medium underline">Tentar de novo</button></span>
                </div>
            )}

            <StandardTable<LinhaDeReajuste>
                storageKey="rentals:reajustes"
                columns={COLUMNS}
                rows={linhas}
                rowKey={l => l.id}
                rowLabel={l => `Contrato ${l.number}`}
                loading={loading}
                searchText={l => `${l.number} ${l.title} ${nomeDoCliente(l.client_id)} ${l.reajuste_index}`}
                searchPlaceholder="Buscar por contrato, locatário ou índice..."
                defaultSort={{ column: 'proximo', direction: 'asc' }}
                sortValue={(key, l) => {
                    switch (key) {
                        case 'number': return l.number;
                        case 'client': return nomeDoCliente(l.client_id);
                        case 'index': return l.reajuste_index;
                        case 'data_base': return l.aniversario.dataBase;
                        case 'proximo': case 'situacao': return l.aniversario.aniversario;
                        case 'value': return Number(l.current_value ?? l.original_value ?? 0);
                        default: return '';
                    }
                }}
                renderCell={(key, l) => {
                    switch (key) {
                        case 'number':
                            return (
                                <button
                                    type="button"
                                    onClick={() => alternarHistorico(l.id)}
                                    aria-expanded={aberto === l.id}
                                    aria-label={`Histórico de reajustes de ${l.number}`}
                                    className="flex items-center gap-1.5 min-w-0 text-left text-sm font-normal text-gray-700 hover:text-blue-600"
                                    title={l.title}
                                >
                                    <ChevronRight className={`w-4 h-4 shrink-0 text-gray-400 transition-transform ${aberto === l.id ? 'rotate-90' : ''}`} />
                                    <span className="block truncate">{l.number}</span>
                                </button>
                            );
                        case 'client': {
                            const nome = nomeDoCliente(l.client_id);
                            return <span className="block truncate text-sm font-normal text-gray-700" title={nome}>{nome}</span>;
                        }
                        case 'index': return <span className="text-sm font-normal text-gray-600">{l.reajuste_index}</span>;
                        case 'data_base': return <span className="text-sm font-normal text-gray-600">{fmtDate(l.aniversario.dataBase)}</span>;
                        case 'proximo': return <span className="text-sm font-normal text-gray-600">{fmtDate(l.aniversario.aniversario)}</span>;
                        case 'situacao': {
                            const s = situacao(diasAte(l.aniversario.aniversario));
                            return <span className={`text-sm font-normal ${s.cor}`}>{s.texto}</span>;
                        }
                        case 'value': return <span className="text-sm font-medium text-gray-800">{fmtCur(l.current_value ?? l.original_value)}</span>;
                        default: return null;
                    }
                }}
                actions={{
                    width: 190,
                    render: l => {
                        const dias = diasAte(l.aniversario.aniversario);
                        const motivo = dias > 0 ? `O reajuste vence em ${fmtDate(l.aniversario.aniversario)} — decida a partir dessa data.` : null;
                        return (
                            <>
                                <span className="inline-flex" title={motivo ?? undefined}>
                                    <button
                                        type="button"
                                        onClick={() => setDecidindo(l.id)}
                                        disabled={!!motivo}
                                        className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-[6px] transition-all disabled:text-gray-400 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                                    >
                                        Reajustar
                                    </button>
                                </span>
                                {onOpenContract && (
                                    <ActionIconButton kind="view" title="Abrir a negociação do contrato" onClick={() => onOpenContract(l.id)} />
                                )}
                            </>
                        );
                    },
                }}
                renderExpanded={(l, visibleCount) => {
                    if (aberto !== l.id) return null;
                    const h = historicos[l.id];
                    return (
                        <tr className="bg-gray-50/50">
                            <td colSpan={visibleCount} className="px-6 py-3">
                                <div className="sticky left-6 max-w-3xl" role="region" aria-label={`Histórico de reajustes de ${l.number}`}>
                                    {h === 'carregando' || h === undefined ? (
                                        <p className="text-sm text-gray-500">Carregando histórico…</p>
                                    ) : h === 'falhou' ? (
                                        <p className="text-sm text-red-600">
                                            Não foi possível carregar o histórico. <button type="button" onClick={() => carregarHistorico(l.id)} className="font-medium underline">Tentar de novo</button>
                                        </p>
                                    ) : h.length === 0 ? (
                                        <p className="text-sm text-gray-500">Nenhum reajuste decidido por aqui ainda. Os de todos os contratos ficam em "Histórico".</p>
                                    ) : (
                                        <ul className="space-y-1.5">
                                            {h.map(r => (
                                                <li key={r.id} className="text-sm text-gray-700">
                                                    <span className="font-medium text-gray-900">{fmtDate(r.aniversario)}</span>
                                                    {' · '}{ROTULO_DECISAO[r.decisao]}
                                                    {r.decisao !== 'NAO_APLICADO' && ` (${fmtPct(Number(r.percentual_aplicado))}): ${fmtCur(r.valor_anterior)} → ${fmtCur(r.valor_novo)} · ${r.parcelas_atualizadas} parcela(s)`}
                                                    {r.percentual_indice != null && <span className="text-gray-500">{` · ${r.indice} no período ${fmtPct(Number(r.percentual_indice))}`}</span>}
                                                    {r.observacao && <span className="text-gray-500">{` · "${r.observacao}"`}</span>}
                                                    {r.criado_por && <span className="text-gray-500">{` · ${r.criado_por}`}</span>}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </td>
                        </tr>
                    );
                }}
                empty={{
                    icon: <Percent className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                    title: 'Nenhum reajuste a decidir',
                    subtitle: negociacoesDoEmpreendimento
                        ? 'Nenhuma locação deste empreendimento com aniversário de reajuste vencido ou dentro do prazo de aviso.'
                        : 'Nenhuma locação com aniversário de reajuste vencido ou dentro do prazo de aviso.',
                }}
            />

            <ReajusteDecisaoSheet
                contractId={decidindo}
                onClose={() => setDecidindo(null)}
                onDecidido={aoDecidir}
                onErro={m => onNotify(m, 'error')}
            />
        </div>
    );
};

export default RentalReajustes;
