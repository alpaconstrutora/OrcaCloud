import React, { useState } from 'react';
import { Ruler, LayoutGrid, ShieldCheck, ArrowRight, Info } from 'lucide-react';
import { RentalPricingConfig } from '../types';

interface RentalPricingIntelligencePanelProps {
    onApply: (config: RentalPricingConfig) => void;
    loading?: boolean;
}

/**
 * Bloco de precificação da aba "Inteligência" (Comercial › Gestão de Locações ›
 * Gestão de Unidades): escolhe a estratégia, o valor-alvo, e aplica.
 *
 * Histórico, porque a forma deste componente é consequência dele:
 *  - nasceu `RentalPricingIntelligenceModal` (diálogo com overlay);
 *  - virou aba própria, "Inteligência Hedônica", e perdeu backdrop/X/Cancelar;
 *  - em 2026-09-11 o modelo hedônico saiu do cálculo — sobrou área × regras;
 *  - em 2026-09-12 a aba própria deixou de existir e este conteúdo passou a
 *    morar ACIMA da tabela de regras, na aba "Inteligência". Com as duas metades
 *    na mesma tela (o que ajusta o preço, e o botão que aplica), o cabeçalho
 *    azul de tela cheia virou um segundo título competindo com o da página
 *    (§18/§20 do guia) — por isso ele saiu, e o bloco adotou a escala compacta
 *    do §16 (containers 10px, controles 6px/h-9, botão primário do §17).
 */
const RentalPricingIntelligencePanel: React.FC<RentalPricingIntelligencePanelProps> = ({ onApply, loading }) => {
    const [config, setConfig] = useState<RentalPricingConfig>({
        mode: 'PER_SQM',
        base_per_sqm: 0,
        target_total_rent: 0,
    });

    const modeButton = (mode: RentalPricingConfig['mode'], Icon: typeof Ruler, title: string, hint: string) => (
        <button
            type="button"
            onClick={() => setConfig({ ...config, mode })}
            className={`flex-1 flex items-start gap-2.5 p-3 rounded-[6px] border text-left transition-all ${
                config.mode === mode
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300'
            }`}
        >
            <Icon className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="min-w-0">
                <span className="block text-sm font-medium">{title}</span>
                <span className={`block text-[13px] ${config.mode === mode ? 'text-blue-100' : 'text-gray-400'}`}>{hint}</span>
            </span>
        </button>
    );

    const isPerSqm = config.mode === 'PER_SQM';

    return (
        <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-4 space-y-3">
            {/* O que o cálculo faz — curto, porque as regras que ele usa estão
                logo abaixo, na mesma tela. */}
            <div className="flex items-start gap-2.5 text-[13px] text-gray-500">
                <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <p>
                    O aluguel de cada unidade sai da <span className="font-medium text-gray-700">área</span> ajustada pelas
                    <span className="font-medium text-gray-700"> regras abaixo</span> que casarem com ela — e por mais nada.
                    Para valorizar pavimento, posição ou vista, crie uma regra.
                </p>
            </div>

            <div className="flex flex-col md:flex-row gap-2">
                {modeButton('PER_SQM', Ruler, 'R$/m² + regras', 'Aluguel base por m², ajustado pelas regras.')}
                {modeButton('TARGET_TOTAL', LayoutGrid, 'Aluguel-alvo total', 'Distribui o total do prédio por área e regras.')}
            </div>

            <div className="flex flex-col lg:flex-row lg:items-end gap-3">
                <div className="flex-1 space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500" htmlFor="rental-pricing-target">
                        {isPerSqm ? 'Aluguel base por m² (R$/mês)' : 'Aluguel-alvo total mensal do prédio (R$)'}
                    </label>
                    <div className="relative flex items-center">
                        <span className="absolute left-3 text-sm font-medium text-gray-400">R$</span>
                        <input
                            id="rental-pricing-target"
                            type="number"
                            value={(isPerSqm ? config.base_per_sqm : config.target_total_rent) || ''}
                            onChange={e => {
                                const valor = parseFloat(e.target.value) || 0;
                                setConfig(isPerSqm
                                    ? { ...config, base_per_sqm: valor }
                                    : { ...config, target_total_rent: valor });
                            }}
                            className="w-full h-9 pl-10 pr-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                            placeholder="0,00"
                        />
                    </div>
                    <p className="text-[13px] text-gray-400">
                        {isPerSqm
                            ? 'Multiplicado pela área de cada unidade e pelas regras que casarem com ela.'
                            : 'Distribuído entre as unidades por área e pelas regras que casarem com cada uma.'}
                    </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                    <span className="flex items-center gap-1.5 text-[13px] text-gray-400 max-w-[220px]">
                        <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                        Substitui os aluguéis atuais de todas as unidades deste edifício.
                    </span>
                    {/* §17 — botão primário compacto, único azul sólido do bloco. */}
                    <button
                        type="button"
                        onClick={() => onApply(config)}
                        disabled={loading}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 disabled:opacity-50 font-medium text-[13px] transition-all active:scale-95 whitespace-nowrap"
                    >
                        Aplicar Inteligência
                        <ArrowRight className="w-[15px] h-[15px]" />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default RentalPricingIntelligencePanel;
