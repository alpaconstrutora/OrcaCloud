import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
    FileText, Plus, Edit2, Trash2, Save, X,
    AlertCircle, Loader2, Upload, Download,
    CalendarX, CalendarClock, CalendarCheck, Shield,
} from 'lucide-react';
import {
    CompanyDocument, CompanyDocumentInsert,
    TipoDocumento, TIPO_DOCUMENTO_LABELS,
} from '../types';
import { companyService } from '../services/companyService';

interface Props {
    companyId: string;
}

// ─── Badge de vencimento ─────────────────────────────────────

const ExpiryBadge: React.FC<{ validade?: string; diasAlerta?: number }> = ({ validade, diasAlerta = 30 }) => {
    if (!validade) return (
        <span className="flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">
            <Shield className="w-3 h-3" /> Sem validade
        </span>
    );
    const diff = Math.ceil((new Date(validade + 'T00:00:00').getTime() - Date.now()) / 86400000);
    const data = new Date(validade + 'T00:00:00').toLocaleDateString('pt-BR');

    if (diff < 0) return (
        <span className="flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-red-100 text-red-600">
            <CalendarX className="w-3 h-3" /> Vencido {data}
        </span>
    );
    if (diff <= diasAlerta) return (
        <span className="flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-red-100 text-red-600">
            <CalendarClock className="w-3 h-3" /> Vence {diff}d
        </span>
    );
    if (diff <= diasAlerta * 2) return (
        <span className="flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
            <CalendarClock className="w-3 h-3" /> Vence {diff}d
        </span>
    );
    return (
        <span className="flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-green-100 text-green-700">
            <CalendarCheck className="w-3 h-3" /> Válido {data}
        </span>
    );
};

// ─── Form ────────────────────────────────────────────────────

type FormData = {
    tipo: TipoDocumento | '';
    numero: string;
    emissor: string;
    data_emissao: string;
    data_validade: string;
    observacoes: string;
    alerta_dias_antecedencia: string;
};

const EMPTY: FormData = {
    tipo: '', numero: '', emissor: '', data_emissao: '',
    data_validade: '', observacoes: '', alerta_dias_antecedencia: '30',
};

const cls = "w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white";

const Field: React.FC<{ label: string; children: React.ReactNode; required?: boolean }> = ({ label, children, required }) => (
    <div>
        <label className="block text-xs font-black uppercase tracking-widest text-gray-500 mb-1">
            {label}{required && <span className="text-red-500 ml-1">*</span>}
        </label>
        {children}
    </div>
);

// ─── Componente ───────────────────────────────────────────────

