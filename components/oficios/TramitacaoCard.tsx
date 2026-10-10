import React from 'react';
import { Send, Inbox, Reply, CheckCheck, Ban, Loader2, CalendarClock, FileUp } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { useToast } from '../../hooks/useToast';
import type { DocGenDocumento, DocGenSituacaoTramitacao } from '../../types/docGen';
import { docGenDocumentoService, SITUACOES_EM_CURSO, TRANSICOES } from '../../services/docGenDocumentoService';
import { CANAIS_ENVIO, ROTULO_SITUACAO } from '../../services/docGen/tramitacao';
import { dataCurta, hojeIso } from '../../services/docGen/dataExtenso';

/**
 * Tramitação do ofício EMITIDO (F4): envio, recebimento pelo destinatário
 * (protocolo), resposta, encerramento — e o prazo de resposta com tarefa.
 * A transição é validada pelo banco (`doc_gen_tramitar`), que guarda os dados
 * no histórico. Cancelar continua no rodapé da tela (a tela-mãe confirma).
 */
interface Props {
    documento: DocGenDocumento;
    onDocumento: (doc: DocGenDocumento) => void;
    onCancelar: () => void;
    /** "Registrar resposta" → arquivar o ofício de resposta recebido (aba Recebidos). */
    onArquivarResposta: () => void;
}

const INPUT = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all';
const LABEL = 'text-xs font-semibold text-slate-500';
const BTN_SEC = 'flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed';

const ACAO: Record<Exclude<DocGenSituacaoTramitacao, 'CANCELADO'>, { label: string; icon: React.ReactNode; titulo: string; descricao: string }> = {
    ENVIADO: { label: 'Registrar envio', icon: <Send className="w-[15px] h-[15px]" />, titulo: 'Registrar o envio', descricao: 'Como e quando o ofício saiu. Fica no histórico.' },
    RECEBIDO: { label: 'Registrar recebimento', icon: <Inbox className="w-[15px] h-[15px]" />, titulo: 'Registrar o recebimento pelo destinatário', descricao: 'O protocolo e quem recebeu do lado de lá.' },
    RESPONDIDO: { label: 'Registrar resposta', icon: <Reply className="w-[15px] h-[15px]" />, titulo: 'Registrar a resposta', descricao: 'Arquive o ofício de resposta recebido (fica vinculado a este) ou só marque como respondido.' },
    ENCERRADO: { label: 'Encerrar', icon: <CheckCheck className="w-[15px] h-[15px]" />, titulo: 'Encerrar o ofício', descricao: 'Nada mais a acompanhar. Fica no histórico; não volta.' },
};

