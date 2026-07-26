import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, AlertTriangle, History } from 'lucide-react';
import RenewContractSheet from './RenewContractSheet';
import { contractRenewalService } from '../../services/contractRenewalService';
import { contractService } from '../../services/contractService';
import { Contract, ContractAddendum } from '../../types';

interface Props {
    /** Contrato gerado a partir desta negociação. */
    contract: Contract;
    onNotify: (msg: string, type?: 'success' | 'error' | 'info') => void;
    /** Recarrega o contrato no pai (vigência e valor mudam ao renovar). */
    onChanged?: () => void;
}

/** Data BR por split — `new Date(iso)` retrocede um dia em UTC-3. */
const fmtDate = (iso?: string) => {
    if (!iso) return '—';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
};
const fmtCur = (n?: number) =>
    (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Renovações DESTE contrato, dentro da negociação.
 *
 * É o único lugar onde se renova: a aba Renovações do módulo Locações é apenas
 * a fila do que está vencendo e manda para cá. Mostra a cadeia completa —
 * aditivos de prorrogação e contratos-filhos — na ordem em que aconteceram.
 */
const ContractRenewalsPanel: React.FC<Props> = ({ contract, onNotify, onChanged }) => {
    const [addendums, setAddendums] = useState<ContractAddendum[]>([]);
    const [chain, setChain] = useState<Contract[]>([]);
    const [loading, setLoading] = useState(true);
    const [renewOpen, setRenewOpen] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const cadeia = await contractRenewalService.getRenewalChain(contract.id);
            setChain(cadeia);
            // Aditivos de TODA a cadeia: com renovação mista (um novo contrato e
            // depois prorrogações nele), os aditivos ficam no filho, não neste.
            const ids = cadeia.length > 0 ? cadeia.map(c => c.id) : [contract.id];
            const listas = await Promise.all(ids.map(id => contractService.listAddendums(id)));
            setAddendums(listas.flat().filter(a => a.new_start_date));   // só prorrogações
        } catch (e) {
            onNotify(`Erro ao carregar renovações: ${e instanceof Error ? e.message : ''}`, 'error');
        } finally {
            setLoading(false);
        }
    }, [contract.id, onNotify]);

    useEffect(() => { load(); }, [load]);

    // O contrato VIGENTE da cadeia, não necessariamente o da negociação: se a
    // renovação anterior foi por "novo contrato", o desta negociação está
    // Encerrado e quem vale é o último filho. Renovar o encerrado falharia.
    // (Renovar por ADITIVO não produz essa divergência — mantém o mesmo
    // contrato e a mesma negociação; é a via padrão do Sheet.)
    const vigente = chain.length > 0 ? chain[chain.length - 1] : contract;
    const semVigencia = !vigente.end_date;
    const outroContrato = vigente.id !== contract.id;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <p className="text-sm text-gray-800">
                        {outroContrato ? `Contrato vigente ${vigente.number}: ` : 'Vigência atual: '}
                        {fmtDate(vigente.start_date)} a {fmtDate(vigente.end_date)}
                    </p>
                    <p className="text-sm text-gray-500">
                        Aluguel {fmtCur(vigente.current_value ?? vigente.original_value)}
                        {vigente.reajuste_index ? ` · reajuste por ${vigente.reajuste_index}` : ''}
                        {outroContrato ? ` · ${contract.number} foi encerrado por renovação` : ''}
                    </p>
                </div>
                <button
                    onClick={() => setRenewOpen(true)}
                    disabled={semVigencia}
                    title={semVigencia ? 'Informe o fim da vigência antes de renovar' : undefined}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
                >
                    <RefreshCw className="w-[15px] h-[15px]" />
                    Renovar contrato
                </button>
            </div>

            {semVigencia && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-[10px] p-3 text-sm">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>Preencha o fim da vigência acima para poder renovar.</span>
                </div>
            )}

            {loading ? (
                <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                </div>
            ) : addendums.length === 0 && chain.length <= 1 ? (
                <p className="text-sm text-gray-500 py-4">
                    Nenhuma renovação ainda. Ao renovar, escolha entre aditivo de prorrogação
                    (estende este contrato) ou novo contrato (encerra este e cria outro).
                </p>
            ) : (
                <div className="space-y-2">
                    {addendums.map(ad => (
                        <div key={ad.id} className="flex items-start gap-3 p-4 rounded-[10px] border border-gray-100">
                            <History className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                            <div className="min-w-0">
                                <p className="text-sm text-gray-800">
                                    Aditivo {ad.number}
                                    <span className={`ml-2 text-sm font-normal ${
                                        ad.status === 'Aprovado' ? 'text-emerald-600'
                                            : ad.status === 'Cancelado' ? 'text-red-600' : 'text-amber-600'}`}>
                                        {ad.status}
                                    </span>
                                </p>
                                <p className="text-sm text-gray-500">
                                    Prorroga até {fmtDate(ad.new_end_date)} · aluguel {fmtCur(ad.new_value)}
                                    {ad.previous_value != null && ad.previous_value !== ad.new_value
                                        ? ` (era ${fmtCur(ad.previous_value)})` : ''}
                                </p>
                                {ad.installments_generated ? (
                                    <p className="text-sm text-gray-400">
                                        {ad.installments_generated} parcela(s) geradas
                                    </p>
                                ) : null}
                            </div>
                        </div>
                    ))}

                    {chain.filter(c => c.id !== contract.id).map(c => (
                        <div key={c.id} className="flex items-start gap-3 p-4 rounded-[10px] border border-gray-100">
                            <RefreshCw className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                            <div className="min-w-0">
                                <p className="text-sm text-gray-800">
                                    Contrato {c.number}
                                    <span className="ml-2 text-sm font-normal text-gray-500">{c.status}</span>
                                </p>
                                <p className="text-sm text-gray-500">
                                    {fmtDate(c.start_date)} a {fmtDate(c.end_date)} · {fmtCur(c.current_value)}
                                    {c.parent_contract_id === contract.id ? ' · renovação deste contrato' : ''}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <RenewContractSheet
                open={renewOpen}
                contractId={vigente.id}
                onClose={() => setRenewOpen(false)}
                onRenewed={(r) => {
                    load();
                    onChanged?.();
                    onNotify(r.mode === 'ADITIVO'
                        ? 'Aditivo de prorrogação gerado.'
                        : 'Novo contrato criado e o anterior encerrado.', 'success');
                }}
            />
        </div>
    );
};

export default ContractRenewalsPanel;
