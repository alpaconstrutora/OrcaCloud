import React from 'react';
import { Calculator } from 'lucide-react';
import { InvestmentSimulator, podeSimular } from './InvestmentSimulator';
import { naVitrine } from '../../utils/oportunidadeNumerosDaVersao';
import type { InvestorOpportunity } from '../../services/investorPortalService';

/**
 * Aba "Simulador" (Fase C7 do plano docs/planos/2026-11-21-portal-do-investidor-consolidacao.md): simula o aporte
 * numa oportunidade publicada, com os números congelados da versão (o mesmo simulador da ficha). Antes a aba era
 * uma calculadora genérica com imóvel de R$ 500 mil, juros de 9,5% e "lucro projetado" de 40% inventados.
 */
export const oportunidadesSimulaveis = (opps: InvestorOpportunity[]) =>
    opps.filter(o => o.is_published !== false).map(o => naVitrine(o)).filter(o => podeSimular(o));

const SimuladorDaOportunidade: React.FC<{ opportunities: InvestorOpportunity[] }> = ({ opportunities }) => {
    const simulaveis = React.useMemo(() => oportunidadesSimulaveis(opportunities), [opportunities]);
    const [id, setId] = React.useState<string | undefined>(simulaveis[0]?.id);
    const escolhida = simulaveis.find(o => o.id === id) ?? simulaveis[0];

    if (!escolhida) {
        return (
            <div className="bg-white rounded-[10px] border border-gray-100 p-8 text-center">
                <Calculator className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-700">Nenhuma oportunidade publicada com versão para simular</p>
                <p className="text-xs text-gray-500 mt-1">O simulador usa os números congelados da versão do estudo publicada na oportunidade.</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {simulaveis.length > 1 && (
                <label className="flex items-center gap-2 text-sm text-gray-600">
                    <span className="text-xs font-semibold text-slate-500">Oportunidade</span>
                    <select
                        aria-label="Oportunidade a simular"
                        value={escolhida.id}
                        onChange={e => setId(e.target.value)}
                        className="h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-slate-800"
                    >
                        {simulaveis.map(o => <option key={o.id} value={o.id}>{o.title}</option>)}
                    </select>
                </label>
            )}
            <InvestmentSimulator key={escolhida.id} numeros={escolhida} ticketMinimo={escolhida.ticket_min ?? null} />
        </div>
    );
};

export default SimuladorDaOportunidade;
