import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Users } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import Button from '../ui/Button';
import { academyService } from '../../services/academyService';
import type { AcademyAssignment, AcademyAssignmentAlvo, TrainingCourse } from '../../types/academy';

/**
 * Criar/editar atribuição. Sheet: é item de lista e o contexto da tabela
 * atrás importa.
 *
 * A prévia de alcance usa a MESMA função que o cron
 * (`fn_academy_resolve_assignment`) — se a prévia e o resultado divergirem,
 * é bug no banco, não duas contas diferentes.
 */

const ALVOS: Array<{ id: AcademyAssignmentAlvo; label: string; ajuda: string }> = [
    { id: 'COLABORADOR', label: 'Colaborador', ajuda: 'Uma pessoa específica.' },
    { id: 'CARGO',       label: 'Cargo',       ajuda: 'Todos os colaboradores neste cargo, inclusive os que entrarem depois.' },
    { id: 'FUNCAO',      label: 'Função',      ajuda: 'Todos os cargos ligados a esta função.' },
    { id: 'EQUIPE',      label: 'Equipe',      ajuda: 'Membros da equipe.' },
    { id: 'OBRA',        label: 'Obra',        ajuda: 'Colaboradores alocados na obra.' },
    { id: 'TODOS',       label: 'Toda a organização', ajuda: 'Todos os colaboradores ativos.' },
];

const inputCls = 'w-full px-3 py-2 bg-white border border-gray-200 rounded-[6px] text-sm font-normal outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all';

export interface AlvoOpcao { id: string; nome: string }

interface Props {
    open: boolean;
    onClose: () => void;
    orgId: string;
    courses: TrainingCourse[];
    assignment: AcademyAssignment | null;
    opcoes: Record<Exclude<AcademyAssignmentAlvo, 'TODOS'>, AlvoOpcao[]>;
    onSaved: () => void;
    notify: (msg: string, tipo?: 'success' | 'error') => void;
}

