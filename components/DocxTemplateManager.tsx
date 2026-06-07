import React, { useCallback, useEffect, useState } from 'react';
import {
    X, FileText, Upload, Trash2, Pencil, Plus, Loader2, Save, AlertCircle, Link2,
} from 'lucide-react';
import {
    documentTemplateService, DocumentTemplate,
} from '../services/documentTemplateService';
import { detectTokens } from '../services/docxRenderService';
import { FIELD_GROUPS, TokenMap, TokenMapping } from '../services/docxFieldCatalog';

interface Props {
    organizationId: string;
    onClose: () => void;
}

type Draft = {
    id: string | null;
    name: string;
    description: string;
    file: File | null;          // arquivo novo (obrigatório ao criar)
    detectedTokens: string[];
    tokenMap: TokenMap;
};

const EMPTY_DRAFT: Draft = {
    id: null, name: '', description: '', file: null, detectedTokens: [], tokenMap: {},
};

// ─── Seletor de mapeamento de um marcador ─────────────────────────────────────────
const MappingSelect: React.FC<{
    value?: TokenMapping;
    onChange: (m: TokenMapping | undefined) => void;
}> = ({ value, onChange }) => {
    const selectValue = !value ? '' : value.source === 'fixed' ? 'fixed' : `${value.source}.${value.field}`;

    return (
        <div className="flex flex-col gap-1.5">
            <select
                value={selectValue}
                onChange={(e) => {
                    const v = e.target.value;
                    if (v === '') return onChange(undefined);
                    if (v === 'fixed') return onChange({ source: 'fixed', fixed: value?.fixed ?? '' });
                    const [source, field] = v.split('.');
                    const group = FIELD_GROUPS.find(g => g.source === source);
                    const f = group?.fields.find(x => x.field === field);
                    onChange({ source: source as TokenMapping['source'], field, label: f?.label });
                }}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2.5 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
                <option value="">— não mapeado —</option>
                <option value="fixed">✎ Texto fixo…</option>
                {FIELD_GROUPS.map(g => (
                    <optgroup key={g.source} label={g.label}>
                        {g.fields.map(f => (
                            <option key={`${g.source}.${f.field}`} value={`${g.source}.${f.field}`}>
                                {f.label}
                            </option>
                        ))}
                    </optgroup>
                ))}
            </select>
            {value?.source === 'fixed' && (
                <input
                    value={value.fixed ?? ''}
                    onChange={(e) => onChange({ source: 'fixed', fixed: e.target.value })}
                    placeholder="Texto que substituirá o marcador"
                    className="w-full rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
            )}
        </div>
    );
};

