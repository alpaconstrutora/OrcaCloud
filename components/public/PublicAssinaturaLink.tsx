import React from 'react';
import { FileSignature, XCircle } from 'lucide-react';
import { FluxoDeAssinatura } from '../assinatura/FluxoDeAssinatura';
import { acessoDoLinkDaTestemunha, type AcessoDoSignatario } from '../../services/assinaturaInternaService';

/**
 * `/assinar#s=<signatário>&t=<token>` — a testemunha assina SEM conta e sem
 * portal. O token vem no fragmento (não vai em log de servidor nem em Referer)
 * e sai da barra de endereço logo ao abrir. Quem confere é o banco (hash do
 * token); o código por e-mail é o segundo fator.
 * Plano: docs/planos/2026-11-21-assinatura-eletronica-interna.md (F3).
 */
export function PublicAssinaturaLink({ hash }: { hash: string }) {
    const [acesso] = React.useState<AcessoDoSignatario | null>(() => {
        const a = acessoDoLinkDaTestemunha(hash);
        return a ? { signatarioId: a.signatarioId, canal: 'LINK', credencial: a.token } : null;
    });
    const [aberto, setAberto] = React.useState(!!acesso);

    // O token sai da barra de endereço (o App já guardou o fragmento). Layout
    // effect: roda ANTES do useEffect da tela de assinatura, que empilha uma
    // entrada no histórico — senão o "voltar" cairia de novo na URL com o token.
    React.useLayoutEffect(() => {
        if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
    }, []);

    return (
        <div className="min-h-screen bg-gray-50 flex items-start justify-center p-4 py-12">
            <div className="w-full max-w-lg">
                <div className="text-center mb-6">
                    <h1 className="text-2xl font-black text-gray-900 tracking-tight">Assinatura eletrônica</h1>
                    <p className="text-gray-500 text-sm mt-1.5">Documento enviado para você assinar</p>
                </div>
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm">
                    {acesso ? (
                        <div className="text-center py-12 px-6">
                            <FileSignature className="w-12 h-12 text-blue-600 mx-auto mb-4" />
                            <h2 className="text-lg font-bold text-gray-900 mb-2">Seu documento está pronto</h2>
                            <p className="text-sm text-gray-500 mb-6">Abra, confira e assine com o código que vamos enviar ao seu e-mail.</p>
                            <button type="button" onClick={() => setAberto(true)}
                                className="inline-flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95">
                                <FileSignature className="w-[15px] h-[15px]" /> Abrir documento
                            </button>
                        </div>
                    ) : (
                        <div className="text-center py-12 px-6">
                            <XCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h2 className="text-lg font-bold text-gray-900 mb-2">Link incompleto</h2>
                            <p className="text-sm text-gray-500">Abra o link exatamente como veio no e-mail. Se continuar assim, peça um novo envio a quem mandou o documento.</p>
                        </div>
                    )}
                </div>
                <p className="text-xs text-gray-500 text-center mt-6">
                    Este link é pessoal. Não o encaminhe a ninguém.
                </p>
            </div>
            <FluxoDeAssinatura aberto={aberto} onFechar={() => setAberto(false)} acesso={acesso} />
        </div>
    );
}

export default PublicAssinaturaLink;