const AcademyAssignmentSheet: React.FC<Props> = ({
    open, onClose, orgId, courses, assignment, opcoes, onSaved, notify,
}) => {
    const editando = !!assignment;
    const [salvando, setSalvando] = useState(false);
    const [alcance, setAlcance] = useState<number | null>(null);
    const [calculando, setCalculando] = useState(false);

    const [form, setForm] = useState({
        course_id: assignment?.course_id || courses[0]?.id || '',
        alvo_tipo: (assignment?.alvo_tipo || 'CARGO') as AcademyAssignmentAlvo,
        alvo_id: assignment?.alvo_id || '',
        obrigatorio: assignment?.obrigatorio ?? true,
        prazo_dias: assignment?.prazo_dias ?? 30,
        reciclagem_automatica: assignment?.reciclagem_automatica ?? true,
        observacoes: assignment?.observacoes || '',
    });

    const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
        setForm(p => ({ ...p, [k]: v }));

    const listaAlvo = useMemo(
        () => form.alvo_tipo === 'TODOS' ? [] : (opcoes[form.alvo_tipo] ?? []),
        [form.alvo_tipo, opcoes]
    );

    // Prévia só existe depois de salvo — a resolução é server-side.
    useEffect(() => {
        if (!assignment) { setAlcance(null); return; }
        setCalculando(true);
        academyService.previewAssignmentTargets(assignment.id)
            .then(ids => setAlcance(ids.length))
            .catch(() => setAlcance(null))
            .finally(() => setCalculando(false));
    }, [assignment]);

    const salvar = async () => {
        if (!form.course_id) { notify('Selecione o treinamento.', 'error'); return; }
        if (form.alvo_tipo !== 'TODOS' && !form.alvo_id) {
            notify('Selecione o alvo da atribuição.', 'error'); return;
        }

        setSalvando(true);
        try {
            const payload = {
                org_id: orgId,
                course_id: form.course_id,
                alvo_tipo: form.alvo_tipo,
                alvo_id: form.alvo_tipo === 'TODOS' ? undefined : form.alvo_id,
                obrigatorio: form.obrigatorio,
                prazo_dias: form.prazo_dias,
                reciclagem_automatica: form.reciclagem_automatica,
                observacoes: form.observacoes.trim() || undefined,
                status: 'ATIVA' as const,
            };

            if (editando && assignment) {
                await academyService.updateAssignment(assignment.id, payload);
            } else {
                await academyService.createAssignment(payload);
            }
            onSaved();
            onClose();
        } catch (e: any) {
            notify('Erro ao salvar atribuição: ' + (e?.message || ''), 'error');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Sheet open={open} onClose={onClose} size="xl">
            <SheetHeader onClose={onClose}>
                <SheetTitle>{editando ? 'Editar atribuição' : 'Nova atribuição'}</SheetTitle>
                <SheetDescription>Quem precisa fazer este treinamento e até quando.</SheetDescription>
            </SheetHeader>

            <SheetPanel className="p-6">
                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-gray-500">Treinamento</label>
                        <select
                            value={form.course_id}
                            onChange={e => set('course_id', e.target.value)}
                            className={inputCls}
                        >
                            {courses.map(c => (
                                <option key={c.id} value={c.id}>
                                    {c.nome}{c.nr_referencia ? ` (${c.nr_referencia})` : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-gray-500">Atribuir a</label>
                        <select
                            value={form.alvo_tipo}
                            onChange={e => { set('alvo_tipo', e.target.value as AcademyAssignmentAlvo); set('alvo_id', ''); }}
                            className={inputCls}
                        >
                            {ALVOS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                        </select>
                        <p className="text-xs text-gray-400">{ALVOS.find(a => a.id === form.alvo_tipo)?.ajuda}</p>
                    </div>

                    {form.alvo_tipo !== 'TODOS' && (
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-gray-500">
                                {ALVOS.find(a => a.id === form.alvo_tipo)?.label}
                            </label>
                            <select
                                value={form.alvo_id}
                                onChange={e => set('alvo_id', e.target.value)}
                                className={inputCls}
                            >
                                <option value="">Selecione...</option>
                                {listaAlvo.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                            </select>
                            {listaAlvo.length === 0 && (
                                <p className="text-xs text-amber-600">
                                    Nenhuma opção cadastrada para este tipo de alvo.
                                </p>
                            )}
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-gray-500">Prazo (dias a partir da matrícula)</label>
                        <input
                            type="number" min="1"
                            value={form.prazo_dias}
                            onChange={e => set('prazo_dias', parseInt(e.target.value) || 30)}
                            className={inputCls}
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="flex items-center gap-2.5 text-sm font-normal text-gray-700 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={form.obrigatorio}
                                onChange={e => set('obrigatorio', e.target.checked)}
                                className="w-4 h-4 rounded border-gray-300 text-blue-600"
                            />
                            Treinamento obrigatório
                        </label>
                        <label className="flex items-start gap-2.5 text-sm font-normal text-gray-700 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={form.reciclagem_automatica}
                                onChange={e => set('reciclagem_automatica', e.target.checked)}
                                className="w-4 h-4 mt-0.5 rounded border-gray-300 text-blue-600"
                            />
                            Recriar automaticamente quando a validade estiver vencendo
                        </label>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-gray-500">Observações</label>
                        <textarea
                            value={form.observacoes}
                            onChange={e => set('observacoes', e.target.value)}
                            className={inputCls + ' resize-none h-16'}
                        />
                    </div>

                    {editando && (
                        <div className="p-4 bg-blue-50 border border-blue-100 rounded-[10px] flex items-start gap-3">
                            <Users className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-xs font-semibold text-blue-900">Alcance atual</p>
                                <p className="text-xs text-blue-700 mt-1">
                                    {calculando ? 'Calculando...'
                                        : alcance == null ? 'Não foi possível calcular.'
                                        : `${alcance} colaborador(es) ativo(s) hoje. As matrículas são criadas pelo processamento diário.`}
                                </p>
                            </div>
                        </div>
                    )}
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
                    {salvando ? 'Salvando...' : (editando ? 'Salvar atribuição' : 'Criar atribuição')}
                </button>
            </SheetFooter>
        </Sheet>
    );
};

export default AcademyAssignmentSheet;
