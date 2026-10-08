import React from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { TableKit } from '@tiptap/extension-table';
import {
    Bold, Italic, Underline as UnderlineIcon, Strikethrough, List, ListOrdered, AlignLeft, AlignCenter, AlignRight, AlignJustify,
    Heading1, Heading2, Heading3, Table as TableIcon, Link as LinkIcon, Minus, Undo2, Redo2, Braces, TextCursorInput, PenLine, Paperclip, Search, X,
} from 'lucide-react';
import type { DocTipTap } from '../../types/docGen';
import { GRUPOS_DOC, GRUPOS_LEGADOS } from '../../services/docGen/catalogoCampos';
import { Anexos, Assinaturas, CampoLivre, Variavel } from './editorExtensoes';

/**
 * Editor de texto rico dos documentos gerados (TipTap).
 *
 *  - `modo="modelo"`: além de formatar, insere variáveis `{{grupo.campo}}`,
 *    campos livres, o bloco de assinaturas e a lista de anexos.
 *  - `modo="documento"` (F2): só formatação — é o que o usuário digita num
 *    campo livre do ofício.
 *
 * Grava/lê JSON do TipTap (`DocTipTap`), nunca HTML: é o JSON que o motor de
 * render lê, e não há `innerHTML` em lugar nenhum (check-xss-sinks.sh).
 * Colar: Ctrl+V mantém a formatação que o TipTap entende; Ctrl+Shift+V cola
 * como texto puro (comportamento do navegador).
 */
interface Props {
    value: DocTipTap;
    onChange: (doc: DocTipTap) => void;
    modo?: 'modelo' | 'documento';
    placeholder?: string;
    /** Altura mínima da área de texto. */
    minHeightClass?: string;
}

const BTN = 'p-1.5 rounded-[6px] text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
const BTN_ATIVO = 'bg-blue-50 text-blue-700';

