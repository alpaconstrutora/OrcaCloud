import React from 'react';
import { Sparkles, Loader2, AlertCircle, Info } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import type { DocTipTap } from '../../types/docGen';
import { ErroIA, acrescentar, paragrafosParaEditor, pedirSugestao, textoDoEditor, type AcaoIA, type SugestaoIA } from '../../services/docGen/ia';

/**
 * Assistente de IA de um campo livre do ofício (F7). Redige, revisa ou — quando o
 * ofício responde a um recebido arquivado no GED — sugere a resposta lendo o PDF.
 * A sugestão aparece aqui; só entra no texto quando a pessoa escolhe
 * "Substituir" ou "Acrescentar". Dado que a IA não tem volta como [[…]].
 * Drawer transitório (guia §4.3).
 */
interface Props {
    aberto: boolean;
    onClose: () => void;
    organizationId: string;
    campo: { nome: string; rotulo: string } | null;
    textoAtual: DocTipTap | null;
    contexto: Record<string, string | null | undefined>;
    /** Ofício recebido (GED) a que este responde — habilita "Responder". */
    recebidoGedId: string | null;
    recebidoDescricao: string | null;
    onAplicar: (doc: DocTipTap) => void;
}

const ACOES: { value: AcaoIA; label: string; ajuda: string }[] = [
    { value: 'redigir', label: 'Redigir', ajuda: 'Escreve o trecho a partir da sua instrução e dos dados do ofício.' },
    { value: 'revisar', label: 'Revisar o texto atual', ajuda: 'Corrige e deixa mais claro e formal, sem mudar fatos nem pedidos.' },
    { value: 'responder', label: 'Responder ao ofício recebido', ajuda: 'Lê o PDF do ofício recebido (GED) e sugere a resposta.' },
];

export default function AssistenteIASheet({ aberto, onClose, organizationId, campo, textoAtual, contexto, recebidoGedId, recebidoDescricao, onAplicar }: Props) {
    const [acao, setAcao] = React.useState<AcaoIA>('redigir');
    const [instrucao, setInstrucao] = React.useState('');
    const [gerando, setGerando] = React.useState(false);
    const [sugestao, setSugestao] = React.useState<SugestaoIA | null>(null);
    const [erro, setErro] = React.useState<{ texto: string; naoConfigurada: boolean } | null>(null);

    const textoPlano = React.useMemo(() => textoDoEditor(textoAtual), [textoAtual]);
    React.useEffect(() => {
        if (!aberto) return;
        setAcao(recebidoGedId && !textoPlano ? 'responder' : textoPlano ? 'revisar' : 'redigir');
        setInstrucao('');
        setSugestao(null);
        setErro(null);
    }, [aberto, recebidoGedId, textoPlano]);

    if (!aberto || !campo) return null;

    const motivo = acao === 'redigir' && !instrucao.trim() ? 'Diga o que o trecho deve conter.'
        : acao === 'revisar' && !textoPlano ? 'O campo ainda não tem texto para revisar.'
        : acao === 'responder' && !recebidoGedId ? 'Este ofício não está vinculado a um ofício recebido no GED (use "Em resposta a…").'
        : undefined;

    const gerar = async () => {
        setGerando(true);
        setErro(null);
        setSugestao(null);
        try {
            setSugestao(await pedirSugestao({
                organizationId, acao, campo: campo.rotulo, instrucao, textoAtual: textoPlano, contexto,
                documentoGedId: acao === 'responder' ? recebidoGedId : null,
            }));
        } catch (e) {
            setErro({ texto: e instanceof Error ? e.message : 'Falha ao falar com a IA.', naoConfigurada: e instanceof ErroIA && e.naoConfigurada });
        } finally {
            setGerando(false);
        }
    };

    return (
        <Sheet open={aberto} onClose={onClose} size="2xl">
            <SheetHeader onClose={onClose}>
                <SheetTitle>Assistente de redação — {campo.rotulo}</SheetTitle>
                <SheetDescription>A sugestão aparece aqui; nada muda no ofício até você escolher substituir ou acrescentar. Confira os fatos — dados que a IA não tem voltam como [[…]].</SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-5 space-y-4">
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="O que fazer">
                    {ACOES.map(a => (
                        <button key={a.value} type="button" role="radio" aria-checked={acao === a.value} onClick={() => setAcao(a.value)}
                            disabled={a.value === 'responder' && !recebidoGedId}
                            title={a.value === 'responder' && !recebidoGedId ? 'Vincule o ofício recebido em "Em resposta a…" para usar' : a.ajuda}
                            className={`h-9 px-3.5 rounded-[6px] text-[13px] font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${acao === a.value ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                            {a.label}
                        </button>
                    ))}
                </div>
                <p className="text-xs text-gray-500">{ACOES.find(a => a.value === acao)?.ajuda}{acao === 'responder' && recebidoDescricao ? ` (${recebidoDescricao})` : ''}</p>
                <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500" htmlFor="ia-instrucao">{acao === 'redigir' ? 'O que o trecho deve dizer *' : 'Orientação (opcional)'}</label>
                    <textarea id="ia-instrucao" rows={4} value={instrucao} onChange={e => setInstrucao(e.target.value)}
                        placeholder={acao === 'redigir' ? 'Ex.: pedir a ligação definitiva de energia do empreendimento, citando o projeto aprovado e o prazo de entrega das unidades.' : 'Ex.: tom mais firme; mencionar o prazo de 15 dias.'}
                        className="w-full border border-gray-200 rounded-[6px] px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                </div>
                {erro && (
                    <div className={`flex items-start gap-2 rounded-[10px] px-3 py-2 text-sm border ${erro.naoConfigurada ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
                        {erro.naoConfigurada ? <Info className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
                        <span>{erro.naoConfigurada ? 'O assistente de IA ainda não está ligado nesta instalação: falta cadastrar a chave da API do Claude (ANTHROPIC_API_KEY) nos segredos do Supabase. Fale com quem administra o sistema.' : erro.texto}</span>
                    </div>
                )}
                {sugestao && (
                    <div className="space-y-2">
                        <p className="text-xs font-semibold text-slate-500">Sugestão</p>
                        <div className="rounded-[10px] border border-blue-100 bg-blue-50/40 px-4 py-3 space-y-2 text-sm text-gray-800 max-h-[45vh] overflow-y-auto">
                            {sugestao.paragrafos.map((t, i) => <p key={i}>{t}</p>)}
                        </div>
                        {sugestao.observacao && <p className="text-xs text-gray-500">{sugestao.observacao}</p>}
                    </div>
                )}
            </SheetPanel>
            <SheetFooter>
                <button type="button" onClick={onClose} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px]">Fechar</button>
                {sugestao && (
                    <>
                        <button type="button" onClick={() => { onAplicar(acrescentar(textoAtual, sugestao.paragrafos)); onClose(); }}
                            className="h-9 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 font-medium text-[13px]">
                            Acrescentar ao texto
                        </button>
                        <button type="button" onClick={() => { onAplicar(paragrafosParaEditor(sugestao.paragrafos)); onClose(); }}
                            className="h-9 px-3.5 bg-white border border-blue-200 text-blue-700 rounded-[6px] hover:bg-blue-50 font-medium text-[13px]">
                            Substituir o texto
                        </button>
                    </>
                )}
                <button type="button" onClick={() => void gerar()} disabled={gerando || !!motivo} title={motivo}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                    {gerando ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Sparkles className="w-[15px] h-[15px]" />}
                    {gerando ? 'Gerando…' : sugestao ? 'Gerar outra' : 'Gerar sugestão'}
                </button>
            </SheetFooter>
        </Sheet>
    );
}
