import React, { useEffect, useMemo, useState } from 'react';
import { Gavel, Loader2, CheckCircle2, XCircle, MinusCircle } from 'lucide-react';
import { ImovibStudy, ImovibStudyUpdate } from '../types';
import type { ImovibMathResult } from '../hooks/useImovibMath';
import type { IndicadoresDoEstudo } from '../utils/imovibIndicadores';
import { imovibService } from '../services/imovibService';
import { useImovibEdicao } from '../hooks/useImovibEdicao';
import { useToast } from '../hooks/useToast';
import { useStore } from '../store/useStore';
import { criteriosDoParecer, ROTULO_DO_PARECER, type Parecer, type CriterioDoParecer } from '../utils/imovibParecer';
import { terrenoMaximo } from '../utils/imovibEquilibrio';
import { IMOVIB_DEFAULTS } from '../constants/imovibDefaults';

interface Props {
    study: ImovibStudy;
    resultado: ImovibMathResult;
    indicadores: IndicadoresDoEstudo;
    onDataChanged: () => void;
}

const CAMPO = 'h-9 w-full px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';
const fmtBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
const fmt = (v: number | null, unidade: CriterioDoParecer['unidade']) =>
    v == null ? '—' : unidade === 'R$' ? fmtBRL(v) : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}${unidade}`;

/** Nome de quem registra o parecer: o do cadastro do usuário, senão o e-mail. */
const useNomeDoUsuario = (): string => {
    const session = useStore(s => s.session);
    const email = useStore(s => s.currentProfile?.email);
    const meta = (session?.user as { user_metadata?: { full_name?: string; name?: string } } | undefined)?.user_metadata;
    return meta?.full_name?.trim() || meta?.name?.trim() || session?.user?.email || email || 'Usuário';
};

function CampoDoMinimo({ rotulo, valor, padrao, onCommit, desligado, motivo }: {
    rotulo: string; valor: number | null | undefined; padrao: string; onCommit: (v: number | null) => void; desligado: boolean; motivo?: string;
}) {
    const [texto, setTexto] = useState(valor == null ? '' : String(valor));
    useEffect(() => { setTexto(valor == null ? '' : String(valor)); }, [valor]);
    const id = `imovib-parecer-${rotulo}`;
    return (
        <div className="space-y-1.5">
            <label htmlFor={id} className="text-xs font-semibold text-slate-500">{rotulo}</label>
            <input
                id={id}
                type="number"
                value={texto}
                placeholder={padrao}
                disabled={desligado}
                title={desligado ? motivo : undefined}
                onChange={e => setTexto(e.target.value)}
                onBlur={() => {
                    const novo = texto.trim() === '' ? null : Number(texto);
                    if (novo !== (valor ?? null) && (novo == null || Number.isFinite(novo))) onCommit(novo);
                }}
                className={CAMPO}
            />
        </div>
    );
}

/**
 * Parecer e critérios (item 10.3 do plano 2026-11-11), no topo do Resumo. Os
 * critérios dizem se o estudo atende aos mínimos; o parecer é de uma pessoa — o
 * sistema não o escolhe —, gravado com a justificativa, quem e quando.
 */
const ImovibParecerCard: React.FC<Props> = ({ study, resultado, indicadores, onDataChanged }) => {
    const { pode, motivo: motivoRo } = useImovibEdicao();
    const { showToast } = useToast();
    const nomeDoUsuario = useNomeDoUsuario();
    const criterios = useMemo(() => criteriosDoParecer(study, resultado, indicadores), [study, resultado, indicadores]);
    const terreno = useMemo(() => terrenoMaximo(study, { tipo: 'vpl_zero' }), [study]);
    const [parecer, setParecer] = useState<Parecer | ''>(study.recommendation ?? '');
    const [justificativa, setJustificativa] = useState(study.recommendation_notes ?? '');
    const [salvando, setSalvando] = useState(false);

    useEffect(() => {
        setParecer(study.recommendation ?? '');
        setJustificativa(study.recommendation_notes ?? '');
    }, [study.recommendation, study.recommendation_notes]);

    const gravar = async (campos: ImovibStudyUpdate) => {
        try {
            await imovibService.updateStudy(study.id, campos);
            onDataChanged();
            return true;
        } catch (e) {
            showToast((e as Error).message, 'error');
            return false;
        }
    };
    const mudou = parecer !== (study.recommendation ?? '') || justificativa.trim() !== (study.recommendation_notes ?? '');
    const motivo = !pode ? motivoRo : !parecer ? 'Escolha o parecer.' : !mudou ? 'Nada foi alterado.' : undefined;
    const registrar = async () => {
        if (motivo || !parecer) return;
        setSalvando(true);
        const ok = await gravar({
            recommendation: parecer,
            recommendation_notes: justificativa.trim() || null,
            recommended_by: nomeDoUsuario,
            recommended_at: new Date().toISOString(),
        });
        setSalvando(false);
        if (ok) showToast('Parecer registrado.', 'success');
    };

    const Icone = ({ atende }: { atende: boolean | null }) =>
        atende == null ? <MinusCircle className="w-4 h-4 text-slate-400" aria-label="Sem como avaliar" />
            : atende ? <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-label="Atende" />
                : <XCircle className="w-4 h-4 text-red-600" aria-label="Não atende" />;

    return (
        <section className="bg-white rounded-[10px] p-6 border border-gray-200 space-y-5" aria-labelledby="imovib-parecer-titulo">
            <div>
                <h2 id="imovib-parecer-titulo" className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <Gavel className="w-5 h-5 text-indigo-500" />
                    Parecer
                </h2>
                <p className="text-slate-500 text-sm mt-1">Os critérios mostram se o estudo atende aos mínimos. O parecer é de quem assina: o sistema não o escolhe.</p>
            </div>

            <table className="w-full text-sm">
                <thead>
                    <tr className="text-left text-xs text-slate-500">
                        <th className="py-2 pr-3 font-semibold">Critério</th>
                        <th className="py-2 pr-3 font-semibold text-right">Estudo</th>
                        <th className="py-2 pr-3 font-semibold text-right">Mínimo / limite</th>
                        <th className="py-2 font-semibold text-center w-20">Atende</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {criterios.map(c => (
                        <tr key={c.id}>
                            <td className="py-2 pr-3 text-gray-700">{c.rotulo}</td>
                            <td className="py-2 pr-3 text-right text-gray-800">{c.valor == null && c.id === 'tir_acima_da_tma' ? 'Sem TIR' : fmt(c.valor, c.unidade)}</td>
                            <td className="py-2 pr-3 text-right text-gray-700">
                                {c.minimo == null ? <span className="text-slate-500">Sem limite definido</span> : `${c.id === 'exposicao_maxima' ? 'até ' : ''}${fmt(c.minimo, c.unidade)}`}
                            </td>
                            <td className="py-2"><span className="flex justify-center"><Icone atende={c.atende} /></span></td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <CampoDoMinimo rotulo="Folga da TIR sobre a TMA (p.p.)" valor={study.hurdle_irr_spread} padrao={`Padrão: ${IMOVIB_DEFAULTS.hurdle_irr_spread}`} desligado={!pode} motivo={motivoRo}
                    onCommit={v => void gravar({ hurdle_irr_spread: v })} />
                <CampoDoMinimo rotulo="Margem mínima (%)" valor={study.hurdle_margin_percent} padrao={`Padrão: ${IMOVIB_DEFAULTS.hurdle_margin_percent}`} desligado={!pode} motivo={motivoRo}
                    onCommit={v => void gravar({ hurdle_margin_percent: v })} />
                <CampoDoMinimo rotulo="Exposição máxima aceita (R$)" valor={study.hurdle_max_exposure} padrao="Sem limite" desligado={!pode} motivo={motivoRo}
                    onCommit={v => void gravar({ hurdle_max_exposure: v })} />
            </div>

            <p className="text-sm text-slate-700">
                Valor máximo do terreno (VPL zero): <span className="font-medium text-gray-900">{terreno.valor == null ? 'não existe com estas premissas' : fmtBRL(terreno.valor)}</span>
                {terreno.valor != null && <span className="text-slate-500"> · terreno do estudo {fmtBRL(resultado.landCost)}</span>}
            </p>

            <div className="pt-4 border-t border-gray-100 grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                <div className="space-y-1.5">
                    <label htmlFor="imovib-parecer-escolha" className="text-xs font-semibold text-slate-500">Parecer</label>
                    <select id="imovib-parecer-escolha" value={parecer} disabled={!pode} title={!pode ? motivoRo : undefined}
                        onChange={e => setParecer(e.target.value as Parecer | '')} className={`${CAMPO} cursor-pointer`}>
                        <option value="">Não registrado</option>
                        {(Object.keys(ROTULO_DO_PARECER) as Parecer[]).map(p => <option key={p} value={p}>{ROTULO_DO_PARECER[p]}</option>)}
                    </select>
                </div>
                <div className="space-y-1.5 md:col-span-2">
                    <label htmlFor="imovib-parecer-justificativa" className="text-xs font-semibold text-slate-500">Justificativa</label>
                    <textarea id="imovib-parecer-justificativa" rows={2} value={justificativa} disabled={!pode} title={!pode ? motivoRo : undefined}
                        onChange={e => setJustificativa(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-[6px] text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none" />
                </div>
                <div className="md:col-span-3 flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs text-slate-600">
                        {study.recommendation
                            ? `Registrado: ${ROTULO_DO_PARECER[study.recommendation]}${study.recommended_by ? `, por ${study.recommended_by}` : ''}${study.recommended_at ? ` em ${new Date(study.recommended_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}` : ''}.`
                            : 'Nenhum parecer registrado.'}
                    </span>
                    <button type="button" onClick={() => void registrar()} disabled={salvando || !!motivo} title={motivo}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] disabled:opacity-50 disabled:cursor-not-allowed">
                        {salvando && <Loader2 className="w-[15px] h-[15px] animate-spin" />}
                        Registrar parecer
                    </button>
                </div>
            </div>
        </section>
    );
};

export default ImovibParecerCard;
