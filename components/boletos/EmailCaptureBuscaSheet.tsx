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
import { CalendarSearch, Loader2, Info, Users, X } from 'lucide-react';
import { normalizarFiltroRemetente } from '../../utils/emailCaptureRegras';
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
    type RemetenteCaptura,
} from '../../services/emailCaptureService';

const ROTULO = 'text-xs font-semibold text-slate-500';
const CAMPO = 'w-full px-3 h-9 bg-gray-50 border border-gray-100 rounded-[6px] text-sm text-gray-900 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all disabled:opacity-60';

/** Data LOCAL em AAAA-MM-DD — `toISOString()` é UTC e, depois das 21h em Brasília, já dá o dia seguinte. */
const dataLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hoje = () => dataLocal(new Date());
const diasAtras = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return dataLocal(d); };
const ativa = (b: BuscaPeriodo | null) => !!b && (b.status === 'pendente' || b.status === 'em_andamento');
const br = (d: string) => d.split('-').reverse().join('/');
const mesAtual = () => hoje().slice(0, 7);

/** "2026-09" → 01/09 a 30/09; mês corrente vai só até hoje (a busca não aceita futuro). */
export function periodoDoMes(mes: string, hojeLocal = hoje()): { de: string; ate: string } | null {
    const m = /^(\d{4})-(\d{2})$/.exec(mes);
    if (!m) return null;
    const ano = Number(m[1]), mm = Number(m[2]);
    if (mm < 1 || mm > 12) return null;
    const ultimo = new Date(ano, mm, 0).getDate();
    const de = `${m[1]}-${m[2]}-01`;
    const fim = `${m[1]}-${m[2]}-${String(ultimo).padStart(2, '0')}`;
    if (de > hojeLocal) return null;
    return { de, ate: fim > hojeLocal ? hojeLocal : fim };
}

/** Rótulo de um remetente monitorado como item do filtro (e-mail exato ou domínio). */
const alvoDoRemetente = (r: RemetenteCaptura) => (r.tipo === 'exato' ? r.email : r.dominio) ?? '';

interface Props {
    open: boolean;
    onClose: () => void;
    conta: ContaCaptura | null;
    /** Busca em andamento desta caixa, se houver — o painel retoma em vez de pedir datas. */
    buscaAtiva: BuscaPeriodo | null;
    onAtualizada: (b: BuscaPeriodo) => void;
    /** Remetentes monitorados desta caixa — viram opções do filtro. */
    remetentesDaCaixa?: RemetenteCaptura[];
}

