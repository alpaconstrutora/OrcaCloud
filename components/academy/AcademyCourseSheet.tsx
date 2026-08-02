import React, { useState } from 'react';
import { ChevronDown, Loader2, Shield } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import Button from '../ui/Button';
import { trainingsService } from '../../services/trainingsService';
import type {
    TrainingCategoria, TrainingCourse, TrainingModalidade,
} from '../../types/academy';

/**
 * Criar/editar treinamento no catálogo.
 *
 * Migrado do modal `fixed inset-0` hand-rolled para `Sheet` (UI_PATTERNS §3:
 * criar/editar item de lista é painel lateral, não modal central).
 */

export const CAT_CONFIG: Record<TrainingCategoria, { label: string; color: string }> = {
    NR_OBRIGATORIA: { label: 'NR Obrigatória', color: 'text-rose-700' },
    INTEGRACAO:     { label: 'Integração',     color: 'text-indigo-700' },
    DDS:            { label: 'DDS',            color: 'text-amber-700' },
    QUALIDADE:      { label: 'Qualidade',      color: 'text-emerald-700' },
    LIDERANCA:      { label: 'Liderança',      color: 'text-purple-700' },
    TECNICO:        { label: 'Técnico',        color: 'text-blue-700' },
    OUTROS:         { label: 'Outros',         color: 'text-slate-700' },
};

const MODALIDADES: Array<{ id: TrainingModalidade; label: string; ajuda: string }> = [
    { id: 'PRESENCIAL', label: 'Presencial', ajuda: 'Só registro de participação — sem conteúdo na Academia.' },
    { id: 'EAD',        label: 'EAD',        ajuda: 'Conteúdo, avaliação e certificado pela Academia.' },
    { id: 'HIBRIDO',    label: 'Híbrido',    ajuda: 'Parte presencial, parte a distância.' },
];

const inputCls = 'w-full px-3 py-2 bg-white border border-gray-200 rounded-[6px] text-sm font-normal outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all';

const Campo: React.FC<{ label: string; ajuda?: string; children: React.ReactNode }> = ({ label, ajuda, children }) => (
    <div className="space-y-1.5">
        <label className="text-xs font-semibold text-gray-500">{label}</label>
        {children}
        {ajuda && <p className="text-xs text-gray-400">{ajuda}</p>}
    </div>
);

interface Props {
    open: boolean;
    onClose: () => void;
    orgId: string;
    course: TrainingCourse | null;
    /** Cargos disponíveis para marcar como obrigatórios. */
    cargos: Array<{ id: string; nome: string }>;
    onSaved: (course: TrainingCourse, criado: boolean) => void;
    notify: (msg: string, tipo?: 'success' | 'error') => void;
}

