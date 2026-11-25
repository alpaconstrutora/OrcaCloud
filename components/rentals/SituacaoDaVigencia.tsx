import React, { useEffect, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { contractRenewalService } from '../../services/contractRenewalService';
import { contractService } from '../../services/contractService';
import { Contract, ContractAddendum } from '../../types';

/**
 * Gerenciar Negociação › Contrato › Dados do contrato: a situação da vigência,
 * SÓ LEITURA (plano docs/planos/2026-11-25-renovacoes-e-reajustes-um-lugar.md,
 * item 4). Renovar e reajustar acontecem em Gestão de Unidades › Renovações /
 * Reajustes — aqui só se vê onde o contrato está, com o atalho para lá.
 */

interface Props {
    contract: Contract;
    /** Dentro da Gestão de Unidades: fecha a negociação e abre a aba. Fora dela, sem atalho. */
    onIrPara?: (aba: 'renewals' | 'reajustes') => void;
}

/** Data BR por split — `new Date(iso)` retrocede um dia em UTC-3. */
const fmtDate = (iso?: string | null) => {
    if (!iso) return '—';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
};

const SituacaoDaVigencia: React.FC<Props> = ({ contract, onIrPara }) => {
    // Vigente da cadeia (renovação por contrato novo encerra este) e a última renovação dele.
    const [vigente, setVigente] = useState<Contract>(contract);
    const [ultima, setUltima] = useState<ContractAddendum | null>(null);

    useEffect(() => {
        let vivo = true;
        (async () => {
            try {
                const cadeia = await contractRenewalService.getRenewalChain(contract.id);
                const v = cadeia.length > 0 ? cadeia[cadeia.length - 1] : contract;
                const ads = await contractService.listAddendums(v.id);
                if (!vivo) return;
                setVigente(v);
                // listAddendums vem do mais recente para o mais antigo.
                setUltima(ads.find(a => a.new_start_date && a.status !== 'Cancelado' && a.status !== 'Rejeitado') ?? null);
            } catch {
                // Só leitura: sem a cadeia, mostra o contrato desta negociação.
            }
        })();
        return () => { vivo = false; };
    }, [contract]);

    const outro = vigente.id !== contract.id;
    const partes = [
        `Vigência até ${fmtDate(vigente.end_date)}`,
        outro ? `contrato vigente ${vigente.number}` : null,
        ultima ? `última renovação ${ultima.number}` : null,
        vigente.reajuste_proximo ? `próximo reajuste ${fmtDate(vigente.reajuste_proximo)}` : null,
    ].filter(Boolean);

    return (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-white rounded-[10px] border border-gray-200 px-4 py-3">
            <CalendarClock className="w-4 h-4 text-gray-400 shrink-0" />
            <p className="text-sm text-gray-800 flex-1 min-w-0">{partes.join(' · ')}</p>
            {onIrPara ? (
                <div className="flex items-center gap-3 text-sm">
                    <button type="button" onClick={() => onIrPara('renewals')} className="font-medium text-blue-600 hover:text-blue-700">
                        Renovações
                    </button>
                    <button type="button" onClick={() => onIrPara('reajustes')} className="font-medium text-blue-600 hover:text-blue-700">
                        Reajustes
                    </button>
                </div>
            ) : (
                <p className="text-xs text-gray-500">Renovações e reajustes ficam em Gestão de Unidades.</p>
            )}
        </div>
    );
};

export default SituacaoDaVigencia;
