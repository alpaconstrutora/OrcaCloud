/**
 * Buscar e-mails de um período numa caixa da captura de boletos.
 *
 * Plano: docs/planos/2026-10-15-captura-boletos-por-email.md (P3).
 * A busca anda por partes (a Edge Function tem tempo limitado). Com o painel
 * aberto ela segue sozinha, parte após parte; fechado, o agendamento de 15 em
 * 15 minutos continua de onde parou. Duplicidade é barrada como na leitura
 * normal: e-mail já lido é pulado, PDF/linha digitável repetidos viram
 * "Duplicado" no histórico, sem boleto novo.
 */
import React, { useEffect, useRef, useState } from 'react';
import { CalendarSearch, Loader2, Info } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { SegmentedProgress } from '../ui/SegmentedProgress';
import { useConfirm } from '../ui/confirm';
import {
    emailCaptureService,
    progressoDaBusca,
    ROTULO_MODO,
    ROTULO_STATUS_BUSCA,
    type BuscaPeriodo,
    type ContaCaptura,
} from '../../services/emailCaptureService';

const ROTULO = 'text-xs font-semibold text-slate-500';
const CAMPO = 'w-full px-3 h-9 bg-gray-50 border border-gray-100 rounded-[6px] text-sm text-gray-900 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all disabled:opacity-60';

/** Data LOCAL em AAAA-MM-DD — `toISOString()` é UTC e, depois das 21h em Brasília, já dá o dia seguinte. */
const dataLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hoje = () => dataLocal(new Date());
const diasAtras = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return dataLocal(d); };
const ativa = (b: BuscaPeriodo | null) => !!b && (b.status === 'pendente' || b.status === 'em_andamento');
const br = (d: string) => d.split('-').reverse().join('/');

interface Props {
    open: boolean;
    onClose: () => void;
    conta: ContaCaptura | null;
    /** Busca em andamento desta caixa, se houver — o painel retoma em vez de pedir datas. */
    buscaAtiva: BuscaPeriodo | null;
    onAtualizada: (b: BuscaPeriodo) => void;
}

