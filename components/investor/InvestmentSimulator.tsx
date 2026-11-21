import React, { useState } from 'react';
import { TrendingUp } from 'lucide-react';
import type { NumerosDaVitrine } from '../../utils/oportunidadeNumerosDaVersao';
import MoneyCentsInput from '../ui/MoneyCentsInput';

const fmtBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
const fmtPct = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

/**
 * Quanto um aporte renderia NAS PREMISSAS DA VERSÃO congelada do Imovib (plano
 * docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md, item 2.4).
 *
 * Antes: sem dado, mostrava custo R$ 58 mi, VGV R$ 92 mi, TIR 18,4%, ROI 62% e CDI 10,5% fixos — números
 * inventados na aba pública. Agora:
 *  - participação = aporte ÷ capital que o projeto exige (exposição máxima da versão);
 *  - retorno = aporte × lucro ÷ exposição (o "retorno sobre o capital" do Imovib);
 *  - régua = a TMA do estudo no mesmo prazo, não um CDI fixo;
 *  - sem versão, sem exposição ou sem lucro: o simulador não aparece (`podeSimular`).
 * Puro na conta (`simular`), testado em __tests__/components/InvestmentSimulator.test.tsx.
 */
export const podeSimular = (n: NumerosDaVitrine) =>
    n.comVersao && (n.exposicao_maxima ?? 0) > 0 && n.lucro_liquido != null;

export function simular(aporte: number, n: NumerosDaVitrine) {
    const exposicao = n.exposicao_maxima ?? 0;
    const lucro = n.lucro_liquido ?? 0;
    // Fase 4: a participação é sobre a META da captação (fontes de investidor do estudo, senão a exposição).
    const base = n.captacaoReal?.meta ?? exposicao;
    const participacaoPct = base > 0 ? (aporte / base) * 100 : 0;
    const retorno = exposicao > 0 ? aporte * (lucro / exposicao) : 0;
    const meses = n.prazo_meses ?? 0;
    const naTma = n.tma != null && meses > 0 ? aporte * (Math.pow(1 + n.tma / 100, meses / 12) - 1) : null;
    return { participacaoPct, retorno, naTma, meses };
}

export const InvestmentSimulator: React.FC<{ numeros: NumerosDaVitrine; ticketMinimo?: number | null; versao?: string | null }> = ({ numeros, ticketMinimo, versao }) => {
    const [aporte, setAporte] = useState<number>(ticketMinimo && ticketMinimo > 0 ? ticketMinimo : 100_000);
    if (!podeSimular(numeros)) return null;
    const r = simular(aporte, numeros);
    const abaixoDoTicket = !!ticketMinimo && aporte < ticketMinimo;

    return (
        <section className="bg-white rounded-[10px] border border-gray-100 p-6 shadow-sm space-y-5" aria-labelledby="simulador-titulo">
            <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-indigo-600" />
                <h3 id="simulador-titulo" className="text-lg font-semibold text-gray-900">Simulador de aporte</h3>
            </div>
            <div className="max-w-xs space-y-1.5">
                <label htmlFor="simulador-aporte" className="block text-xs font-semibold text-slate-500">Valor do aporte (R$)</label>
                <MoneyCentsInput id="simulador-aporte" value={aporte} onChange={v => setAporte(Number(v) || 0)}
                    className="w-full px-3 h-9 border border-gray-200 rounded-[6px] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                {abaixoDoTicket && <p className="text-xs text-amber-700">Abaixo do ticket mínimo de {fmtBRL(ticketMinimo!)}.</p>}
            </div>
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                <div className="rounded-[10px] bg-slate-50 border border-slate-100 p-4">
                    <dt className="text-xs text-slate-500">Participação na captação</dt>
                    <dd className="text-lg font-semibold text-slate-900 mt-1">{fmtPct(r.participacaoPct)}</dd>
                </div>
                <div className="rounded-[10px] bg-slate-50 border border-slate-100 p-4">
                    <dt className="text-xs text-slate-500">Lucro estimado sobre o aporte</dt>
                    <dd className="text-lg font-semibold text-emerald-700 mt-1">{fmtBRL(r.retorno)}</dd>
                </div>
                <div className="rounded-[10px] bg-slate-50 border border-slate-100 p-4">
                    <dt className="text-xs text-slate-500">O mesmo valor à TMA do estudo{r.meses ? ` (${r.meses} meses)` : ''}</dt>
                    <dd className="text-lg font-semibold text-slate-900 mt-1">{r.naTma == null ? '—' : fmtBRL(r.naTma)}</dd>
                </div>
            </dl>
            <p className="text-xs text-slate-500">
                Proporcional aos números {versao ? `da versão "${versao}"` : 'da versão publicada'} do estudo de viabilidade: lucro líquido
                {' '}{fmtBRL(numeros.lucro_liquido ?? 0)} sobre o capital máximo exigido de {fmtBRL(numeros.exposicao_maxima ?? 0)}.
                Simulação, não promessa de rentabilidade.
            </p>
        </section>
    );
};
