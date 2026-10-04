import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, FileText, Lock, Plus, Send } from 'lucide-react';
import ActionIconButton from '../ui/ActionIconButton';
import { useConfirm } from '../ui/confirm';
import StandardTable, { StandardTableColumn } from '../ui/StandardTable';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { contractDocumentVersionService } from '../../services/contractDocumentVersionService';
import { ContractDocumentVersion, DocumentKind, DocumentOwnerType, DocumentSource } from '../../types';

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
    /** Linha(s) acima da toolbar, no mesmo card — as abas Contrato/Aditivo do pai (§19.1). */
    toolbarTop?: React.ReactNode;
}

/** Data BR por split — `new Date(iso)` retrocede um dia em UTC-3. */
const fmtDate = (iso?: string) => {
    if (!iso) return '';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
};

const ORIGEM: Record<DocumentSource, string> = {
    UPLOAD: 'Arquivo enviado',
    TEMPLATE_DOCX: 'Modelo .docx',
    TEMPLATE_HTML: 'Modelo HTML',
};
const origem = (s?: DocumentSource | null) => (s ? ORIGEM[s] ?? s : '—');

// Colunas de DADO (§6.10) — "Ações" entra por `actions`. Larguras somam ~1150px
// com Ações; a folga do card vai para o espaçador antes de "Ações" (§6.1.1).
const COLUMNS: StandardTableColumn[] = [
    { key: 'v', label: 'Versão', sortable: true, width: 100 },
    { key: 'name', label: 'Documento', sortable: true, width: 280 },
    { key: 'emitted', label: 'Situação', sortable: true, width: 120 },
    { key: 'notes', label: 'O que mudou', sortable: true, width: 260 },
    // 170: "Arquivo enviado" + padding §6.6 quebrava em duas linhas com 150.
    { key: 'source', label: 'Origem', sortable: true, width: 170 },
    { key: 'created_at', label: 'Data', sortable: true, width: 110 },
];

const inputCls = 'w-full h-9 px-3 bg-gray-50 border border-gray-100 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all';

/**
 * Versões de documento de um contrato OU de um aditivo, em TABELA
 * (`StandardTable`, §6.10 de docs/ui_ux_guia_unificado.md): busca, colunas
 * configuráveis, ajuste de largura ao conteúdo (§6.1.2) e ordenação.
 *
 * Histórico: sucede o `MinutaVersionsPanel` (escritor legado do JSONB, só no
 * status "Minuta"); até 2026-10-03 era uma pilha de cartões, um por versão,
 * com o formulário "Adicionar versão" fixo acima. O formulário virou `Sheet`
 * aberto pela ação primária da toolbar (§17), e renomear virou "Editar versão"
 * (nome + o que mudou). Plano: docs/planos/2026-10-03-documentos-do-contrato-em-tabela.md
 */
