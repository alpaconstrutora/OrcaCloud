import React, { useMemo } from 'react';
import { MapPin, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { ImovibStudy, ImovibParcelaDoTerreno } from '../types';
import { useImovibEdicao } from '../hooks/useImovibEdicao';
import { useImovibMath } from '../hooks/useImovibMath';
import { IMOVIB_DEFAULTS } from '../constants/imovibDefaults';
import { nomeDoMes } from '../utils/imovibCronograma';
import MoneyCentsInput from './ui/MoneyCentsInput';
import ImovibDueDiligenceCard from './ImovibDueDiligenceCard';

interface ImovibTerrenoTabProps {
    study: ImovibStudy;
    /** Formulário de Premissas: custo e parcelas gravam com "Salvar Premissas". */
    formData: Partial<ImovibStudy>;
    setCampo: (campo: keyof ImovibStudy, valor: unknown) => void;
}

const fmtBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
const CAMPO = 'h-9 w-full px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all';

/**
 * Sub-aba Terreno de Premissas (itens 5.2 e 5.9 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md): custo do terreno
 * (saiu do CAPEX), parcelas de pagamento e due diligence.
 */
const ImovibTerrenoTab: React.FC<ImovibTerrenoTabProps> = ({ study, formData, setCampo }) => {
    const { pode, motivo } = useImovibEdicao();
    const estudo = useMemo(() => ({ ...study, ...formData }) as ImovibStudy, [study, formData]);
    const r = useImovibMath(estudo);
    const custo = Number(formData.land_cost ?? 0) || 0;
    const parcelas: ImovibParcelaDoTerreno[] = formData.land_payment_schedule ?? [];
    const soma = parcelas.reduce((a, p) => a + (Number(p.percent) || 0), 0);
    const aquisicao = estudo.acquisition_month ?? IMOVIB_DEFAULTS.acquisition_month;
    const aviso = r.avisos.find(a => a.codigo === 'terreno_nao_soma_100');

    const mudarParcelas = (novas: ImovibParcelaDoTerreno[]) => setCampo('land_payment_schedule', novas.length ? novas : null);
    const mudar = (i: number, campo: keyof ImovibParcelaDoTerreno, texto: string) =>
        mudarParcelas(parcelas.map((p, k) => (k === i ? { ...p, [campo]: texto === '' ? 0 : Number(texto) } : p)));

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-[10px] p-6 border border-slate-100 shadow-sm space-y-6">
                <div>
                    <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                        <MapPin className="w-5 h-5 text-indigo-500" />
                        Módulo 3 — Terreno
                    </h2>
                    <p className="text-slate-500 text-sm mt-1">Custo e forma de pagamento. Sem parcelas, o terreno sai inteiro no mês da aquisição (mês {aquisicao}, em Cronograma).</p>
                </div>

                {aviso && (
                    <div className="flex items-start gap-2 rounded-[10px] bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {aviso.mensagem}
                    </div>
                )}

                <fieldset disabled={!pode} title={!pode ? motivo : undefined} className="imovib-ro min-w-0 border-0 p-0 m-0 space-y-6">
                    <div className="max-w-sm">
                        <label htmlFor="imovib-custo-terreno" className="block text-xs font-semibold text-slate-500 mb-1.5">Custo de aquisição do terreno (R$)</label>
                        <MoneyCentsInput
                            id="imovib-custo-terreno"
                            value={custo}
                            onChange={v => setCampo('land_cost', Number(v) || 0)}
                            className={CAMPO}
                        />
                    </div>

                    <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-slate-800">Parcelas do pagamento</span>
                            <button
                                type="button"
                                onClick={() => mudarParcelas([...parcelas, { month: parcelas.length ? Math.max(...parcelas.map(p => p.month)) + 1 : aquisicao, percent: Math.max(0, 100 - soma) }])}
                                className="flex items-center gap-1.5 h-9 px-3.5 text-[13px] font-medium rounded-[6px] border border-gray-200 bg-white text-slate-700 hover:bg-gray-50"
                            >
                                <Plus className="w-[15px] h-[15px]" /> Adicionar parcela
                            </button>
                        </div>
                        {parcelas.length === 0 ? (
                            <p className="text-sm text-slate-600">Pagamento à vista: {fmtBRL(custo)} no mês {aquisicao}.</p>
                        ) : (
                            <div className="space-y-2">
                                {parcelas.map((p, i) => (
                                    <div key={i} className="grid grid-cols-[8rem_8rem_1fr_auto] items-end gap-3">
                                        <div>
                                            <label htmlFor={`imovib-parcela-mes-${i}`} className="block text-xs font-semibold text-slate-500 mb-1.5">Mês</label>
                                            <input id={`imovib-parcela-mes-${i}`} type="number" min="1" step="1" value={p.month || ''} onChange={e => mudar(i, 'month', e.target.value)} className={CAMPO} />
                                        </div>
                                        <div>
                                            <label htmlFor={`imovib-parcela-pct-${i}`} className="block text-xs font-semibold text-slate-500 mb-1.5">% do terreno</label>
                                            <input id={`imovib-parcela-pct-${i}`} type="number" min="0" step="any" value={p.percent || ''} onChange={e => mudar(i, 'percent', e.target.value)} className={CAMPO} />
                                        </div>
                                        <span className="text-sm text-slate-700 pb-2">
                                            {fmtBRL(custo * (Number(p.percent) || 0) / 100)} em {nomeDoMes(estudo.base_date, p.month || 1)}
                                        </span>
                                        <button type="button" onClick={() => mudarParcelas(parcelas.filter((_, k) => k !== i))} title={!pode ? motivo : 'Remover a parcela'} aria-label={`Remover a parcela ${i + 1}`}
                                            className="h-9 w-9 flex items-center justify-center rounded-[6px] text-slate-500 hover:bg-rose-50 hover:text-rose-600">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                                <p className={`text-sm ${Math.abs(soma - 100) > 0.01 ? 'text-amber-700' : 'text-slate-600'}`}>
                                    Soma das parcelas: {soma.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%
                                </p>
                            </div>
                        )}
                    </div>
                </fieldset>
            </div>

            <ImovibDueDiligenceCard study={study} />
        </div>
    );
};

export default ImovibTerrenoTab;
