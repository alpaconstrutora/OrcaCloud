import React, { useEffect, useMemo, useState } from 'react';
import { History, AlertCircle, Loader2 } from 'lucide-react';
import { ImovibStudy } from '../types';
import { imovibService } from '../services/imovibService';
import { resultadosDoEstudo, diferencaEntreVersoes, type ImovibStudyVersion, type LadoDaComparacao } from '../utils/imovibVersoes';
import StandardTable, { type StandardTableColumn } from './ui/StandardTable';

interface Props {
    study: ImovibStudy;
}

const ATUAL = 'atual';
const CAMPO = 'h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';

const fmt = (v: number | string | null, unidade: string): string => {
    if (v == null) return '—';
    if (typeof v === 'string') return v;
    if (unidade === 'R$') return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
    const n = v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
    return unidade.startsWith('%') ? `${n}${unidade}` : `${n} ${unidade}`.trim();
};
const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

const COLUNAS: StandardTableColumn[] = [
    { key: 'label', label: 'Versão', width: 260 },
    { key: 'created_at', label: 'Congelada em', width: 150 },
    { key: 'vpl', label: 'VPL', width: 150, align: 'right' },
    { key: 'tir', label: 'TIR', width: 110, align: 'right' },
    { key: 'notes', label: 'Observações', width: 320 },
];

/**
 * Versões congeladas (item 10.2 do plano 2026-11-11, decisão D5): lista e
 * comparação de duas versões (ou de uma versão com o estudo atual). Versão não se
 * edita nem se apaga — a tela não oferece nenhuma das duas.
 */