export default function EditorRico({ value, onChange, modo = 'documento', minHeightClass = 'min-h-[320px]' }: Props) {
    const [painelVariaveis, setPainelVariaveis] = React.useState(false);
    const [painelCampoLivre, setPainelCampoLivre] = React.useState(false);
    const [buscaVar, setBuscaVar] = React.useState('');
    const [novoCampo, setNovoCampo] = React.useState({ nome: '', rotulo: '' });
    const ultimoJson = React.useRef<string>(JSON.stringify(value));

    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: { levels: [1, 2, 3] },
                link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
            }),
            TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right', 'justify'] }),
            TableKit.configure({ table: { resizable: false } }),
            Variavel, CampoLivre, Assinaturas, Anexos,
        ],
        content: value,
        editorProps: {
            attributes: { class: `editor-rico focus:outline-none ${minHeightClass} px-4 py-3` },
        },
        onUpdate: ({ editor: ed }) => {
            const json = ed.getJSON() as DocTipTap;
            ultimoJson.current = JSON.stringify(json);
            onChange(json);
        },
    });

    // Troca de documento por fora (abrir outro modelo): repõe o conteúdo sem disparar onUpdate.
    React.useEffect(() => {
        if (!editor) return;
        const entrada = JSON.stringify(value);
        if (entrada !== ultimoJson.current) {
            ultimoJson.current = entrada;
            editor.commands.setContent(value, { emitUpdate: false });
        }
    }, [editor, value]);

    const grupos = React.useMemo(() => {
        const termo = buscaVar.trim().toLowerCase();
        const todos = [...GRUPOS_DOC, ...GRUPOS_LEGADOS];
        if (!termo) return todos.filter(g => !g.rotulo.startsWith('Avançado')).concat(todos.filter(g => g.rotulo.startsWith('Avançado')));
        return todos
            .map(g => ({ ...g, campos: g.campos.filter(c => c.chave.toLowerCase().includes(termo) || c.rotulo.toLowerCase().includes(termo) || g.rotulo.toLowerCase().includes(termo)) }))
            .filter(g => g.campos.length);
    }, [buscaVar]);

    if (!editor) return null;

    const definirLink = () => {
        const atual = editor.getAttributes('link').href as string | undefined;
        // Sem `window.prompt`? O guia proíbe `confirm()` nativo (§14) por ser destrutivo
        // sem identidade visual; um campo de URL inline é o equivalente aqui.
        setLinkDraft({ aberto: true, url: atual ?? 'https://' });
    };
    const [linkDraft, setLinkDraft] = React.useState<{ aberto: boolean; url: string }>({ aberto: false, url: '' });
    const aplicarLink = () => {
        const url = linkDraft.url.trim();
        if (!url || url === 'https://') editor.chain().focus().extendMarkRange('link').unsetLink().run();
        else editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
        setLinkDraft({ aberto: false, url: '' });
    };

    const inserirCampoLivre = () => {
        const nome = novoCampo.nome.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'conteudo';
        const rotulo = novoCampo.rotulo.trim() || nome;
        editor.chain().focus().inserirCampoLivre(nome, rotulo).run();
        setNovoCampo({ nome: '', rotulo: '' });
        setPainelCampoLivre(false);
    };

    const Botao = ({ ativo, title, onClick, children, disabled }: { ativo?: boolean; title: string; onClick: () => void; children: React.ReactNode; disabled?: boolean }) => (
        <button type="button" title={title} onClick={onClick} disabled={disabled} aria-pressed={ativo}
            className={`${BTN} ${ativo ? BTN_ATIVO : ''}`}>
            {children}
        </button>
    );
    const Sep = () => <div className="w-px h-5 bg-gray-200 mx-0.5" />;

    return (
        <div className="rounded-[10px] border border-gray-200 bg-white overflow-hidden">
            {/* Barra de ferramentas — mesma escala dos controles do app (§16): botões 28px, radius 6px. */}
            <div className="flex flex-wrap items-center gap-0.5 p-1.5 border-b border-gray-100 bg-gray-50/60" role="toolbar" aria-label="Formatação">
                <Botao title="Desfazer" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}><Undo2 className="w-4 h-4" /></Botao>
                <Botao title="Refazer" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}><Redo2 className="w-4 h-4" /></Botao>
                <Sep />
                <Botao title="Título 1" ativo={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 className="w-4 h-4" /></Botao>
                <Botao title="Título 2" ativo={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="w-4 h-4" /></Botao>
                <Botao title="Título 3" ativo={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 className="w-4 h-4" /></Botao>
                <Sep />
                <Botao title="Negrito (Ctrl+B)" ativo={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="w-4 h-4" /></Botao>
                <Botao title="Itálico (Ctrl+I)" ativo={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="w-4 h-4" /></Botao>
                <Botao title="Sublinhado (Ctrl+U)" ativo={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon className="w-4 h-4" /></Botao>
                <Botao title="Tachado" ativo={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough className="w-4 h-4" /></Botao>
                <Sep />
                <Botao title="Alinhar à esquerda" ativo={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()}><AlignLeft className="w-4 h-4" /></Botao>
                <Botao title="Centralizar" ativo={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()}><AlignCenter className="w-4 h-4" /></Botao>
                <Botao title="Alinhar à direita" ativo={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()}><AlignRight className="w-4 h-4" /></Botao>
                <Botao title="Justificar" ativo={editor.isActive({ textAlign: 'justify' })} onClick={() => editor.chain().focus().setTextAlign('justify').run()}><AlignJustify className="w-4 h-4" /></Botao>
                <Sep />
                <Botao title="Lista com marcadores" ativo={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="w-4 h-4" /></Botao>
                <Botao title="Lista numerada" ativo={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="w-4 h-4" /></Botao>
                <Botao title="Inserir tabela 3×3" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><TableIcon className="w-4 h-4" /></Botao>
                <Botao title="Link" ativo={editor.isActive('link')} onClick={definirLink}><LinkIcon className="w-4 h-4" /></Botao>
                <Botao title="Linha horizontal" onClick={() => editor.chain().focus().setHorizontalRule().run()}><Minus className="w-4 h-4" /></Botao>

                {modo === 'modelo' && (
                    <>
                        <Sep />
                        <button type="button" onClick={() => { setPainelVariaveis(v => !v); setPainelCampoLivre(false); }}
                            aria-pressed={painelVariaveis}
                            className={`flex items-center gap-1.5 h-7 px-2.5 rounded-[6px] text-sm font-medium transition-colors ${painelVariaveis ? 'bg-blue-600 text-white' : 'text-blue-700 bg-blue-50 hover:bg-blue-100'}`}
                            title="Inserir variável do sistema ({{grupo.campo}})">
                            <Braces className="w-4 h-4" /> Variável
                        </button>
                        <button type="button" onClick={() => { setPainelCampoLivre(v => !v); setPainelVariaveis(false); }}
                            aria-pressed={painelCampoLivre}
                            className={`flex items-center gap-1.5 h-7 px-2.5 rounded-[6px] text-sm font-medium transition-colors ${painelCampoLivre ? 'bg-blue-600 text-white' : 'text-blue-700 bg-blue-50 hover:bg-blue-100'}`}
                            title="Inserir um campo de texto livre que será redigido em cada documento">
                            <TextCursorInput className="w-4 h-4" /> Campo livre
                        </button>
                        <button type="button" onClick={() => editor.chain().focus().inserirAssinaturas().run()}
                            className="flex items-center gap-1.5 h-7 px-2.5 rounded-[6px] text-sm font-medium text-gray-700 hover:bg-gray-100"
                            title="Inserir o bloco de assinaturas (os signatários do documento)">
                            <PenLine className="w-4 h-4" /> Assinaturas
                        </button>
                        <button type="button" onClick={() => editor.chain().focus().inserirAnexos().run()}
                            className="flex items-center gap-1.5 h-7 px-2.5 rounded-[6px] text-sm font-medium text-gray-700 hover:bg-gray-100"
                            title="Inserir a lista numerada de anexos">
                            <Paperclip className="w-4 h-4" /> Anexos
                        </button>
                    </>
                )}
            </div>

            {linkDraft.aberto && (
                <div className="flex items-center gap-2 p-2 border-b border-gray-100 bg-white">
                    <label className="text-xs font-semibold text-slate-500 shrink-0">URL do link</label>
                    <input autoFocus value={linkDraft.url} onChange={e => setLinkDraft({ aberto: true, url: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); aplicarLink(); } if (e.key === 'Escape') setLinkDraft({ aberto: false, url: '' }); }}
                        className="flex-1 h-8 px-3 rounded-[6px] border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                    <button type="button" onClick={aplicarLink} className="h-8 px-3 rounded-[6px] bg-blue-600 text-white text-[13px] font-medium hover:bg-blue-700">Aplicar</button>
                    <button type="button" onClick={() => { editor.chain().focus().extendMarkRange('link').unsetLink().run(); setLinkDraft({ aberto: false, url: '' }); }}
                        className="h-8 px-3 rounded-[6px] text-sm text-gray-600 hover:bg-gray-100">Remover</button>
                </div>
            )}

            {painelCampoLivre && (
                <div className="flex flex-wrap items-end gap-3 p-3 border-b border-gray-100 bg-white">
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-500">Nome interno (chave)</label>
                        <input value={novoCampo.nome} onChange={e => setNovoCampo(v => ({ ...v, nome: e.target.value }))} placeholder="conteudo"
                            className="h-9 w-48 px-3 rounded-[6px] border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-500">Rótulo para quem redige</label>
                        <input value={novoCampo.rotulo} onChange={e => setNovoCampo(v => ({ ...v, rotulo: e.target.value }))} placeholder="Conteúdo do ofício"
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); inserirCampoLivre(); } }}
                            className="h-9 w-64 px-3 rounded-[6px] border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                    </div>
                    <button type="button" onClick={inserirCampoLivre}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95">
                        Inserir campo
                    </button>
                    <p className="text-xs text-gray-400 w-full">Vários campos (introdução, contexto, solicitação, conclusão) deixam o modelo mais estruturado — cada um é redigido separadamente em cada ofício.</p>
                </div>
            )}

            <div className={`flex ${painelVariaveis ? 'divide-x divide-gray-100' : ''}`}>
                <div className="flex-1 min-w-0">
                    <EditorContent editor={editor} />
                </div>

                {painelVariaveis && (
                    <aside className="w-72 shrink-0 max-h-[520px] overflow-y-auto bg-gray-50/60" aria-label="Variáveis disponíveis">
                        <div className="sticky top-0 bg-gray-50/95 backdrop-blur p-2 border-b border-gray-100 flex items-center gap-1.5">
                            <div className="relative flex-1">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                                <input value={buscaVar} onChange={e => setBuscaVar(e.target.value)} placeholder="Buscar variável…"
                                    className="w-full h-8 pl-8 pr-2 rounded-[6px] border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                            </div>
                            <button type="button" title="Fechar" onClick={() => setPainelVariaveis(false)} className={BTN}><X className="w-4 h-4" /></button>
                        </div>
                        <div className="p-2 space-y-3">
                            {grupos.map(g => (
                                <div key={g.id}>
                                    <p className="text-[11px] font-semibold text-slate-500 px-1 mb-1">{g.rotulo}</p>
                                    <div className="flex flex-col">
                                        {g.campos.map(c => (
                                            <button key={c.chave} type="button" title={c.chave}
                                                onClick={() => editor.chain().focus().inserirVariavel(c.chave).run()}
                                                className="text-left px-2 py-1 rounded-[6px] hover:bg-white hover:shadow-sm text-sm text-gray-700">
                                                <span className="block truncate">{c.rotulo}</span>
                                                <span className="block truncate text-[11px] text-gray-400">{`{{${c.chave}}}`}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                            {!grupos.length && <p className="text-sm text-gray-500 px-1 py-4 text-center">Nenhuma variável com esse nome.</p>}
                        </div>
                    </aside>
                )}
            </div>
        </div>
    );
}
