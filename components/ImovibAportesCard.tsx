import React, { useMemo, useState } from 'react';
import { ArrowLeftRight, ChevronDown, ChevronRight } from 'lucide-react';
import { ImovibStudy, ImovibStudyUpdate } from '../types';
import type { ImovibMathResult } from '../hooks/useImovibMath';
import { IMOVIB_DEFAULTS } from '../constants/imovibDefaults';
import { useImovibEdicao } from '../hooks/useImovibEdicao';
import { KpiCard } from './ui/KpiCard';
import StandardTable, { type StandardTableColumn } from './ui/StandardTable';
import ImovibInputRow from './ImovibInputRow';

interface ImovibAportesCardProps {
    study: ImovibStudy;
    resultado: ImovibMathResult;
    onSalvar: (campos: ImovibStudyUpdate) => Promise<void>;
}

interface LinhaDoAno {
    id: string;
    ano: number;
    de: number;
    ate: number;
    aporte: number;
    distribuicao: number;
    paraTerceiros: number;
    caixa: number;
}

const fmtBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
const valor = (v: number) => (Math.abs(v) < 0.5 ? <span className="text-slate-400">—</span> : fmtBRL(v));

const COLUNAS: StandardTableColumn[] = [
    { key: 'periodo', label: 'Período', width: 200 },
    { key: 'aporte', label: 'Aporte', width: 160, align: 'right' },
    { key: 'distribuicao', label: 'Distribuição', width: 160, align: 'right' },
    { key: 'caixa', label: 'Caixa no fim', width: 160, align: 'right' },
];
// Só com fonte por participação: quanto de cada distribuição vai para ela.
const COLUNAS_COM_PARTICIPACAO: StandardTableColumn[] = [
    ...COLUNAS.slice(0, 3),
    { key: 'paraTerceiros', label: 'Para as fontes', width: 160, align: 'right' },
    COLUNAS[3],
];

/**
 * Aportes e distribuições (item 4.3 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md): o incorporador
 * aporta quando o caixa ficaria abaixo do mínimo e recebe o que sobra além do que
 * os meses seguintes ainda vão consumir. Os números vêm do motor
 * (`ImovibMathResult.aportes`); a tela só agrupa por ano.
 */
