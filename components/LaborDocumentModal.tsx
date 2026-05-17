import React, { useState, useRef } from 'react';
import {
    X, Upload, Calendar, FileText, AlertCircle,
    Check, Loader2, Info
} from 'lucide-react';
import {
    laborService, Employee, DocumentCategory
} from '../services/laborService';
import { validateDocumentFile, DOCUMENT_ACCEPT_ATTR } from '../lib/mimeValidation';

interface LaborDocumentModalProps {
    employees: Employee[];
    orgId: string;
    onClose: () => void;
    onSaved: () => void;
}

const CATEGORIES: { value: DocumentCategory; label: string }[] = [
    { value: 'ASO', label: 'ASO (Atestado de Saúde Ocupacional)' },
    { value: 'NR', label: 'NR (Norma Regulamentadora)' },
    { value: 'IDENTIDADE', label: 'Identidade / RG / CPF' },
    { value: 'CONTRATO', label: 'Contrato de Trabalho' },
    { value: 'TREINAMENTO', label: 'Certificado de Treinamento' },
    { value: 'OUTROS', label: 'Outros Documentos' }
];

const LaborDocumentModal: React.FC<LaborDocumentModalProps> = ({ employees, orgId, onClose, onSaved }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [form, setForm] = useState({
        employee_id: '',
        category: 'ASO' as DocumentCategory,
        title: '',
        expiry_date: '',
        notes: ''
    });
    const [file, setFile] = useState<File | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file) {
            setError('Por favor, selecione um arquivo.');
            return;
        }
        if (!form.employee_id) {
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
            // Find selected employee to ensure we have their correct org_id
            const selectedEmp = employees.find(e => e.id === form.employee_id);
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
                notes: form.notes,
                status: 'ATIVO'
            }, file);
            
            onSaved();
        } catch (err: any) {
            console.error('[LaborDocumentModal] Error:', err);
            setError(err.message || 'Erro ao fazer upload do documento. Verifique o tamanho e formato do arquivo.');
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
            if (!form.title) {
                setForm(prev => ({ ...prev, title: selectedFile.name.split('.')[0].toUpperCase() }));
            }
        }
    };

    // Sort employees by name
    const sortedEmployees = [...employees].sort((a, b) => a.name.localeCompare(b.name));

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl border border-slate-100 flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-300">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-slate-50">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                            <Upload className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-slate-900 leading-tight">NOVO DOCUMENTO</h3>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Upload e controle de validade</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
                    {error && (
                        <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3 text-red-700 text-sm animate-in shake duration-500">
                            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                            <p className="font-bold">{error}</p>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Colaborador */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Colaborador</label>
                            <select 
                                value={form.employee_id}
                                onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
                                className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                                required
                            >
                                <option value="">Selecionar Colaborador</option>
                                {sortedEmployees.map(emp => (
                                    <option key={emp.id} value={emp.id}>{emp.name} ({emp.role})</option>
                                ))}
                            </select>
                        </div>

                        {/* Categoria */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Categoria</label>
                            <select 
                                value={form.category}
                                onChange={(e) => setForm({ ...form, category: e.target.value as DocumentCategory })}
                                className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                                required
                            >
                                {CATEGORIES.map(cat => (
                                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Título */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Título do Documento</label>
                        <input 
                            type="text" 
                            placeholder="Ex: ASO Periódico 2024"
                            value={form.title}
                            onChange={(e) => setForm({ ...form, title: e.target.value.toUpperCase() })}
                            className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Data de Vencimento */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1 flex items-center justify-between">
                                Vencimento
                                <span className="text-[9px] text-slate-300 normal-case font-medium">Opcional</span>
                            </label>
                            <div className="relative">
                                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input 
                                    type="date" 
                                    value={form.expiry_date}
                                    onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
                                    className="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                                />
                            </div>
                        </div>

                        {/* File Upload */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Arquivo (PDF, JPG, PNG)</label>
                            <div 
                                onClick={() => fileInputRef.current?.click()}
                                className={`flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-2xl cursor-pointer transition-all ${file ? 'border-emerald-300 bg-emerald-50 text-emerald-600' : 'border-slate-200 bg-slate-50 text-slate-400 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600'}`}
                            >
                                {file ? (
                                    <div className="flex items-center gap-2">
                                        <Check className="w-5 h-5" />
                                        <span className="text-xs font-black truncate max-w-[150px]">{file.name}</span>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center gap-1">
                                        <Upload className="w-5 h-5" />
                                        <span className="text-[10px] font-black uppercase">Fazer Upload</span>
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
                    </div>

                    {/* Observações */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Observações</label>
                        <textarea 
                            rows={3}
                            value={form.notes}
                            onChange={(e) => setForm({ ...form, notes: e.target.value })}
                            className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-medium text-slate-600 outline-none focus:ring-2 focus:ring-indigo-500 transition-all resize-none"
                            placeholder="Informações adicionais sobre o documento..."
                        />
                    </div>

                    <div className="p-4 bg-indigo-50 rounded-2xl flex gap-3 text-indigo-700 text-[11px] font-bold border border-indigo-100">
                        <Info className="w-4 h-4 shrink-0" />
                        <p>O arquivo será armazenado com segurança e o vencimento será monitorado automaticamente no seu Dashboard.</p>
                    </div>
                </form>

                {/* Footer */}
                <div className="p-6 border-t border-slate-50 bg-slate-50/50 flex items-center justify-end gap-3">
                    <button 
                        onClick={onClose}
                        className="px-6 py-2.5 text-slate-500 font-black text-xs uppercase tracking-tight hover:text-slate-700 transition-all"
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={handleSubmit}
                        disabled={loading}
                        className="flex items-center gap-2 px-8 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 font-black text-xs uppercase tracking-tight disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Enviando...
                            </>
                        ) : (
                            <>
                                <Check className="w-4 h-4" />
                                Salvar Documento
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LaborDocumentModal;