const DocxTemplateManager: React.FC<Props> = ({ organizationId, onClose }) => {
    const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [parsing, setParsing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(() => {
        setLoading(true);
        documentTemplateService.list(organizationId)
            .then(setTemplates)
            .catch(e => setError(e instanceof Error ? e.message : 'Erro ao carregar modelos'))
            .finally(() => setLoading(false));
    }, [organizationId]);

    useEffect(() => { load(); }, [load]);

    const startNew = () => { setError(null); setDraft({ ...EMPTY_DRAFT }); };

    const startEdit = (t: DocumentTemplate) => {
        setError(null);
        setDraft({
            id: t.id,
            name: t.name,
            description: t.description ?? '',
            file: null,
            detectedTokens: t.detected_tokens,
            tokenMap: t.token_map ?? {},
        });
    };

    const handleFile = async (file: File) => {
        if (!file.name.toLowerCase().endsWith('.docx')) {
            setError('Selecione um arquivo .docx (Word).');
            return;
        }
        setError(null);
        setParsing(true);
        try {
            const tokens = await detectTokens(file);
            setDraft(d => {
                const base = d ?? { ...EMPTY_DRAFT };
                // Preserva mapeamentos já feitos para marcadores que continuam existindo
                const keptMap: TokenMap = {};
                for (const tk of tokens) if (base.tokenMap[tk]) keptMap[tk] = base.tokenMap[tk];
                return {
                    ...base,
                    file,
                    name: base.name || file.name.replace(/\.docx$/i, ''),
                    detectedTokens: tokens,
                    tokenMap: keptMap,
                };
            });
            if (tokens.length === 0) {
                setError('Nenhum marcador {001} encontrado no documento. Verifique se o texto usa chaves simples, ex.: {001}.');
            }
        } catch (e) {
            const raw = e instanceof Error ? e.message : '';
            // Oculta mensagens técnicas do docxtemplater (ex.: "Multi error")
            const friendly = /multi error|templat/i.test(raw)
                ? 'Erro ao ler o arquivo. Verifique se é um .docx válido e tente novamente.'
                : raw || 'Não foi possível ler o .docx.';
            setError(friendly);
        } finally {
            setParsing(false);
        }
    };

    const setMapping = (token: string, m: TokenMapping | undefined) => {
        setDraft(d => {
            if (!d) return d;
            const next = { ...d.tokenMap };
            if (m) next[token] = m; else delete next[token];
            return { ...d, tokenMap: next };
        });
    };

    const canSave = !!draft && draft.name.trim() !== '' && (draft.id !== null || draft.file !== null);

    const save = async () => {
        if (!draft || !canSave) return;
        setSaving(true);
        setError(null);
        try {
            if (draft.id) {
                await documentTemplateService.update(
                    draft.id, organizationId,
                    {
                        name: draft.name.trim(),
                        description: draft.description.trim() || undefined,
                        detected_tokens: draft.detectedTokens,
                        token_map: draft.tokenMap,
                    },
                    draft.file ?? undefined,
                );
            } else {
                await documentTemplateService.create(organizationId, draft.file!, {
                    name: draft.name.trim(),
                    description: draft.description.trim() || undefined,
                    detected_tokens: draft.detectedTokens,
                    token_map: draft.tokenMap,
                });
            }
            setDraft(null);
            load();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Erro ao salvar o modelo.');
        } finally {
            setSaving(false);
        }
    };

    const remove = async (t: DocumentTemplate) => {
        if (!window.confirm(`Remover o modelo "${t.name}"?`)) return;
        await documentTemplateService.deactivate(t.id);
        load();
    };

    const mappedCount = draft ? draft.detectedTokens.filter(tk => draft.tokenMap[tk]).length : 0;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 dark:border-gray-700">
                    <FileText className="w-5 h-5 text-blue-600" />
                    <div className="flex-1">
                        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Modelos de Documento</h2>
                        <p className="text-xs text-gray-400">Suba um .docx com marcadores {'{001}'} e escolha o que cada um significa.</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {error && (
                    <div className="mx-6 mt-4 flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
                    </div>
                )}

                <div className="flex-1 overflow-auto px-6 py-4">
                    {/* ─── Modo edição/criação ─── */}
                    {draft ? (
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Nome do modelo *</label>
                                    <input
                                        value={draft.name}
                                        onChange={e => setDraft({ ...draft, name: e.target.value })}
                                        placeholder="Ex.: Contrato de prestação de serviços"
                                        className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Descrição</label>
                                    <input
                                        value={draft.description}
                                        onChange={e => setDraft({ ...draft, description: e.target.value })}
                                        placeholder="Opcional"
                                        className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                            </div>

                            {/* Upload / substituição do arquivo */}
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">
                                    Arquivo .docx {draft.id ? '(deixe em branco para manter o atual)' : '*'}
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer rounded-lg border border-dashed border-gray-300 dark:border-gray-600 px-3 py-3 text-sm text-gray-600 dark:text-gray-300 hover:border-blue-400 hover:bg-blue-50/40 transition-colors">
                                    {parsing ? <Loader2 className="w-4 h-4 animate-spin text-blue-600" /> : <Upload className="w-4 h-4 text-blue-600" />}
                                    <span className="truncate">
                                        {parsing ? 'Lendo marcadores…' : draft.file ? draft.file.name : (draft.id ? 'Substituir arquivo (.docx)' : 'Selecionar arquivo (.docx)')}
                                    </span>
                                    <input
                                        type="file"
                                        accept=".docx"
                                        className="hidden"
                                        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.currentTarget.value = ''; }}
                                    />
                                </label>
                            </div>

                            {/* Mapeamento de marcadores */}
                            {draft.detectedTokens.length > 0 && (
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-1.5">
                                            <Link2 className="w-4 h-4 text-blue-600" /> Mapeamento dos marcadores
                                        </h3>
                                        <span className="text-xs text-gray-400">{mappedCount}/{draft.detectedTokens.length} mapeados</span>
                                    </div>
                                    <div className="space-y-2">
                                        {draft.detectedTokens.map(tk => (
                                            <div key={tk} className="grid grid-cols-[80px_1fr] items-start gap-3 rounded-lg bg-gray-50 dark:bg-gray-900/40 p-2.5">
                                                <span className="font-mono text-sm font-semibold text-blue-700 dark:text-blue-400 pt-1.5">{`{${tk}}`}</span>
                                                <MappingSelect value={draft.tokenMap[tk]} onChange={m => setMapping(tk, m)} />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center justify-end gap-2 pt-2">
                                <button onClick={() => setDraft(null)} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700">
                                    Cancelar
                                </button>
                                <button
                                    onClick={save}
                                    disabled={!canSave || saving || parsing}
                                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                                >
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    Salvar modelo
                                </button>
                            </div>
                        </div>
                    ) : (
                        /* ─── Lista ─── */
                        <div className="space-y-3">
                            <button
                                onClick={startNew}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                            >
                                <Plus className="w-4 h-4" /> Novo modelo
                            </button>

                            {loading ? (
                                <div className="space-y-2">
                                    {[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-gray-50 dark:bg-gray-700/50 rounded-lg animate-pulse" />)}
                                </div>
                            ) : templates.length === 0 ? (
                                <div className="flex flex-col items-center gap-3 py-12 text-gray-400">
                                    <FileText size={32} strokeWidth={1} />
                                    <p className="text-sm">Nenhum modelo ainda. Crie um a partir de um .docx.</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {templates.map(t => {
                                        const mapped = t.detected_tokens.filter(tk => t.token_map?.[tk]).length;
                                        return (
                                            <div key={t.id} className="flex items-center gap-3 rounded-xl border border-gray-100 dark:border-gray-700 p-3 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                                <FileText className="w-5 h-5 text-blue-600 shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{t.name}</p>
                                                    <p className="text-xs text-gray-400 truncate">
                                                        {t.file_name ?? '—'} · {mapped}/{t.detected_tokens.length} marcadores mapeados
                                                    </p>
                                                </div>
                                                <button onClick={() => startEdit(t)} title="Editar" className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500">
                                                    <Pencil className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => remove(t)} title="Remover" className="p-2 rounded-lg hover:bg-red-50 text-red-500">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DocxTemplateManager;
