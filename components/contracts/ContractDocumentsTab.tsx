import React, { useCallback, useEffect, useState } from 'react';
import { FileText, History } from 'lucide-react';
import DocumentVersionsPanel from './DocumentVersionsPanel';
import { contractService } from '../../services/contractService';
import { Contract, ContractAddendum } from '../../types';

interface Props {
    contract: Contract;
    onNotify: (msg: string, type?: 'success' | 'error' | 'info') => void;
    /** Recarrega o contrato no pai (o mirror de minuta_versions muda). */
    onChanged?: () => void;
}

/** Data BR por split — `new Date(iso)` retrocede um dia em UTC-3. */
const fmtDate = (iso?: string) => {
    if (!iso) return '—';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
};

/**
 * Aba "Documentos & Assinatura": versões do contrato e de cada aditivo, com
 * emissão ao Portal do Cliente e assinatura eletrônica por versão.
 *
 * Antes isso vivia espalhado: o painel de minutas só aparecia no status
 * "Minuta" e a assinatura ficava na aba Emissão — e nenhuma das duas existia
 * para contrato recorrente (locação).
 */
const ContractDocumentsTab: React.FC<Props> = ({ contract, onNotify, onChanged }) => {
    const [addendums, setAddendums] = useState<ContractAddendum[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setAddendums(await contractService.listAddendums(contract.id));
        } catch (e) {
            onNotify(`Erro ao carregar aditivos: ${e instanceof Error ? e.message : ''}`, 'error');
        } finally {
            setLoading(false);
        }
    }, [contract.id, onNotify]);

    useEffect(() => { load(); }, [load]);

    return (
        <div className="space-y-6">
            {/* Documentos do contrato */}
            <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-4">
                <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-600" />
                    <h4 className="text-sm text-gray-800">Contrato {contract.number}</h4>
                </div>
                <DocumentVersionsPanel
                    ownerType="CONTRACT"
                    ownerId={contract.id}
                    contractId={contract.id}
                    organizationId={contract.organization_id}
                    label={`Contrato ${contract.number}`}
                    onNotify={onNotify}
                    onChanged={onChanged}
                />
            </div>

            {/* Documentos por aditivo */}
            {loading ? (
                <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                </div>
            ) : addendums.length === 0 ? null : (
                addendums.map(ad => (
                    <div key={ad.id} className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-4">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-2">
                                <History className="w-4 h-4 text-blue-600" />
                                <div>
                                    <h4 className="text-sm text-gray-800">Aditivo {ad.number}</h4>
                                    <p className="text-sm text-gray-500">{ad.description}</p>
                                </div>
                            </div>
                            <div className="text-sm text-gray-500 text-right">
                                <p>{ad.status}</p>
                                {ad.new_start_date && (
                                    <p className="text-gray-400">
                                        Vigência {fmtDate(ad.new_start_date)} a {fmtDate(ad.new_end_date)}
                                    </p>
                                )}
                            </div>
                        </div>
                        <DocumentVersionsPanel
                            ownerType="ADDENDUM"
                            ownerId={ad.id}
                            contractId={contract.id}
                            organizationId={contract.organization_id}
                            label={`Aditivo ${ad.number}`}
                            kind="ADITIVO"
                            onNotify={onNotify}
                            onChanged={onChanged}
                        />
                    </div>
                ))
            )}
        </div>
    );
};

export default ContractDocumentsTab;
