import React, { useEffect, useMemo, useState } from 'react';
import { X, FileText, FileDown, Loader2, AlertCircle, Settings } from 'lucide-react';
import { saveAs } from 'file-saver';
import { documentTemplateService, DocumentTemplate } from '../services/documentTemplateService';
import { clientService } from '../services/clientService';
import { fillDocx } from '../services/docxRenderService';
import { resolveFields, describeMapping } from '../services/docxFieldCatalog';
import { Contract } from '../types/contracts';
import { Client, Organization } from '../types/users';

interface Props {
    organizationId: string;
    contract: Contract;
    organization: Organization | null;
    onClose: () => void;
    onManageTemplates?: () => void;
    notify?: (msg: string, type: 'success' | 'error' | 'info') => void;
}

const slug = (s: string) => (s || '').replace(/[^\w.\-]+/g, '_').replace(/^_+|_+$/g, '');

const EmitDocumentModal: React.FC<Props> = ({
    organizationId, contract, organization, onClose, onManageTemplates, notify,
}) => {
    const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [loading, setLoading] = useState(true);
    const [templateId, setTemplateId] = useState<string>('');
    const [clientId, setClientId] = useState<string>(contract.client_id ?? '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        Promise.all([
            documentTemplateService.list(organizationId),
            clientService.listClients(organizationId),
        ])
            .then(([tpls, cls]) => {
                setTemplates(tpls);
                setClients(cls);
                if (tpls.length === 1) setTemplateId(tpls[0].id);
            })
            .catch(e => setError(e instanceof Error ? e.message : 'Erro ao carregar dados'))
            .finally(() => setLoading(false));
    }, [organizationId]);

    const template = useMemo(() => templates.find(t => t.id === templateId) ?? null, [templates, templateId]);
    const client = useMemo(() => clients.find(c => c.id === clientId) ?? null, [clients, clientId]);

    const resolved = useMemo(() => {
        if (!template) return {};
        return resolveFields(template.token_map ?? {}, { organization, client, contract });
    }, [template, organization, client, contract]);

    const unmapped = template ? template.detected_tokens.filter(tk => !template.token_map?.[tk]) : [];

    const emit = async () => {
        if (!template) return;
        setBusy(true);
        setError(null);
        try {
            const sourceBlob = await documentTemplateService.downloadFile(template);
            const filled = await fillDocx(sourceBlob, resolved);
            const baseName = `${slug(contract.number)}_${slug(template.name)}`;
            saveAs(filled, `${baseName}.docx`);
            notify?.('Documento gerado com sucesso!', 'success');
            onClose();
        } catch (e) {
            const raw = e instanceof Error ? e.message : '';
            const msg = /multi error|templat/i.test(raw)
                ? 'Erro ao processar o modelo. Verifique se o .docx é válido e tente novamente.'
                : raw || 'Falha ao gerar o documento.';
            setError(msg);
            notify?.(msg, 'error');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 dark:border-gray-700">
                    <FileDown className="w-5 h-5 text-blue-600" />
                    <div className="flex-1">
                        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Emitir documento</h2>
                        <p className="text-xs text-gray-400">Contrato {contract.number} · escolha o modelo e o cliente.</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
                    {loading ? (
                        <div className="space-y-2">
                            {[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-gray-50 dark:bg-gray-700/50 rounded-lg animate-pulse" />)}
                        </div>
                    ) : templates.length === 0 ? (
                        <div className="flex flex-col items-center gap-3 py-10 text-center text-gray-400">
                            <FileText size={32} strokeWidth={1} />
                            <p className="text-sm max-w-xs">Nenhum modelo de documento cadastrado. Suba um .docx em “Modelos de Documento” para emitir contratos.</p>
                            {onManageTemplates && (
                                <button onClick={onManageTemplates} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
                                    <Settings className="w-4 h-4" /> Gerenciar modelos
                                </button>
                            )}
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Modelo *</label>
                                    <select
                                        value={templateId}
                                        onChange={e => setTemplateId(e.target.value)}
                                        className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="">Selecione um modelo…</option>
                                        {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Cliente</label>
                                    <select
                                        value={clientId}
                                        onChange={e => setClientId(e.target.value)}
                                        className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="">Sem cliente</option>
                                        {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>
                            </div>

                            {template && unmapped.length > 0 && (
                                <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                    {unmapped.length} marcador(es) sem mapeamento ({unmapped.map(t => `{${t}}`).join(', ')}) ficarão em branco no documento.
                                </div>
                            )}

                            {/* Pré-visualização dos valores */}
                            {template && template.detected_tokens.length > 0 && (
                                <div>
                                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Pré-visualização dos valores</h3>
                                    <div className="rounded-lg border border-gray-100 dark:border-gray-700 divide-y divide-gray-50 dark:divide-gray-700/50 max-h-64 overflow-auto">
                                        {template.detected_tokens.map(tk => (
                                            <div key={tk} className="grid grid-cols-[64px_1fr] gap-2 px-3 py-2 text-sm">
                                                <span className="font-mono text-xs font-semibold text-blue-700 dark:text-blue-400">{`{${tk}}`}</span>
                                                <div className="min-w-0">
                                                    <p className="text-[11px] text-gray-400 truncate">{describeMapping(template.token_map?.[tk])}</p>
                                                    <p className="text-gray-900 dark:text-white truncate">{resolved[tk] || <span className="text-gray-300">(vazio)</span>}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {error && (
                        <div className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
                        </div>
                    )}
                </div>

                {/* Footer */}
                {templates.length > 0 && (
                    <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 dark:border-gray-700">
                        <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700">
                            Cancelar
                        </button>
                        <button
                            onClick={emit}
                            disabled={!template || busy}
                            className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                        >
                            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                            {busy ? 'Gerando…' : 'Emitir documento'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default EmitDocumentModal;