export default function TramitacaoCard({ documento, onDocumento, onCancelar, onArquivarResposta }: Props) {
    const { showToast } = useToast();
    const [acao, setAcao] = React.useState<Exclude<DocGenSituacaoTramitacao, 'CANCELADO'> | null>(null);
    const [prazo, setPrazo] = React.useState(documento.resposta_esperada_ate ?? '');
    const [gravandoPrazo, setGravandoPrazo] = React.useState(false);
    React.useEffect(() => { setPrazo(documento.resposta_esperada_ate ?? ''); }, [documento.resposta_esperada_ate]);

    const proximas = TRANSICOES[documento.status].filter((s): s is Exclude<DocGenSituacaoTramitacao, 'CANCELADO'> => s !== 'CANCELADO');
    const podeCancelar = TRANSICOES[documento.status].includes('CANCELADO');
    const emCurso = SITUACOES_EM_CURSO.includes(documento.status);
    const vencido = emCurso && !!documento.resposta_esperada_ate && documento.resposta_esperada_ate < hojeIso();

    const salvarPrazo = async () => {
        setGravandoPrazo(true);
        try {
            await docGenDocumentoService.definirPrazo(documento.id, prazo || null);
            if (prazo) {
                await docGenDocumentoService.garantirTarefaDePrazo({
                    id: documento.id, organizationId: documento.organization_id, prazo,
                    titulo: `Cobrar resposta do ofício ${documento.numero ?? ''}`.trim(),
                    descricao: `${documento.assunto} — ${documento.destinatario_snapshot?.razao_social ?? ''}`,
                });
            } else {
                await docGenDocumentoService.concluirTarefaDePrazo(documento.id);
            }
            onDocumento({ ...documento, resposta_esperada_ate: prazo || null });
            showToast(prazo ? 'Prazo gravado — a tarefa de cobrar a resposta está na sua agenda.' : 'Prazo removido.', 'success');
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Falha ao gravar o prazo.', 'error');
        } finally {
            setGravandoPrazo(false);
        }
    };

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-gray-700">Situação</span>
                <span className={`text-sm ${documento.status === 'CANCELADO' ? 'text-red-600' : documento.status === 'ENCERRADO' ? 'text-slate-600' : 'text-green-700'}`}>
                    {ROTULO_SITUACAO[documento.status]}
                </span>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                    {proximas.map(s => (
                        <button key={s} type="button" onClick={() => setAcao(s)} className={BTN_SEC}>{ACAO[s].icon} {ACAO[s].label}</button>
                    ))}
                    {podeCancelar && (
                        <button type="button" onClick={onCancelar} className="flex items-center gap-1.5 h-9 px-3.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-[6px]">
                            <Ban className="w-[15px] h-[15px]" /> Cancelar ofício
                        </button>
                    )}
                </div>
            </div>

            {(emCurso || documento.resposta_esperada_ate) && (
                <div className="flex flex-wrap items-end gap-3">
                    <div className="space-y-1.5">
                        <label className={LABEL} htmlFor="prazo-resposta">Resposta esperada até</label>
                        <input id="prazo-resposta" type="date" value={prazo} min="2000-01-01" max="2099-12-31" disabled={!emCurso}
                            onChange={e => setPrazo(e.target.value)} className={`${INPUT} w-44 disabled:bg-gray-50 disabled:text-gray-500`} />
                    </div>
                    {emCurso && (
                        <button type="button" onClick={salvarPrazo} disabled={gravandoPrazo || prazo === (documento.resposta_esperada_ate ?? '')}
                            title={prazo === (documento.resposta_esperada_ate ?? '') ? 'Prazo igual ao gravado' : 'Grava o prazo e cria/atualiza a tarefa de cobrar a resposta'}
                            className={BTN_SEC}>
                            {gravandoPrazo ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <CalendarClock className="w-[15px] h-[15px]" />} Salvar prazo
                        </button>
                    )}
                    {vencido && <span className="text-sm text-red-600 pb-2">Prazo vencido em {dataCurta(documento.resposta_esperada_ate)}</span>}
                </div>
            )}

            <TramitarSheet
                acao={acao}
                documento={documento}
                onClose={() => setAcao(null)}
                onArquivarResposta={() => { setAcao(null); onArquivarResposta(); }}
                onFeito={doc => { setAcao(null); onDocumento(doc); }}
            />
        </div>
    );
}

