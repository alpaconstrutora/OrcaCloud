import React, { useRef, useState } from 'react';
import { Award, ChevronDown, FileText, Loader2, Upload, X } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import Button from '../ui/Button';
import { trainingsService } from '../../services/trainingsService';
import type { EmployeeTraining, TrainingCourse } from '../../types/academy';
import type { Employee } from '../../services/laborService';

/**
 * Registro de treinamento PRESENCIAL (o fluxo que já existia).
 *
 * Migrado do modal `fixed inset-0` para `Sheet`. O comportamento é o mesmo:
 * grava `employee_trainings` com `origem = 'MANUAL'` e deixa `data_validade`
 * em branco para a trigger `set_training_validade()` calcular.
 */

const inputCls = 'w-full px-3 py-2 bg-white border border-gray-200 rounded-[6px] text-sm font-normal outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all';

const Campo: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="space-y-1.5">
        <label className="text-xs font-semibold text-gray-500">{label}</label>
        {children}
    </div>
);

interface Props {
    open: boolean;
    onClose: () => void;
    orgId: string;
    employees: Employee[];
    courses: TrainingCourse[];
    onSaved: (registro: EmployeeTraining) => void;
    notify: (msg: string, tipo?: 'success' | 'error') => void;
}

const AcademyRecordSheet: React.FC<Props> = ({
    open, onClose, orgId, employees, courses, onSaved, notify,
}) => {
    const fileRef = useRef<HTMLInputElement>(null);
    const [salvando, setSalvando] = useState(false);
    const [certificado, setCertificado] = useState<File | null>(null);
    const [form, setForm] = useState({
        employee_id: '', course_id: '',
        data_realizacao: new Date().toISOString().split('T')[0],
        data_validade: '', instrutor: '', local: '',
        carga_horaria: undefined as number | undefined,
        nota: undefined as number | undefined,
        aprovado: true, observacoes: '',
    });

    const cursoSelecionado = courses.find(c => c.id === form.course_id);

    const salvar = async () => {
        if (!form.employee_id || !form.course_id || !form.data_realizacao) {
            notify('Colaborador, treinamento e data são obrigatórios.', 'error');
            return;
        }
        setSalvando(true);
        try {
            const criado = await trainingsService.createEmployeeTraining({
                org_id: orgId,
                employee_id: form.employee_id,
                course_id: form.course_id,
                data_realizacao: form.data_realizacao,
                // Vazio de propósito: a trigger calcula por validade_meses.
                data_validade: form.data_validade || undefined,
                instrutor: form.instrutor || undefined,
                local: form.local || undefined,
                carga_horaria: form.carga_horaria ?? cursoSelecionado?.carga_horaria,
                nota: form.nota,
                aprovado: form.aprovado,
                status: 'ATIVO',
                origem: 'MANUAL',
                observacoes: form.observacoes || undefined,
            });

            if (certificado && criado?.id) {
                await trainingsService.uploadTrainingCertificado(criado.id, orgId, certificado);
            }
            onSaved(criado);
            onClose();
        } catch (e: any) {
            notify('Erro ao registrar: ' + (e?.message || 'tente novamente.'), 'error');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Sheet open={open} onClose={onClose} size="lg">
            <SheetHeader onClose={onClose}>
                <SheetTitle>Registrar treinamento</SheetTitle>
                <SheetDescription>Participação presencial ou certificado externo já realizado.</SheetDescription>
            </SheetHeader>

            <SheetPanel className="p-6">
                <div className="space-y-4">
                    <Campo label="Colaborador">
                        <div className="relative">
                            <select
                                value={form.employee_id}
                                onChange={e => setForm(p => ({ ...p, employee_id: e.target.value }))}
                                className={inputCls + ' appearance-none pr-8'}
                            >
                                <option value="">Selecione...</option>
                                {employees.filter(e => e.status === 'ATIVO').map(e => (
                                    <option key={e.id} value={e.id}>{e.name} — {e.role}</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                        </div>
                    </Campo>

                    <Campo label="Treinamento">
                        <div className="relative">
                            <select
                                value={form.course_id}
                                onChange={e => setForm(p => ({ ...p, course_id: e.target.value }))}
                                className={inputCls + ' appearance-none pr-8'}
                            >
                                <option value="">Selecione...</option>
                                {courses.filter(c => c.status === 'ATIVO').map(c => (
                                    <option key={c.id} value={c.id}>
                                        {c.nome}{c.nr_referencia ? ` (${c.nr_referencia})` : ''}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                        </div>
                    </Campo>

                    {cursoSelecionado && (
                        <div className="p-3 bg-emerald-50 rounded-[6px] border border-emerald-100 text-xs font-medium text-emerald-800 flex items-center gap-2">
                            <Award className="w-4 h-4 text-emerald-600 shrink-0" />
                            {cursoSelecionado.carga_horaria}h
                            {cursoSelecionado.validade_meses
                                ? ` · validade ${cursoSelecionado.validade_meses} meses`
                                : ' · sem validade'}
                            {cursoSelecionado.nr_referencia && ` · ${cursoSelecionado.nr_referencia}`}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <Campo label="Data de realização">
                            <input
                                type="date"
                                value={form.data_realizacao}
                                onChange={e => setForm(p => ({ ...p, data_realizacao: e.target.value }))}
                                className={inputCls}
                            />
                        </Campo>
                        <Campo label="Validade (vazio = calcula sozinho)">
                            <input
                                type="date"
                                value={form.data_validade}
                                onChange={e => setForm(p => ({ ...p, data_validade: e.target.value }))}
                                className={inputCls}
                            />
                        </Campo>
                        <Campo label="Instrutor">
                            <input
                                value={form.instrutor}
                                onChange={e => setForm(p => ({ ...p, instrutor: e.target.value }))}
                                className={inputCls}
                                placeholder={cursoSelecionado?.instrutor || ''}
                            />
                        </Campo>
                        <Campo label="Local">
                            <input
                                value={form.local}
                                onChange={e => setForm(p => ({ ...p, local: e.target.value }))}
                                className={inputCls}
                            />
                        </Campo>
                        <Campo label="Nota (0-10)">
                            <input
                                type="number" min="0" max="10" step="0.1"
                                value={form.nota ?? ''}
                                onChange={e => setForm(p => ({ ...p, nota: e.target.value ? parseFloat(e.target.value) : undefined }))}
                                className={inputCls}
                            />
                        </Campo>
                        <Campo label="Resultado">
                            <div className="relative">
                                <select
                                    value={form.aprovado ? 'true' : 'false'}
                                    onChange={e => setForm(p => ({ ...p, aprovado: e.target.value === 'true' }))}
                                    className={inputCls + ' appearance-none pr-8'}
                                >
                                    <option value="true">Aprovado</option>
                                    <option value="false">Reprovado</option>
                                </select>
                                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                            </div>
                        </Campo>
                    </div>

                    <Campo label="Observações">
                        <textarea
                            value={form.observacoes}
                            onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))}
                            className={inputCls + ' resize-none h-16'}
                        />
                    </Campo>

                    <Campo label="Certificado (opcional)">
                        <div
                            onClick={() => fileRef.current?.click()}
                            className="border-2 border-dashed border-gray-200 rounded-[10px] p-3 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-all"
                        >
                            {certificado ? (
                                <div className="flex items-center justify-center gap-2 text-blue-700">
                                    <FileText className="w-4 h-4" />
                                    <span className="text-xs font-medium">{certificado.name}</span>
                                    <button
                                        onClick={e => { e.stopPropagation(); setCertificado(null); }}
                                        className="ml-2 text-gray-400 hover:text-rose-500"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ) : (
                                <div className="flex items-center justify-center gap-2">
                                    <Upload className="w-4 h-4 text-gray-300" />
                                    <span className="text-xs text-gray-400 font-medium">Anexar certificado PDF/imagem</span>
                                </div>
                            )}
                        </div>
                        <input
                            ref={fileRef}
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            className="hidden"
                            onChange={e => setCertificado(e.target.files?.[0] || null)}
                        />
                    </Campo>
                </div>
            </SheetPanel>

            <SheetFooter>
                <Button variant="ghost" size="lg" onClick={onClose}>Cancelar</Button>
                <button
                    onClick={salvar}
                    disabled={salvando}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 transition-all font-medium text-[13px] active:scale-95 disabled:opacity-50"
                >
                    {salvando ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : null}
                    {salvando ? 'Registrando...' : 'Registrar'}
                </button>
            </SheetFooter>
        </Sheet>
    );
};

export default AcademyRecordSheet;
