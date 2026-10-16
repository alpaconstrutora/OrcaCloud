/**
 * Multa & Juros do boleto — extraído de BoletoFormModal.tsx (16/10/2026) para o
 * cadastro do remetente usar o MESMO campo nos padrões do boleto (plano:
 * docs/planos/2026-10-16-captura-padroes-do-remetente.md, passo E).
 *
 * Multa em R$ e em % se excluem (preencher um limpa o outro), como no banco
 * (`boletos` e `email_capture_senders.padrao_*`).
 */
import React from 'react';

const ROTULO_PADRAO = 'text-xs font-semibold text-slate-500';
const CAMPO_PADRAO = 'w-full px-3 h-9 bg-gray-50 border border-gray-100 rounded-[6px] text-sm text-gray-900 outline-none focus:bg-white focus:border-blue-600 transition-colors disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed';

export interface MultaJurosFieldsProps {
    multa: string; setMulta: (v: string) => void;
    multaPercentual: string; setMultaPercentual: (v: string) => void;
    jurosDia: string; setJurosDia: (v: string) => void;
    jurosDiaTipo: 'valor' | 'percentual'; setJurosDiaTipo: (v: 'valor' | 'percentual') => void;
    /** Texto ao lado dos campos (padrão: o do boleto lido do PDF). */
    ajuda?: React.ReactNode;
    classeCampo?: string;
    classeRotulo?: string;
}

const Campo: React.FC<React.PropsWithChildren<{ label: string; classeRotulo: string }>> = ({ label, classeRotulo, children }) => (
    <div className="space-y-1.5">
        <label className={`flex items-center gap-1.5 ${classeRotulo}`}>{label}</label>
        {children}
    </div>
);

const MultaJurosFields: React.FC<MultaJurosFieldsProps> = ({
    multa, setMulta, multaPercentual, setMultaPercentual,
    jurosDia, setJurosDia, jurosDiaTipo, setJurosDiaTipo,
    ajuda, classeCampo = CAMPO_PADRAO, classeRotulo = ROTULO_PADRAO,
}) => {
    const temDados = multa || multaPercentual || jurosDia;
    return (
        <details open={!!temDados} className="group">
            <summary className={`flex items-center gap-1.5 ${classeRotulo} cursor-pointer select-none list-none mb-2`}>
                <span className="group-open:rotate-90 inline-block transition-transform">▶</span>
                Multa &amp; Juros
                {temDados && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />}
            </summary>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 pt-1">
                <Campo label="Multa (R$)" classeRotulo={classeRotulo}>
                    <input
                        type="number" step="0.01" min="0"
                        aria-label="Multa (R$)"
                        value={multa}
                        onChange={e => { setMulta(e.target.value); if (e.target.value) setMultaPercentual(''); }}
                        placeholder="0,00"
                        className={classeCampo}
                    />
                </Campo>
                <Campo label="Multa (%)" classeRotulo={classeRotulo}>
                    <input
                        type="number" step="0.0001" min="0" max="100"
                        aria-label="Multa (%)"
                        value={multaPercentual}
                        onChange={e => { setMultaPercentual(e.target.value); if (e.target.value) setMulta(''); }}
                        placeholder="2,00"
                        className={classeCampo}
                    />
                </Campo>
                <Campo label="Juros/dia" classeRotulo={classeRotulo}>
                    <div className="flex gap-1">
                        <input
                            type="number" step="0.0001" min="0"
                            aria-label="Juros/dia"
                            value={jurosDia}
                            onChange={e => setJurosDia(e.target.value)}
                            placeholder="0,033"
                            className={classeCampo}
                        />
                        <select
                            aria-label="Tipo dos juros"
                            value={jurosDiaTipo}
                            onChange={e => setJurosDiaTipo(e.target.value as 'valor' | 'percentual')}
                            className={`${classeCampo} w-auto px-2`}
                        >
                            <option value="valor">R$</option>
                            <option value="percentual">%</option>
                        </select>
                    </div>
                </Campo>
                <div className="flex items-end pb-1">
                    <p className="text-xs text-gray-400 leading-tight">
                        {ajuda ?? <>Extraídos do texto do boleto.<br />Confidence baixa — revise antes de aprovar.</>}
                    </p>
                </div>
            </div>
        </details>
    );
};

export default MultaJurosFields;