const ImovibAportesCard: React.FC<ImovibAportesCardProps> = ({ study, resultado, onSalvar }) => {
    const D = IMOVIB_DEFAULTS;
    const { pode, motivo } = useImovibEdicao();
    const [aberto, setAberto] = useState<number | null>(null);
    const meses = resultado.aportes;

    const anos = useMemo<LinhaDoAno[]>(() => {
        const out: LinhaDoAno[] = [];
        for (let i = 0; i < meses.length; i += 12) {
            const doAno = meses.slice(i, i + 12);
            out.push({
                id: `ano-${i / 12 + 1}`,
                ano: i / 12 + 1,
                de: doAno[0].mes,
                ate: doAno[doAno.length - 1].mes,
                aporte: doAno.reduce((a, m) => a + m.aporte, 0),
                distribuicao: doAno.reduce((a, m) => a + m.distribuicao, 0),
                paraTerceiros: doAno.reduce((a, m) => a + m.paraTerceiros, 0),
                caixa: doAno[doAno.length - 1].caixa,
            });
        }
        return out;
    }, [meses]);

    const totalAportado = meses.reduce((a, m) => a + m.aporte, 0);
    const totalDistribuido = meses.reduce((a, m) => a + m.distribuicao, 0);
    const totalParaTerceiros = meses.reduce((a, m) => a + m.paraTerceiros, 0);
    const ultimoAporte = [...meses].reverse().find(m => m.aporte > 0.5)?.mes ?? null;
    const temParticipacao = (study.funding_sources ?? []).some(f => f.remuneration === 'participacao');

    return (
        <section className="bg-white rounded-[10px] p-6 border border-gray-200 space-y-4" aria-labelledby="imovib-aportes-titulo">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-[6px]">
                        <ArrowLeftRight className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 id="imovib-aportes-titulo" className="text-lg font-semibold text-gray-900">Aportes e distribuições</h2>
                        <p className="text-slate-500 text-sm">
                            Aporta quando o caixa ficaria abaixo do mínimo; distribui o que sobra além do que os meses seguintes vão consumir.
                            {temParticipacao ? ' As distribuições devolvem primeiro o capital aportado; as fontes por participação recebem o capital delas e a parte delas no lucro.' : ''}
                        </p>
                    </div>
                </div>
                <fieldset disabled={!pode} title={!pode ? motivo : undefined} className="imovib-ro min-w-0 border-0 p-0 m-0 w-full md:w-[26rem]">
                    <ImovibInputRow
                        label="Caixa mínimo"
                        desc="Reserva que a SPE mantém até o último mês"
                        unidade="R$" step="1000"
                        value={study.min_cash_balance ?? D.min_cash_balance} padrao={D.min_cash_balance}
                        onCommit={(v) => onSalvar({ min_cash_balance: v == null ? null : Math.max(0, v) })}
                    />
                </fieldset>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <KpiCard label="Total aportado" value={fmtBRL(totalAportado)} sub={ultimoAporte != null ? `Último aporte no mês ${ultimoAporte}` : 'Nenhum aporte'} color="rose" />
                <KpiCard label="Total distribuído" value={fmtBRL(totalDistribuido)} sub={temParticipacao ? `${fmtBRL(totalParaTerceiros)} para as fontes por participação` : undefined} color="emerald" />
                <KpiCard label="Lucro do incorporador" value={fmtBRL(totalDistribuido - totalParaTerceiros - totalAportado)} sub="Distribuído a ele menos o que aportou" color="indigo" />
            </div>

            <StandardTable<LinhaDoAno>
                storageKey="imovib:aportes"
                columns={temParticipacao ? COLUNAS_COM_PARTICIPACAO : COLUNAS}
                rows={anos}
                rowKey={l => l.id}
                dense
                bare
                onRowClick={l => setAberto(a => (a === l.ano ? null : l.ano))}
                rowLabel={l => `Ano ${l.ano}: abrir os meses`}
                renderCell={(k, l) => {
                    switch (k) {
                        case 'periodo': return (
                            <span className="flex items-center gap-1.5 text-sm text-gray-700">
                                {aberto === l.ano ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                                Ano {l.ano} <span className="text-slate-500">· meses {l.de} a {l.ate}</span>
                            </span>
                        );
                        case 'aporte': return <span className="text-sm text-gray-700">{valor(l.aporte)}</span>;
                        case 'distribuicao': return <span className="text-sm text-gray-700">{valor(l.distribuicao)}</span>;
                        case 'paraTerceiros': return <span className="text-sm text-gray-700">{valor(l.paraTerceiros)}</span>;
                        case 'caixa': return <span className="text-sm text-gray-700">{valor(l.caixa)}</span>;
                        default: return null;
                    }
                }}
                totaisPorColuna={(k, linhas) =>
                    k === 'periodo' ? <span className="text-sm font-semibold text-gray-900">Total</span>
                        : k === 'aporte' ? <span className="text-sm font-semibold text-gray-900">{fmtBRL(linhas.reduce((a, l) => a + l.aporte, 0))}</span>
                            : k === 'distribuicao' ? <span className="text-sm font-semibold text-gray-900">{fmtBRL(linhas.reduce((a, l) => a + l.distribuicao, 0))}</span>
                                : k === 'paraTerceiros' ? <span className="text-sm font-semibold text-gray-900">{fmtBRL(linhas.reduce((a, l) => a + l.paraTerceiros, 0))}</span>
                                    : null}
                renderExpanded={(l, visibleCount) => aberto !== l.ano ? null : (
                    <tr className="bg-gray-50/50">
                        <td colSpan={visibleCount} className="px-6 py-3">
                            <table className="w-full max-w-2xl text-sm">
                                <thead>
                                    <tr className="text-xs font-semibold text-slate-500">
                                        <th className="text-left font-semibold py-1">Mês</th>
                                        <th className="text-right font-semibold py-1">Aporte</th>
                                        <th className="text-right font-semibold py-1">Distribuição</th>
                                        {temParticipacao && <th className="text-right font-semibold py-1">Para as fontes</th>}
                                        <th className="text-right font-semibold py-1">Caixa no fim</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {meses.slice(l.de - 1, l.ate).map(m => (
                                        <tr key={m.mes} className="border-t border-gray-100 text-gray-700">
                                            <td className="py-1">Mês {m.mes}</td>
                                            <td className="py-1 text-right">{valor(m.aporte)}</td>
                                            <td className="py-1 text-right">{valor(m.distribuicao)}</td>
                                            {temParticipacao && <td className="py-1 text-right">{valor(m.paraTerceiros)}</td>}
                                            <td className="py-1 text-right">{valor(m.caixa)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </td>
                    </tr>
                )}
                empty={{ title: 'Sem fluxo de caixa', subtitle: 'Preencha o cronograma e o orçamento do estudo.' }}
            />
        </section>
    );
};

export default ImovibAportesCard;
