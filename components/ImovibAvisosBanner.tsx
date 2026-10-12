import React from 'react';
import { AlertTriangle } from 'lucide-react';
import type { ImovibAba, ImovibAviso } from '../hooks/useImovibMath';

/**
 * Avisos do motor de viabilidade (`computeImovibMath().avisos`) acima dos KPIs.
 *
 * Situação anormal que exige ação (guia §5.3): o número exibido abaixo foi
 * calculado com uma premissa que o motor não consegue usar como está. Mesmo
 * estilo do banner de EAP perdida (`BudgetEditor.tsx`).
 */

const ROTULO_ABA: Record<ImovibAba, string> = {
    premises: 'Premissas',
    capex: 'Orçamento (CAPEX)',
    funding: 'Receitas & Capital',
    viability_dynamic: 'Dinâmica',
};

interface ImovibAvisosBannerProps {
    avisos: ImovibAviso[];
    /** Quando presente, cada aviso ganha um botão que abre a aba que corrige. */
    onIrPara?: (aba: ImovibAba) => void;
}

const ImovibAvisosBanner: React.FC<ImovibAvisosBannerProps> = ({ avisos, onIrPara }) => {
    if (!avisos.length) return null;
    return (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-[10px]" role="alert">
            <div className="flex items-start gap-3">
                <div className="bg-amber-100 p-2 rounded-full text-amber-600 shrink-0">
                    <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-amber-800 font-bold text-sm">
                        {avisos.length === 1 ? 'Uma premissa precisa de atenção' : `${avisos.length} premissas precisam de atenção`}
                    </p>
                    <ul className="mt-2 space-y-2">
                        {avisos.map(a => (
                            <li key={a.codigo} className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-amber-700 text-xs">{a.mensagem}</span>
                                {onIrPara && (
                                    <button
                                        type="button"
                                        onClick={() => onIrPara(a.aba)}
                                        className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded text-button font-bold transition-colors whitespace-nowrap"
                                    >
                                        Corrigir em {ROTULO_ABA[a.aba]}
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default ImovibAvisosBanner;
