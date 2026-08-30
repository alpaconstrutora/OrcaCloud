import React from 'react';
import { AlertTriangle, Download, Handshake, Loader2, Plus, RefreshCw } from 'lucide-react';
import { formatMoney, formatDateBR } from '../ui/Format';
import { useConfirm } from '../ui/confirm';
import { usePersistedState } from '../ui/TableUtils';
import { useOrgContext, errorMessage } from '../../hooks/useOrgContext';
import { debtService } from '../../services/debtService';
import { debtAnalyticsService, toCsv, baixarCsv } from '../../services/debtAnalyticsService';
import {
    DEBT_AMORTIZATION_PT,
    DEBT_MODALITY_PT,
    type DebtContract,
    type DebtConcentrationRow,
    type DebtProposalComparison,
} from '../../types/debt';

interface Props {
    /** Abre o formulário de contrato já como proposta do grupo informado. */
    onNovaProposta: (proposalGroup: string) => void;
    /** A lista de contratos do módulo, para o pai ressincronizar após aceitar. */
    onAlterou: () => void;
    /**
     * Muda quando o pai grava um contrato. Sem isto, criar uma proposta pelo
     * botão desta aba não a faz aparecer aqui: o formulário é do pai, e esta
     * lista só carregava na montagem — a tela ficava no empty state como se a
     * criação tivesse falhado. Achado no passeio de 30/08.
     */
    reloadKey?: number;
}

const th = 'px-6 py-2 border-r border-gray-100 text-table-header font-semibold text-gray-500';
const td = 'px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal';

