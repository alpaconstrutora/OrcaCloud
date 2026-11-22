import React from 'react';
import { CheckCircle2, ExternalLink, FileSignature, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { useConfirm } from '../ui/confirm';
import { FluxoDeAssinatura } from './FluxoDeAssinatura';
import {
    envioDeAssinaturaService, situacaoEfetiva, ROTULO_PAPEL, ROTULO_SITUACAO,
    type EnvelopeDeAssinatura, type OrigemDaAssinatura,
} from '../../services/assinaturaInternaService';
import { supabase } from '../../lib/supabase';

/**
 * Acompanhar a assinatura interna de um documento: quem já assinou, cancelar
 * (enquanto em andamento), refazer a finalização (se a Edge caiu no meio),
 * assinar agora (quando EU sou o representante) e abrir a via assinada.
 * Plano: docs/planos/2026-11-21-assinatura-eletronica-interna.md (F4/F5).
 */

const fmtDataHora = (iso?: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

const COR_SITUACAO: Record<string, string> = {
    ENVIADO: 'text-amber-700', FINALIZANDO: 'text-blue-700', CONCLUIDO: 'text-emerald-700', CANCELADO: 'text-gray-500', EXPIRADO: 'text-red-700',
};

interface Props {
    aberto: boolean;
    onFechar: () => void;
    origem: OrigemDaAssinatura | null;
    titulo: string;
    /** Abre a via assinada (o pai sabe onde ela ficou: versão ou documento da negociação). */
    onAbrirAssinado?: () => void;
    /** Algo mudou (cancelou/finalizou/assinou): o pai recarrega a lista. */
    onMudou: () => void;
    onNotify: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export function AcompanharAssinaturaSheet({ aberto, onFechar, origem, titulo, onAbrirAssinado, onMudou, onNotify }: Props) {
    const confirm = useConfirm();
    const [envelopes, setEnvelopes] = React.useState<EnvelopeDeAssinatura[] | null>(null);
    const [eu, setEu] = React.useState<string | null>(null);
    const [ocupado, setOcupado] = React.useState(false);
    const [assinando, setAssinando] = React.useState<string | null>(null);

    const carregar = React.useCallback(async () => {
        if (!origem) return;
        try {
            setEnvelopes(await envioDeAssinaturaService.listar(origem));
        } catch (e) {
            onNotify(e instanceof Error ? e.message : 'Não foi possível carregar a assinatura.', 'error');
            setEnvelopes([]);
        }
    }, [origem, onNotify]);

    React.useEffect(() => {
        if (!aberto) return;
        setEnvelopes(null);
        void carregar();
        void supabase.auth.getUser().then(r => setEu(r.data.user?.id ?? null));
    }, [aberto, carregar]);

    const atual = envelopes?.[0] ?? null;
    const situacao = atual ? situacaoEfetiva(atual) : null;
    const meu = atual?.assinatura_signatarios.find(s => s.canal === 'MEMBRO' && s.user_id === eu && s.status === 'PENDENTE');

    const cancelar = async () => {
        if (!atual) return;
        const ok = await confirm({
            title: 'Cancelar a assinatura?',
            message: 'Quem ainda não assinou não poderá mais assinar este envio. As assinaturas já feitas ficam registradas, mas o documento não será concluído.',
            variant: 'warning',
            confirmLabel: 'Cancelar assinatura',
        });
        if (!ok) return;
        setOcupado(true);
        try {
            await envioDeAssinaturaService.cancelar(atual.id);
            onNotify('Assinatura cancelada.', 'success');
            await carregar();
            onMudou();
        } catch (e) {
            onNotify(e instanceof Error ? e.message : 'Não foi possível cancelar.', 'error');
        } finally { setOcupado(false); }
    };

    const finalizar = async () => {
        if (!atual) return;
        setOcupado(true);
        try {
            await envioDeAssinaturaService.finalizar(atual.id);
            onNotify('Documento finalizado e enviado a todos.', 'success');
            await carregar();
            onMudou();
        } catch (e) {
            onNotify(e instanceof Error ? e.message : 'Não foi possível finalizar.', 'error');
        } finally { setOcupado(false); }
    };

    const assinados = atual?.assinatura_signatarios.filter(s => s.status === 'ASSINADO').length ?? 0;

    return (
        <>
            <Sheet open={aberto} onClose={onFechar} size="lg">
                <SheetHeader onClose={onFechar}>
                    <SheetTitle>Assinatura no portal</SheetTitle>
                    <SheetDescription>{atual?.titulo || titulo}</SheetDescription>
                </SheetHeader>
                <SheetPanel>
                    {envelopes === null ? (
                        <div className="text-center py-12">
                            <Loader2 className="w-8 h-8 text-blue-600 mx-auto animate-spin" />
                            <p className="mt-2 text-gray-500">Carregando...</p>
                        </div>
                    ) : !atual || !situacao ? (
                        <div className="text-center py-12 px-6">
                            <FileSignature className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum envio ainda</h3>
                            <p className="text-sm text-gray-500">Este documento ainda não foi enviado para assinatura no portal.</p>
                        </div>
                    ) : (
                        <div className="p-6 space-y-8">
                            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
                                <div className="space-y-1.5">
                                    <dt className="text-xs font-semibold text-slate-500">Situação</dt>
                                    <dd className={COR_SITUACAO[situacao]}>{ROTULO_SITUACAO[situacao]}{situacao === 'ENVIADO' ? ` (${assinados} de ${atual.assinatura_signatarios.length})` : ''}</dd>
                                </div>
                                <div className="space-y-1.5">
                                    <dt className="text-xs font-semibold text-slate-500">{situacao === 'CONCLUIDO' ? 'Concluído em' : 'Prazo para assinar'}</dt>
                                    <dd className="text-gray-900">{fmtDataHora(situacao === 'CONCLUIDO' ? atual.concluido_em : atual.expira_em)}</dd>
                                </div>
                                <div className="space-y-1.5">
                                    <dt className="text-xs font-semibold text-slate-500">Enviado em</dt>
                                    <dd className="text-gray-900">{fmtDataHora(atual.criado_em)}</dd>
                                </div>
                                {atual.motivo && (
                                    <div className="space-y-1.5">
                                        <dt className="text-xs font-semibold text-slate-500">Motivo</dt>
                                        <dd className="text-gray-900">{atual.motivo}</dd>
                                    </div>
                                )}
                            </dl>

                            <div className="space-y-4">
                                <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-100 pb-3">Signatários</h3>
                                <ul className="divide-y divide-gray-100 rounded-[6px] border border-gray-100">
                                    {atual.assinatura_signatarios.map(s => (
                                        <li key={s.id} className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm">
                                            <span className="min-w-0">
                                                <span className="block text-gray-900 truncate">{s.nome}{s.representa ? ` (por ${s.representa})` : ''}</span>
                                                <span className="block text-xs text-gray-500 truncate">{ROTULO_PAPEL[s.papel]} · {s.email}</span>
                                            </span>
                                            {s.status === 'ASSINADO' ? (
                                                <span className="flex items-center gap-1 text-emerald-700 shrink-0"><CheckCircle2 className="w-4 h-4" /> {fmtDataHora(s.assinado_em)}</span>
                                            ) : (
                                                <span className="text-amber-700 text-right shrink-0">{s.visualizou_em ? `Abriu em ${fmtDataHora(s.visualizou_em)}` : 'Ainda não abriu'}</span>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            {situacao === 'FINALIZANDO' && (
                                <p className="flex items-start gap-2 text-sm text-blue-700">
                                    <RefreshCw className="w-4 h-4 mt-0.5 shrink-0" />
                                    Todos assinaram, mas a geração da via assinada não terminou. Use "Finalizar de novo".
                                </p>
                            )}
                            {envelopes.length > 1 && (
                                <p className="text-xs text-gray-500">
                                    Envios anteriores deste documento: {envelopes.slice(1).map(e => `${ROTULO_SITUACAO[situacaoEfetiva(e)].toLowerCase()} em ${fmtDataHora(e.criado_em)}`).join('; ')}.
                                </p>
                            )}
                        </div>
                    )}
                </SheetPanel>
                <SheetFooter>
                    {situacao === 'ENVIADO' && (
                        <button type="button" onClick={() => void cancelar()} disabled={ocupado}
                            className="mr-auto inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] border border-gray-200 bg-white text-[13px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-60">
                            <XCircle className="w-[15px] h-[15px]" /> Cancelar assinatura
                        </button>
                    )}
                    {situacao === 'CONCLUIDO' && onAbrirAssinado && (
                        <button type="button" onClick={onAbrirAssinado}
                            className="mr-auto inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] border border-gray-200 bg-white text-[13px] font-medium text-gray-700 hover:bg-gray-50">
                            <ExternalLink className="w-[15px] h-[15px]" /> Abrir via assinada
                        </button>
                    )}
                    <button type="button" onClick={onFechar}
                        className="h-9 px-3.5 rounded-[6px] border border-gray-200 bg-white text-[13px] font-medium text-gray-700 hover:bg-gray-50">
                        Fechar
                    </button>
                    {situacao === 'FINALIZANDO' && (
                        <button type="button" onClick={() => void finalizar()} disabled={ocupado}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-60">
                            {ocupado ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <RefreshCw className="w-[15px] h-[15px]" />} Finalizar de novo
                        </button>
                    )}
                    {situacao === 'ENVIADO' && meu && (
                        <button type="button" onClick={() => { onFechar(); setAssinando(meu.id); }}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95">
                            <FileSignature className="w-[15px] h-[15px]" /> Assinar agora
                        </button>
                    )}
                </SheetFooter>
            </Sheet>
            <FluxoDeAssinatura
                aberto={!!assinando}
                onFechar={() => setAssinando(null)}
                acesso={assinando ? { signatarioId: assinando, canal: 'MEMBRO', credencial: null } : null}
                onAssinado={() => { void carregar(); onMudou(); }}
            />
        </>
    );
}

export default AcompanharAssinaturaSheet;
