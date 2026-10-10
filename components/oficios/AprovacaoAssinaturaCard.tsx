import React from 'react';
import { Check, Loader2, PenLine, Send, ShieldCheck, Undo2, X } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { useToast } from '../../hooks/useToast';
import type { DocGenAssinatura, DocGenDocumento, DocGenModelo } from '../../types/docGen';
import type { OrganizationMember } from '../../types/users';
import { docGenDocumentoService } from '../../services/docGenDocumentoService';
import { assinaturasValidas } from '../../services/docGen/emissao';
import { dataHoraCurta } from '../../services/docGen/dataExtenso';

/**
 * Aprovação e assinaturas do RASCUNHO (F4). As regras são do banco:
 *   - em aprovação o texto não muda; aprovado e alterado volta a precisar;
 *   - cada um assina a própria linha, sobre a versão SALVA (salvar de novo
 *     invalida a assinatura anterior);
 *   - o modelo diz se a emissão exige aprovação e/ou todas as assinaturas.
 * Aqui só se mostra o estado e se explica por que um botão está desligado.
 */
interface Props {
    documento: DocGenDocumento | null;
    modelo: DocGenModelo;
    /** Há alteração não salva na tela. */
    dirty: boolean;
    membros: OrganizationMember[];
    emailUsuario: string | null;
    assinaturas: DocGenAssinatura[];
    onDocumento: (doc: DocGenDocumento) => void;
    onAssinaturasMudaram: () => void;
}

const ROTULO_APROVACAO: Record<DocGenDocumento['approval_status'], { label: string; className: string }> = {
    RASCUNHO: { label: 'Não enviado para aprovação', className: 'text-gray-600' },
    PENDENTE: { label: 'Em aprovação', className: 'text-amber-700' },
    APROVADO: { label: 'Aprovado', className: 'text-green-700' },
    REJEITADO: { label: 'Rejeitado', className: 'text-red-600' },
};

const BTN_SEC = 'flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed';
const BTN_PRI = 'flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed';