function TramitarSheet({ acao, documento, onClose, onArquivarResposta, onFeito }: {
    acao: Exclude<DocGenSituacaoTramitacao, 'CANCELADO'> | null;
    documento: DocGenDocumento;
    onClose: () => void;
    onArquivarResposta: () => void;
    onFeito: (doc: DocGenDocumento) => void;
}) {
    const { showToast } = useToast();
    const [dados, setDados] = React.useState<Record<string, string>>({});
    const [salvando, setSalvando] = React.useState(false);
    React.useEffect(() => {
        if (!acao) return;
        const d = documento.destinatario_snapshot;
        setDados(acao === 'ENVIADO'
            ? { canal: 'EM_MAOS', enviado_em: hojeIso(), para: d?.contato_email || '' }
            : acao === 'RECEBIDO' ? { recebido_em: hojeIso() } : {});
    }, [acao, documento.destinatario_snapshot]);

    const set = (k: string, v: string) => setDados(x => ({ ...x, [k]: v }));
    const campo = (k: string, rotulo: string, opts?: { tipo?: string; placeholder?: string }) => (
        <div className="space-y-1.5">
            <label className={LABEL} htmlFor={`tram-${k}`}>{rotulo}</label>
            <input id={`tram-${k}`} type={opts?.tipo ?? 'text'} value={dados[k] ?? ''} placeholder={opts?.placeholder}
                onChange={e => set(k, e.target.value)} className={INPUT} />
        </div>
    );

    const confirmar = async () => {
        if (!acao) return;
        setSalvando(true);
        try {
            const doc = await docGenDocumentoService.tramitar(documento.id, acao, dados);
            if (acao === 'RESPONDIDO' || acao === 'ENCERRADO') await docGenDocumentoService.concluirTarefaDePrazo(documento.id);
            showToast(`Ofício ${documento.numero ?? ''}: ${ROTULO_SITUACAO[acao].toLowerCase()}.`, 'success');
            onFeito(doc);
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Falha ao registrar.', 'error');
        } finally {
            setSalvando(false);
        }
    };

    if (!acao) return null;
    const info = ACAO[acao];
    return (
        <Sheet open={!!acao} onClose={onClose} size="lg">
            <SheetHeader onClose={onClose}>
                <SheetTitle>{info?.titulo}</SheetTitle>
                <SheetDescription>{info?.descricao}</SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-5 space-y-4">
                {acao === 'ENVIADO' && (
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                        <div className="space-y-1.5">
                            <label className={LABEL} htmlFor="tram-canal">Canal</label>
                            <select id="tram-canal" value={dados.canal ?? 'EM_MAOS'} onChange={e => set('canal', e.target.value)} className={INPUT}>
                                {CANAIS_ENVIO.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                            </select>
                        </div>
                        {campo('enviado_em', 'Data do envio', { tipo: 'date' })}
                        <div className="col-span-2">{campo('para', 'Para (e-mail, endereço ou setor)')}</div>
                        {campo('rastreio', 'Rastreio / nº do AR')}
                        {campo('observacao', 'Observação')}
                    </div>
                )}
                {acao === 'RECEBIDO' && (
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                        {campo('protocolo', 'Nº do protocolo', { placeholder: 'Ex.: 2026/004512' })}
                        {campo('recebido_em', 'Recebido em', { tipo: 'date' })}
                        <div className="col-span-2">{campo('recebido_por', 'Recebido por (nome / setor)')}</div>
                        <div className="col-span-2">{campo('observacao', 'Observação')}</div>
                    </div>
                )}
                {acao === 'RESPONDIDO' && (
                    <div className="space-y-4">
                        <button type="button" onClick={onArquivarResposta}
                            className="w-full flex items-start gap-3 rounded-[10px] border border-blue-200 bg-blue-50/50 px-4 py-3 text-left hover:bg-blue-50">
                            <FileUp className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                            <span>
                                <span className="block text-sm text-gray-900">Arquivar o ofício de resposta (PDF)</span>
                                <span className="block text-xs text-gray-500">Vai para o GED (Ofícios / ano / Recebidos), congelado com hash, vinculado a este ofício — e este passa a Respondido.</span>
                            </span>
                        </button>
                        <p className="text-xs text-gray-500">Ou só marque como respondido (a resposta veio por outro meio):</p>
                        {campo('observacao', 'Como respondeu')}
                    </div>
                )}
                {acao === 'ENCERRADO' && campo('observacao', 'Observação')}
            </SheetPanel>
            <SheetFooter>
                <button type="button" onClick={onClose} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px]">Cancelar</button>
                <button type="button" onClick={confirmar} disabled={salvando}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                    {salvando ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : info?.icon}
                    {acao === 'RESPONDIDO' ? 'Marcar como respondido' : info?.label}
                </button>
            </SheetFooter>
        </Sheet>
    );
}
