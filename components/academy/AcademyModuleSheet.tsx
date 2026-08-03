import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import Button from '../ui/Button';
import { academyService } from '../../services/academyService';
import type { AcademyModule } from '../../types/academy';

/**
 * Criar/editar módulo.
 *
 * UI_PATTERNS §3 — "criar/editar item de lista" é painel lateral. O pai é a
 * TELA do construtor, não outro Sheet, então não há drawer aninhado (mesma
 * situação de AcademyLessonSheet).
 *
 * Antes o título era um input transparente embutido na linha, que parecia
 * texto comum e salvava a cada tecla digitada. Descrição, ordem e
 * "obrigatório" não tinham como ser editados de jeito nenhum.
 */

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
    versionId: string;
    module: AcademyModule | null;
    /** Usada para sugerir a ordem do próximo módulo. */
    totalModulos: number;
    onSaved: (module: AcademyModule, criado: boolean) => void;
    notify: (msg: string, tipo?: 'success' | 'error') => void;
}

const AcademyModuleSheet: React.FC<Props> = ({
    open, onClose, orgId, versionId, module, totalModulos, onSaved, notify,
}) => {
    const editando = !!module;
    const [salvando, setSalvando] = useState(false);
    const [form, setForm] = useState({
        titulo: module?.titulo || '',
        descricao: module?.descricao || '',
        ordem: module?.ordem ?? totalModulos,
        obrigatorio: module?.obrigatorio ?? true,
    });

    const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
        setForm(p => ({ ...p, [k]: v }));

    const salvar = async () => {
        if (!form.titulo.trim()) { notify('Informe o título do módulo.', 'error'); return; }

        setSalvando(true);
        try {
            const dados = {
                titulo: form.titulo.trim(),
                descricao: form.descricao.trim() || undefined,
                ordem: form.ordem,
                obrigatorio: form.obrigatorio,
            };

            const salvo = editando && module
                ? await academyService.updateModule(module.id, dados)
                : await academyService.createModule({ ...dados, org_id: orgId, version_id: versionId });

            onSaved(salvo, !editando);
            onClose();
        } catch (e: any) {
            notify('Erro ao salvar módulo: ' + (e?.message || 'tente novamente.'), 'error');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Sheet open={open} onClose={onClose} size="lg">
            <SheetHeader onClose={onClose}>
                <SheetTitle>{editando ? 'Editar módulo' : 'Novo módulo'}</SheetTitle>
                <SheetDescription>O módulo agrupa as aulas do treinamento.</SheetDescription>
            </SheetHeader>

            <SheetPanel className="p-6">
                <div className="space-y-4">
                    <Campo label="Título">
                        <input
                            value={form.titulo}
                            onChange={e => set('titulo', e.target.value)}
                            className={inputCls}
                            placeholder="Ex: Segurança em trabalho em altura"
                            autoFocus
                        />
                    </Campo>

                    <Campo label="Descrição" ajuda="Aparece para o aluno no sumário do treinamento.">
                        <textarea
                            value={form.descricao}
                            onChange={e => set('descricao', e.target.value)}
                            className={inputCls + ' resize-none h-20'}
                        />
                    </Campo>

                    <Campo label="Ordem" ajuda="Define a sequência dos módulos no treinamento.">
                        <input
                            type="number" min="0"
                            value={form.ordem}
                            onChange={e => set('ordem', parseInt(e.target.value) || 0)}
                            className={inputCls}
                        />
                    </Campo>

                    <div className="space-y-2">
                        <label className="flex items-start gap-2.5 text-sm font-normal text-gray-700 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={form.obrigatorio}
                                onChange={e => set('obrigatorio', e.target.checked)}
                                className="w-4 h-4 mt-0.5 rounded border-gray-300 text-blue-600"
                            />
                            Módulo obrigatório
                        </label>
                        <p className="text-xs text-gray-400 pl-6">
                            Desmarcado, o módulo vira conteúdo de apoio: as aulas dele continuam
                            disponíveis, mas não entram no cálculo de conclusão do treinamento.
                        </p>
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
                    {salvando ? 'Salvando...' : (editando ? 'Salvar módulo' : 'Criar módulo')}
                </button>
            </SheetFooter>
        </Sheet>
    );
};

export default AcademyModuleSheet;
