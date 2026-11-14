import React, { useEffect, useMemo, useState } from 'react';
import { Activity, AlertCircle, Loader2 } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { ImovibStudy } from '../types';
import { imovibService } from '../services/imovibService';
import { imovibRealizadoService, type RealizadoDoEstudo } from '../services/imovibRealizadoService';
import { computeImovibMath } from '../utils/imovibMotor';
import { compararComRealizado, type MesDoAcompanhamento } from '../utils/imovibAcompanhamento';
import { nomeDoMes } from '../utils/imovibCronograma';
import type { ImovibStudyVersion } from '../utils/imovibVersoes';
import StandardTable, { type StandardTableColumn } from './ui/StandardTable';
import {
    ChartCard, Legend, GRID, TICK, TOOLTIP_STYLE, TOOLTIP_CURSOR, INITIAL_DIMENSION, compactAxis, moneyBRL,
} from './analysis/chartKit';

interface Props {
    study: ImovibStudy;
}

const ATUAL = 'atual';
const RECEITA = '#3b82f6';
const CUSTO = '#f97316';
const CAMPO = 'h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';
const hojeAnoMes = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const brl = (v: number | null) => (v == null ? '—' : moneyBRL(v));
const desvio = (prev: number, real: number | null) => (real == null ? '—' : moneyBRL(real - prev));

const COLUNAS: StandardTableColumn[] = [
    { key: 'mes', label: 'Mês', width: 90 },
    { key: 'receitaPrevista', label: 'Receita prevista', width: 140, align: 'right' },
    { key: 'receitaRealizada', label: 'Receita realizada', width: 140, align: 'right' },
    { key: 'desvioReceita', label: 'Desvio', width: 130, align: 'right' },
    { key: 'custoPrevisto', label: 'Custo previsto', width: 140, align: 'right' },
    { key: 'custoRealizado', label: 'Custo realizado', width: 140, align: 'right' },
    { key: 'desvioCusto', label: 'Desvio', width: 130, align: 'right' },
    { key: 'vendasPrevistasAcum', label: 'Vendas previstas (acum.)', width: 170, align: 'right' },
    { key: 'vendasReaisAcum', label: 'Vendas reais (acum.)', width: 160, align: 'right' },
];

/**
 * Viabilidade × realizado (item 10.4 do plano 2026-11-11), só para estudo
 * vinculado a empreendimento. O previsto é o do estudo atual ou de uma versão
 * congelada; o realizado é o financeiro das obras e as vendas reais. Sem
 * data-base, pede a data em vez de alinhar os meses por conta própria.
 */
