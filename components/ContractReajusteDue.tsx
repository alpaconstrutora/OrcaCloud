import React, { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { contractIndexService, IndexName } from '../services/contractIndexService';
import { contractService } from '../services/contractService';

interface Props {
    organizationId: string;
}

const fmtDate = (d: string) => {
    const [y, m] = d.split('-');
    return `${m}/${y}`;
};
const fmtCur = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

const ContractReajusteDue: React.FC<Props> = ({ organizationId }) => {
    const [dueContracts, setDueContracts] = useState<{
        id: string; number: string; title: string; reajuste_index: string;
        reajuste_proximo: string; current_value: number;
    }[]>([]);
    const [loadingDue, setLoadingDue] = useState(false);
    const [applyingId, setApplyingId] = useState<string | null>(null);
    const [notification, setNotification] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);

    const notify = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
        setNotification({ msg, type });
        setTimeout(() => setNotification(null), 4000);
    };

    const loadDue = useCallback(async () => {
        setLoadingDue(true);
        try { setDueContracts(await contractIndexService.listDueForReajuste(organizationId)); }
        finally { setLoadingDue(false); }
    }, [organizationId]);

    useEffect(() => { loadDue(); }, [loadDue]);

    const handleApplyReajuste = async (contractId: string, indexName: string) => {
        setApplyingId(contractId);
        try {
            const contract = await contractService.getContractById(contractId);
            if (!contract?.reajuste_data_base) {
                notify('Contrato sem data-base de reajuste definida. Aplique o primeiro reajuste manualmente.', 'error');
                return;
            }
            const [baseRow, currentRow] = await Promise.all([
                contractIndexService.getClosestTo(indexName as IndexName, contract.reajuste_data_base, organizationId),
                contractIndexService.getClosestTo(indexName as IndexName, new Date().toISOString().slice(0, 10), organizationId),
            ]);
            if (!baseRow || !currentRow) {
                notify(`Índice ${indexName} não encontrado para as datas necessárias. Cadastre os valores em Configurações do Sistema.`, 'error');
                return;
            }
            if (baseRow.value === currentRow.value) {
                notify('Índice base e atual são iguais — nenhum reajuste necessário.', 'info');
                return;
            }
            await contractService.applyReajuste(contractId, baseRow.value, currentRow.value,
                `${indexName} ${fmtDate(baseRow.reference_month)} → ${fmtDate(currentRow.reference_month)}`);
            notify(`Reajuste aplicado ao contrato ${contract.number}.`, 'success');
            loadDue();
        } catch (e) {
            notify(`Erro: ${e instanceof Error ? e.message : 'Tente novamente.'}`, 'error');
        } finally { setApplyingId(null); }
    };

    return (
        <div className="p-6 space-y-4 max-w-4xl mx-auto">
            {notification && (
                <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl text-sm shadow-lg font-medium ${
                    notification.type === 'success' ? 'bg-emerald-600 text-white' :
                    notification.type === 'error'   ? 'bg-red-600 text-white' :
                                                      'bg-gray-900 text-white'
                }`}>{notification.msg}</div>
            )}

            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <AlertTriangle size={20} className="text-amber-500" /> Reajustes de Contrato
            </h2>

            {loadingDue ? (
                <div className="space-y-2">
                    {[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-gray-50 dark:bg-gray-700/50 rounded-xl animate-pulse" />)}
                </div>
            ) : dueContracts.length > 0 ? (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl p-5 space-y-3">
                    <p className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
                        <AlertTriangle size={16} />
                        {dueContracts.length} contrato(s) com reajuste vencido
                    </p>
                    <div className="space-y-2">
                        {dueContracts.map(c => (
                            <div key={c.id} className="flex items-center justify-between gap-3 bg-white dark:bg-gray-800 rounded-xl px-4 py-2.5">
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{c.number} — {c.title}</p>
                                    <p className="text-xs text-gray-400">
                                        {c.reajuste_index} · venceu {new Date(c.reajuste_proximo).toLocaleDateString('pt-BR')} · valor atual {fmtCur(c.current_value)}
                                    </p>
                                </div>
                                <button
                                    onClick={() => handleApplyReajuste(c.id, c.reajuste_index)}
                                    disabled={applyingId === c.id}
                                    className="shrink-0 px-3 py-1.5 bg-amber-600 text-white text-button font-semibold rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
                                >
                                    {applyingId === c.id ? 'Aplicando…' : 'Aplicar'}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-2.5 rounded-xl">
                    <CheckCircle2 size={15} /> Nenhum reajuste vencido no momento.
                </div>
            )}
        </div>
    );
};

export default ContractReajusteDue;