const EmailCaptureBuscaSheet: React.FC<Props> = ({ open, onClose, conta, buscaAtiva, onAtualizada, remetentesDaCaixa = [] }) => {
    const confirm = useConfirm();
    const [de, setDe] = useState(diasAtras(30));
    const [ate, setAte] = useState(hoje());
    const [busca, setBusca] = useState<BuscaPeriodo | null>(null);
    const [rodando, setRodando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [mes, setMes] = useState('');
    // Remetentes: 'todos' (regra da caixa) ou 'escolhidos' (marcados + digitados).
    const [escopo, setEscopo] = useState<'todos' | 'escolhidos'>('todos');
    const [marcados, setMarcados] = useState<string[]>([]);
    const [extras, setExtras] = useState<string[]>([]);
    const [digitado, setDigitado] = useState('');
    const [erroDigitado, setErroDigitado] = useState<string | null>(null);
    const vivo = useRef(false);

    useEffect(() => {
        if (!open) { vivo.current = false; return; }
        vivo.current = true;
        setErro(null);
        setBusca(buscaAtiva);
        setDe(diasAtras(30));
        setAte(hoje());
        setMes('');
        setEscopo('todos');
        setMarcados([]);
        setExtras([]);
        setDigitado('');
        setErroDigitado(null);
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

    const filtroEscolhido = escopo === 'escolhidos' ? [...new Set([...marcados, ...extras])] : [];

    function escolherMes(valor: string) {
        setMes(valor);
        const p = periodoDoMes(valor);
        if (p) { setDe(p.de); setAte(p.ate); }
    }

    function alternarMarcado(alvo: string) {
        setMarcados(prev => prev.includes(alvo) ? prev.filter(x => x !== alvo) : [...prev, alvo]);
    }

    function adicionarDigitado() {
        const f = normalizarFiltroRemetente(digitado);
        if (!f) { setErroDigitado('Use um e-mail (cobranca@fornecedor.com.br) ou um domínio (fornecedor.com.br).'); return; }
        setErroDigitado(null);
        setExtras(prev => prev.includes(f.valor) || marcados.includes(f.valor) ? prev : [...prev, f.valor]);
        setDigitado('');
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
                        : escopo === 'escolhidos' && filtroEscolhido.length === 0
                            ? 'Escolha ao menos um remetente (ou volte para "Todos").'
                            : filtroEscolhido.length > 20
                                ? 'No máximo 20 remetentes por busca.'
                                : null;

    function iniciar() {
        if (motivoDesligado || !conta) return;
        setErro(null);
        avancar(conta.id, emailCaptureService.buscarPeriodo(conta.id, de, ate, filtroEscolhido));
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
                            <span className="text-gray-500" title="Boleto que já estava cadastrado: lido antes nesta caixa, ou mesmo arquivo/linha digitável de outro boleto">Já existiam</span><span className="text-gray-700">{busca.duplicados}</span>
                            <span className="text-gray-500">Ignorados</span><span className="text-gray-700">{busca.ignorados}</span>
                            <span className="text-gray-500">Falhas</span><span className={busca.erros ? 'text-red-600' : 'text-gray-700'}>{busca.erros}</span>
                        </div>
                        <p className="text-sm text-gray-600">
                            <span className="text-gray-500">Remetentes: </span>
                            {busca.remetentes?.length ? busca.remetentes.join(', ') : 'todos (regra da caixa)'}
                        </p>
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
                    <div className="space-y-8">
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                            <div className="space-y-1.5 col-span-2">
                                <label className={ROTULO} htmlFor="ebus-mes">Mês inteiro (atalho)</label>
                                <input id="ebus-mes" type="month" value={mes} max={mesAtual()} onChange={e => escolherMes(e.target.value)} className={CAMPO} />
                            </div>
                            <div className="space-y-1.5">
                                <label className={ROTULO} htmlFor="ebus-de">De</label>
                                <input id="ebus-de" type="date" value={de} max={ate || hoje()} onChange={e => setDe(e.target.value)} className={CAMPO} />
                            </div>
                            <div className="space-y-1.5">
                                <label className={ROTULO} htmlFor="ebus-ate">Até</label>
                                <input id="ebus-ate" type="date" value={ate} min={de} max={hoje()} onChange={e => setAte(e.target.value)} className={CAMPO} />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                            <Users className="w-4 h-4 text-blue-600" />
                            <h3 className="text-sm font-semibold text-gray-900">Remetentes</h3>
                        </div>
                        <div className="flex flex-col gap-2 text-sm text-gray-700">
                            <label className="flex items-center gap-2">
                                <input type="radio" name="ebus-escopo" checked={escopo === 'todos'} onChange={() => setEscopo('todos')}
                                    className="w-4 h-4 text-blue-600 focus:ring-blue-500" />
                                Todos — conforme a regra da caixa ({conta ? ROTULO_MODO[conta.modo].toLowerCase() : '—'})
                            </label>
                            <label className="flex items-center gap-2">
                                <input type="radio" name="ebus-escopo" checked={escopo === 'escolhidos'} onChange={() => setEscopo('escolhidos')}
                                    className="w-4 h-4 text-blue-600 focus:ring-blue-500" />
                                Só os remetentes que eu escolher
                            </label>
                        </div>
                        {escopo === 'escolhidos' && (
                            <div className="space-y-4">
                                {remetentesDaCaixa.length > 0 ? (
                                    <div className="space-y-1.5">
                                        <p className={ROTULO}>Remetentes monitorados</p>
                                        <div className="space-y-1.5">
                                            {remetentesDaCaixa.map(r => {
                                                const alvo = alvoDoRemetente(r);
                                                if (!alvo) return null;
                                                return (
                                                    <label key={r.id} className="flex items-center gap-2 text-sm text-gray-700">
                                                        <input type="checkbox" checked={marcados.includes(alvo)} onChange={() => alternarMarcado(alvo)}
                                                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                                                        <span className="truncate">{r.nome || alvo}</span>
                                                        <span className="text-gray-400 truncate">{r.tipo === 'dominio' ? `@${alvo} (domínio)` : alvo}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-xs text-gray-500">Nenhum remetente monitorado nesta caixa — digite abaixo.</p>
                                )}
                                <div className="space-y-1.5">
                                    <label className={ROTULO} htmlFor="ebus-outro">Outro e-mail ou domínio</label>
                                    <div className="flex gap-2">
                                        <input id="ebus-outro" value={digitado} onChange={e => { setDigitado(e.target.value); setErroDigitado(null); }}
                                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionarDigitado(); } }}
                                            placeholder="energisaonline.com.br" className={CAMPO} />
                                        <button type="button" onClick={adicionarDigitado} disabled={!digitado.trim()}
                                            title={!digitado.trim() ? 'Digite um e-mail ou domínio' : undefined}
                                            className="h-9 px-3.5 shrink-0 bg-white border border-gray-200 text-blue-600 rounded-[6px] hover:bg-blue-50 font-medium text-[13px] disabled:opacity-50 disabled:cursor-not-allowed">
                                            Adicionar
                                        </button>
                                    </div>
                                    {erroDigitado && <p className="text-xs text-red-600">{erroDigitado}</p>}
                                    {extras.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5 pt-1">
                                            {extras.map(x => (
                                                <span key={x} className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-[6px] border border-gray-200 bg-white text-sm text-gray-700">
                                                    {x}
                                                    <button type="button" onClick={() => setExtras(prev => prev.filter(y => y !== x))} title={`Tirar ${x}`}
                                                        className="p-0.5 rounded-[4px] text-gray-400 hover:text-red-600 hover:bg-red-50">
                                                        <X className="w-3.5 h-3.5" />
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <p className="text-xs text-gray-500">
                                    {filtroEscolhido.length} escolhido(s). Domínio inclui os subdomínios. Com remetentes escolhidos,
                                    a busca lê só os e-mails deles — mesmo que a regra da caixa os deixasse de fora.
                                </p>
                            </div>
                        )}
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