const DocumentVersionsPanel: React.FC<Props> = ({
    ownerType, ownerId, contractId, organizationId, label, kind, onNotify, onChanged, toolbarTop,
}) => {
    const [versions, setVersions] = useState<ContractDocumentVersion[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);
    const confirm = useConfirm();

    // Sheet "Nova versão"
    const [novaAberta, setNovaAberta] = useState(false);
    const [novoNome, setNovoNome] = useState('');
    const [novaNota, setNovaNota] = useState('');
    const [novoArquivo, setNovoArquivo] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    // Sheet "Editar versão"
    const [editando, setEditando] = useState<ContractDocumentVersion | null>(null);
    const [editNome, setEditNome] = useState('');
    const [editNota, setEditNota] = useState('');
    const [salvando, setSalvando] = useState(false);

    // `onNotify` costuma chegar como função inline do pai: no deps do `load` ele
    // recarregaria a lista a cada render do pai. A ref mantém o carregamento
    // amarrado só ao dono.
    const notifyRef = useRef(onNotify);
    notifyRef.current = onNotify;

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setVersions(await contractDocumentVersionService.listByOwner(ownerType, ownerId));
        } catch (e) {
            notifyRef.current(`Erro ao carregar versões: ${e instanceof Error ? e.message : ''}`, 'error');
        } finally {
            setLoading(false);
        }
    }, [ownerType, ownerId]);

    useEffect(() => { load(); }, [load]);

    const abrirNova = () => {
        setNovoNome(''); setNovaNota(''); setNovoArquivo(null);
        if (fileRef.current) fileRef.current.value = '';
        setNovaAberta(true);
    };

    const enviarNova = async () => {
        if (!novoArquivo) return;
        setUploading(true);
        try {
            await contractDocumentVersionService.addVersion({
                ownerType, ownerId, contractId, organizationId,
                file: novoArquivo, name: novoNome.trim() || undefined, notes: novaNota.trim(), kind,
            });
            setNovaAberta(false);
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

    const abrirEdicao = (ver: ContractDocumentVersion) => {
        setEditando(ver);
        setEditNome(ver.name ?? '');
        setEditNota(ver.notes ?? '');
    };

    const editDirty = !!editando && (editNome.trim() !== (editando.name ?? '') || editNota.trim() !== (editando.notes ?? ''));

    const salvarEdicao = async () => {
        if (!editando) return;
        setSalvando(true);
        try {
            await contractDocumentVersionService.update(editando.id, { name: editNome.trim(), notes: editNota.trim() });
            setEditando(null);
            await load();
            onChanged?.();
            onNotify('Versão atualizada.', 'success');
        } catch (err) {
            onNotify(`Erro ao salvar: ${err instanceof Error ? err.message : ''}`, 'error');
        } finally { setSalvando(false); }
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

    /** Por que a versão não pode ser excluída — `null` quando pode. */
    const motivoNaoExclui = (ver: ContractDocumentVersion): string | null => {
        if (ver.emitted) return 'Versão emitida ao cliente não pode ser excluída';
        if (ver.signature_token) return 'Versão enviada para assinatura não pode ser excluída';
        return null;
    };

    return (
        <>
            <StandardTable<ContractDocumentVersion>
                storageKey="contratos:documentos:versoes"
                searchScope={`${ownerType}:${ownerId}`}
                columns={COLUMNS}
                rows={versions}
                rowKey={v => v.id}
                loading={loading}
                toolbarTop={toolbarTop}
                searchText={v => `v${v.v} ${v.name ?? ''} ${v.notes ?? ''} ${origem(v.source)}`}
                searchPlaceholder="Buscar por versão, documento ou o que mudou..."
                sortValue={(key, v) => {
                    switch (key) {
                        case 'v': return v.v;
                        case 'name': return v.name ?? '';
                        case 'emitted': return v.emitted;
                        case 'notes': return v.notes ?? '';
                        case 'source': return origem(v.source);
                        case 'created_at': return v.created_at;
                        default: return null;
                    }
                }}
                renderCell={(key, v) => {
                    switch (key) {
                        case 'v':
                            return <span className="text-sm font-normal text-gray-600">v{v.v}</span>;
                        case 'name':
                            return (
                                <span className="block truncate text-sm font-normal text-gray-700" title={v.name || 'Documento'}>
                                    {v.name || 'Documento'}
                                </span>
                            );
                        case 'emitted':
                            // §8 — texto colorido, sem pílula
                            return (
                                <span className={`text-sm font-normal ${v.emitted ? 'text-emerald-600' : 'text-amber-600'}`}>
                                    {v.emitted ? 'Emitida' : 'Rascunho'}
                                </span>
                            );
                        case 'notes':
                            return v.notes
                                ? <span className="block truncate text-sm font-normal text-gray-700" title={v.notes}>{v.notes}</span>
                                : <span className="text-sm font-normal text-gray-400">—</span>;
                        case 'source':
                            return <span className="text-sm font-normal text-gray-600">{origem(v.source)}</span>;
                        case 'created_at':
                            return <span className="text-sm font-normal text-gray-600">{fmtDate(v.created_at)}</span>;
                        default:
                            return null;
                    }
                }}
                actions={{
                    width: 210,
                    render: v => {
                        const motivo = motivoNaoExclui(v);
                        return (
                            <div className="flex items-center justify-end gap-1.5">
                                {/* Ação dominante em texto azul (§9): emitir o rascunho */}
                                {!v.emitted && (
                                    <button
                                        onClick={() => handleEmit(v)}
                                        disabled={busyId === v.id}
                                        className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all disabled:opacity-50"
                                        title="Emitir ao Portal do Cliente"
                                    >
                                        <Send className="w-3.5 h-3.5" /> Emitir
                                    </button>
                                )}
                                <ActionIconButton
                                    kind="view"
                                    title="Abrir documento"
                                    icon={<ExternalLink className="w-4 h-4" />}
                                    onClick={() => window.open(v.url, '_blank', 'noopener,noreferrer')}
                                />
                                <ActionIconButton kind="edit" title="Editar versão" onClick={() => abrirEdicao(v)} />
                                {/* Desabilitado diz o motivo: o botão desabilitado não
                                    recebe hover (pointer-events-none), então o title
                                    mora no span em volta. */}
                                <span title={motivo ?? undefined} className="inline-flex">
                                    <ActionIconButton
                                        kind="delete"
                                        title={motivo ?? 'Excluir versão'}
                                        disabled={!!motivo || busyId === v.id}
                                        icon={motivo ? <Lock className="w-4 h-4" /> : undefined}
                                        onClick={() => handleDelete(v)}
                                    />
                                </span>
                            </div>
                        );
                    },
                }}
                empty={{
                    icon: <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                    title: 'Nenhuma versão ainda',
                    subtitle: 'Suba um arquivo ou gere o documento a partir de um modelo.',
                }}
                toolbarRight={
                    <button
                        onClick={abrirNova}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
                    >
                        <Plus className="w-[15px] h-[15px]" />
                        Subir documento
                    </button>
                }
            />

            {/* Nova versão — painel lateral (UI_PATTERNS: criar registro simples) */}
            <Sheet open={novaAberta} onClose={() => setNovaAberta(false)} size="md"
                dirty={!uploading && (!!novoArquivo || !!novoNome.trim() || !!novaNota.trim())}>
                <SheetHeader onClose={() => setNovaAberta(false)}>
                    <SheetTitle>Nova versão</SheetTitle>
                    <SheetDescription>{label} — entra como rascunho; o cliente só vê depois de emitida.</SheetDescription>
                </SheetHeader>
                <SheetPanel className="p-6 space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-500">Arquivo (PDF ou DOCX)</label>
                        {/* Input nativo escondido: o "Choose File / No file chosen"
                            do navegador muda de idioma e de cara por navegador. */}
                        <input ref={fileRef} type="file" accept=".pdf,.docx,.doc" className="hidden"
                            onChange={e => setNovoArquivo(e.target.files?.[0] ?? null)} />
                        <div className="flex items-center gap-3 min-w-0">
                            <button type="button" onClick={() => fileRef.current?.click()}
                                className="flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 font-medium text-[13px] transition-all active:scale-95 shrink-0">
                                <FileText className="w-[15px] h-[15px]" />
                                {novoArquivo ? 'Trocar arquivo' : 'Escolher arquivo'}
                            </button>
                            <span className={`block truncate text-sm ${novoArquivo ? 'text-gray-700' : 'text-gray-400'}`} title={novoArquivo?.name}>
                                {novoArquivo ? novoArquivo.name : 'Nenhum arquivo escolhido'}
                            </span>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-500">Nome do documento</label>
                        <input type="text" value={novoNome} onChange={e => setNovoNome(e.target.value)}
                            placeholder="Opcional — usa o nome do arquivo" className={inputCls} />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-500">O que mudou nesta versão</label>
                        <textarea rows={3} value={novaNota} onChange={e => setNovaNota(e.target.value)}
                            placeholder="Opcional"
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all resize-none" />
                    </div>
                </SheetPanel>
                <SheetFooter>
                    <button onClick={() => setNovaAberta(false)} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px]">
                        Cancelar
                    </button>
                    <button
                        onClick={enviarNova}
                        disabled={!novoArquivo || uploading}
                        title={!novoArquivo ? 'Escolha o arquivo da versão' : undefined}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
                    >
                        <Plus className="w-[15px] h-[15px]" />
                        {uploading ? 'Enviando…' : 'Subir documento'}
                    </button>
                </SheetFooter>
            </Sheet>

            {/* Editar versão — nome e "o que mudou" (o arquivo não se troca: nova versão) */}
            <Sheet open={!!editando} onClose={() => setEditando(null)} size="md" dirty={editDirty && !salvando}>
                <SheetHeader onClose={() => setEditando(null)}>
                    <SheetTitle>Editar versão {editando ? `v${editando.v}` : ''}</SheetTitle>
                    <SheetDescription>Para trocar o arquivo, suba uma nova versão.</SheetDescription>
                </SheetHeader>
                <SheetPanel className="p-6 space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-500">Nome do documento</label>
                        <input type="text" autoFocus value={editNome} onChange={e => setEditNome(e.target.value)}
                            placeholder={editando ? `Versão ${editando.v}` : ''} className={inputCls} />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-500">O que mudou nesta versão</label>
                        <textarea rows={3} value={editNota} onChange={e => setEditNota(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all resize-none" />
                    </div>
                </SheetPanel>
                <SheetFooter>
                    <button onClick={() => setEditando(null)} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px]">
                        Cancelar
                    </button>
                    <button
                        onClick={salvarEdicao}
                        disabled={!editDirty || salvando}
                        title={!editDirty ? 'Nada mudou' : undefined}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
                    >
                        {salvando ? 'Salvando…' : 'Salvar alterações'}
                    </button>
                </SheetFooter>
            </Sheet>
        </>
    );
};

export default DocumentVersionsPanel;
