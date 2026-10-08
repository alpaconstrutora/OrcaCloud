import React from 'react';
import { Paperclip, FolderOpen, Upload, Plus, Loader2, Search, ArrowUp, ArrowDown, X, FileText } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel } from '../ui/sheet';
import ActionIconButton from '../ui/ActionIconButton';
import type { AnexoDoc } from '../../types/docGen';
import type { OpuraDocumentCategoria } from '../../types/documents';
import { buscarDocumentosGed, type DocumentoGedResumo } from '../../services/docGen/resolverContexto';
import { documentService } from '../../services/documentService';
import { CATEGORIA_GED_LABEL } from './rotulos';

/**
 * Anexos do documento (item 11 do pedido). Três origens:
 *   - documento que já está no GED (busca por nome);
 *   - arquivo novo — sobe para o GED (categoria do modelo) e entra na lista;
 *   - anexo só descrito ("ART nº 1234567") — sem arquivo no sistema.
 * O PDF do ofício traz a seção "Anexos" numerada na ordem desta lista.
 */
interface Props {
    anexos: AnexoDoc[];
    onChange: (anexos: AnexoDoc[]) => void;
    organizationId: string;
    categoriaGed: OpuraDocumentCategoria;
    projectId: string | null;
    emailUsuario: string | null;
    somenteLeitura?: boolean;
}

