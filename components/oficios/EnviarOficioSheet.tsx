import React from 'react';
import { Mail, MessageCircle, Loader2, AlertCircle, ExternalLink } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { useToast } from '../../hooks/useToast';
import type { DocGenDocumento } from '../../types/docGen';
import {
    enviarPorEmail, linkWhatsApp, listaDeEmails, registrarEnvio, telefoneWhatsApp, textoPadraoDeEnvio, urlDeValidacao,
} from '../../services/docGen/envio';

/**
 * Enviar o ofício emitido (F5):
 *   - e-mail: o PDF OFICIAL do GED vai em anexo (Edge Function `doc-gen-enviar`);
 *     o envio entra no histórico sozinho;
 *   - WhatsApp: abre o `wa.me` com o texto e o link de validação; como o sistema
 *     não vê a conversa, o envio só é registrado quando o usuário confirma.
 * Drawer transitório (formulário curto, guia §4.3).
 */
interface Props {
    canal: 'EMAIL' | 'WHATSAPP' | null;
    documento: DocGenDocumento;
    emitente: string;
    onClose: () => void;
    onEnviado: () => void;
}

const INPUT = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all';
const LABEL = 'text-xs font-semibold text-slate-500';

export default function EnviarOficioSheet({ canal, documento, emitente, onClose, onEnviado }: Props) {
    const { showToast } = useToast();
    const [para, setPara] = React.useState('');
    const [cc, setCc] = React.useState('');
    const [mensagem, setMensagem] = React.useState('');
    const [telefone, setTelefone] = React.useState('');
    const [incluirAnexos, setIncluirAnexos] = React.useState(false);
    const [enviando, setEnviando] = React.useState(false);
    const [abriuWhatsApp, setAbriuWhatsApp] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!canal) return;
        const d = documento.destinatario_snapshot;
        setPara(d?.contato_email ?? '');
        setCc('');
        setTelefone(d?.contato_telefone ?? '');
        setIncluirAnexos(false);
        setAbriuWhatsApp(false);
        setErro(null);
        const base = textoPadraoDeEnvio(documento, emitente);
        setMensagem(canal === 'WHATSAPP' ? `${base}\n\nConfira o documento: ${urlDeValidacao(documento.id)}` : base);
    }, [canal, documento, emitente]);

    if (!canal) return null;

    const temAnexosDoGed = documento.anexos.some(a => a.tipo === 'GED' && a.documentId);
    const emails = listaDeEmails(para);
    const motivoEmail = emails.length === 0 ? 'Informe ao menos um e-mail em "Para".'
        : emails.length + listaDeEmails(cc).length > 10 ? 'No máximo 10 destinatários por envio.' : undefined;
    const motivoWhats = !telefoneWhatsApp(telefone) ? 'Informe o telefone (com DDD).' : undefined;

    const enviarEmail = async () => {
        setEnviando(true);
        setErro(null);
        try {
            const r = await enviarPorEmail({ documentoId: documento.id, para: emails, cc: listaDeEmails(cc), mensagem, incluirAnexos });
            showToast(r.registrado ? 'E-mail enviado com o PDF do ofício.' : `E-mail enviado, mas o registro falhou: ${r.erro_registro ?? ''} — registre o envio à mão.`, r.registrado ? 'success' : 'error');
            onEnviado();
            onClose();
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Falha ao enviar o e-mail.');
        } finally {
            setEnviando(false);
        }
    };

    const abrirWhatsApp = () => {
        window.open(linkWhatsApp(telefone, mensagem), '_blank', 'noopener');
        setAbriuWhatsApp(true);
    };

    const confirmarWhatsApp = async () => {
        setEnviando(true);
        setErro(null);
        try {
            await registrarEnvio(documento.id, { canal: 'WHATSAPP', para: telefoneWhatsApp(telefone) });
            showToast('Envio por WhatsApp registrado.', 'success');
            onEnviado();
            onClose();
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Falha ao registrar o envio.');
        } finally {
            setEnviando(false);
        }
    };

    return (
        <Sheet open={!!canal} onClose={onClose} size="2xl">
            <SheetHeader onClose={onClose}>
                <SheetTitle>{canal === 'EMAIL' ? `Enviar o ofício ${documento.numero ?? ''} por e-mail` : `Enviar o ofício ${documento.numero ?? ''} por WhatsApp`}</SheetTitle>
                <SheetDescription>
                    {canal === 'EMAIL'
                        ? 'O PDF oficial (o do GED, com o hash) vai anexado. A resposta do destinatário chega no seu e-mail.'
                        : 'Abre o WhatsApp com a mensagem e o link de validação do documento. O sistema não vê a conversa: confirme depois de mandar.'}
                </SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-5 space-y-4">
                {erro && (
                    <div className="flex items-start gap-2 rounded-[10px] bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {erro}
                    </div>
                )}
                {canal === 'EMAIL' ? (
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                        <div className="space-y-1.5 col-span-2">
                            <label className={LABEL} htmlFor="env-para">Para *</label>
                            <input id="env-para" value={para} onChange={e => setPara(e.target.value)} placeholder="email@orgao.gov.br; outro@orgao.gov.br" className={INPUT} />
                        </div>
                        <div className="space-y-1.5 col-span-2">
                            <label className={LABEL} htmlFor="env-cc">Cópia</label>
                            <input id="env-cc" value={cc} onChange={e => setCc(e.target.value)} className={INPUT} />
                        </div>
                        <div className="space-y-1.5 col-span-2">
                            <label className={LABEL} htmlFor="env-mensagem">Mensagem</label>
                            <textarea id="env-mensagem" rows={7} value={mensagem} onChange={e => setMensagem(e.target.value)}
                                className="w-full border border-gray-200 rounded-[6px] px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                        </div>
                        {temAnexosDoGed && (
                            <label className="col-span-2 flex items-start gap-2 text-sm text-gray-700">
                                <input type="checkbox" checked={incluirAnexos} onChange={e => setIncluirAnexos(e.target.checked)} className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600" />
                                <span>Anexar também os arquivos dos anexos (do GED){documento.anexos_no_pdf ? ' — eles já estão dentro do PDF do ofício' : ''}</span>
                            </label>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                        <div className="space-y-1.5">
                            <label className={LABEL} htmlFor="env-telefone">Telefone (com DDD) *</label>
                            <input id="env-telefone" value={telefone} onChange={e => { setTelefone(e.target.value); setAbriuWhatsApp(false); }} placeholder="(35) 99999-0000" className={INPUT} />
                        </div>
                        <div className="space-y-1.5 col-span-2">
                            <label className={LABEL} htmlFor="env-texto">Mensagem</label>
                            <textarea id="env-texto" rows={8} value={mensagem} onChange={e => setMensagem(e.target.value)}
                                className="w-full border border-gray-200 rounded-[6px] px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                            <p className="text-[11px] text-gray-400">O PDF não vai pelo link — quem recebe confere o documento pelo endereço de validação.</p>
                        </div>
                    </div>
                )}
            </SheetPanel>
            <SheetFooter>
                <button type="button" onClick={onClose} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px]">Cancelar</button>
                {canal === 'EMAIL' ? (
                    <button type="button" onClick={enviarEmail} disabled={enviando || !!motivoEmail} title={motivoEmail}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                        {enviando ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Mail className="w-[15px] h-[15px]" />}
                        {enviando ? 'Enviando…' : 'Enviar e-mail'}
                    </button>
                ) : (
                    <>
                        <button type="button" onClick={abrirWhatsApp} disabled={!!motivoWhats} title={motivoWhats}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 font-medium text-[13px] disabled:opacity-50 disabled:cursor-not-allowed">
                            <ExternalLink className="w-[15px] h-[15px]" /> Abrir WhatsApp
                        </button>
                        <button type="button" onClick={confirmarWhatsApp} disabled={enviando || !abriuWhatsApp}
                            title={!abriuWhatsApp ? 'Abra o WhatsApp e mande a mensagem antes de registrar' : 'Registra o envio no histórico do ofício'}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                            {enviando ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <MessageCircle className="w-[15px] h-[15px]" />}
                            Mandei — registrar envio
                        </button>
                    </>
                )}
            </SheetFooter>
        </Sheet>
    );
}