const EmailCaptureBuscaSheet: React.FC<Props> = ({ open, onClose, conta, buscaAtiva, onAtualizada }) => {
    const confirm = useConfirm();
    const [de, setDe] = useState(diasAtras(30));
    const [ate, setAte] = useState(hoje());
    const [busca, setBusca] = useState<BuscaPeriodo | null>(null);
    const [rodando, setRodando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const vivo = useRef(false);

    useEffect(() => {
        if (!open) { vivo.current = false; return; }
        vivo.current = true;
        setErro(null);
        setBusca(buscaAtiva);
        setDe(diasAtras(30));
        setAte(hoje());
        if (ativa(buscaAtiva) && conta) avancar(conta.id);
        return () => { vivo.current = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    /** Chama a próxima parte enquanto o painel estiver aberto e a busca não terminar. */
    async function avancar(accountId: string, primeira?: Promise<BuscaPeriodo | null>) {
        setRodando(true);
        try {
            let atual = primeira ? await primeira : await emailCaptureService.continuarBusca(accountId);
            while (vivo.current && atual) {
                setBusca(atual);
                onAtualizada(atual);
                if (!ativa(atual)) break;
                atual = await emailCaptureService.continuarBusca(accountId);
            }
        } catch (e) {
            if (vivo.current) setErro(e instanceof Error ? e.message : String(e));
        } finally {
            if (vivo.current) setRodando(false);
        }
    }

    const motivoDesligado: string | null = !conta
        ? 'Escolha uma caixa.'
        : conta.status !== 'ativa'
            ? 'A caixa precisa estar ativa (reconecte ou reative).'
            : !de || !ate
                ? 'Informe as duas datas.'
                : de > ate
                    ? 'A data inicial é depois da final.'
                    : ate > hoje()
                        ? 'A data final não pode estar no futuro.'
                        : null;

    function iniciar() {
        if (motivoDesligado || !conta) return;
        setErro(null);
        avancar(conta.id, emailCaptureService.buscarPeriodo(conta.id, de, ate));
    }

    async function cancelar() {
        if (!busca) return;
        const ok = await confirm({
            title: 'Cancelar a busca?',
            message: 'Os boletos já criados por ela continuam em Boletos a Pagar. O restante do período não será lido.',
            variant: 'warning',
            confirmLabel: 'Cancelar busca',
        });
        if (!ok) return;
        vivo.current = false;
        try {
            const b = await emailCaptureService.cancelarBusca(busca.id);
            setBusca(b);
            onAtualizada(b);
        } catch (e) {
            setErro(e instanceof Error ? e.message : String(e));
        } finally {
            vivo.current = open;
            setRodando(false);
        }
    }

    if (!open) return null;

    const pct = busca ? progressoDaBusca(busca) : null;
    const emCurso = ativa(busca);

    return (
        <Sheet open={open} onClose={onClose} size="md">
            <SheetHeader onClose={onClose}>
                <SheetTitle>Buscar e-mails de um período</SheetTitle>
                <SheetDescription>{conta ? `Caixa ${conta.usuario}` : ''}</SheetDescription>
            </SheetHeader>

            <SheetPanel className="px-6 py-5 space-y-8">
                {busca ? (
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                            <CalendarSearch className="w-4 h-4 text-blue-600" />
                            <h3 className="text-sm font-semibold text-gray-900">{br(busca.data_de)} a {br(busca.data_ate)}</h3>
                            <span className={`ml-auto text-sm ${busca.status === 'concluida' ? 'text-emerald-700' : busca.status === 'cancelada' || busca.status === 'erro' ? 'text-red-600' : 'text-blue-700'}`}>
                                {ROTULO_STATUS_BUSCA[busca.status]}
                            </span>
                        </div>
                        {pct != null ? (
                            <SegmentedProgress percent={pct} tone="blue"
                                hint={busca.total_mensagens != null ? `${busca.mensagens_processadas} de ${busca.total_mensagens} e-mails do período` : undefined} />
                        ) : (
                            <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Contando os e-mails do período…</p>
                        )}
                        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                            <span className="text-gray-500">Boletos criados</span><span className="text-emerald-700">{busca.criados}</span>
                            <span className="text-gray-500">Duplicados (já existiam)</span><span className="text-gray-700">{busca.duplicados}</span>
                            <span className="text-gray-500">Ignorados</span><span className="text-gray-700">{busca.ignorados}</span>
                            <span className="text-gray-500">Falhas</span><span className={busca.erros ? 'text-red-600' : 'text-gray-700'}>{busca.erros}</span>
                        </div>
                        {busca.ultimo_erro && <p className="text-sm text-red-600">{busca.ultimo_erro}</p>}
                        {emCurso && (
                            <p className="text-xs text-gray-500">
                                {rodando ? 'Lendo — cada parte leva até 2 minutos. ' : ''}
                                Se fechar este painel, a busca continua sozinha a cada 15 minutos.
                            </p>
                        )}
                        {busca.status === 'concluida' && (
                            <p className="text-xs text-gray-500">Os boletos criados estão em Boletos a Pagar › Em revisão, com Origem = E-mail.</p>
                        )}
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                            <div className="space-y-1.5">
                                <label className={ROTULO} htmlFor="ebus-de">De</label>
                                <input id="ebus-de" type="date" value={de} max={ate || hoje()} onChange={e => setDe(e.target.value)} className={CAMPO} />
                            </div>
                            <div className="space-y-1.5">
                                <label className={ROTULO} htmlFor="ebus-ate">Até</label>
                                <input id="ebus-ate" type="date" value={ate} min={de} max={hoje()} onChange={e => setAte(e.target.value)} className={CAMPO} />
                            </div>
                        </div>
                        <div className="flex gap-2 rounded-[10px] border border-blue-100 bg-blue-50 px-3 py-2.5 text-xs text-blue-800">
                            <Info className="w-4 h-4 shrink-0 mt-px" />
                            <p>
                                Lê os e-mails com PDF recebidos no período, uma vez, seguindo a regra da caixa
                                ({conta ? ROTULO_MODO[conta.modo].toLowerCase() : '—'}). E-mail já lido é pulado; boleto que já existe vira
                                “Duplicado” no histórico, sem criar outro. Tudo entra em revisão enquanto a caixa estiver em modo piloto.
                                A leitura automática de 15 em 15 minutos não muda.
                            </p>
                        </div>
                    </div>
                )}

                {erro && <p className="rounded-[10px] border border-red-100 bg-red-50 px-3 py-2.5 text-sm text-red-700">{erro}</p>}
            </SheetPanel>

            <SheetFooter>
                {emCurso ? (
                    <>
                        <button onClick={cancelar} className="h-9 px-3.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-[6px]">
                            Cancelar busca
                        </button>
                        {!rodando && conta && (
                            <button onClick={() => { vivo.current = true; avancar(conta.id); }}
                                className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95">
                                Continuar agora
                            </button>
                        )}
                        {rodando && (
                            <span className="flex items-center gap-1.5 h-9 px-3.5 text-[13px] font-medium text-blue-700">
                                <Loader2 className="w-4 h-4 animate-spin" /> Lendo…
                            </span>
                        )}
                    </>
                ) : busca ? (
                    <>
                        <button onClick={() => setBusca(null)} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px]">
                            Nova busca
                        </button>
                        <button onClick={onClose} className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95">
                            Fechar
                        </button>
                    </>
                ) : (
                    <>
                        <button onClick={onClose} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px]">Cancelar</button>
                        <button onClick={iniciar} disabled={!!motivoDesligado || rodando} title={motivoDesligado ?? undefined}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                            {rodando && <Loader2 className="w-4 h-4 animate-spin" />}
                            Buscar e-mails do período
                        </button>
                    </>
                )}
            </SheetFooter>
        </Sheet>
    );
};

export default EmailCaptureBuscaSheet;
