import React, { useRef, useState } from 'react';
import { ChevronDown, FileText, Loader2, Upload, X } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import Button from '../ui/Button';
import { academyService } from '../../services/academyService';
import type { AcademyLesson, AcademyLessonTipo, AcademyModule } from '../../types/academy';

/**
 * Criar/editar aula. É um Sheet aninhado numa TELA (o construtor), não num
 * outro Sheet — logo não viola a proibição de drawer aninhado (UI_PATTERNS §4).
 *
 * O upload grava o PATH; a URL assinada só é gerada na leitura.
 */

const TIPOS: Array<{ id: AcademyLessonTipo; label: string; ajuda: string }> = [
    { id: 'VIDEO_UPLOAD', label: 'Vídeo (upload)',      ajuda: 'Arquivo hospedado no ÒPURA. Melhor controle de progresso.' },
    { id: 'VIDEO_LINK',   label: 'Vídeo (incorporado)', ajuda: 'YouTube/Vimeo. O progresso é menos preciso.' },
    { id: 'PDF',          label: 'PDF',                 ajuda: 'Conta tempo de leitura na tela.' },
    { id: 'AUDIO',        label: 'Áudio',               ajuda: 'Podcast, gravação de DDS.' },
    { id: 'IMAGEM',       label: 'Imagem',              ajuda: 'Cartaz, infográfico, procedimento ilustrado.' },
    { id: 'TEXTO',        label: 'Texto',               ajuda: 'Conteúdo escrito direto no sistema.' },
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
    courseId: string;
    versionId: string;
    modules: AcademyModule[];
    lesson: AcademyLesson | null;
    /** Módulo pré-selecionado ao criar. */
    defaultModuleId?: string;
    onSaved: (lesson: AcademyLesson) => void;
    notify: (msg: string, tipo?: 'success' | 'error') => void;
}