const ImovibVersoesTab: React.FC<Props> = ({ study }) => {
    const [versoes, setVersoes] = useState<ImovibStudyVersion[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);
    const [ladoA, setLadoA] = useState<string>('');
    const [ladoB, setLadoB] = useState<string>(ATUAL);
    const [snapshots, setSnapshots] = useState<Record<string, ImovibStudy>>({});

    useEffect(() => {
        let vivo = true;
        setCarregando(true);
        imovibService.listarVersoes(study.id)
            .then(l => { if (vivo) { setVersoes(l); setErro(null); setLadoA(a => a || l[0]?.id || ''); } })
            .catch(e => { if (vivo) setErro((e as Error).message); })
            .finally(() => { if (vivo) setCarregando(false); });
        return () => { vivo = false; };
    }, [study.id]);

    // O snapshot é pesado: só é lido quando a versão entra na comparação.
    useEffect(() => {
        let vivo = true;
        for (const id of [ladoA, ladoB]) {
            if (!id || id === ATUAL || snapshots[id]) continue;
            imovibService.snapshotDaVersao(id)
                .then(s => { if (vivo) setSnapshots(prev => ({ ...prev, [id]: s })); })
                .catch(e => { if (vivo) setErro((e as Error).message); });
        }
        return () => { vivo = false; };
    }, [ladoA, ladoB, snapshots]);

    const atual = useMemo<LadoDaComparacao>(() => ({ snapshot: study, results: resultadosDoEstudo(study) }), [study]);
    const lado = (id: string): LadoDaComparacao | null => {
        if (id === ATUAL) return atual;
        const v = versoes.find(x => x.id === id);
        return v && snapshots[id] ? { snapshot: snapshots[id], results: v.results } : null;
    };
    const a = lado(ladoA);
    const b = lado(ladoB);
    const diferenca = a && b ? diferencaEntreVersoes(a, b) : null;
    const nomeDe = (id: string) => (id === ATUAL ? 'Estudo atual' : versoes.find(v => v.id === id)?.label ?? '');
    const opcoes = [...versoes.map(v => ({ id: v.id, nome: `${v.label} (${dataHora(v.created_at)})` })), { id: ATUAL, nome: 'Estudo atual' }];

    return (
        <div className="space-y-6">
            <section className="bg-white rounded-[10px] p-6 border border-gray-200 space-y-4" aria-labelledby="imovib-versoes-titulo">
                <div>
                    <h2 id="imovib-versoes-titulo" className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <History className="w-5 h-5 text-indigo-500" />
                        Versões congeladas
                    </h2>
                    <p className="text-slate-500 text-sm mt-1">Cada versão guarda o estudo inteiro e os indicadores do momento em que foi congelada. Não se edita nem se apaga.</p>
                </div>
                {erro && (
                    <div className="flex items-start gap-2 rounded-[10px] bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {erro}
                    </div>
                )}
                <StandardTable<ImovibStudyVersion>
                    storageKey="imovib:versoes"
                    columns={COLUNAS}
                    rows={versoes}
                    rowKey={v => v.id}
                    loading={carregando}
                    dense
                    bare
                    renderCell={(k, v) => {
                        switch (k) {
                            case 'label': return <span className="text-sm text-gray-800">{v.label}</span>;
                            case 'created_at': return <span className="text-sm text-gray-700">{dataHora(v.created_at)}</span>;
                            case 'vpl': return <span className="text-sm text-gray-700">{fmt(v.results.vpl, 'R$')}</span>;
                            case 'tir': return <span className="text-sm text-gray-700">{fmt(v.results.tirAnual, '% a.a.')}</span>;
                            case 'notes': return <span className="text-sm text-gray-600">{v.notes ?? '—'}</span>;
                            default: return null;
                        }
                    }}
                    empty={{
                        icon: <History className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                        title: 'Nenhuma versão congelada',
                        subtitle: 'Use "Congelar versão" no cabeçalho do estudo para guardar o estudo como está, por exemplo antes de apresentar ao comitê.',
                    }}
                />
            </section>

            {versoes.length > 0 && (
                <section className="bg-white rounded-[10px] p-6 border border-gray-200 space-y-4" aria-labelledby="imovib-comparar-titulo">
                    <div className="flex flex-wrap items-end gap-3">
                        <h2 id="imovib-comparar-titulo" className="text-lg font-semibold text-gray-900 mr-auto">Comparar</h2>
                        <label className="space-y-1.5">
                            <span className="block text-xs font-semibold text-slate-500">De</span>
                            <select aria-label="Comparar de" value={ladoA} onChange={e => setLadoA(e.target.value)} className={CAMPO}>
                                {opcoes.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                            </select>
                        </label>
                        <label className="space-y-1.5">
                            <span className="block text-xs font-semibold text-slate-500">Para</span>
                            <select aria-label="Comparar para" value={ladoB} onChange={e => setLadoB(e.target.value)} className={CAMPO}>
                                {opcoes.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                            </select>
                        </label>
                    </div>

                    {!diferenca ? (
                        erro ? null : <p className="text-sm text-slate-600 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Lendo as versões…</p>
                    ) : (
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                            <section aria-label="Premissas que mudaram" className="space-y-2">
                                <h3 className="text-sm font-semibold text-slate-700">Premissas que mudaram</h3>
                                {diferenca.premissas.length === 0 ? (
                                    <p className="text-sm text-slate-600">Nenhuma premissa do memorial mudou entre {nomeDe(ladoA)} e {nomeDe(ladoB)}.</p>
                                ) : (
                                    <table className="w-full text-sm">
                                        <thead><tr className="text-left text-xs text-slate-500"><th className="py-2 pr-3 font-semibold">Premissa</th><th className="py-2 pr-3 font-semibold text-right">{nomeDe(ladoA)}</th><th className="py-2 font-semibold text-right">{nomeDe(ladoB)}</th></tr></thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {diferenca.premissas.map(p => (
                                                <tr key={p.campo}>
                                                    <td className="py-2 pr-3 text-gray-700">{p.premissa}<span className="block text-xs text-slate-500">{p.grupo}</span></td>
                                                    <td className="py-2 pr-3 text-right text-gray-700">{fmt(p.antes, p.unidade)}</td>
                                                    <td className="py-2 text-right text-gray-800 font-medium">{fmt(p.depois, p.unidade)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </section>
                            <section aria-label="Indicadores lado a lado" className="space-y-2">
                                <h3 className="text-sm font-semibold text-slate-700">Indicadores lado a lado</h3>
                                <table className="w-full text-sm">
                                    <thead><tr className="text-left text-xs text-slate-500"><th className="py-2 pr-3 font-semibold">Indicador</th><th className="py-2 pr-3 font-semibold text-right">{nomeDe(ladoA)}</th><th className="py-2 font-semibold text-right">{nomeDe(ladoB)}</th></tr></thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {diferenca.indicadores.map(i => (
                                            <tr key={i.chave}>
                                                <td className="py-2 pr-3 text-gray-700">{i.rotulo}</td>
                                                <td className="py-2 pr-3 text-right text-gray-700">{i.textoA ?? fmt(i.a, i.unidade)}</td>
                                                <td className={`py-2 text-right ${i.a !== i.b ? 'text-gray-900 font-medium' : 'text-gray-700'}`}>{i.textoB ?? fmt(i.b, i.unidade)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </section>
                        </div>
                    )}
                </section>
            )}
        </div>
    );
};

export default ImovibVersoesTab;
