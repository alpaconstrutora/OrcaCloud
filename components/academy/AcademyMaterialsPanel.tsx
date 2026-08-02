import React, { useEffect, useRef, useState } from 'react';
import { Link2, Loader2, Paperclip, Plus, Upload, X } from 'lucide-react';
import ActionIconButton from '../ui/ActionIconButton';
import { useConfirm } from '../ui/confirm';
import { academyService } from '../../services/academyService';
import type { AcademyLesson, AcademyMaterial, AcademyModule } from '../../types/academy';

/**
 * Materiais complementares da versão (arquivo ou link), com escopo opcional
 * de módulo/aula. `exige_download` gera evento DOWNLOAD_MATERIAL no log de
 * acesso — é evidência, não enfeite.
 */

const inputCls = 'w-full px-3 py-2 bg-white border border-gray-200 rounded-[6px] text-sm font-normal outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all';

interface Props {
    orgId: string;
    versionId: string;
    modules: AcademyModule[];
    lessons: AcademyLesson[];
    somenteLeitura: boolean;
    notify: (msg: string, tipo?: 'success' | 'error') => void;
}

const AcademyMaterialsPanel: React.FC<Props> = ({
    orgId, versionId, modules, lessons, somenteLeitura, notify,
}) => {
    const confirm = useConfirm();
    const fileRef = useRef<HTMLInputElement>(null);
    const [materiais, setMateriais] = useState<AcademyMaterial[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [salvando, setSalvando] = useState(false);
    const [aberto, setAberto] = useState(false);
    const [arquivo, setArquivo] = useState<File | null>(null);
    const [form, setForm] = useState({
        titulo: '', tipo: 'ARQUIVO' as 'ARQUIVO' | 'LINK', url: '',
        lesson_id: '', exige_download: false,
    });

    useEffect(() => {
        (async () => {
            setCarregando(true);
            try {
                setMateriais(await academyService.listMaterials(versionId));
            } catch (e: any) {
                notify('Erro ao carregar materiais: ' + (e?.message || ''), 'error');
            } finally {
                setCarregando(false);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [versionId]);

    const limpar = () => {
        setForm({ titulo: '', tipo: 'ARQUIVO', url: '', lesson_id: '', exige_download: false });
        setArquivo(null);
        setAberto(false);
    };

    const adicionar = async () => {
        if (!form.titulo.trim()) { notify('Informe o título do material.', 'error'); return; }
        if (form.tipo === 'LINK' && !form.url.trim()) { notify('Informe a URL.', 'error'); return; }
        if (form.tipo === 'ARQUIVO' && !arquivo) { notify('Selecione o arquivo.', 'error'); return; }

        setSalvando(true);
        try {
            const aula = lessons.find(l => l.id === form.lesson_id);
            let criado = await academyService.createMaterial({
                org_id: orgId,
                version_id: versionId,
                module_id: aula?.module_id,
                lesson_id: form.lesson_id || undefined,
                titulo: form.titulo.trim(),
                tipo: form.tipo,
                url: form.tipo === 'LINK' ? form.url.trim() : undefined,
                // O CHECK exige a fonte coerente; o path real vem após o upload.
                storage_path: form.tipo === 'ARQUIVO' ? 'pendente' : undefined,
                mime_type: arquivo?.type,
                tamanho_bytes: arquivo?.size,
                ordem: materiais.length,
                exige_download: form.exige_download,
            } as any);

            if (arquivo) {
                const path = await academyService.uploadMaterialFile({
                    orgId, versionId, materialId: criado.id, file: arquivo,
                });
                criado = await academyService.updateMaterial(criado.id, { storage_path: path });
            }

            setMateriais(prev => [...prev, criado]);   // §22
            limpar();
            notify('Material adicionado.');
        } catch (e: any) {
            notify('Erro ao adicionar material: ' + (e?.message || ''), 'error');
        } finally {
            setSalvando(false);
        }
    };

    const excluir = async (m: AcademyMaterial) => {
        const ok = await confirm({
            title: 'Excluir material?',
            message: `"${m.titulo}" será removido desta versão.`,
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        await academyService.deleteMaterial(m.id);
        setMateriais(prev => prev.filter(x => x.id !== m.id));
        if (m.storage_path && m.storage_path !== 'pendente') {
            await academyService.deleteMediaIfUnused(m.storage_path).catch(() => undefined);
        }
    };

    if (carregando) {
        return (
            <div className="text-center py-12">
                <Loader2 className="w-8 h-8 text-blue-600 mx-auto animate-spin" />
                <p className="mt-2 text-gray-500">Carregando materiais...</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-end">
                <button
                    onClick={() => setAberto(v => !v)}
                    disabled={somenteLeitura}
                    title={somenteLeitura ? 'Versão não editável' : undefined}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 transition-all font-medium text-[13px] active:scale-95 disabled:opacity-50"
                >
                    <Plus className="w-[15px] h-[15px]" /> Novo material
                </button>
            </div>

            {aberto && !somenteLeitura && (
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-gray-500">Título</label>
                            <input
                                value={form.titulo}
                                onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))}
                                className={inputCls}
                                placeholder="Ex: Procedimento PT-018"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-gray-500">Tipo</label>
                            <select
                                value={form.tipo}
                                onChange={e => setForm(p => ({ ...p, tipo: e.target.value as 'ARQUIVO' | 'LINK' }))}
                                className={inputCls}
                            >
                                <option value="ARQUIVO">Arquivo</option>
                                <option value="LINK">Link externo</option>
                            </select>
                        </div>

                        {form.tipo === 'LINK' ? (
                            <div className="space-y-1.5 md:col-span-2">
                                <label className="text-xs font-semibold text-gray-500">URL</label>
                                <input
                                    value={form.url}
                                    onChange={e => setForm(p => ({ ...p, url: e.target.value }))}
                                    className={inputCls}
                                    placeholder="https://..."
                                />
                            </div>
                        ) : (
                            <div className="space-y-1.5 md:col-span-2">
                                <label className="text-xs font-semibold text-gray-500">Arquivo</label>
                                <div
                                    onClick={() => fileRef.current?.click()}
                                    className="border-2 border-dashed border-gray-200 rounded-[10px] p-3 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-all"
                                >
                                    {arquivo ? (
                                        <div className="flex items-center justify-center gap-2 text-blue-700">
                                            <Paperclip className="w-4 h-4" />
                                            <span className="text-xs font-medium">{arquivo.name}</span>
                                            <button
                                                onClick={e => { e.stopPropagation(); setArquivo(null); }}
                                                className="ml-2 text-gray-400 hover:text-rose-500"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-center gap-2">
                                            <Upload className="w-4 h-4 text-gray-300" />
                                            <span className="text-xs text-gray-400 font-medium">Selecionar arquivo</span>
                                        </div>
                                    )}
                                </div>
                                <input
                                    ref={fileRef}
                                    type="file"
                                    className="hidden"
                                    onChange={e => setArquivo(e.target.files?.[0] || null)}
                                />
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-gray-500">Vincular a uma aula (opcional)</label>
                            <select
                                value={form.lesson_id}
                                onChange={e => setForm(p => ({ ...p, lesson_id: e.target.value }))}
                                className={inputCls}
                            >
                                <option value="">Todo o treinamento</option>
                                {modules.map(m => (
                                    <optgroup key={m.id} label={m.titulo}>
                                        {lessons.filter(l => l.module_id === m.id).map(l => (
                                            <option key={l.id} value={l.id}>{l.titulo}</option>
                                        ))}
                                    </optgroup>
                                ))}
                            </select>
                        </div>

                        <div className="flex items-end pb-2">
                            <label className="flex items-center gap-2.5 text-sm font-normal text-gray-700 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={form.exige_download}
                                    onChange={e => setForm(p => ({ ...p, exige_download: e.target.checked }))}
                                    className="w-4 h-4 rounded border-gray-300 text-blue-600"
                                />
                                Exigir abertura deste material
                            </label>
                        </div>
                    </div>

                    <div className="flex items-center justify-end gap-1.5">
                        <button onClick={limpar} className="h-9 px-3 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100">
                            Cancelar
                        </button>
                        <button
                            onClick={adicionar}
                            disabled={salvando}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 transition-all font-medium text-[13px] active:scale-95 disabled:opacity-50"
                        >
                            {salvando ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : null}
                            {salvando ? 'Salvando...' : 'Adicionar material'}
                        </button>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                {materiais.length === 0 ? (
                    <div className="text-center py-12">
                        <Paperclip className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum material complementar</h3>
                        <p className="text-sm text-gray-500">Anexe procedimentos, normas e apresentações de apoio.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {materiais.map(m => {
                            const aula = lessons.find(l => l.id === m.lesson_id);
                            return (
                                <div key={m.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-blue-50/50 transition-colors">
                                    {m.tipo === 'LINK'
                                        ? <Link2 className="w-4 h-4 text-gray-400 shrink-0" />
                                        : <Paperclip className="w-4 h-4 text-gray-400 shrink-0" />}
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-normal text-gray-900 truncate">{m.titulo}</p>
                                        <p className="text-xs text-gray-400 truncate">
                                            {aula ? aula.titulo : 'Todo o treinamento'}
                                            {m.exige_download && ' · abertura obrigatória'}
                                        </p>
                                    </div>
                                    <ActionIconButton kind="delete" onClick={() => excluir(m)} disabled={somenteLeitura} />
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AcademyMaterialsPanel;
