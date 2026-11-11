import React, { useMemo, useState } from 'react';
import { Scale } from 'lucide-react';
import { ImovibStudy } from '../types';
import { IMOVIB_DEFAULTS } from '../constants/imovibDefaults';
import { terrenoMaximo, precoMinimo, custoMaximoDeObra, vendasMinimas, PontoDeEquilibrio } from '../utils/imovibEquilibrio';

interface ImovibPontosDeEquilibrioCardProps {
    study: ImovibStudy;
}

const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
const pct = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

const MOTIVO: Record<NonNullable<PontoDeEquilibrio['motivo']>, string> = {
    sem_vgv: 'Sem VGV no estudo',
    sem_raiz: 'Não existe: o alvo não é atingido em nenhum valor',
    acima_do_vgv: 'Nem vendendo tudo: o VPL fica negativo',
};

const Linha: React.FC<{ rotulo: string; ajuda: string; ponto: PontoDeEquilibrio; formata: (v: number) => string }> = ({ rotulo, ajuda, ponto, formata }) => (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-slate-100 last:border-b-0">
        <div className="min-w-0">
            <p className="text-sm font-medium text-slate-800">{rotulo}</p>
            <p className="text-xs text-slate-500">{ajuda}</p>
        </div>
        <p className={`text-sm font-semibold whitespace-nowrap ${ponto.valor == null ? 'text-slate-500' : 'text-slate-900'}`}>
            {ponto.valor == null ? MOTIVO[ponto.motivo ?? 'sem_raiz'] : formata(ponto.valor)}
        </p>
    </div>
);

/**
 * Pontos de equilíbrio do Resumo Executivo (item 2.3 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md). Cada número sai
 * de rodar o motor de novo sobre cópias do estudo (utils/imovibEquilibrio.ts);
 * a margem-alvo é hipótese desta tela, não é gravada.
 */
const ImovibPontosDeEquilibrioCard: React.FC<ImovibPontosDeEquilibrioCardProps> = ({ study }) => {
    const [margemAlvo, setMargemAlvo] = useState<string>(String(IMOVIB_DEFAULTS.margem_alvo_terreno_percent));
    const margem = parseFloat(margemAlvo);

    const fixos = useMemo(() => ({
        terrenoVplZero: terrenoMaximo(study, { tipo: 'vpl_zero' }),
        preco: precoMinimo(study),
        custo: custoMaximoDeObra(study),
        vendas: vendasMinimas(study),
    }), [study]);
    const terrenoMargem = useMemo(
        () => (Number.isFinite(margem) ? terrenoMaximo(study, { tipo: 'margem', pct: margem }) : { valor: null, motivo: 'sem_raiz' as const }),
        [study, margem],
    );

    return (
        <div className="bg-white rounded-[10px] p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3 mb-1">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-[6px]">
                    <Scale className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Pontos de equilíbrio</h3>
            </div>
            <p className="text-sm text-slate-500 mb-3">Até onde cada premissa pode ir antes de o projeto deixar de pagar a TMA (VPL zero).</p>

            <Linha
                rotulo="Valor máximo do terreno"
                ajuda="Custo do terreno que leva o VPL a zero"
                ponto={fixos.terrenoVplZero}
                formata={brl}
            />
            <div className="flex items-start justify-between gap-4 py-3 border-b border-slate-100">
                <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800">Terreno para a margem-alvo</p>
                    <label className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                        Margem líquida sobre o VGV
                        <input
                            type="number"
                            step="0.5"
                            value={margemAlvo}
                            onChange={(e) => setMargemAlvo(e.target.value)}
                            aria-label="Margem-alvo sobre o VGV (%)"
                            title="Hipótese desta tela, não é gravada no estudo."
                            className="h-9 w-20 px-2 bg-white border border-gray-200 rounded-[6px] text-sm text-slate-700 text-right outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                        />
                        %
                    </label>
                </div>
                <p className={`text-sm font-semibold whitespace-nowrap ${terrenoMargem.valor == null ? 'text-slate-500' : 'text-slate-900'}`}>
                    {terrenoMargem.valor == null ? MOTIVO[terrenoMargem.motivo ?? 'sem_raiz'] : brl(terrenoMargem.valor)}
                </p>
            </div>
            <Linha
                rotulo={fixos.preco.valor != null && fixos.preco.valor > 0 ? 'Aumento de preço necessário' : 'Queda de preço suportada'}
                ajuda="Variação do VGV que leva o VPL a zero"
                ponto={fixos.preco}
                formata={(v) => pct(v)}
            />
            <Linha
                rotulo={fixos.custo.valor != null && fixos.custo.valor < 0 ? 'Redução de custo necessária' : 'Alta de custo de obra suportada'}
                ajuda="Variação do custo de obra que leva o VPL a zero"
                ponto={fixos.custo}
                formata={(v) => pct(v)}
            />
            <Linha
                rotulo="Vendas mínimas"
                ajuda="Percentual do VGV vendável, no ritmo da curva de vendas"
                ponto={fixos.vendas}
                formata={(v) => pct(v)}
            />
        </div>
    );
};

export default ImovibPontosDeEquilibrioCard;
