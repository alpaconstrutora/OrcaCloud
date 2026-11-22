import React from 'react';
import { CheckCircle2, ChevronRight, FileSignature } from 'lucide-react';
import { FluxoDeAssinatura } from './FluxoDeAssinatura';
import {
    aguardaMinhaAssinatura, assinaturasDoPortal, esquecerSignatarioDaUrl, signatarioDaUrl,
    ROTULO_PAPEL, ROTULO_SITUACAO, type AcessoDoSignatario, type ItemDeAssinaturaDoPortal,
} from '../../services/assinaturaInternaService';

/**
 * "Documentos para assinar" dentro de um portal (Cliente, Corretor). Lê por RPC
 * com o token do portal (o portal nunca lê tabela direto) e abre o
 * `FluxoDeAssinatura`. O e-mail de convite chega com `?assinar=<id>`: abre direto.
 *
 * Sem nada pendente nem assinado, não desenha nada — não é seção fixa do portal.
 * Plano: docs/planos/2026-11-21-assinatura-eletronica-interna.md (F3/F6).
 */

const fmtData = (iso?: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
};

interface Props {
    portal: 'cliente' | 'corretor';
    token: string;
    /** Lista também os já assinados (ex.: aba Contratos). Pendentes aparecem sempre. */
    mostrarAssinados?: boolean;
    /** Prévia do gestor: abre, mas não assina. */
    somenteLeitura?: boolean;
    className?: string;
}

export function DocumentosParaAssinar({ portal, token, mostrarAssinados = false, somenteLeitura = false, className = '' }: Props) {
    const [itens, setItens] = React.useState<ItemDeAssinaturaDoPortal[]>([]);
    const [aberto, setAberto] = React.useState<string | null>(null);
    const canal = portal === 'cliente' ? 'PORTAL_CLIENTE' : 'PORTAL_CORRETOR';

    const carregar = React.useCallback(async () => {
        try {
            setItens(await assinaturasDoPortal(portal, token));
        } catch (e) {
            console.error('[DocumentosParaAssinar]', e);
        }
    }, [portal, token]);

    React.useEffect(() => { void carregar(); }, [carregar]);

    // Link do e-mail: abre o documento pedido uma vez e limpa a URL.
    React.useEffect(() => {
        const id = signatarioDaUrl();
        if (id) { setAberto(id); esquecerSignatarioDaUrl(); }
    }, []);

    const acesso = React.useMemo<AcessoDoSignatario | null>(
        () => (aberto ? { signatarioId: aberto, canal, credencial: token } : null),
        [aberto, canal, token],
    );

    const pendentes = itens.filter(aguardaMinhaAssinatura);
    const assinados = itens.filter(i => !aguardaMinhaAssinatura(i));
    const lista = mostrarAssinados ? itens : pendentes;

    return (
        <>
            {lista.length > 0 && (
                <section aria-labelledby={`assinar-${portal}`} className={`bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden ${className}`}>
                    <div className="flex items-center gap-2 px-4 md:px-6 py-3 border-b border-gray-100">
                        <FileSignature className="w-4 h-4 text-blue-600" />
                        <h2 id={`assinar-${portal}`} className="text-sm font-semibold text-gray-900">
                            {pendentes.length > 0
                                ? `${pendentes.length} documento${pendentes.length > 1 ? 's' : ''} para assinar`
                                : 'Documentos assinados'}
                        </h2>
                    </div>
                    <ul className="divide-y divide-gray-100">
                        {(mostrarAssinados ? [...pendentes, ...assinados] : pendentes).map(i => {
                            const pendente = aguardaMinhaAssinatura(i);
                            return (
                                <li key={i.signatario_id}>
                                    <button type="button" onClick={() => setAberto(i.signatario_id)}
                                        className="w-full flex items-center gap-3 px-4 md:px-6 py-3 text-left hover:bg-gray-50 transition-colors">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-gray-900 truncate">{i.titulo}</p>
                                            <p className="text-xs text-gray-500 truncate">
                                                {[i.emitente, ROTULO_PAPEL[i.papel], pendente ? `prazo ${fmtData(i.expira_em)}` : null].filter(Boolean).join(' · ')}
                                            </p>
                                        </div>
                                        {pendente ? (
                                            <span className="text-sm font-medium text-blue-600 shrink-0">Assinar</span>
                                        ) : i.minha_situacao === 'ASSINADO' ? (
                                            <span className="flex items-center gap-1 text-sm text-emerald-700 shrink-0">
                                                <CheckCircle2 className="w-4 h-4" />
                                                {i.situacao === 'CONCLUIDO' ? 'Concluído' : 'Você assinou'}
                                            </span>
                                        ) : (
                                            <span className="text-sm text-gray-500 shrink-0">{ROTULO_SITUACAO[i.situacao]}</span>
                                        )}
                                        <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            )}
            <FluxoDeAssinatura
                aberto={!!aberto}
                onFechar={() => setAberto(null)}
                acesso={acesso}
                somenteLeitura={somenteLeitura}
                onAssinado={() => void carregar()}
            />
        </>
    );
}

export default DocumentosParaAssinar;
