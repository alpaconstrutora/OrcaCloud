import React, { useCallback, useState } from 'react';
import { AlertTriangle, FileDown, Settings } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { SecaoTitulo } from '../ui/SecaoTitulo';
import type { RegistroDeRenovacao } from '../../services/contractRenewalService';
import { contractService } from '../../services/contractService';
import { buildRentalResolveContext } from '../../services/rentalDocumentContextService';
import DocumentVersionsPanel from '../contracts/DocumentVersionsPanel';
import EmitDocumentModal from '../EmitDocumentModal';
import { Contract } from '../../types';
import { fmtDate, fmtDataHora, fmtCur } from './reajusteFormatos';

/**
 * Locações › Renovações › Histórico › Ver: uma renovação, e — por aditivo — os
 * DOCUMENTOS do aditivo (plano docs/planos/2026-11-25-renovacoes-e-reajustes-um-lugar.md,
 * itens 3 e 3b): anexar PDF, assinar, emitir ao portal e gerar pelo modelo .docx.
 * Antes, documento de aditivo de locação não tinha tela nenhuma.
 */

interface Props {
    registro: RegistroDeRenovacao | null;
    nomeDoCliente: (id?: string | null) => string;
    onClose: () => void;
    onOpenContract?: (contractId: string) => void;
    onNotify?: (msg: string, type?: 'success' | 'error' | 'info') => void;
    /** "Modelos de documento": a tela de modelos (o pai fecha esta gaveta e a abre). */
    onGerenciarModelos?: (organizationId: string) => void;
}

const Linha: React.FC<{ rotulo: string; children: React.ReactNode }> = ({ rotulo, children }) => (
    <div className="grid grid-cols-[160px_1fr] gap-3 py-2 border-b border-gray-100 last:border-b-0">
        <dt className="text-xs font-semibold text-slate-500 pt-0.5">{rotulo}</dt>
        <dd className="text-sm text-gray-800 min-w-0 break-words">{children}</dd>
    </div>
);