const ImovibAcompanhamentoTab: React.FC<Props> = ({ study }) => {
    const [dados, setDados] = useState<RealizadoDoEstudo | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [versoes, setVersoes] = useState<ImovibStudyVersion[]>([]);
    const [fonte, setFonte] = useState<string>(ATUAL);
    const [snapshot, setSnapshot] = useState<ImovibStudy | null>(null);
    const temData = !!study.base_date;

    useEffect(() => {
        if (!temData) return;
        let vivo = true;
        setErro(null);
        imovibRealizadoService.doEstudo(study)
            .then(d => { if (vivo) setDados(d); })
            .catch(e => { if (vivo) setErro((e as Error).message); });
        imovibService.listarVersoes(study.id).then(v => { if (vivo) setVersoes(v); }).catch(() => undefined);
        return () => { vivo = false; };
    }, [study, temData]);

    useEffect(() => {
        if (fonte === ATUAL) { setSnapshot(null); return; }
        let vivo = true;
        imovibService.snapshotDaVersao(fonte)
            .then(s => { if (vivo) setSnapshot(s); })
            .catch(e => { if (vivo) setErro((e as Error).message); });
        return () => { vivo = false; };
    }, [fonte]);

    const previsto = fonte === ATUAL ? study : snapshot;
    const meses = useMemo<MesDoAcompanhamento[]>(() => {
        if (!previsto || !dados || !study.base_date) return [];
        const r = computeImovibMath(previsto);
        // A data-base da versão, se ela tinha uma: é ela que diz qual mês do calendário era o mês 1.
        return compararComRealizado(r.monthlyFlows, previsto.base_date ?? study.base_date, dados.financeiro, dados.vendas, r.vendasPorMes, hojeAnoMes());
    }, [previsto, dados, study.base_date]);

    // Os meses do previsto contam da data-base DELE: a versão congelada pode ter outra
    // (deixado para depois na revisão das pendências — o gráfico usava a do estudo atual).
    const dataBaseDoPrevisto = previsto?.base_date ?? study.base_date;
    const acumulados = useMemo(() => {
        let rp = 0, rr = 0, cp = 0, cr = 0;
        return meses.map((m, i) => {
            rp += m.receitaPrevista; cp += m.custoPrevisto;
            const passado = m.vendasReaisAcum != null;
            if (passado) { rr += m.receitaRealizada ?? 0; cr += m.custoRealizado ?? 0; }
            return {
                mes: nomeDoMes(dataBaseDoPrevisto, i + 1),
                receitaPrevista: rp, custoPrevisto: cp,
                receitaRealizada: passado ? rr : null, custoRealizado: passado ? cr : null,
                vendasPrevistas: m.vendasPrevistasAcum, vendasReais: m.vendasReaisAcum,
            };
        });
    }, [meses, dataBaseDoPrevisto]);
    const periodo = acumulados.length ? `de ${acumulados[0].mes} a ${acumulados[acumulados.length - 1].mes}` : '';
    const ultimo = acumulados[acumulados.length - 1];

    if (!temData) {
        return (
            <div className="flex items-start gap-2 rounded-[10px] bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                Informe a data-base do estudo em Premissas › Cronograma: é ela que diz qual mês do calendário é o mês 1, para comparar o previsto com o realizado.
            </div>
        );
    }
    if (erro) {
        return (
            <div className="flex items-start gap-2 rounded-[10px] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> Não foi possível ler o realizado: {erro}
            </div>
        );
    }
    if (!dados || !previsto) {
        return <p className="text-sm text-slate-600 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Lendo o realizado do empreendimento…</p>;
    }

    const semObra = dados.obras.length === 0;
    const linha = (dataKey: string, nome: string, cor: string, tracejada = false) => (
        <Line dataKey={dataKey} name={nome} stroke={cor} strokeWidth={2} dot={false} type="monotone" connectNulls={false} {...(tracejada ? { strokeDasharray: '5 4' } : {})} />
    );

    return (
        <div className="space-y-6">
            <section className="bg-white rounded-[10px] p-6 border border-gray-200 space-y-3" aria-labelledby="imovib-acomp-titulo">
                <div className="flex flex-wrap items-end gap-3">
                    <div className="mr-auto">
                        <h2 id="imovib-acomp-titulo" className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                            <Activity className="w-5 h-5 text-indigo-500" />
                            Viabilidade × realizado
                        </h2>
                        <p className="text-slate-500 text-sm mt-1">
                            {semObra
                                ? 'O empreendimento não tem obra vinculada nesta organização: só as vendas reais são comparadas. Vincule a obra no cadastro do empreendimento para comparar receitas e custos.'
                                : `Realizado das obras ${dados.obras.map(o => o.nome).join(', ')}: só lançamentos conciliados. Vendas reais: negociações com contrato, pelo mês da negociação.`}
                        </p>
                        {!semObra && (
                            <p className="text-slate-500 text-xs mt-1">
                                Previsto: receita = o que os compradores pagam no mês; custo = terreno, obra e rubricas do estudo. Realizado: entradas e saídas lançadas nas obras (inclui financiamento, aportes e transferências).
                            </p>
                        )}
                        <ul className="text-xs text-amber-800 mt-2 space-y-0.5">
                            {(dados.aConciliar.entradas > 0 || dados.aConciliar.saidas > 0) && (
                                <li>Lançado nas obras e ainda não conciliado (fora do realizado): {moneyBRL(dados.aConciliar.entradas)} de entradas e {moneyBRL(dados.aConciliar.saidas)} de saídas.</li>
                            )}
                            {dados.obrasDeOutraOrganizacao.length > 0 && (
                                <li>Obra de outra organização fica fora: {dados.obrasDeOutraOrganizacao.join(', ')}. Lançamentos de outras organizações nas obras também.</li>
                            )}
                            {dados.vendidasSemNegociacao > 0 && (
                                <li>{dados.vendidasSemNegociacao} unidades vendidas sem negociação (sem data de venda) ficam fora das vendas reais.</li>
                            )}
                            {meses[0]?.antesDaDataBase && (
                                <li>O realizado de antes da data-base ({moneyBRL(meses[0].antesDaDataBase.entradas)} de entradas e {moneyBRL(meses[0].antesDaDataBase.saidas)} de saídas) entra no primeiro mês.</li>
                            )}
                        </ul>
                    </div>
                    <label className="space-y-1.5">
                        <span className="block text-xs font-semibold text-slate-500">Previsto de</span>
                        <select aria-label="Previsto de" value={fonte} onChange={e => setFonte(e.target.value)} className={CAMPO}>
                            <option value={ATUAL}>Estudo atual</option>
                            {versoes.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                        </select>
                    </label>
                </div>
            </section>

            <div className={`grid grid-cols-1 ${semObra ? '' : 'xl:grid-cols-2'} gap-4`}>
                {!semObra && (
                    <ChartCard title="Receita e custo acumulados" subtitle="Previsto (tracejado) e realizado até o mês atual.">
                        <Legend items={[{ label: 'Receita', color: RECEITA }, { label: 'Custo', color: CUSTO }]} />
                        <div className="h-64" role="img" aria-label={`Receita e custo acumulados ${periodo}: previstos ${moneyBRL(ultimo?.receitaPrevista ?? 0)} e ${moneyBRL(ultimo?.custoPrevisto ?? 0)}.`}>
                            <ResponsiveContainer width="100%" height="100%" initialDimension={INITIAL_DIMENSION}>
                                <LineChart accessibilityLayer={false} data={acumulados} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                                    <CartesianGrid vertical={false} stroke={GRID} />
                                    <XAxis dataKey="mes" tick={TICK} axisLine={false} tickLine={false} minTickGap={24} />
                                    <YAxis tick={TICK} axisLine={false} tickLine={false} tickFormatter={compactAxis} width={56} />
                                    <Tooltip contentStyle={TOOLTIP_STYLE} cursor={TOOLTIP_CURSOR} formatter={(v: unknown) => moneyBRL(Number(v))} />
                                    {linha('receitaPrevista', 'Receita prevista', RECEITA, true)}
                                    {linha('receitaRealizada', 'Receita realizada', RECEITA)}
                                    {linha('custoPrevisto', 'Custo previsto', CUSTO, true)}
                                    {linha('custoRealizado', 'Custo realizado', CUSTO)}
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </ChartCard>
                )}
                <ChartCard title="Vendas acumuladas" subtitle="VGV vendido: curva de vendas do estudo (tracejado) e vendas reais.">
                    <Legend items={[{ label: 'Vendas', color: RECEITA }]} />
                    <div className="h-64" role="img" aria-label={`Vendas acumuladas ${periodo}: previstas ${moneyBRL(ultimo?.vendasPrevistas ?? 0)}.`}>
                        <ResponsiveContainer width="100%" height="100%" initialDimension={INITIAL_DIMENSION}>
                            <LineChart accessibilityLayer={false} data={acumulados} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                                <CartesianGrid vertical={false} stroke={GRID} />
                                <XAxis dataKey="mes" tick={TICK} axisLine={false} tickLine={false} minTickGap={24} />
                                <YAxis tick={TICK} axisLine={false} tickLine={false} tickFormatter={compactAxis} width={56} />
                                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={TOOLTIP_CURSOR} formatter={(v: unknown) => moneyBRL(Number(v))} />
                                {linha('vendasPrevistas', 'Vendas previstas', RECEITA, true)}
                                {linha('vendasReais', 'Vendas reais', RECEITA)}
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </ChartCard>
            </div>

            <section aria-label="Mês a mês" className="bg-white rounded-[10px] p-6 border border-gray-200">
                <StandardTable<MesDoAcompanhamento & { idx: number }>
                    storageKey="imovib:acompanhamento"
                    columns={COLUNAS}
                    rows={meses.map((m, idx) => ({ ...m, idx }))}
                    rowKey={m => m.mes}
                    dense
                    bare
                    renderCell={(k, m) => {
                        const t = (s: string) => <span className="text-sm text-gray-700">{s}</span>;
                        switch (k) {
                            case 'mes': return t(`${nomeDoMes(dataBaseDoPrevisto, m.idx + 1)}${m.emCurso ? ' (em curso)' : ''}`);
                            case 'receitaPrevista': return t(brl(m.receitaPrevista));
                            case 'receitaRealizada': return t(semObra ? '—' : brl(m.receitaRealizada));
                            case 'desvioReceita': return t(semObra || m.emCurso ? '—' : desvio(m.receitaPrevista, m.receitaRealizada));
                            case 'custoPrevisto': return t(brl(m.custoPrevisto));
                            case 'custoRealizado': return t(semObra ? '—' : brl(m.custoRealizado));
                            case 'desvioCusto': return t(semObra || m.emCurso ? '—' : desvio(m.custoPrevisto, m.custoRealizado));
                            case 'vendasPrevistasAcum': return t(brl(m.vendasPrevistasAcum));
                            case 'vendasReaisAcum': return t(brl(m.vendasReaisAcum));
                            default: return null;
                        }
                    }}
                />
            </section>
        </div>
    );
};

export default ImovibAcompanhamentoTab;
