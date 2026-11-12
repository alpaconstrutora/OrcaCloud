import React, { useEffect, useState } from 'react';
import { ImovibStudy } from '../types';
import { cubDoPadrao, CubDoPadrao } from '../services/cubService';
import { empreendimentoService } from '../services/empreendimentoService';

/**
 * Referência de CUB para o custo de obra por torre (item 5.7 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md). UF, padrão e
 * acréscimo são hipóteses desta tela (não gravadas): a UF vem do terreno do
 * empreendimento vinculado; o padrão, da subclassificação do estudo.
 */

export const PADRAO_CUB_DA_SUBCLASSIFICACAO: Record<string, string> = {
    'Econômico': 'R8-B', 'Médio': 'R8-N', 'Alto': 'R8-A', 'Luxo': 'R8-A',
    'MCMV F1': 'R8-B', 'MCMV F2': 'R8-B', 'MCMV F3': 'R8-B',
};
const PADROES = ['R1-B', 'R1-N', 'R1-A', 'PP-B', 'PP-N', 'R8-B', 'R8-N', 'R8-A', 'R16-N', 'R16-A', 'PIS', 'RP1Q', 'CSL8-N', 'CSL8-A', 'CSL16-N', 'CSL16-A', 'CAL8-N', 'CAL8-A', 'GI'];
const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];
/** O mesmo padrão de HipotesesFinanceiras.acrescimosSobreCubPct (utils/blueprintProduto.ts). */
const ACRESCIMO_PADRAO = 25;

export interface ReferenciaDeCub {
    cub: CubDoPadrao | null;
    acrescimoPct: number;
    /** CUB × (1 + acréscimo). */
    sugerido: number | null;
}

const CAMPO = 'h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20';

/** Controles (UF, padrão, acréscimo) e a linha de referência; devolve a referência por `onReferencia`. */
const ImovibCubReferencia: React.FC<{ study: ImovibStudy; onReferencia: (r: ReferenciaDeCub) => void }> = ({ study, onReferencia }) => {
    const empId = study.estrutura?.origem === 'empreendimento' ? study.estrutura.empreendimento_id : undefined;
    const [ufDoEmp, setUfDoEmp] = useState<string | null>(null);
    const [uf, setUf] = useState<string>('');
    const padraoSugerido = PADRAO_CUB_DA_SUBCLASSIFICACAO[study.sub_classification ?? ''] ?? 'R8-N';
    const [padrao, setPadrao] = useState(padraoSugerido);
    const [acrescimo, setAcrescimo] = useState(String(ACRESCIMO_PADRAO));
    const [cub, setCub] = useState<CubDoPadrao | null>(null);

    useEffect(() => {
        if (!empId) return;
        let vivo = true;
        empreendimentoService.getById(empId)
            .then(e => { if (vivo && e?.terreno_state) { setUfDoEmp(e.terreno_state); setUf(u => u || e.terreno_state!); } })
            .catch(() => undefined);
        return () => { vivo = false; };
    }, [empId]);

    useEffect(() => {
        if (!uf || !padrao) { setCub(null); return; }
        let vivo = true;
        cubDoPadrao(uf, padrao).then(c => { if (vivo) setCub(c); }).catch(() => { if (vivo) setCub(null); });
        return () => { vivo = false; };
    }, [uf, padrao]);

    const pct = Number(acrescimo);
    const acrescimoPct = Number.isFinite(pct) && pct >= 0 ? pct : ACRESCIMO_PADRAO;
    useEffect(() => {
        onReferencia({ cub, acrescimoPct, sugerido: cub ? cub.valorM2 * (1 + acrescimoPct / 100) : null });
    }, [cub, acrescimoPct]); // eslint-disable-line react-hooks/exhaustive-deps

    const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

    return (
        <div className="flex flex-wrap items-end gap-3 pb-3 mb-3 border-b border-slate-200">
            <div>
                <label htmlFor="imovib-cub-uf" className="block text-xs font-semibold text-slate-500 mb-1">UF do CUB</label>
                <select id="imovib-cub-uf" value={uf} onChange={e => setUf(e.target.value)} className={`${CAMPO} cursor-pointer`}
                    title={ufDoEmp ? `Do terreno do empreendimento: ${ufDoEmp}` : 'Sem empreendimento vinculado com UF: escolha a UF'}>
                    <option value="">Escolha…</option>
                    {UFS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
            </div>
            <div>
                <label htmlFor="imovib-cub-padrao" className="block text-xs font-semibold text-slate-500 mb-1">Padrão</label>
                <select id="imovib-cub-padrao" value={padrao} onChange={e => setPadrao(e.target.value)} className={`${CAMPO} cursor-pointer`}
                    title={`Pela subclassificação do estudo (${study.sub_classification || 'sem subclassificação'} → ${padraoSugerido}); altere se precisar.`}>
                    {PADROES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
            </div>
            <div>
                <label htmlFor="imovib-cub-acrescimo" className="block text-xs font-semibold text-slate-500 mb-1">Acréscimo sobre o CUB (%)</label>
                <input id="imovib-cub-acrescimo" type="number" min="0" step="1" value={acrescimo} onChange={e => setAcrescimo(e.target.value)} className={`${CAMPO} w-24 text-right`} />
            </div>
            <p className="text-sm text-slate-700 pb-2">
                {!uf ? 'Escolha a UF para ver o CUB.'
                    : !cub ? 'Carregando o CUB…'
                        : <>CUB {padrao}/{uf}: {fmt(cub.valorM2)}/m² · {cub.fonte === 'ESTIMADO' ? 'estimado (sem tabela do mês)' : cub.referencia}</>}
            </p>
        </div>
    );
};

export default ImovibCubReferencia;