export default function AprovacaoAssinaturaCard({ documento, modelo, dirty, membros, emailUsuario, assinaturas, onDocumento, onAssinaturasMudaram }: Props) {
    const { showToast } = useToast();
    const [ocupado, setOcupado] = React.useState<string | null>(null);
    const [decisao, setDecisao] = React.useState<'approve' | 'reject' | null>(null);

    const eu = React.useMemo(
        () => membros.find(m => (m.email ?? '').toLowerCase() === (emailUsuario ?? '').toLowerCase()) ?? null,
        [membros, emailUsuario],
    );

    if (!documento) {
        return <p className="text-sm text-gray-500">Salve o rascunho para enviar à aprovação e colher as assinaturas.</p>;
    }

    const ap = documento.approval_status;
    const chain = documento.approval_chain ?? [];
    const aprovados = chain.filter(s => s.action === 'APROVADO').length;
    const mostrarAprovacao = modelo.exige_aprovacao || ap !== 'RASCUNHO' || chain.length > 0;
    const validas = assinaturasValidas(documento.signatarios, assinaturas, documento.versao);

    const executar = async (rotulo: string, fn: () => Promise<void>) => {
        setOcupado(rotulo);
        try { await fn(); } catch (e) {
            showToast(e instanceof Error ? e.message : 'Falha na operação.', 'error');
        } finally { setOcupado(null); }
    };

    const enviar = () => executar('enviar', async () => {
        onDocumento(await docGenDocumentoService.enviarParaAprovacao(documento));
        showToast('Ofício enviado para aprovação. Ele aparece na fila da Central de Controle.', 'success');
    });
    const retirar = () => executar('retirar', async () => {
        onDocumento(await docGenDocumentoService.retirarDaAprovacao(documento));
        showToast('Ofício retirado da aprovação — pode editar.', 'success');
    });
    const assinar = () => executar('assinar', async () => {
        await docGenDocumentoService.assinar(documento.id);
        onAssinaturasMudaram();
        showToast('Assinatura registrada nesta versão do ofício.', 'success');
    });

    const motivoEnviar = dirty ? 'Salve o rascunho antes — a aprovação vale para a versão salva.' : undefined;
    const motivoAssinar = dirty ? 'Salve o rascunho antes — a assinatura vale para a versão salva.'
        : ap === 'PENDENTE' ? 'O ofício está em aprovação — assine depois da decisão.'
        : modelo.exige_aprovacao && ap !== 'APROVADO' ? 'Este modelo exige aprovação antes da assinatura.'
        : undefined;

    return (
        <div className="space-y-6">
            {mostrarAprovacao && (
                <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                        <ShieldCheck className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-700">Aprovação</span>
                        <span className={`text-sm ${ROTULO_APROVACAO[ap].className}`}>
                            {ROTULO_APROVACAO[ap].label}
                            {ap === 'PENDENTE' && ` — nível ${aprovados + 1} de ${documento.approval_required_levels}`}
                        </span>
                        {modelo.exige_aprovacao && <span className="text-xs text-gray-400">o modelo exige aprovação para emitir</span>}
                        <div className="ml-auto flex flex-wrap items-center gap-2">
                            {(ap === 'RASCUNHO' || ap === 'REJEITADO') && (
                                <button type="button" onClick={enviar} disabled={!!ocupado || !!motivoEnviar} title={motivoEnviar ?? 'Coloca o ofício na fila de aprovação'} className={BTN_PRI}>
                                    {ocupado === 'enviar' ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Send className="w-[15px] h-[15px]" />}
                                    {ap === 'REJEITADO' ? 'Reenviar para aprovação' : 'Enviar para aprovação'}
                                </button>
                            )}
                            {ap === 'PENDENTE' && (
                                <>
                                    <button type="button" onClick={retirar} disabled={!!ocupado} title="Volta o ofício para edição" className={BTN_SEC}>
                                        {ocupado === 'retirar' ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Undo2 className="w-[15px] h-[15px]" />} Retirar da aprovação
                                    </button>
                                    <button type="button" onClick={() => setDecisao('reject')} disabled={!!ocupado} className={`${BTN_SEC} text-red-600`}>
                                        <X className="w-[15px] h-[15px]" /> Rejeitar
                                    </button>
                                    <button type="button" onClick={() => setDecisao('approve')} disabled={!!ocupado} className="flex items-center gap-1.5 h-9 px-3.5 bg-green-600 text-white rounded-[6px] hover:bg-green-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50">
                                        <Check className="w-[15px] h-[15px]" /> Aprovar
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                    {chain.length > 0 && (
                        <ul className="space-y-1 pl-7">
                            {chain.map((s, i) => (
                                <li key={i} className="text-xs text-gray-500">
                                    <span className={s.action === 'APROVADO' ? 'text-green-700' : 'text-red-600'}>{s.action === 'APROVADO' ? `Aprovado (nível ${s.level})` : 'Rejeitado'}</span>
                                    {` por ${s.approved_by} em ${dataHoraCurta(s.approved_at)}`}
                                    {s.notes ? ` — "${s.notes}"` : ''}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                    <PenLine className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-700">Assinatura eletrônica</span>
                    <span className="text-xs text-gray-400">
                        {modelo.exige_assinatura ? 'o modelo exige a assinatura de todos os signatários para emitir' : 'opcional — quem assina aparece no PDF como "assinado eletronicamente"'}
                    </span>
                </div>
                {documento.signatarios.length === 0 ? (
                    <p className="text-sm text-gray-500 pl-7">Escolha os signatários na seção acima.</p>
                ) : (
                    <ul className="divide-y divide-gray-100 rounded-[10px] border border-gray-100">
                        {documento.signatarios.map((s, i) => {
                            const valida = validas[i];
                            const antiga = !valida && assinaturas.some(a => a.member_id === s.memberId);
                            const souEu = !!eu && eu.id === s.memberId;
                            return (
                                <li key={s.memberId ?? `${s.nome}-${i}`} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm text-gray-800">{s.nome}{s.cargo ? <span className="text-gray-500"> · {s.cargo}</span> : null}</p>
                                        <p className={`text-xs ${valida ? 'text-green-700' : antiga ? 'text-amber-700' : 'text-gray-500'}`}>
                                            {valida ? `Assinou em ${dataHoraCurta(valida.assinado_em)} (versão ${valida.versao})`
                                                : antiga ? 'Assinou uma versão anterior — o texto mudou depois e a assinatura precisa ser refeita'
                                                : 'Aguardando assinatura'}
                                        </p>
                                    </div>
                                    {souEu && !valida && (
                                        <button type="button" onClick={assinar} disabled={!!ocupado || !!motivoAssinar}
                                            title={motivoAssinar ?? `Assina a versão ${documento.versao} deste ofício`} className={BTN_PRI}>
                                            {ocupado === 'assinar' ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <PenLine className="w-[15px] h-[15px]" />} Assinar
                                        </button>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            <DecisaoSheet
                aberto={decisao}
                documento={documento}
                emailUsuario={emailUsuario}
                onClose={() => setDecisao(null)}
                onFeito={async () => {
                    setDecisao(null);
                    const relido = await docGenDocumentoService.get(documento.id);
                    if (relido) onDocumento(relido);
                }}
            />
        </div>
    );
}

/** Aprovar / rejeitar daqui mesmo (o mesmo que a fila da Central de Controle faz). */
function DecisaoSheet({ aberto, documento, emailUsuario, onClose, onFeito }: {
    aberto: 'approve' | 'reject' | null;
    documento: DocGenDocumento;
    emailUsuario: string | null;
    onClose: () => void;
    onFeito: () => void;
}) {
    const { showToast } = useToast();
    const [notas, setNotas] = React.useState('');
    const [salvando, setSalvando] = React.useState(false);
    React.useEffect(() => { if (aberto) setNotas(''); }, [aberto]);

    const nivel = (documento.approval_chain.some(s => s.action === 'APROVADO' && s.level === 1) ? 2 : 1) as 1 | 2;
    const aprovar = aberto === 'approve';
    const motivo = !emailUsuario ? 'Sessão sem e-mail — entre de novo.'
        : !aprovar && !notas.trim() ? 'Informe o motivo da rejeição.' : undefined;

    if (!aberto) return null;

    const confirmar = async () => {
        if (!emailUsuario) return;
        setSalvando(true);
        try {
            if (aprovar) await docGenDocumentoService.aprovar(documento.id, nivel, emailUsuario, { level1_label: 'Gestor', level2_label: 'Diretoria' }, notas.trim() || undefined);
            else await docGenDocumentoService.rejeitar(documento.id, emailUsuario, notas.trim());
            showToast(aprovar ? `Aprovado (nível ${nivel}).` : 'Ofício rejeitado — volta para quem redige.', 'success');
            onFeito();
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Falha ao registrar a decisão.', 'error');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Sheet open={!!aberto} onClose={onClose} size="md">
            <SheetHeader onClose={onClose}>
                <SheetTitle>{aprovar ? `Aprovar — nível ${nivel}` : 'Rejeitar o ofício'}</SheetTitle>
                <SheetDescription>{documento.assunto || 'Ofício sem assunto'}</SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-5 space-y-1.5">
                <label className="text-xs font-semibold text-slate-500" htmlFor="decisao-notas">{aprovar ? 'Observação (opcional)' : 'Motivo da rejeição *'}</label>
                <textarea id="decisao-notas" rows={4} value={notas} onChange={e => setNotas(e.target.value)}
                    placeholder={aprovar ? 'Ex.: Texto conferido.' : 'O que precisa mudar…'}
                    className="w-full border border-gray-200 rounded-[6px] px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
            </SheetPanel>
            <SheetFooter>
                <button type="button" onClick={onClose} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px]">Cancelar</button>
                <button type="button" onClick={confirmar} disabled={salvando || !!motivo} title={motivo}
                    className={`flex items-center gap-1.5 h-9 px-3.5 text-white rounded-[6px] font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${aprovar ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>
                    {salvando ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : aprovar ? <Check className="w-[15px] h-[15px]" /> : <X className="w-[15px] h-[15px]" />}
                    {aprovar ? 'Confirmar aprovação' : 'Confirmar rejeição'}
                </button>
            </SheetFooter>
        </Sheet>
    );
}
