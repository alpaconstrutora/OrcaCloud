import React, { useCallback, useEffect, useRef, useState } from 'react';
import { History, Plus, ExternalLink, Send, Pencil, Trash2 } from 'lucide-react';
import ActionIconButton from '../ui/ActionIconButton';
import { useConfirm } from '../ui/confirm';
import { contractDocumentVersionService } from '../../services/contractDocumentVersionService';
import { ContractDocumentVersion, DocumentKind, DocumentOwnerType } from '../../types';

interface Props {
    ownerType: DocumentOwnerType;
    ownerId: string;
    contractId: string;
    organizationId?: string | null;
    /** Rótulo do dono ("Contrato CL-2026-001" / "Aditivo AD-001"). */
    label: string;
    kind?: DocumentKind;
    onNotify: (msg: string, type?: 'success' | 'error' | 'info') => void;
    /** Recarrega o pai quando algo muda (o mirror do contrato é reescrito). */
    onChanged?: () => void;
}

/** Data BR por split — `new Date(iso)` retrocede um dia em UTC-3. */
const fmtDate = (iso?: string) => {
    if (!iso) return '';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
};

/**
 * Versões de documento de um contrato OU de um aditivo.
 *
 * Sucede o `MinutaVersionsPanel` que vivia dentro do ContractDetailView e só
 * sabia lidar com `contracts.minuta_versions` (e só aparecia no status
 * "Minuta"). Agora lê a tabela `contract_document_versions` e serve os dois
 * donos, com assinatura por versão.
 */
