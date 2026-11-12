import React, { useEffect, useMemo, useRef, useState } from 'react';
import { TrendingUp, Download, Loader2, AlertTriangle } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { ImovibStudy, ImovibStudyUpdate } from '../types';
import type { ImovibMathResult } from '../hooks/useImovibMath';
import { IMOVIB_DEFAULTS } from '../constants/imovibDefaults';
import { useImovibEdicao } from '../hooks/useImovibEdicao';
import { useToast } from '../hooks/useToast';
import { curvaDoPlanejamentoDaObra } from '../services/imovibCurvaDoPlanejamento';
import { TipoCurvaDeDesembolso } from '../utils/imovibCurvas';
import { ChartCard, Legend, GRID, TICK, TOOLTIP_STYLE, TOOLTIP_CURSOR, INITIAL_DIMENSION, SERIE_PRINCIPAL, SERIE_CONTEXTO, compactAxis } from './analysis/chartKit';

interface ImovibDesembolsoCardProps {
    study: ImovibStudy;
    resultado: ImovibMathResult;
    onSalvar: (campos: ImovibStudyUpdate) => Promise<void>;
}

const ROTULO_DA_CURVA: Record<TipoCurvaDeDesembolso, string> = {
    linear: 'Linear (o mesmo valor todo mês)',
    curva_s: 'Curva S (devagar, pico no meio, devagar)',
    custom: 'Personalizada (% de cada mês)',
};
const fmtBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
const CAMPO = 'h-9 w-full px-2 bg-white border border-gray-200 rounded-[6px] text-sm text-slate-800 text-right outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20';

/**
 * Curva de desembolso da obra (itens 5.3 e 5.4 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md). O gráfico lê o
 * fluxo do motor (obra + rubricas de obra), não recalcula.
 */