const CompanyDocumentsTab: React.FC<Props> = ({ companyId }) => {
    const [documents, setDocuments] = useState<CompanyDocument[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState<FormData>(EMPTY);
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setDocuments(await companyService.listDocuments(companyId));
        } catch (e: unknown) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, [companyId]);

    useEffect(() => { load(); }, [load]);

    const openNew = () => { setEditingId(null); setForm(EMPTY); setPendingFile(null); setShowForm(true); setError(null); };
    const openEdit = (d: CompanyDocument) => {
        setEditingId(d.id);
        setForm({
            tipo: d.tipo, numero: d.numero ?? '', emissor: d.emissor ?? '',
            data_emissao: d.data_emissao ?? '', data_validade: d.data_validade ?? '',
            observacoes: d.observacoes ?? '',
            alerta_dias_antecedencia: String(d.alerta_dias_antecedencia),
        });
        setPendingFile(null); setShowForm(true); setError(null);
    };
    const cancel = () => { setShowForm(false); setEditingId(null); setPendingFile(null); setError(null); };
    const set = (field: keyof FormData, value: string) => setForm(prev => ({ ...prev, [field]: value }));

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setPendingFile(e.target.files?.[0] ?? null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.tipo) { setError('Tipo de documento é obrigatório.'); return; }
        setSaving(true); setError(null);
        try {
            let arquivoUrl: string | undefined;

            if (pendingFile) {
                setUploading(true);
                arquivoUrl = await companyService.uploadDocumento(companyId, form.tipo, pendingFile);
                setUploading(false);
            }

            const payload: CompanyDocumentInsert = {
                company_id: companyId,
                tipo: form.tipo as TipoDocumento,
                numero: form.numero.trim() || undefined,
                emissor: form.emissor.trim() || undefined,
                data_emissao: form.data_emissao || undefined,
                data_validade: form.data_validade || undefined,
                observacoes: form.observacoes.trim() || undefined,
                alerta_dias_antecedencia: parseInt(form.alerta_dias_antecedencia) || 30,
                arquivo_url: arquivoUrl,
            };

            if (editingId) {
                await companyService.updateDocument(editingId, payload);
            } else {
                await companyService.createDocument(payload);
            }
            await load(); cancel();
        } catch (e: unknown) {
            setError((e as Error).message);
            setUploading(false);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string, tipo: string) => {
        if (!confirm(`Excluir documento "${TIPO_DOCUMENTO_LABELS[tipo as TipoDocumento]}"?`)) return;
        try {
            await companyService.removeDocument(id);
            setDocuments(prev => prev.filter(d => d.id !== id));
        } catch (e: unknown) {
            setError((e as Error).message);
        }
    };

    const handleDownload = async (arquivoUrl: string) => {
        try {
            const url = await companyService.getDocumentoSignedUrl(arquivoUrl);
            window.open(url, '_blank');
        } catch (e: unknown) {
            setError((e as Error).message);
        }
    };

    // Agrupa por tipo
    const grouped = documents.reduce<Record<string, CompanyDocument[]>>((acc, d) => {
        if (!acc[d.tipo]) acc[d.tipo] = [];
        acc[d.tipo].push(d);
        return acc;
    }, {});

    const vencendoEm30 = documents.filter(d => {
        if (!d.data_validade) return false;
        const diff = Math.ceil((new Date(d.data_validade + 'T00:00:00').getTime() - Date.now()) / 86400000);
        return diff >= 0 && diff <= d.alerta_dias_antecedencia;
    });

    const vencidos = documents.filter(d => {
        if (!d.data_validade) return false;
        return new Date(d.data_validade + 'T00:00:00') < new Date();
    });

    return (
        <div className="space-y-4">
            {/* Cabeçalho */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <p className="text-xs font-black uppercase tracking-widest text-gray-500">Documentos</p>
                    {vencidos.length > 0 && (
                        <span className="flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-red-100 text-red-600">
                            <CalendarX className="w-3 h-3" /> {vencidos.length} vencido{vencidos.length > 1 ? 's' : ''}
                        </span>
                    )}
                    {vencendoEm30.length > 0 && (
                        <span className="flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                            <CalendarClock className="w-3 h-3" /> {vencendoEm30.length} vencendo
                        </span>
                    )}
                </div>
                {!showForm && (
                    <button onClick={openNew}
                        className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-wide hover:bg-blue-700 transition-all active:scale-95">
                        <Plus className="w-3.5 h-3.5" /> Adicionar Documento
                    </button>
                )}
            </div>

            {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
                </div>
            )}

            {/* Formulário */}
            {showForm && (
                <form onSubmit={handleSubmit} className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-4">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-black uppercase tracking-widest text-blue-600">
                            {editingId ? 'Editar Documento' : 'Novo Documento'}
                        </p>
                        <button type="button" onClick={cancel} className="text-gray-400 hover:text-gray-600">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        <Field label="Tipo de Documento" required>
                            <select className={cls} value={form.tipo}
                                onChange={e => set('tipo', e.target.value)}>
                                <option value="">Selecione</option>
                                {(Object.entries(TIPO_DOCUMENTO_LABELS) as [TipoDocumento, string][]).map(([v, l]) => (
                                    <option key={v} value={v}>{l}</option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Número / Identificação">
                            <input className={cls} value={form.numero}
                                onChange={e => set('numero', e.target.value)} />
                        </Field>
                        <Field label="Emissor / Órgão">
                            <input className={cls} value={form.emissor}
                                placeholder="ex: Receita Federal"
                                onChange={e => set('emissor', e.target.value)} />
                        </Field>
                        <Field label="Data de Emissão">
                            <input type="date" className={cls} value={form.data_emissao}
                                onChange={e => set('data_emissao', e.target.value)} />
                        </Field>
                        <Field label="Data de Validade">
                            <input type="date" className={cls} value={form.data_validade}
                                onChange={e => set('data_validade', e.target.value)} />
                        </Field>
                        <Field label="Alertar com antecedência (dias)">
                            <input type="number" min="1" max="365" className={cls}
                                value={form.alerta_dias_antecedencia}
                                onChange={e => set('alerta_dias_antecedencia', e.target.value)} />
                        </Field>
                        <div className="md:col-span-3">
                            <Field label="Observações">
                                <input className={cls} value={form.observacoes}
                                    onChange={e => set('observacoes', e.target.value)} />
                            </Field>
                        </div>
                    </div>

                    {/* Upload */}
                    <div>
                        <p className="text-xs font-black uppercase tracking-widest text-gray-500 mb-2">Arquivo</p>
                        <div className="flex items-center gap-3">
                            <input ref={fileInputRef} type="file"
                                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                                className="hidden" onChange={handleFileChange} />
                            <button type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-300 text-gray-500 rounded-xl font-black text-xs uppercase tracking-wide hover:border-blue-400 hover:text-blue-600 transition-all">
                                <Upload className="w-4 h-4" />
                                {pendingFile ? pendingFile.name : 'Selecionar arquivo'}
                            </button>
                            {pendingFile && (
                                <button type="button" onClick={() => { setPendingFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                                    className="text-gray-400 hover:text-red-500">
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1">PDF, Word, JPG, PNG. Deixe em branco para registrar sem arquivo.</p>
                    </div>

                    <div className="flex justify-end gap-2 pt-1 border-t border-gray-200">
                        <button type="button" onClick={cancel}
                            className="px-4 py-2 text-xs font-black uppercase tracking-wide text-gray-500 hover:text-gray-700">
                            Cancelar
                        </button>
                        <button type="submit" disabled={saving || uploading}
                            className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-wide hover:bg-blue-700 transition-all disabled:opacity-60 active:scale-95">
                            {(saving || uploading) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                            {uploading ? 'Enviando...' : 'Salvar'}
                        </button>
                    </div>
                </form>
            )}

            {/* Lista */}
            {loading ? (
                <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
            ) : documents.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-gray-400 gap-2">
                    <FileText className="w-8 h-8 opacity-30" />
                    <p className="text-sm font-medium">Nenhum documento cadastrado.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {Object.entries(grouped).map(([tipo, docs]) => (
                        <div key={tipo}>
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">
                                {TIPO_DOCUMENTO_LABELS[tipo as TipoDocumento]}
                            </p>
                            <div className="space-y-2">
                                {docs.map(d => (
                                    <div key={d.id}
                                        className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3">
                                        <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                {d.numero && (
                                                    <span className="font-black text-gray-900 text-sm">{d.numero}</span>
                                                )}
                                                <ExpiryBadge validade={d.data_validade} diasAlerta={d.alerta_dias_antecedencia} />
                                            </div>
                                            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                                                {d.emissor && <span className="text-xs text-gray-400">{d.emissor}</span>}
                                                {d.data_emissao && (
                                                    <span className="text-xs text-gray-400">
                                                        Emitido: {new Date(d.data_emissao + 'T00:00:00').toLocaleDateString('pt-BR')}
                                                    </span>
                                                )}
                                                {d.observacoes && <span className="text-xs text-gray-400 italic">{d.observacoes}</span>}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                            {d.arquivo_url && (
                                                <button onClick={() => handleDownload(d.arquivo_url!)}
                                                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                    title="Baixar arquivo">
                                                    <Download className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                            <button onClick={() => openEdit(d)}
                                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                                                <Edit2 className="w-3.5 h-3.5" />
                                            </button>
                                            <button onClick={() => handleDelete(d.id, d.tipo)}
                                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default CompanyDocumentsTab;