const AcademyLessonSheet: React.FC<Props> = ({
    open, onClose, orgId, courseId, versionId, modules, lesson, defaultModuleId, onSaved, notify,
}) => {
    const editando = !!lesson;
    const fileRef = useRef<HTMLInputElement>(null);
    const [salvando, setSalvando] = useState(false);
    const [arquivo, setArquivo] = useState<File | null>(null);

    const [form, setForm] = useState({
        module_id: lesson?.module_id || defaultModuleId || modules[0]?.id || '',
        titulo: lesson?.titulo || '',
        descricao: lesson?.descricao || '',
        tipo: (lesson?.tipo || 'VIDEO_UPLOAD') as AcademyLessonTipo,
        video_url: lesson?.video_url || '',
        conteudo_html: lesson?.conteudo_html || '',
        duracao_segundos: lesson?.duracao_segundos ?? undefined as number | undefined,
        tempo_minimo_segundos: lesson?.tempo_minimo_segundos ?? undefined as number | undefined,
        percentual_minimo_override: lesson?.percentual_minimo_override ?? undefined as number | undefined,
        obrigatoria: lesson?.obrigatoria ?? true,
        permite_avanco_rapido: lesson?.permite_avanco_rapido ?? false,
        ordem: lesson?.ordem ?? 0,
    });

    const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
        setForm(p => ({ ...p, [k]: v }));

    const precisaArquivo = ['VIDEO_UPLOAD', 'PDF', 'AUDIO', 'IMAGEM'].includes(form.tipo);
    const temMidia = !!lesson?.storage_path || !!arquivo;

    const salvar = async () => {
        if (!form.titulo.trim()) { notify('Informe o título da aula.', 'error'); return; }
        if (!form.module_id)     { notify('Selecione o módulo.', 'error'); return; }
        if (precisaArquivo && !temMidia) { notify('Anexe o arquivo da aula.', 'error'); return; }
        if (form.tipo === 'VIDEO_LINK' && !form.video_url.trim()) {
            notify('Informe a URL do vídeo.', 'error'); return;
        }
        if (form.tipo === 'TEXTO' && !form.conteudo_html.trim()) {
            notify('Escreva o conteúdo da aula.', 'error'); return;
        }

        setSalvando(true);
        try {
            const base = {
                org_id: orgId,
                module_id: form.module_id,
                version_id: versionId,
                titulo: form.titulo.trim(),
                descricao: form.descricao.trim() || undefined,
                ordem: form.ordem,
                tipo: form.tipo,
                video_url: form.tipo === 'VIDEO_LINK' ? form.video_url.trim() : undefined,
                conteudo_html: form.tipo === 'TEXTO' ? form.conteudo_html : undefined,
                duracao_segundos: form.duracao_segundos,
                tempo_minimo_segundos: form.tempo_minimo_segundos,
                percentual_minimo_override: form.percentual_minimo_override,
                obrigatoria: form.obrigatoria,
                permite_avanco_rapido: form.permite_avanco_rapido,
            };

            let salva: AcademyLesson;
            if (editando && lesson) {
                salva = await academyService.updateLesson(lesson.id, base);
            } else {
                // O CHECK do banco exige a fonte coerente com o tipo; para
                // arquivo, o path só existe depois do upload — então cria com
                // um placeholder e atualiza logo em seguida.
                salva = await academyService.createLesson({
                    ...base,
                    storage_path: precisaArquivo ? 'pendente' : undefined,
                } as any);
            }

            if (arquivo) {
                const path = await academyService.uploadLessonMedia({
                    orgId, courseId, versionId, lessonId: salva.id, file: arquivo,
                });
                salva = await academyService.updateLesson(salva.id, { storage_path: path });
            }

            onSaved(salva);
            onClose();
        } catch (e: any) {
            notify('Erro ao salvar aula: ' + (e?.message || 'tente novamente.'), 'error');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Sheet open={open} onClose={onClose} size="lg">
            <SheetHeader onClose={onClose}>
                <SheetTitle>{editando ? 'Editar aula' : 'Nova aula'}</SheetTitle>
                <SheetDescription>Conteúdo, duração e critério de conclusão desta aula.</SheetDescription>
            </SheetHeader>

            <SheetPanel className="p-6">
                <div className="space-y-4">
                    <Campo label="Módulo">
                        <div className="relative">
                            <select
                                value={form.module_id}
                                onChange={e => set('module_id', e.target.value)}
                                className={inputCls + ' appearance-none pr-8'}
                            >
                                {modules.map(m => <option key={m.id} value={m.id}>{m.titulo}</option>)}
                            </select>
                            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                        </div>
                    </Campo>

                    <Campo label="Título da aula">
                        <input
                            value={form.titulo}
                            onChange={e => set('titulo', e.target.value)}
                            className={inputCls}
                            placeholder="Ex: Uso correto do cinto paraquedista"
                        />
                    </Campo>

                    <Campo label="Descrição">
                        <textarea
                            value={form.descricao}
                            onChange={e => set('descricao', e.target.value)}
                            className={inputCls + ' resize-none h-16'}
                        />
                    </Campo>

                    <Campo label="Tipo de conteúdo" ajuda={TIPOS.find(t => t.id === form.tipo)?.ajuda}>
                        <div className="relative">
                            <select
                                value={form.tipo}
                                onChange={e => { set('tipo', e.target.value as AcademyLessonTipo); setArquivo(null); }}
                                className={inputCls + ' appearance-none pr-8'}
                            >
                                {TIPOS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                            </select>
                            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                        </div>
                    </Campo>

                    {precisaArquivo && (
                        <Campo label="Arquivo">
                            <div
                                onClick={() => fileRef.current?.click()}
                                className="border-2 border-dashed border-gray-200 rounded-[10px] p-4 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-all"
                            >
                                {arquivo ? (
                                    <div className="flex items-center justify-center gap-2 text-blue-700">
                                        <FileText className="w-4 h-4" />
                                        <span className="text-xs font-medium">{arquivo.name}</span>
                                        <button
                                            onClick={e => { e.stopPropagation(); setArquivo(null); }}
                                            className="ml-2 text-gray-400 hover:text-rose-500"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ) : lesson?.storage_path && lesson.storage_path !== 'pendente' ? (
                                    <span className="text-xs text-gray-500 font-medium">
                                        Arquivo já enviado — clique para substituir
                                    </span>
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
                        </Campo>
                    )}

                    {form.tipo === 'VIDEO_LINK' && (
                        <Campo label="URL do vídeo" ajuda="Use o link de incorporação (embed) do YouTube ou Vimeo.">
                            <input
                                value={form.video_url}
                                onChange={e => set('video_url', e.target.value)}
                                className={inputCls}
                                placeholder="https://www.youtube.com/embed/..."
                            />
                        </Campo>
                    )}

                    {form.tipo === 'TEXTO' && (
                        <Campo label="Conteúdo" ajuda="Aceita HTML simples (parágrafos, listas, negrito).">
                            <textarea
                                value={form.conteudo_html}
                                onChange={e => set('conteudo_html', e.target.value)}
                                className={inputCls + ' resize-none h-40 font-normal'}
                            />
                        </Campo>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        {['VIDEO_UPLOAD', 'VIDEO_LINK', 'AUDIO'].includes(form.tipo) && (
                            <Campo label="Duração (segundos)" ajuda="Base do percentual assistido.">
                                <input
                                    type="number" min="0"
                                    value={form.duracao_segundos ?? ''}
                                    onChange={e => set('duracao_segundos', e.target.value ? parseInt(e.target.value) : undefined)}
                                    className={inputCls}
                                />
                            </Campo>
                        )}
                        <Campo label="Tempo mínimo (segundos)" ajuda="Para PDF/texto/imagem, que não têm duração.">
                            <input
                                type="number" min="0"
                                value={form.tempo_minimo_segundos ?? ''}
                                onChange={e => set('tempo_minimo_segundos', e.target.value ? parseInt(e.target.value) : undefined)}
                                className={inputCls}
                            />
                        </Campo>
                        <Campo label="% mínimo desta aula" ajuda="Vazio = usa o percentual da versão.">
                            <input
                                type="number" min="0" max="100"
                                value={form.percentual_minimo_override ?? ''}
                                onChange={e => set('percentual_minimo_override', e.target.value ? parseInt(e.target.value) : undefined)}
                                className={inputCls}
                            />
                        </Campo>
                        <Campo label="Ordem">
                            <input
                                type="number" min="0"
                                value={form.ordem}
                                onChange={e => set('ordem', parseInt(e.target.value) || 0)}
                                className={inputCls}
                            />
                        </Campo>
                    </div>

                    <div className="space-y-2">
                        <label className="flex items-center gap-2.5 text-sm font-normal text-gray-700 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={form.obrigatoria}
                                onChange={e => set('obrigatoria', e.target.checked)}
                                className="w-4 h-4 rounded border-gray-300 text-blue-600"
                            />
                            Aula obrigatória (entra no cálculo de conclusão)
                        </label>
                        <label className="flex items-center gap-2.5 text-sm font-normal text-gray-700 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={form.permite_avanco_rapido}
                                onChange={e => set('permite_avanco_rapido', e.target.checked)}
                                className="w-4 h-4 rounded border-gray-300 text-blue-600"
                            />
                            Permitir avanço rápido
                        </label>
                        <p className="text-xs text-gray-400 pl-6">
                            Desmarcado (recomendado): arrastar a barra para frente não credita progresso.
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
                    {salvando ? 'Salvando...' : (editando ? 'Salvar aula' : 'Criar aula')}
                </button>
            </SheetFooter>
        </Sheet>
    );
};

export default AcademyLessonSheet;