export default function DebtProposals({ onNovaProposta, onAlterou, reloadKey = 0 }: Props) {
    const { orgId } = useOrgContext();
    const confirm = useConfirm();

    const [propostas, setPropostas] = React.useState<DebtContract[]>([]);
    const [grupo, setGrupo] = usePersistedState<string>('dividasPropostas:grupo', '');
    const [comparacao, setComparacao] = React.useState<DebtProposalComparison[]>([]);
    const [concentracao, setConcentracao] = React.useState<DebtConcentrationRow[]>([]);
    const [carregando, setCarregando] = React.useState(true);
    const [aceitando, setAceitando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);
    const [aviso, setAviso] = React.useState<string | null>(null);

    const carregar = React.useCallback(async () => {
        setCarregando(true);
        setErro(null);
        try {
            const [lista, conc] = await Promise.all([
                debtService.listProposals(orgId),
                // Concentração da dívida JÁ contratada: é o eixo que o PRD manda
                // pesar junto com a taxa, e sem ele a tela recomendaria sempre o
                // banco mais barato — inclusive o que já concentra a exposição.
                debtAnalyticsService.concentration(orgId, 'INSTITUICAO'),
            ]);
            setPropostas(lista);
            setConcentracao(conc);
        } catch (e) {
            setErro(errorMessage(e, 'Não foi possível carregar as propostas.'));
        } finally {
            setCarregando(false);
        }
    }, [orgId]);

    React.useEffect(() => { void carregar(); }, [carregar, reloadKey]);

    /** Grupos distintos, com o rótulo tirado da primeira proposta de cada um. */
    const grupos = React.useMemo(() => {
        const mapa = new Map<string, { id: string; rotulo: string; n: number }>();
        for (const p of propostas) {
            if (!p.proposalGroup) continue;
            const atual = mapa.get(p.proposalGroup)
                ?? { id: p.proposalGroup, rotulo: p.purpose || DEBT_MODALITY_PT[p.modality], n: 0 };
            atual.n += 1;
            mapa.set(p.proposalGroup, atual);
        }
        return [...mapa.values()];
    }, [propostas]);

    // Seleciona o primeiro grupo sozinho — chegar numa tela de comparação vazia
    // tendo cotação cadastrada é atrito à toa.
    React.useEffect(() => {
        if (!grupo && grupos.length > 0) setGrupo(grupos[0].id);
    }, [grupos, grupo, setGrupo]);

    React.useEffect(() => {
        if (!grupo) { setComparacao([]); return; }
        debtService.compareProposals(grupo)
            .then(setComparacao)
            .catch(e => setErro(errorMessage(e, 'Não foi possível comparar as propostas.')));
    }, [grupo, propostas]);

    const semCronograma = comparacao.filter(c => c.nParcelas === 0);

    /** Exposição atual naquela instituição, para o alerta de concentração. */
    const exposicaoAtual = React.useCallback((nome: string) =>
        concentracao.find(c => c.rotulo === nome)?.pct ?? 0, [concentracao]);

    const aceitar = async (linha: DebtProposalComparison) => {
        const alvo = propostas.find(p => p.id === linha.debtContractId);
        if (!alvo) return;

        const irmas = comparacao.length - 1;
        const ok = await confirm({
            title: `Aceitar a proposta de ${linha.instituicao}?`,
            message:
                `Ela passa a CONTRATADO e ${irmas} proposta(s) do grupo são canceladas. ` +
                'O cronograma já gerado vira o contratual da operação.',
            variant: 'warning',
            confirmLabel: 'Aceitar proposta',
        });
        if (!ok) return;

        setAceitando(true);
        setErro(null);
        try {
            const r = await debtService.acceptProposal(alvo, {
                motivo: `CET ${linha.cetAnual?.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) ?? '—'}% a.a., ` +
                        `custo total ${formatMoney(linha.custoTotal)}`,
            });
            setAviso(`Proposta de ${linha.instituicao} aceita. ${r.recusadas} recusada(s).`);
            await carregar();
            onAlterou();
        } catch (e) {
            setErro(errorMessage(e, 'Não foi possível aceitar a proposta.'));
        } finally {
            setAceitando(false);
        }
    };

    const exportar = () => {
        baixarCsv(
            `propostas-${new Date().toISOString().slice(0, 10)}`,
            toCsv(
                ['Instituição', 'Sistema', 'Parcelas', 'Bruto', 'Líquido', 'Custos na liberação',
                 'Taxa (% a.m.)', 'CET (% a.a.)', '1ª parcela', 'Total de juros', 'Total pago',
                 'Custo total', 'Impacto mensal 1º ano'],
                comparacao.map(c => [
                    c.instituicao, DEBT_AMORTIZATION_PT[c.amortizationSystem], c.nParcelas,
                    c.brutoLiberado, c.liquidoRecebido, c.custosNaLiberacao,
                    c.taxaMensalPct, c.cetAnual ?? 0, c.primeiraParcela,
                    c.totalJuros, c.totalPago, c.custoTotal, c.impactoMensal12m,
                ]),
            ),
        );
    };

    const menorCusto = comparacao.length
        ? Math.min(...comparacao.map(c => c.custoTotal)) : null;
    const menorImpacto = comparacao.length
        ? Math.min(...comparacao.map(c => c.impactoMensal12m)) : null;

    return (
        <div className="space-y-6">
            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                <div className="flex flex-wrap items-center gap-2">
                    <select
                        value={grupo}
                        onChange={e => setGrupo(e.target.value)}
                        className="h-9 pl-3 pr-8 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer min-w-[240px]"
                    >
                        <option value="">Selecione a cotação…</option>
                        {grupos.map(g => (
                            <option key={g.id} value={g.id}>{g.rotulo} ({g.n} proposta{g.n === 1 ? '' : 's'})</option>
                        ))}
                    </select>
                    <button
                        onClick={() => void carregar()}
                        className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95"
                        title="Atualizar"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>
                    {comparacao.length > 0 && (
                        <button onClick={exportar} className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all">
                            <Download className="w-4 h-4 inline mr-1" />Exportar
                        </button>
                    )}
                </div>
                <button
                    onClick={() => onNovaProposta(grupo || crypto.randomUUID())}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
                >
                    <Plus className="w-[15px] h-[15px]" />
                    {grupo ? 'Nova proposta nesta cotação' : 'Nova cotação'}
                </button>
            </div>

            {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-[10px] px-4 py-3">{erro}</div>}
            {aviso && <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-[10px] px-4 py-3">{aviso}</div>}

            {semCronograma.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-[10px] px-4 py-3">
                    {semCronograma.length} proposta(s) sem cronograma gerado — elas aparecem sem custo, juros nem
                    CET. Abra cada uma e clique em “Gerar cronograma” para a comparação ficar honesta.
                </div>
            )}

            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                {carregando ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="mt-2 text-gray-500">Carregando...</p>
                    </div>
                ) : comparacao.length === 0 ? (
                    <div className="text-center py-12">
                        <Handshake className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma proposta em cotação</h3>
                        <p className="text-sm text-gray-500">
                            Cadastre as propostas dos bancos como contratos em negociação e compare aqui antes de assinar.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-auto max-h-[70vh]">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    <th className={`${th} text-left`}>Instituição</th>
                                    <th className={`${th} text-left`}>Sistema</th>
                                    <th className={`${th} text-right`}>Parcelas</th>
                                    <th className={`${th} text-right`}>Líquido</th>
                                    <th className={`${th} text-right`}>Taxa a.m.</th>
                                    <th className={`${th} text-right`}>CET a.a.</th>
                                    <th className={`${th} text-right`}>1ª parcela</th>
                                    <th className={`${th} text-right`}>Custo total</th>
                                    <th className={`${th} text-right`}>Impacto 1º ano</th>
                                    <th className={`${th} text-left`}>Concentração</th>
                                    <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {comparacao.map(c => {
                                    const exp = exposicaoAtual(c.instituicao);
                                    return (
                                        <tr key={c.debtContractId} className="hover:bg-blue-50/50 transition-colors">
                                            <td className={`${td} text-gray-700`}>
                                                <span className="block truncate" title={c.instituicao}>{c.instituicao}</span>
                                                {c.contractNumber && (
                                                    <span className="block truncate text-xs text-gray-400" title={c.contractNumber}>{c.contractNumber}</span>
                                                )}
                                            </td>
                                            <td className={`${td} text-gray-600`}>{DEBT_AMORTIZATION_PT[c.amortizationSystem]}</td>
                                            <td className={`${td} text-right text-gray-600`}>{c.nParcelas || '—'}</td>
                                            <td className={`${td} text-right font-medium text-gray-800`}>{formatMoney(c.liquidoRecebido)}</td>
                                            <td className={`${td} text-right text-gray-600`}>
                                                {c.taxaMensalPct.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}%
                                                {c.indexName ? ` + ${c.indexName}` : ''}
                                            </td>
                                            <td className={`${td} text-right font-medium text-gray-800`}>
                                                {c.cetAnual == null ? '—' : `${c.cetAnual.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`}
                                            </td>
                                            <td className={`${td} text-right text-gray-600`}>{formatMoney(c.primeiraParcela)}</td>
                                            <td className={`${td} text-right font-medium ${c.custoTotal === menorCusto ? 'text-green-700' : 'text-gray-800'}`}>
                                                {formatMoney(c.custoTotal)}
                                            </td>
                                            <td className={`${td} text-right font-medium ${c.impactoMensal12m === menorImpacto ? 'text-green-700' : 'text-gray-800'}`}>
                                                {formatMoney(c.impactoMensal12m)}
                                            </td>
                                            <td className={`${td} text-gray-600`}>
                                                {exp > 0 ? (
                                                    <span className={exp >= 50 ? 'text-amber-700' : 'text-gray-600'}>
                                                        {exp >= 50 && <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />}
                                                        já tem {exp.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
                                                    </span>
                                                ) : 'sem exposição'}
                                            </td>
                                            <td className="px-6 py-2.5 text-right">
                                                <button
                                                    onClick={() => void aceitar(c)}
                                                    disabled={aceitando || c.nParcelas === 0}
                                                    className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                                    title={c.nParcelas === 0 ? 'Gere o cronograma desta proposta antes de aceitar' : undefined}
                                                >
                                                    {aceitando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Aceitar'}
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {comparacao.length > 0 && (
                    <div className="px-5 py-3 border-t border-gray-100 bg-amber-50/60">
                        <p className="text-xs text-amber-800">
                            <strong>Verde marca o melhor em cada eixo, não a vencedora.</strong> A coluna
                            Concentração mostra o quanto da sua dívida atual já está naquele banco — fechar
                            com quem já concentra a exposição é risco que a taxa não mostra. Garantias
                            exigidas e covenants entram na conta e ainda não são cadastrados aqui.
                        </p>
                    </div>
                )}
            </div>

            {/* Datas do horizonte, quando há o que mostrar. */}
            {comparacao.length > 0 && comparacao[0].ultimoVencimento && (
                <p className="text-xs text-gray-400">
                    Horizonte da primeira proposta: {comparacao[0].primeiroVencimento ? formatDateBR(comparacao[0].primeiroVencimento) : '—'}
                    {' → '}{formatDateBR(comparacao[0].ultimoVencimento)}.
                </p>
            )}
        </div>
    );
}