const AcademyCourseSheet: React.FC<Props> = ({
    open, onClose, orgId, course, cargos, onSaved, notify,
}) => {
    const editando = !!course;
    const [salvando, setSalvando] = useState(false);
    const [form, setForm] = useState<Partial<TrainingCourse>>({
        org_id: orgId,
        nome: course?.nome || '',
        descricao: course?.descricao || '',
        nr_referencia: course?.nr_referencia || '',
        categoria: course?.categoria || 'NR_OBRIGATORIA',
        modalidade: course?.modalidade || 'PRESENCIAL',
        carga_horaria: course?.carga_horaria ?? 8,
        validade_meses: course?.validade_meses ?? undefined,
        instrutor: course?.instrutor || '',
        is_obrigatorio: course?.is_obrigatorio ?? false,
        roles_obrigatorios: course?.roles_obrigatorios || [],
        cargos_obrigatorios: course?.cargos_obrigatorios || [],
        status: course?.status || 'ATIVO',
    });

    const set = <K extends keyof TrainingCourse>(k: K, v: TrainingCourse[K]) =>
        setForm(p => ({ ...p, [k]: v }));

    const alternarCargo = (id: string) => {
        const atual = form.cargos_obrigatorios || [];
        set('cargos_obrigatorios', atual.includes(id) ? atual.filter(x => x !== id) : [...atual, id]);
    };

    const salvar = async () => {
        if (!form.nome?.trim()) { notify('Informe o nome do treinamento.', 'error'); return; }
        setSalvando(true);
        try {
            const salvo = editando && course
                ? await trainingsService.updateTrainingCourse(course.id, form)
                : await trainingsService.createTrainingCourse(
                    form as Omit<TrainingCourse, 'id' | 'created_at' | 'updated_at'>);
            onSaved(salvo, !editando);
            onClose();
        } catch (e: any) {
            notify('Erro ao salvar: ' + (e?.message || 'tente novamente.'), 'error');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Sheet open={open} onClose={onClose} size="lg">
            <SheetHeader onClose={onClose}>
                <SheetTitle>{editando ? 'Editar treinamento' : 'Novo treinamento'}</SheetTitle>
                <SheetDescription>Catálogo compartilhado por RH, SESMT e obra.</SheetDescription>
            </SheetHeader>

            <SheetPanel className="p-6">
                <div className="space-y-4">
                    <Campo label="Nome">
                        <input
                            value={form.nome}
                            onChange={e => set('nome', e.target.value)}
                            className={inputCls}
                            placeholder="Ex: NR-35 — Trabalho em Altura"
                        />
                    </Campo>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Campo label="Categoria">
                            <div className="relative">
                                <select
                                    value={form.categoria}
                                    onChange={e => set('categoria', e.target.value as TrainingCategoria)}
                                    className={inputCls + ' appearance-none pr-8'}
                                >
                                    {(Object.entries(CAT_CONFIG) as Array<[TrainingCategoria, { label: string }]>)
                                        .map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                                </select>
                                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                            </div>
                        </Campo>

                        <Campo
                            label="Modalidade"
                            ajuda={MODALIDADES.find(m => m.id === form.modalidade)?.ajuda}
                        >
                            <div className="relative">
                                <select
                                    value={form.modalidade}
                                    onChange={e => set('modalidade', e.target.value as TrainingModalidade)}
                                    className={inputCls + ' appearance-none pr-8'}
                                >
                                    {MODALIDADES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                                </select>
                                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                            </div>
                        </Campo>

                        <Campo label="NR de referência">
                            <input
                                value={form.nr_referencia || ''}
                                onChange={e => set('nr_referencia', e.target.value)}
                                className={inputCls}
                                placeholder="Ex: NR-35"
                            />
                        </Campo>

                        <Campo label="Carga horária (h)">
                            <input
                                type="number" min="0" step="0.5"
                                value={form.carga_horaria}
                                onChange={e => set('carga_horaria', parseFloat(e.target.value) || 0)}
                                className={inputCls}
                            />
                        </Campo>

                        <Campo label="Validade (meses)" ajuda="Vazio = sem validade.">
                            <input
                                type="number" min="0"
                                value={form.validade_meses ?? ''}
                                onChange={e => set('validade_meses', e.target.value ? parseInt(e.target.value) : undefined)}
                                className={inputCls}
                                placeholder="Ex: 12, 24..."
                            />
                        </Campo>

                        <Campo label="Instrutor padrão">
                            <input
                                value={form.instrutor || ''}
                                onChange={e => set('instrutor', e.target.value)}
                                className={inputCls}
                            />
                        </Campo>
                    </div>

                    <Campo label="Descrição">
                        <textarea
                            value={form.descricao || ''}
                            onChange={e => set('descricao', e.target.value)}
                            className={inputCls + ' resize-none h-16'}
                        />
                    </Campo>

                    <div className="border-t border-gray-100 pt-4 space-y-3">
                        <button
                            type="button"
                            onClick={() => set('is_obrigatorio', !form.is_obrigatorio)}
                            className={`flex items-center gap-2 h-9 px-3 rounded-[6px] border text-sm font-medium transition-all ${
                                form.is_obrigatorio
                                    ? 'bg-rose-50 border-rose-200 text-rose-700'
                                    : 'bg-gray-50 border-gray-200 text-gray-500'
                            }`}
                        >
                            <Shield className="w-3.5 h-3.5" />
                            {form.is_obrigatorio ? 'Obrigatório' : 'Não obrigatório'}
                        </button>

                        {form.is_obrigatorio && (
                            <div className="space-y-2">
                                <p className="text-xs font-semibold text-gray-500">
                                    Cargos que exigem este treinamento
                                </p>
                                {cargos.length === 0 ? (
                                    <p className="text-xs text-amber-600">
                                        Nenhum cargo cadastrado em Recursos Humanos › Cargos.
                                    </p>
                                ) : (
                                    <div className="grid grid-cols-2 gap-1.5">
                                        {cargos.map(c => {
                                            const sel = (form.cargos_obrigatorios || []).includes(c.id);
                                            return (
                                                <button
                                                    key={c.id}
                                                    type="button"
                                                    onClick={() => alternarCargo(c.id)}
                                                    className={`text-left h-8 px-2.5 rounded-[6px] text-sm font-medium border transition-all truncate ${
                                                        sel
                                                            ? 'bg-blue-600 border-blue-600 text-white'
                                                            : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
                                                    }`}
                                                >
                                                    {c.nome}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                                <p className="text-xs text-gray-400">
                                    Isto documenta a exigência. Para gerar matrículas automaticamente,
                                    crie uma atribuição na aba Atribuições.
                                </p>
                            </div>
                        )}
                    </div>
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
                    {salvando ? 'Salvando...' : (editando ? 'Salvar treinamento' : 'Criar treinamento')}
                </button>
            </SheetFooter>
        </Sheet>
    );
};

export default AcademyCourseSheet;
