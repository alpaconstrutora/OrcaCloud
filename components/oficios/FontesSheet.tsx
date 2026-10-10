import React from 'react';
import { Loader2, AlertCircle, Type, Upload } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { InlineDisclosureMenu } from '../ui/inline-disclosure-menu';
import { useToast } from '../../hooks/useToast';
import type { DocGenFonte, VariacaoFonte } from '../../types/docGen';
import { VARIACOES, docGenFonteService } from '../../services/docGenFonteService';

/**
 * Fontes da organização (F9 — "fonte livre nos modelos"): enviar .ttf/.otf
 * (Regular obrigatório; negrito e itálicos opcionais) e excluir. O PDF embute a
 * fonte; no Word ela aparece se estiver instalada no computador.
 * Drawer transitório (guia §4.3) — aberto pelo layout do modelo.
 */
interface Props {
    aberto: boolean;
    onClose: () => void;
    organizationId: string;
    fontes: DocGenFonte[];
    /** Fonte usada pelo modelo aberto — não se exclui daqui. */
    emUso: string | null;
    onCriada: (f: DocGenFonte) => void;
    onExcluida: (id: string) => void;
}

export default function FontesSheet({ aberto, onClose, organizationId, fontes, emUso, onCriada, onExcluida }: Props) {
    const { showToast } = useToast();
    const [nome, setNome] = React.useState('');
    const [arquivos, setArquivos] = React.useState<Partial<Record<VariacaoFonte, File>>>({});
    const [enviando, setEnviando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);
    // Muda a cada envio feito: remonta os seletores de arquivo (o input nativo não se limpa pelo estado).
    const [rodada, setRodada] = React.useState(0);
    React.useEffect(() => { if (aberto) { setNome(''); setArquivos({}); setErro(null); setRodada(r => r + 1); } }, [aberto]);

    if (!aberto) return null;

    const motivo = !nome.trim() ? 'Dê um nome à fonte (como aparece na lista do modelo).'
        : !arquivos.normal ? 'Escolha ao menos o arquivo Regular.' : undefined;

    const enviar = async () => {
        if (motivo) return;
        setEnviando(true);
        setErro(null);
        try {
            const f = await docGenFonteService.criar({ organizationId, nome, arquivos });
            showToast(`Fonte "${f.nome}" enviada.`, 'success');
            onCriada(f);
            setNome('');
            setArquivos({});
            setRodada(r => r + 1);
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Falha ao enviar a fonte.');
        } finally {
            setEnviando(false);
        }
    };

    const excluir = async (f: DocGenFonte) => {
        try {
            await docGenFonteService.remover(f);
            onExcluida(f.id);
            showToast(`Fonte "${f.nome}" excluída. Documentos já emitidos não mudam.`, 'success');
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Falha ao excluir.', 'error');
        }
    };

    return (
        <Sheet open={aberto} onClose={onClose} size="2xl" dirty={!!Object.keys(arquivos).length}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>Fontes da organização</SheetTitle>
                <SheetDescription>Arquivos .ttf ou .otf (até 5 MB cada). O PDF embute a fonte; no Word ela aparece se estiver instalada no computador.</SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-5 space-y-6">
                {fontes.length > 0 && (
                    <ul className="divide-y divide-gray-100 rounded-[10px] border border-gray-100">
                        {fontes.map(f => (
                            <li key={f.id} className="flex items-center gap-3 px-3 py-2.5">
                                <Type className="w-4 h-4 text-gray-400 shrink-0" />
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm text-gray-800">{f.nome}</p>
                                    <p className="text-xs text-gray-500">{VARIACOES.filter(v => f.arquivos[v.id]).map(v => v.rotulo).join(' · ')}</p>
                                </div>
                                <InlineDisclosureMenu
                                    showDelete
                                    onDelete={() => void excluir(f)}
                                    deleteDisabled={emUso === f.id}
                                    deleteDisabledTitle={emUso === f.id ? 'Em uso neste modelo — troque a fonte do modelo antes' : undefined}
                                />
                            </li>
                        ))}
                    </ul>
                )}

                <div className="space-y-4">
                    <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                        <h3 className="text-sm font-semibold text-gray-900">Enviar fonte</h3>
                    </div>
                    {erro && (
                        <div className="flex items-start gap-2 rounded-[10px] bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {erro}
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                        <div className="space-y-1.5 col-span-2">
                            <label className="text-xs font-semibold text-slate-500" htmlFor="fonte-nome">Nome da fonte *</label>
                            <input id="fonte-nome" value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: Fonte institucional"
                                className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                        </div>
                        {VARIACOES.map(v => (
                            <div key={v.id} className="space-y-1.5">
                                <label className="text-xs font-semibold text-slate-500" htmlFor={`fonte-${v.id}`}>{v.rotulo}{v.id === 'normal' ? ' *' : ''}</label>
                                <input key={`${v.id}-${rodada}`} id={`fonte-${v.id}`} type="file" accept=".ttf,.otf,font/ttf,font/otf"
                                    onChange={e => { const f = e.target.files?.[0]; setArquivos(a => { const n = { ...a }; if (f) n[v.id] = f; else delete n[v.id]; return n; }); }}
                                    className="block w-full text-sm text-gray-700 file:mr-3 file:h-9 file:px-3.5 file:rounded-[6px] file:border file:border-gray-200 file:bg-white file:text-[13px] file:font-medium file:text-gray-700 hover:file:bg-gray-50" />
                            </div>
                        ))}
                    </div>
                    <p className="text-xs text-gray-500">A variação que faltar usa a Regular. Envie só fontes que a organização tem licença para embutir em documentos.</p>
                </div>
            </SheetPanel>
            <SheetFooter>
                <button type="button" onClick={onClose} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px]">Fechar</button>
                <button type="button" onClick={() => void enviar()} disabled={enviando || !!motivo} title={motivo}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                    {enviando ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Upload className="w-[15px] h-[15px]" />}
                    {enviando ? 'Enviando…' : 'Enviar fonte'}
                </button>
            </SheetFooter>
        </Sheet>
    );
}
