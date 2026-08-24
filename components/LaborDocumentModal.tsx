import React, { useState, useRef } from 'react';
import {
    Upload, Calendar, AlertCircle, Check, Loader2, Info, Pencil, FileText
} from 'lucide-react';
import {
    laborService, Employee, DocumentCategory, EmployeeDocument
} from '../services/laborService';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from './ui/sheet';
import { validateDocumentFile, DOCUMENT_ACCEPT_ATTR } from '../lib/mimeValidation';

interface LaborDocumentModalProps {
    employees: Employee[];
    orgId: string | null;
    onClose: () => void;
    onSaved: () => void;
    editDoc?: EmployeeDocument;
}

const CATEGORIES: { value: DocumentCategory; label: string }[] = [
    { value: 'ASO', label: 'ASO (Atestado de Saúde Ocupacional)' },
    { value: 'NR', label: 'NR (Norma Regulamentadora)' },
    { value: 'IDENTIDADE', label: 'Identidade / RG / CPF' },
    { value: 'CONTRATO', label: 'Contrato de Trabalho' },
    { value: 'TREINAMENTO', label: 'Certificado de Treinamento' },
    { value: 'OUTROS', label: 'Outros Documentos' }
];

const LaborDocumentModal: React.FC<LaborDocumentModalProps> = ({ employees, orgId, onClose, onSaved, editDoc }) => {
    const isEdit = !!editDoc;
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [dirty, setDirty] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [form, setForm] = useState({
        employee_id: editDoc?.employee_id ?? '',
        category: (editDoc?.category ?? 'ASO') as DocumentCategory,
        title: editDoc?.title ?? '',
        expiry_date: editDoc?.expiry_date ?? '',
        exam_date: editDoc?.exam_date ?? '',
        notes: editDoc?.notes ?? ''
    });
    const [file, setFile] = useState<File | null>(null);

    const updateForm = (patch: Partial<typeof form>) => {
        setForm(prev => ({ ...prev, ...patch }));
        setDirty(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!isEdit && !file) {
            setError('Por favor, selecione um arquivo.');
            return;
        }
        if (!isEdit && !form.employee_id) {
            setError('Selecione um colaborador.');
            return;
        }
        if (!form.title) {
            setError('Informe um título para o documento.');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            if (isEdit) {
                await laborService.updateDocument(editDoc!.id, {
                    category: form.category,
                    title: form.title,
                    expiry_date: form.expiry_date || undefined,
                    exam_date: form.exam_date || undefined,
                    notes: form.notes
                });
                // Substituição do arquivo é opcional na edição
                if (file) {
                    await laborService.replaceDocumentFile(
                        editDoc!.id,
                        editDoc!.file_url,
                        editDoc!.employee_id,
                        file
                    );
                }
            } else {
                const selectedEmp = employees.find(emp => emp.id === form.employee_id);
                const finalOrgId = orgId || selectedEmp?.org_id || '';

                if (!finalOrgId) {
                    throw new Error('Não foi possível identificar a organização deste colaborador.');
                }

                await laborService.uploadDocument({
                    org_id: finalOrgId,
                    employee_id: form.employee_id,
                    category: form.category,
                    title: form.title,
                    expiry_date: form.expiry_date || undefined,
                    exam_date: form.exam_date || undefined,
                    notes: form.notes,
                    status: 'ATIVO'
                }, file!);
            }

            setDirty(false);
            onSaved();
        } catch (err: any) {
            console.error('[LaborDocumentModal] Error:', err);
            setError(err.message || 'Erro ao salvar documento.');
        } finally {
            setLoading(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const selectedFile = e.target.files[0];
            const validation = validateDocumentFile(selectedFile);
            if (!validation.valid) {
                setError(validation.error ?? 'Arquivo inválido.');
                e.target.value = '';
                return;
            }
            setError(null);
            setFile(selectedFile);
            setDirty(true);
            if (!form.title) {
                updateForm({ title: selectedFile.name.split('.')[0].toUpperCase() });
            }
        }
    };

    const sortedEmployees = [...employees].sort((a, b) => a.name.localeCompare(b.name));

    const inputClass = 'w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500 transition-all';
    const labelClass = 'text-xs font-semibold text-slate-500';

    return (
        <Sheet open onClose={onClose} size="lg" dirty={dirty}>
            <SheetHeader onClose={onClose}>
                <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-[10px] shrink-0 ${isEdit ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
                        {isEdit ? <Pencil className="w-5 h-5" /> : <Upload className="w-5 h-5" />}
                    </div>
                    <div className="min-w-0">
                        <SheetTitle>{isEdit ? 'Editar documento' : 'Novo documento'}</SheetTitle>
                        <SheetDescription>
                            {isEdit ? 'Alterar dados e substituir o arquivo do documento' : 'Upload e controle de validade'}
                        </SheetDescription>
                    </div>
                </div>
            </SheetHeader>

            <SheetPanel className="p-6">
                <form onSubmit={handleSubmit} className="space-y-5" id="labor-document-form">
                    {error && (
                        <div className="p-4 bg-red-50 border border-red-100 rounded-[10px] flex items-start gap-3 text-red-700 text-sm">
                            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                            <p className="font-medium">{error}</p>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Colaborador */}
                        <div className="space-y-1.5">
                            <label className={labelClass}>Colaborador</label>
                            {isEdit ? (
                                <div className="w-full px-4 py-2.5 bg-slate-100 rounded-[6px] text-sm font-medium text-slate-500 cursor-not-allowed">
                                    {editDoc?.employee_name || 'Colaborador'}
                                </div>
                            ) : (
                                <select
                                    value={form.employee_id}
                                    onChange={(e) => updateForm({ employee_id: e.target.value })}
                                    className={inputClass}
                                    required
                                >
                                    <option value="">Selecionar colaborador</option>
                                    {sortedEmployees.map(emp => (
                                        <option key={emp.id} value={emp.id}>{emp.name} ({emp.role})</option>
                                    ))}
                                </select>
                            )}
                        </div>

                        {/* Categoria */}
                        <div className="space-y-1.5">
                            <label className={labelClass}>Categoria</label>
                            <select
                                value={form.category}
                                onChange={(e) => updateForm({ category: e.target.value as DocumentCategory })}
                                className={inputClass}
                                required
                            >
                                {CATEGORIES.map(cat => (
                                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Título */}
                    <div className="space-y-1.5">
                        <label className={labelClass}>Título do documento</label>
                        <input
                            type="text"
                            placeholder="Ex: ASO Periódico 2024"
                            value={form.title}
                            onChange={(e) => updateForm({ title: e.target.value.toUpperCase() })}
                            className={inputClass}
                            required
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Data do exame */}
                        <div className="space-y-1.5">
                            <label className={`${labelClass} flex items-center justify-between`}>
                                Data do exame
                                <span className="text-[10px] text-slate-400 font-normal">Opcional</span>
                            </label>
                            <div className="relative">
                                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="date"
                                    value={form.exam_date}
                                    onChange={(e) => updateForm({ exam_date: e.target.value })}
                                    className={`${inputClass} pl-11`}
                                />
                            </div>
                        </div>

                        {/* Vencimento */}
                        <div className="space-y-1.5">
                            <label className={`${labelClass} flex items-center justify-between`}>
                                Vencimento
                                <span className="text-[10px] text-slate-400 font-normal">Opcional</span>
                            </label>
                            <div className="relative">
                                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="date"
                                    value={form.expiry_date}
                                    onChange={(e) => updateForm({ expiry_date: e.target.value })}
                                    className={`${inputClass} pl-11`}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Upload de arquivo — criação (obrigatório) e edição (substituição opcional) */}
                    <div className="space-y-1.5">
                        <label className={labelClass}>
                            {isEdit ? 'Substituir arquivo (opcional)' : 'Arquivo (PDF, JPG, PNG)'}
                        </label>
                        {isEdit && (
                            <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                                <FileText className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate">Arquivo atual mantido se nenhum novo for selecionado.</span>
                            </div>
                        )}
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            className={`flex flex-col items-center justify-center p-5 border-2 border-dashed rounded-[10px] cursor-pointer transition-all ${file ? 'border-emerald-300 bg-emerald-50 text-emerald-600' : 'border-slate-200 bg-slate-50/50 text-slate-400 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600'}`}
                        >
                            {file ? (
                                <div className="flex items-center gap-2">
                                    <Check className="w-5 h-5" />
                                    <span className="text-sm font-medium truncate max-w-[220px]">{file.name}</span>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center gap-1">
                                    <Upload className="w-5 h-5" />
                                    <span className="text-sm font-medium">{isEdit ? 'Selecionar novo arquivo' : 'Fazer upload'}</span>
                                </div>
                            )}
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                className="hidden"
                                accept={DOCUMENT_ACCEPT_ATTR}
                            />
                        </div>
                    </div>

                    {/* Observações */}
                    <div className="space-y-1.5">
                        <label className={labelClass}>Observações</label>
                        <textarea
                            rows={3}
                            value={form.notes}
                            onChange={(e) => updateForm({ notes: e.target.value })}
                            className={`${inputClass} resize-none`}
                            placeholder="Informações adicionais sobre o documento..."
                        />
                    </div>

                    {!isEdit && (
                        <div className="p-4 bg-blue-50 rounded-[10px] flex gap-3 text-blue-700 text-xs font-medium border border-blue-100">
                            <Info className="w-4 h-4 shrink-0" />
                            <p>O arquivo será armazenado com segurança e o vencimento será monitorado automaticamente no seu Dashboard.</p>
                        </div>
                    )}
                </form>
            </SheetPanel>

            <SheetFooter>
                <button
                    type="button"
                    onClick={onClose}
                    className="px-3.5 h-9 border border-slate-200 text-slate-500 font-medium rounded-[6px] hover:bg-slate-50 transition-colors text-[13px]"
                >
                    Cancelar
                </button>
                <button
                    type="submit"
                    form="labor-document-form"
                    disabled={loading}
                    className={`flex items-center gap-1.5 h-9 px-3.5 text-white rounded-[6px] font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${isEdit ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-600 hover:bg-blue-700'}`}
                >
                    {loading ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            {isEdit ? 'Salvando...' : 'Enviando...'}
                        </>
                    ) : (
                        <>
                            <Check className="w-4 h-4" />
                            {isEdit ? 'Salvar alterações' : 'Salvar documento'}
                        </>
                    )}
                </button>
            </SheetFooter>
        </Sheet>
    );
};

export default LaborDocumentModal;
