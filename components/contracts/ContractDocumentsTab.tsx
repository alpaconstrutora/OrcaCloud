import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DocumentVersionsPanel from './DocumentVersionsPanel';
import { TabsBar } from '../ui/TabsBar';
import { contractService } from '../../services/contractService';
import { contractDocumentVersionService } from '../../services/contractDocumentVersionService';
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
 * Documentos do contrato (aba Emissão): versões do contrato e de cada aditivo,
 * com emissão ao Portal do Cliente.
 *
 * UMA tabela (`DocumentVersionsPanel` → `StandardTable`) com abas acopladas no
 * topo do card (§19.1 + `toolbarTop`): "Contrato N" e uma aba por aditivo, com
 * a contagem de versões. Até 2026-10-03 era um card por dono empilhado, cada um
 * com a sua lista de cartões. Plano:
 * docs/planos/2026-10-03-documentos-do-contrato-em-tabela.md
 */
const ContractDocumentsTab: React.FC<Props> = ({ contract, onNotify, onChanged }) => {
    const [addendums, setAddendums] = useState<ContractAddendum[]>([]);
    const [contagem, setContagem] = useState<Record<string, number>>({});
    const [dono, setDono] = useState<string>(contract.id);

    const notifyRef = useRef(onNotify);
    notifyRef.current = onNotify;

    const carregarContagem = useCallback(async () => {
        try {
            const todas = await contractDocumentVersionService.list(contract.id);
            const c: Record<string, number> = {};
            todas.forEach(v => { c[v.owner_id] = (c[v.owner_id] ?? 0) + 1; });
            setContagem(c);
        } catch {
            // A contagem é só o número na aba — a tabela carrega e avisa por conta própria.
        }
    }, [contract.id]);

    useEffect(() => {
        (async () => {
            try {
                setAddendums(await contractService.listAddendums(contract.id));
            } catch (e) {
                notifyRef.current(`Erro ao carregar aditivos: ${e instanceof Error ? e.message : ''}`, 'error');
            }
        })();
        carregarContagem();
    }, [contract.id, carregarContagem]);

    // Aditivo excluído (ou outro contrato) com a aba dele ativa: volta para o contrato.
    const aditivo = addendums.find(a => a.id === dono) ?? null;
    const donoEfetivo = aditivo ? aditivo.id : contract.id;

    const abas = useMemo(() => [
        { id: contract.id, label: `Contrato ${contract.number}`, badge: contagem[contract.id] },
        ...addendums.map(a => ({ id: a.id, label: `Aditivo ${a.number}`, badge: contagem[a.id] })),
    ], [contract.id, contract.number, addendums, contagem]);

    const topo = (
        <div className="space-y-2">
            {/* Só o contrato, sem aditivo: uma aba sozinha não escolhe nada, mas
                diz de quem são as versões — mesmo lugar em qualquer contrato. */}
            <TabsBar<string> bare tabs={abas} value={donoEfetivo} onChange={setDono} />
            {aditivo && (
                <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-1 text-sm">
                    <span className="text-gray-500">{aditivo.description}</span>
                    <span className="text-gray-500">
                        {aditivo.status}
                        {aditivo.new_start_date && (
                            <span className="text-gray-400"> · Vigência {fmtDate(aditivo.new_start_date)} a {fmtDate(aditivo.new_end_date)}</span>
                        )}
                    </span>
                </div>
            )}
        </div>
    );

    return (
        <DocumentVersionsPanel
            // Trocar de dono remonta a tabela: lista, busca escopada e Sheets do dono anterior somem.
            key={donoEfetivo}
            ownerType={aditivo ? 'ADDENDUM' : 'CONTRACT'}
            ownerId={donoEfetivo}
            contractId={contract.id}
            organizationId={contract.organization_id}
            label={aditivo ? `Aditivo ${aditivo.number}` : `Contrato ${contract.number}`}
            kind={aditivo ? 'ADITIVO' : undefined}
            toolbarTop={topo}
            onNotify={onNotify}
            onChanged={() => { carregarContagem(); onChanged?.(); }}
        />
    );
};

export default ContractDocumentsTab;
