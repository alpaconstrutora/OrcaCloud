import React, { useState } from 'react';
import { ArrowRight, Info, Loader2, ShieldCheck } from 'lucide-react';
import { SalesPricingConfig } from '../types';

interface SalesPricingIntelligencePanelProps {
    onApply: (config: SalesPricingConfig) => void;
    /** Enquanto a aplicação roda: trava o botão (clique duplo = precificar duas vezes). */
    loading?: boolean;
}

/**
 * Bloco de precificação da aba "Inteligência" (Comercial › Venda de Unidades):
 * pede o VGV-alvo do edifício, o recorte de permutadas, e aplica. Vive ACIMA da
 * tabela de regras — com as duas metades na mesma tela (o que ajusta o preço, e
 * o botão que aplica), quem mexe numa regra vê o efeito sem trocar de aba.
 *
 * Histórico, porque a forma deste componente é consequência dele:
 *  - nasceu `PricingIntelligenceModal` (diálogo com pesos de andar/posição/
 *    vista/sol), hoje só da Imovib;
 *  - em 2026-09-12 o modelo hedônico saiu do cálculo de Venda — sobrou área ×
 *    regras — e, no mesmo dia, o botão e os dois campos que restaram saíram do
 *    modal e vieram para cá, a pedido do usuário. É o espelho exato do que
 *    Locações fez em 11–12/09 (`RentalPricingIntelligencePanel`), na mesma
 *    escala compacta do guia (§16/§17/§21).
 */
const SalesPricingIntelligencePanel: React.FC<SalesPricingIntelligencePanelProps> = ({ onApply, loading }) => {
    const [config, setConfig] = useState<SalesPricingConfig>({
        target_vgv: 0,
        include_exchanged: false,
    });

    // VGV zero zeraria o preço de todas as unidades — o botão só abre com valor.
    const canApply = !loading && config.target_vgv > 0;

    return (
        <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-4 space-y-3">
            {/* O que o cálculo faz — curto, porque as regras que ele usa estão
                logo abaixo, na mesma tela. */}
            <div className="flex items-start gap-2.5 text-[13px] text-gray-500">
                <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <p>
                    O VGV-alvo é distribuído entre as unidades pela <span className="font-medium text-gray-700">área</span> de cada uma,
                    ajustada pelas <span className="font-medium text-gray-700">regras abaixo</span> que casarem com ela — e por mais nada.
                    Para valorizar pavimento, posição ou vista, crie uma regra.
                </p>
            </div>

            <div className="flex flex-col lg:flex-row lg:items-end gap-3">
                <div className="flex-1 space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500" htmlFor="sales-pricing-vgv">
                        VGV-alvo do edifício (R$)
                    </label>
                    <div className="relative flex items-center">
                        <span className="absolute left-3 text-sm font-medium text-gray-400">R$</span>
                        <input
                            id="sales-pricing-vgv"
                            type="number"
                            min="0"
                            value={config.target_vgv || ''}
                            onChange={e => setConfig({ ...config, target_vgv: parseFloat(e.target.value) || 0 })}
                            className="w-full h-9 pl-10 pr-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                            placeholder="0,00"
                        />
                    </div>
                    <p className="text-[13px] text-gray-400">
                        A soma dos preços de todas as unidades precificadas fecha exatamente neste valor.
                    </p>
                </div>

                {/* Recorte do bolo, não peso de atributo: unidade permutada entra ou não no VGV. */}
                <label className="flex items-center gap-2.5 h-9 text-sm text-gray-700 cursor-pointer shrink-0">
                    <input
                        type="checkbox"
                        checked={!!config.include_exchanged}
                        onChange={e => setConfig({ ...config, include_exchanged: e.target.checked })}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    Incluir unidades permutadas no VGV
                </label>

                <div className="flex items-center gap-3 shrink-0">
                    <span className="flex items-center gap-1.5 text-[13px] text-gray-400 max-w-[220px]">
                        <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                        Substitui os preços atuais de todas as unidades deste edifício.
                    </span>
                    {/* §17 — botão primário compacto, único azul sólido do bloco. */}
                    <button
                        type="button"
                        onClick={() => onApply(config)}
                        disabled={!canApply}
                        title={config.target_vgv > 0 ? undefined : 'Informe o VGV-alvo'}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-[13px] transition-all active:scale-95 whitespace-nowrap"
                    >
                        {loading && <Loader2 className="w-[15px] h-[15px] animate-spin" />}
                        Aplicar Inteligência
                        <ArrowRight className="w-[15px] h-[15px]" />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SalesPricingIntelligencePanel;