const DocumentVersionsPanel: React.FC<Props> = ({
    ownerType, ownerId, contractId, organizationId, label, kind, onNotify, onChanged,
}) => {
    const [versions, setVersions] = useState<ContractDocumentVersion[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [docName, setDocName] = useState('');
    const [notes, setNotes] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const fileRef = useRef<HTMLInputElement>(null);
    const confirm = useConfirm();

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setVersions(await contractDocumentVersionService.listByOwner(ownerType, ownerId));
        } catch (e) {
            onNotify(`Erro ao carregar versões: ${e instanceof Error ? e.message : ''}`, 'error');
        } finally {
            setLoading(false);
        }
    }, [ownerType, ownerId, onNotify]);

    useEffect(() => { load(); }, [load]);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            await contractDocumentVersionService.addVersion({
                ownerType, ownerId, contractId, organizationId,
                file, name: docName.trim() || undefined, notes: notes.trim(), kind,
            });
            setDocName(''); setNotes('');
            if (fileRef.current) fileRef.current.value = '';
            await load();
            onChanged?.();
            onNotify('Versão adicionada como rascunho. Clique em "Emitir" para liberá-la ao cliente.', 'success');
        } catch (err) {
            onNotify(`Erro ao publicar versão: ${err instanceof Error ? err.message : ''}`, 'error');
        } finally {
            setUploading(false);
        }
    };

    const handleEmit = async (ver: ContractDocumentVersion) => {
        setBusyId(ver.id);
        try {
            await contractDocumentVersionService.emit(ver.id);
            await load();
            onChanged?.();
            onNotify('Versão emitida — já está disponível no Portal do Cliente.', 'success');
        } catch (err) {
            onNotify(`Erro ao emitir: ${err instanceof Error ? err.message : ''}`, 'error');
        } finally { setBusyId(null); }
    };

    const saveRename = async (ver: ContractDocumentVersion) => {
        setBusyId(ver.id);
        try {
            await contractDocumentVersionService.update(ver.id, { name: editName.trim() });
            setEditingId(null);
            await load();
            onChanged?.();
        } catch (err) {
            onNotify(`Erro ao renomear: ${err instanceof Error ? err.message : ''}`, 'error');
        } finally { setBusyId(null); }
    };

    const handleDelete = async (ver: ContractDocumentVersion) => {
        const ok = await confirm({
            title: `Excluir a versão ${ver.v}?`,
            message: 'O arquivo é removido junto. Esta ação não pode ser desfeita.',
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        setBusyId(ver.id);
        try {
            await contractDocumentVersionService.remove(ver.id);
            await load();
            onChanged?.();
            onNotify('Versão excluída.', 'success');
        } catch (err) {
            onNotify(err instanceof Error ? err.message : 'Erro ao excluir versão.', 'error');
        } finally { setBusyId(null); }
    };

    return (
        <div className="space-y-4">
            {/* Nova versão */}
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-[10px] space-y-2.5">
                <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-700">Adicionar versão</span>
                </div>
                <div className="flex flex-col md:flex-row gap-2">
                    <input
                        type="text" value={docName} onChange={e => setDocName(e.target.value)}
                        placeholder="Nome do documento (opcional)"
                        className="flex-1 h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                    <input
                        type="text" value={notes} onChange={e => setNotes(e.target.value)}
                        placeholder="O que mudou nesta versão (opcional)"
                        className="flex-1 h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                    <input ref={fileRef} type="file" accept=".pdf,.docx,.doc" onChange={handleUpload} className="hidden" />
                    <button
                        onClick={() => fileRef.current?.click()}
                        disabled={uploading}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 shrink-0"
                    >
                        <Plus className="w-[15px] h-[15px]" />
                        {uploading ? 'Enviando…' : 'Subir documento'}
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                </div>
            ) : versions.length === 0 ? (
                <p className="text-sm text-gray-500 py-4 text-center">
                    Nenhuma versão ainda. Suba um arquivo ou gere o documento a partir de um modelo.
                </p>
            ) : (
                <div className="space-y-2">
                    {versions.map(ver => (
                        <div key={ver.id} className="p-4 rounded-[10px] border border-gray-100 hover:border-blue-100 transition-all space-y-3">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    {editingId === ver.id ? (
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="text" autoFocus value={editName}
                                                onChange={e => setEditName(e.target.value)}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter') saveRename(ver);
                                                    if (e.key === 'Escape') setEditingId(null);
                                                }}
                                                placeholder={`Versão ${ver.v}`}
                                                className="h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                            />
                                            <button
                                                onClick={() => saveRename(ver)}
                                                disabled={busyId === ver.id}
                                                className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all disabled:opacity-50"
                                            >
                                                Salvar
                                            </button>
                                            <button
                                                onClick={() => setEditingId(null)}
                                                className="text-gray-500 hover:text-gray-700 text-sm font-medium p-1.5 rounded-lg transition-all"
                                            >
                                                Cancelar
                                            </button>
                                        </div>
                                    ) : (
                                    <p className="text-sm text-gray-800">
                                        v{ver.v} — {ver.name || 'Documento'}
                                        <span className={`ml-2 text-sm font-normal ${ver.emitted ? 'text-emerald-600' : 'text-amber-600'}`}>
                                            {ver.emitted ? 'Emitida' : 'Rascunho'}
                                        </span>
                                    </p>
                                    )}
                                    {ver.notes && <p className="text-sm text-gray-500 mt-0.5">{ver.notes}</p>}
                                    <p className="text-sm text-gray-400 mt-0.5">
                                        {fmtDate(ver.created_at)}
                                        {ver.source === 'TEMPLATE_DOCX' && ' · gerada de modelo'}
                                    </p>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <a
                                        href={ver.url} target="_blank" rel="noopener noreferrer"
                                        title="Abrir documento"
                                        className="p-1.5 bg-white border border-gray-200 rounded-[6px] text-gray-500 hover:text-blue-600 hover:border-blue-200 transition-all"
                                    >
                                        <ExternalLink className="w-4 h-4" />
                                    </a>
                                    {!ver.emitted && (
                                        <button
                                            onClick={() => handleEmit(ver)}
                                            disabled={busyId === ver.id}
                                            className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all disabled:opacity-50"
                                        >
                                            <Send className="w-4 h-4 inline mr-1" />Emitir
                                        </button>
                                    )}
                                    {/* Assinatura NÃO fica aqui: quem assina é o
                                        SignaturePanel do contrato, na própria aba
                                        Emissão. Dois pontos de assinatura na mesma
                                        tela é duplicidade — e o ZapSign está
                                        desativado por decisão (ver a memória sobre
                                        a Edge Function sign-contract). Quando for
                                        ativado, o botão por versão volta aqui usando
                                        components/contracts/SignaturePanel.tsx. */}
                                    <ActionIconButton kind="edit" title="Renomear" icon={<Pencil className="w-4 h-4" />}
                                        onClick={() => { setEditingId(ver.id); setEditName(ver.name ?? ''); }} />
                                    {!ver.emitted && !ver.signature_token && (
                                        <ActionIconButton kind="delete" icon={<Trash2 className="w-4 h-4" />}
                                            onClick={() => handleDelete(ver)} />
                                    )}
                                </div>
                            </div>

                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default DocumentVersionsPanel;