const RenovacaoRegistroSheet: React.FC<Props> = ({ registro: r, nomeDoCliente, onClose, onOpenContract, onNotify, onGerenciarModelos }) => {
    const [gerando, setGerando] = useState<Contract | null>(null);
    const [abrindo, setAbrindo] = useState(false);
    const [versaoDocs, setVersaoDocs] = useState(0);
    const notificar = useCallback((msg: string, type?: 'success' | 'error' | 'info') => onNotify?.(msg, type), [onNotify]);

    const aditivo = r?.via === 'ADITIVO' ? r.aditivo : undefined;
    const orgId = aditivo?.organization_id ?? null;

    const abrirGeracao = async () => {
        if (!r) return;
        setAbrindo(true);
        try {
            const c = await contractService.getContractById(r.contract_id);
            if (!c) throw new Error(`Contrato ${r.contrato.number} não encontrado.`);
            setGerando(c);
        } catch (e) {
            notificar(e instanceof Error ? e.message : 'Erro ao abrir a geração do documento.', 'error');
        } finally {
            setAbrindo(false);
        }
    };

    // Mesmo contexto da minuta do contrato (locador, unidades, garantias…), mais o aditivo.
    const carregarContexto = useCallback(() => {
        if (!r) return Promise.resolve({});
        return buildRentalResolveContext({ contractId: r.contract_id, dealId: r.negociacaoId, organizationId: orgId });
    }, [r, orgId]);

    const motivoNaoGera = abrindo ? 'Abrindo…'
        : r?.status === 'Cancelado' ? `O ${r.numero} está cancelado: não se gera documento dele.`
        : null;

    return (
        <>
            <Sheet open={!!r} onClose={onClose} size={aditivo ? '4xl' : 'md'}>
                <SheetHeader onClose={onClose}>
                    <SheetTitle>Renovação {r ? `${r.numero} do contrato ${r.contrato.number}` : ''}</SheetTitle>
                    <SheetDescription>{r ? `${r.via === 'ADITIVO' ? 'Aditivo de prorrogação' : 'Novo contrato'} · ${fmtDate(r.inicio)} a ${fmtDate(r.fim)}` : ''}</SheetDescription>
                </SheetHeader>
                <SheetPanel className="p-6">
                    {r && (
                        <div className="space-y-8">
                            {r.status === 'Cancelado' && (
                                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-[10px] p-4 text-sm">
                                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                    <span>
                                        {r.cancelado_em
                                            ? `Cancelada por ${r.cancelado_por ?? '—'} em ${fmtDataHora(r.cancelado_em)}.`
                                            : 'Cancelada antes de o sistema registrar quem e quando (o registro começou em 25/11/2026).'}
                                        {' '}As parcelas do período foram apagadas.
                                    </span>
                                </div>
                            )}
                            <dl className="max-w-2xl">
                                <Linha rotulo="Contrato">{r.contrato.number}{r.contrato.title ? ` · ${r.contrato.title}` : ''}</Linha>
                                <Linha rotulo="Locatário">{nomeDoCliente(r.contrato.client_id)}</Linha>
                                <Linha rotulo="Via">{r.via === 'ADITIVO' ? `Aditivo ${r.numero}` : `Novo contrato ${r.numero}`}</Linha>
                                <Linha rotulo="Situação">{r.status}</Linha>
                                <Linha rotulo="Período novo">{fmtDate(r.inicio)} a {fmtDate(r.fim)}</Linha>
                                <Linha rotulo="Vigência anterior até">{fmtDate(r.fimAnterior)}</Linha>
                                <Linha rotulo="Aluguel">
                                    {r.valorAnterior != null && r.valor != null && Math.abs(r.valorAnterior - r.valor) >= 0.01
                                        ? `${fmtCur(r.valorAnterior)} → ${fmtCur(r.valor)}` : fmtCur(r.valor)}
                                </Linha>
                                {r.via === 'ADITIVO' && <Linha rotulo="Parcelas geradas">{r.parcelas ?? '—'}</Linha>}
                                <Linha rotulo="Descrição">{r.descricao || '—'}</Linha>
                                <Linha rotulo="Feito por">{r.criado_por ?? 'Não registrado (o registro começou em 25/11/2026)'}</Linha>
                                <Linha rotulo="Em">{fmtDataHora(r.criado_em)}</Linha>
                            </dl>

                            {aditivo && (
                                <section className="space-y-4">
                                    <SecaoTitulo
                                        icon={FileDown}
                                        titulo="Documentos do aditivo"
                                        acoes={(
                                            <div className="flex items-center gap-2">
                                                {onGerenciarModelos && orgId && (
                                                    <button
                                                        type="button"
                                                        onClick={() => onGerenciarModelos(orgId)}
                                                        className="flex items-center gap-1.5 h-9 px-3 text-blue-600 hover:text-blue-700 font-medium text-[13px] transition-all"
                                                    >
                                                        <Settings className="w-[15px] h-[15px]" />
                                                        Modelos de documento
                                                    </button>
                                                )}
                                                <span className="inline-flex" title={motivoNaoGera ?? undefined}>
                                                    <button
                                                        type="button"
                                                        onClick={abrirGeracao}
                                                        disabled={!!motivoNaoGera}
                                                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        <FileDown className="w-[15px] h-[15px]" />
                                                        Gerar documento do aditivo
                                                    </button>
                                                </span>
                                            </div>
                                        )}
                                    />
                                    <DocumentVersionsPanel
                                        key={`docs-${r.id}-${versaoDocs}`}
                                        ownerType="ADDENDUM"
                                        ownerId={r.id}
                                        contractId={r.contract_id}
                                        organizationId={orgId}
                                        label={`Aditivo ${r.numero}`}
                                        kind="ADITIVO"
                                        onNotify={notificar}
                                    />
                                </section>
                            )}
                        </div>
                    )}
                </SheetPanel>
                <SheetFooter>
                    <button type="button" onClick={onClose} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px]">
                        Fechar
                    </button>
                    {r && onOpenContract && (
                        <button
                            type="button"
                            onClick={() => onOpenContract(r.contract_id)}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95"
                        >
                            Abrir a negociação
                        </button>
                    )}
                </SheetFooter>
            </Sheet>

            {gerando && aditivo && (
                <EmitDocumentModal
                    organizationId={gerando.organization_id || orgId || ''}
                    contract={gerando}
                    addendum={aditivo}
                    organization={null}
                    loadContext={carregarContexto}
                    persistVersion
                    lockClient
                    onVersionSaved={() => setVersaoDocs(v => v + 1)}
                    onManageTemplates={onGerenciarModelos && orgId ? () => { setGerando(null); onGerenciarModelos(orgId); } : undefined}
                    onClose={() => setGerando(null)}
                    notify={notificar}
                />
            )}
        </>
    );
};

export default RenovacaoRegistroSheet;