const ImovibDesembolsoCard: React.FC<ImovibDesembolsoCardProps> = ({ study, resultado, onSalvar }) => {
    const D = IMOVIB_DEFAULTS;
    const { pode, motivo } = useImovibEdicao();
    const { showToast } = useToast();
    const tipo = (study.cost_curve_type ?? D.cost_curve_type) as TipoCurvaDeDesembolso;
    const meses = Math.max(1, Math.round(study.construction_duration_months ?? D.construction_duration_months));
    const inicio = Math.round(study.construction_start_month ?? D.construction_start_month);
    // Rascunho local dos pesos: cada campo grava o vetor inteiro, e o estudo só
    // chega recarregado depois — sem o rascunho, o 2º campo regravava o 1º com o valor velho.
    const [pesos, setPesos] = useState<number[]>(study.cost_curve_custom ?? []);
    const pesosRef = useRef(pesos);
    pesosRef.current = pesos;
    const doBanco = JSON.stringify(study.cost_curve_custom ?? []);
    useEffect(() => { setPesos(JSON.parse(doBanco)); }, [doBanco]);
    const pontos = pesos.length > 0 ? pesos.length : meses;
    const soma = pesos.reduce((a, b) => a + (Number(b) || 0), 0);
    const aviso = resultado.avisos.find(a => a.codigo === 'curva_de_desembolso_nao_soma_100');

    // Planejamento das obras do empreendimento: lido ao abrir (só leitura), para o botão dizer se dá.
    const empId = study.estrutura?.origem === 'empreendimento' ? study.estrutura.empreendimento_id : undefined;
    const [planejamento, setPlanejamento] = useState<Awaited<ReturnType<typeof curvaDoPlanejamentoDaObra>> | null>(null);
    const [lendo, setLendo] = useState(false);
    useEffect(() => {
        if (!empId) { setPlanejamento(null); return; }
        let vivo = true;
        setLendo(true);
        curvaDoPlanejamentoDaObra(empId, study.organization_id)
            .then(p => { if (vivo) setPlanejamento(p); })
            .catch(e => { if (vivo) setPlanejamento({ motivo: (e as Error).message }); })
            .finally(() => { if (vivo) setLendo(false); });
        return () => { vivo = false; };
    }, [empId, study.organization_id]);
    const motivoImportar = !pode ? motivo
        : !empId ? 'Vincule um empreendimento em Premissas › Identificação: a curva vem do planejamento das obras dele.'
            : lendo ? 'Lendo o planejamento das obras…'
                : !planejamento ? 'Não foi possível ler o planejamento.'
                    : 'motivo' in planejamento ? planejamento.motivo : undefined;
    const importar = async () => {
        if (!planejamento || 'motivo' in planejamento) return;
        await onSalvar({ cost_curve_type: 'custom', cost_curve_custom: planejamento.percentuais.map(p => Number(p.toFixed(4))) });
        const n = planejamento.percentuais.length;
        showToast(n === meses
            ? `Curva importada: ${n} meses, de ${planejamento.projetos} cronograma(s).`
            : `Curva importada com ${n} meses; a obra do estudo tem ${meses}. Ajuste o prazo na aba Dinâmica ou os pesos abaixo.`);
    };

    // Só os meses da obra (rubricas de obra com outro momento saem fora deles): o acumulado fecha em 100%.
    const dados = useMemo(() => {
        const daObra = resultado.monthlyFlows.filter(f => f.month >= inicio && f.month < inicio + meses);
        const total = daObra.reduce((a, f) => a - f.linhas.obra - f.linhas.rubricasObra, 0);
        let acc = 0;
        return daObra
            .map(f => {
                const v = -(f.linhas.obra + f.linhas.rubricasObra);
                acc += v;
                return { nome: f.name, desembolso: v, acumulado: total > 0 ? (acc / total) * 100 : 0 };
            });
    }, [resultado, inicio, meses]);

    const salvarPeso = (k: number, texto: string) => {
        const atual = pesosRef.current;
        const novo = Array.from({ length: Math.max(pontos, atual.length) }, (_, i) => Number(atual[i]) || 0);
        novo[k] = texto === '' ? 0 : Math.max(0, Number(texto) || 0);
        if (novo[k] === (Number(atual[k]) || 0)) return;
        pesosRef.current = novo;
        setPesos(novo);
        void onSalvar({ cost_curve_custom: novo });
    };

    return (
        <section className="bg-white rounded-[10px] p-6 border border-gray-200 space-y-4" aria-labelledby="imovib-desembolso-titulo">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 id="imovib-desembolso-titulo" className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-indigo-500" />
                        Curva de desembolso da obra
                    </h2>
                    <p className="text-slate-500 text-sm mt-1">Como o custo de obra (e as rubricas de obra) sai ao longo dos {meses} meses de obra. O financiamento libera na mesma curva.</p>
                </div>
                <button
                    type="button"
                    onClick={() => void importar()}
                    disabled={!!motivoImportar}
                    title={motivoImportar ?? 'Copia os percentuais mensais do cronograma físico-financeiro das obras. É cópia: mudar o planejamento depois não muda o estudo.'}
                    className="flex items-center gap-1.5 h-9 px-3.5 text-[13px] font-medium rounded-[6px] border border-gray-200 bg-white text-slate-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {lendo ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Download className="w-[15px] h-[15px]" />}
                    Importar a curva do planejamento
                </button>
            </div>

            {aviso && (
                <div className="flex items-start gap-2 rounded-[10px] bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {aviso.mensagem}
                </div>
            )}

            <fieldset disabled={!pode} title={!pode ? motivo : undefined} className="imovib-ro min-w-0 border-0 p-0 m-0 space-y-4">
                <div className="max-w-md">
                    <label htmlFor="imovib-curva-desembolso" className="block text-xs font-semibold text-slate-500 mb-1.5">Curva</label>
                    <select
                        id="imovib-curva-desembolso"
                        value={tipo}
                        onChange={e => { if (e.target.value !== tipo) void onSalvar({ cost_curve_type: e.target.value as TipoCurvaDeDesembolso }); }}
                        className="h-9 w-full px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
                    >
                        {(Object.keys(ROTULO_DA_CURVA) as TipoCurvaDeDesembolso[]).map(t => <option key={t} value={t}>{ROTULO_DA_CURVA[t]}</option>)}
                    </select>
                </div>

                {tipo === 'custom' && (
                    <div className="space-y-2">
                        {pontos !== meses && (
                            <p className="text-sm text-slate-600">A curva tem {pontos} meses e a obra, {meses}: o cálculo redistribui a mesma forma no prazo da obra.</p>
                        )}
                        <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-2">
                            {Array.from({ length: pontos }, (_, k) => (
                                <div key={k}>
                                    <label htmlFor={`imovib-peso-${k}`} className="block text-xs font-semibold text-slate-500 mb-1">{pontos === meses ? `Mês ${inicio + k}` : `${k + 1}º mês da curva`}</label>
                                    <input
                                        id={`imovib-peso-${k}`}
                                        type="number" min="0" step="any"
                                        defaultValue={pesos[k] ?? ''}
                                        key={`${k}-${pesos[k] ?? ''}`}
                                        onBlur={e => salvarPeso(k, e.target.value)}
                                        className={CAMPO}
                                    />
                                </div>
                            ))}
                        </div>
                        <p className={`text-sm ${Math.abs(soma - 100) > 0.01 ? 'text-amber-700' : 'text-slate-600'}`}>
                            Soma: {soma.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%
                        </p>
                    </div>
                )}
            </fieldset>

            <ChartCard title="Desembolso mês a mês" subtitle={`Desembolso nos meses da obra: ${fmtBRL(dados.reduce((a, d) => a + d.desembolso, 0))}. A linha é o acumulado.`}>
                <Legend items={[{ label: 'Desembolso do mês', color: SERIE_PRINCIPAL }, { label: 'Acumulado (%)', color: SERIE_CONTEXTO }]} />
                <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%" initialDimension={INITIAL_DIMENSION}>
                        <ComposedChart data={dados} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                            <CartesianGrid vertical={false} stroke={GRID} />
                            <XAxis dataKey="nome" tick={TICK} axisLine={false} tickLine={false} />
                            <YAxis yAxisId="v" tick={TICK} axisLine={false} tickLine={false} tickFormatter={compactAxis} width={48} />
                            <YAxis yAxisId="p" orientation="right" domain={[0, 100]} tick={TICK} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}%`} width={40} />
                            <Tooltip
                                contentStyle={TOOLTIP_STYLE}
                                cursor={TOOLTIP_CURSOR}
                                formatter={(v: unknown, nome: unknown) => (nome === 'acumulado'
                                    ? [`${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`, 'Acumulado']
                                    : [fmtBRL(Number(v)), 'Desembolso'])}
                            />
                            <Bar yAxisId="v" dataKey="desembolso" fill={SERIE_PRINCIPAL} radius={[3, 3, 0, 0]} />
                            <Line yAxisId="p" dataKey="acumulado" stroke={SERIE_CONTEXTO} dot={false} strokeWidth={2} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </ChartCard>
        </section>
    );
};

export default ImovibDesembolsoCard;