export default function AnexosEditor({ anexos, onChange, organizationId, categoriaGed, projectId, emailUsuario, somenteLeitura }: Props) {
    const [gedAberto, setGedAberto] = React.useState(false);
    const [busca, setBusca] = React.useState('');
    const [resultados, setResultados] = React.useState<DocumentoGedResumo[]>([]);
    const [buscando, setBuscando] = React.useState(false);
    const [descrito, setDescrito] = React.useState('');
    const [enviando, setEnviando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);
    const arquivoRef = React.useRef<HTMLInputElement>(null);

    React.useEffect(() => {
        if (!gedAberto) return;
        let vivo = true;
        setBuscando(true);
        const t = setTimeout(() => {
            buscarDocumentosGed(organizationId, busca)
                .then(r => { if (vivo) setResultados(r); })
                .catch(e => { if (vivo) setErro(e instanceof Error ? e.message : 'Falha na busca do GED.'); })
                .finally(() => { if (vivo) setBuscando(false); });
        }, 300);
        return () => { vivo = false; clearTimeout(t); };
    }, [gedAberto, busca, organizationId]);

    const mover = (i: number, d: -1 | 1) => {
        const j = i + d;
        if (j < 0 || j >= anexos.length) return;
        const n = [...anexos];
        [n[i], n[j]] = [n[j], n[i]];
        onChange(n);
    };

    const adicionarDescrito = () => {
        const nome = descrito.trim();
        if (!nome) return;
        onChange([...anexos, { tipo: 'DESCRITO', nome }]);
        setDescrito('');
    };

    const enviarArquivo = async (file: File | null) => {
        if (!file) return;
        setEnviando(true);
        setErro(null);
        try {
            const doc = await documentService.uploadNewDocument({
                organization_id: organizationId,
                project_id: projectId ?? undefined,
                nome: file.name,
                descricao: 'Anexo de ofício',
                categoria: categoriaGed,
                tipo_documento: 'Anexo de ofício',
                status: 'ativo',
                alerta_dias_antecedencia: 30,
                tags: ['anexo-oficio'],
            }, file, emailUsuario ?? undefined);
            onChange([...anexos, { tipo: 'GED', nome: doc.nome.replace(/\.[^.]+$/, ''), documentId: doc.id }]);
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Falha ao enviar o arquivo ao GED.');
        } finally {
            setEnviando(false);
            if (arquivoRef.current) arquivoRef.current.value = '';
        }
    };

    return (
        <div className="space-y-3">
            {anexos.length === 0 ? (
                <p className="text-sm text-gray-500">Nenhum anexo. A seção "Anexos" só aparece no PDF quando houver algum.</p>
            ) : (
                <ol className="divide-y divide-gray-100 rounded-[10px] border border-gray-100">
                    {anexos.map((a, i) => (
                        <li key={`${a.tipo}-${a.documentId ?? a.nome}-${i}`} className="flex items-center gap-2 px-3 py-2">
                            <span className="text-sm text-gray-400 w-5 text-right">{i + 1}.</span>
                            {a.tipo === 'GED' ? <FolderOpen className="w-4 h-4 text-blue-600 shrink-0" /> : <FileText className="w-4 h-4 text-gray-400 shrink-0" />}
                            {somenteLeitura ? (
                                <span className="flex-1 text-sm text-gray-700 truncate" title={a.nome}>{a.nome}</span>
                            ) : (
                                <input value={a.nome} onChange={e => onChange(anexos.map((x, k) => (k === i ? { ...x, nome: e.target.value } : x)))}
                                    title="Nome que aparece na lista de anexos do documento"
                                    className="flex-1 min-w-0 h-8 px-2 bg-white border border-transparent hover:border-gray-200 rounded-[6px] text-sm text-gray-700 focus:outline-none focus:border-blue-500" />
                            )}
                            <span className="text-xs text-gray-400 shrink-0">{a.tipo === 'GED' ? 'no GED' : 'descrito'}</span>
                            {!somenteLeitura && (
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <ActionIconButton kind="move" size="sm" title="Subir" icon={<ArrowUp className="w-3.5 h-3.5" />} onClick={() => mover(i, -1)} disabled={i === 0} />
                                    <ActionIconButton kind="move" size="sm" title="Descer" icon={<ArrowDown className="w-3.5 h-3.5" />} onClick={() => mover(i, 1)} disabled={i === anexos.length - 1} />
                                    <ActionIconButton kind="delete" size="sm" title="Tirar da lista (o arquivo continua no GED)" icon={<X className="w-3.5 h-3.5" />} onClick={() => onChange(anexos.filter((_, k) => k !== i))} />
                                </div>
                            )}
                        </li>
                    ))}
                </ol>
            )}

            {erro && <p className="text-sm text-red-600">{erro}</p>}

            {!somenteLeitura && (
                <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => { setBusca(''); setGedAberto(true); }}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 font-medium text-[13px]">
                        <FolderOpen className="w-[15px] h-[15px]" /> Do GED
                    </button>
                    <input ref={arquivoRef} type="file" className="hidden" onChange={e => enviarArquivo(e.target.files?.[0] ?? null)} />
                    <button type="button" onClick={() => arquivoRef.current?.click()} disabled={enviando}
                        title={`Sobe o arquivo para o GED (${CATEGORIA_GED_LABEL[categoriaGed]}) e o lista como anexo`}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 font-medium text-[13px] disabled:opacity-50">
                        {enviando ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Upload className="w-[15px] h-[15px]" />} Enviar arquivo
                    </button>
                    <div className="flex items-center gap-2 flex-1 min-w-[260px]">
                        <input value={descrito} onChange={e => setDescrito(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionarDescrito(); } }}
                            placeholder='Ou descreva: "ART nº 1234567"'
                            className="flex-1 h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                        <button type="button" onClick={adicionarDescrito} disabled={!descrito.trim()} title={!descrito.trim() ? 'Digite o nome do anexo' : undefined}
                            className="flex items-center gap-1.5 h-9 px-3 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 font-medium text-[13px] disabled:opacity-50 disabled:cursor-not-allowed">
                            <Plus className="w-[15px] h-[15px]" /> Adicionar
                        </button>
                    </div>
                </div>
            )}

            <Sheet open={gedAberto} onClose={() => setGedAberto(false)} size="xl">
                <SheetHeader onClose={() => setGedAberto(false)}>
                    <SheetTitle>Anexar do GED</SheetTitle>
                    <SheetDescription>Documentos da organização, os mais recentes primeiro. Busque pelo nome.</SheetDescription>
                </SheetHeader>
                <SheetPanel className="px-6 py-5 space-y-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input autoFocus value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar pelo nome do documento..."
                            className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" />
                    </div>
                    {buscando ? (
                        <div className="text-center py-12 text-gray-500"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /><p className="text-sm">Buscando…</p></div>
                    ) : resultados.length === 0 ? (
                        <div className="text-center py-12">
                            <Paperclip className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <p className="text-sm text-gray-500">Nenhum documento com esse nome no GED.</p>
                        </div>
                    ) : (
                        <ul className="divide-y divide-gray-100 rounded-[10px] border border-gray-100">
                            {resultados.map(d => {
                                const ja = anexos.some(a => a.documentId === d.id);
                                return (
                                    <li key={d.id}>
                                        <button type="button" disabled={ja} title={ja ? 'Já está na lista de anexos' : undefined}
                                            onClick={() => { onChange([...anexos, { tipo: 'GED', nome: d.nome.replace(/\.[^.]+$/, ''), documentId: d.id }]); setGedAberto(false); }}
                                            className="w-full text-left px-4 py-2.5 hover:bg-blue-50/50 disabled:opacity-50 disabled:cursor-not-allowed">
                                            <span className="block truncate text-sm text-gray-700" title={d.nome}>{d.nome}</span>
                                            <span className="block text-xs text-gray-400">
                                                {CATEGORIA_GED_LABEL[d.categoria as OpuraDocumentCategoria] ?? d.categoria}{d.tipo_documento ? ` · ${d.tipo_documento}` : ''} · {new Date(d.created_at).toLocaleDateString('pt-BR')}
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </SheetPanel>
            </Sheet>
        </div>
    );
}
