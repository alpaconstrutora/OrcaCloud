import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRightLeft, Loader2 } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { useConfirm } from '../ui/confirm';
import { asaasContaService, type CotacaoSaque } from '../../services/asaasContaService';
import { formatMoney } from '../ui/Format';

interface Props {
    /** Org DONA da conta Asaas (não a do topo): a Edge confere que a conta é dela. */
    organizationId: string;
    paymentAccountId: string;
    env: 'sandbox' | 'production';
    onClose: () => void;
    onDone: (texto: string) => void;
}

const INPUT = 'mt-1.5 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal text-gray-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all';

/** "1.234,56" / "1234.56" / "1234,5" → número; vazio ou inválido → NaN. */
export function lerValorBR(texto: string): number {
    const t = texto.trim().replace(/\s|R\$/g, '');
    if (!t) return NaN;
    const normal = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
    return /^\d+(\.\d{1,2})?$/.test(normal) ? Number(normal) : NaN;
}

/**
 * Financeiro › Conta Asaas › "Transferir para o banco" — saldo da conta Asaas
 * para uma conta bancária PRÓPRIA da mesma organização, por PIX, sem título.
 * Plano: docs/planos/2026-11-09-conta-asaas-tela-financeiro.md (PR 2).
 *
 * Quem decide se pode é o servidor (`saque_quote` devolve os bloqueios de cada
 * destino; `saque_pay` confere de novo com o valor). A tela só mostra o motivo
 * antes de a pessoa tentar.
 */
export default function TransferirSaldoSheet({ organizationId, paymentAccountId, env, onClose, onDone }: Props) {
    const confirm = useConfirm();
    const [cotacao, setCotacao] = useState<CotacaoSaque | null>(null);
    const [erroCotacao, setErroCotacao] = useState<string | null>(null);
    const [destinoId, setDestinoId] = useState('');
    const [valorTexto, setValorTexto] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);

    useEffect(() => {
        let vivo = true;
        asaasContaService.saqueCotacao(organizationId, paymentAccountId)
            .then(c => {
                if (!vivo) return;
                setCotacao(c);
                const livre = c.destinos.find(d => !d.bloqueios.length) ?? c.destinos[0];
                if (livre) setDestinoId(livre.id);
            })
            .catch(e => { if (vivo) setErroCotacao(e instanceof Error ? e.message : String(e)); });
        return () => { vivo = false; };
    }, [organizationId, paymentAccountId]);

    const destino = cotacao?.destinos.find(d => d.id === destinoId) ?? null;
    const valor = lerValorBR(valorTexto);
    const saldo = cotacao?.saldo ?? null;

    const motivo = useMemo(() => {
        if (!cotacao) return null;
        if (saldo == null) return `Não foi possível ler o saldo na Asaas${cotacao.saldo_erro ? ` (${cotacao.saldo_erro})` : ''}.`;
        if (!cotacao.destinos.length) return 'A organização não tem outra conta bancária ativa para receber (Minha Organização › Contas).';
        if (!destino) return 'Escolha a conta de destino.';
        if (destino.bloqueios.length) return destino.bloqueios[0];
        if (!(valor > 0)) return 'Informe o valor a transferir.';
        if (valor > saldo + 0.004) return `O valor passa do saldo disponível (${formatMoney(saldo)}).`;
        return null;
    }, [cotacao, saldo, destino, valor]);

    async function enviar() {
        if (motivo || !destino) return;
        const ok = await confirm({
            title: `Transferir ${formatMoney(valor)}?`,
            message: `Sai da conta Asaas${env === 'sandbox' ? ' (SANDBOX)' : ''} por PIX para ${destino.nome} (${destino.titular ?? 'titular não informado'}), chave ${destino.chave}. A Asaas confere o titular pelo CNPJ antes de liberar.`,
            variant: 'warning',
            confirmLabel: 'Transferir',
            cancelLabel: 'Voltar',
        });
        if (!ok) return;
        setEnviando(true);
        setErro(null);
        try {
            const r = await asaasContaService.saqueEnviar(organizationId, paymentAccountId, destino.id, valor);
            onDone(r.aguardando_autorizacao
                ? `Transferência de ${formatMoney(valor)} criada na Asaas, aguardando autorização (token) no painel da Asaas.`
                : `Transferência de ${formatMoney(valor)} para ${destino.nome} enviada (${r.status ?? 'em processamento'}). Ela aparece no extrato quando a Asaas concluir.`);
        } catch (e) {
            setErro(e instanceof Error ? e.message : String(e));
        } finally {
            setEnviando(false);
        }
    }

    return (
        <Sheet open onClose={onClose} size="md" dirty={enviando}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>Transferir para o banco</SheetTitle>
                <SheetDescription>
                    {env === 'sandbox'
                        ? 'Conta Asaas em SANDBOX — nenhum dinheiro real sai.'
                        : 'PIX do saldo da conta Asaas para uma conta bancária própria da organização.'}
                </SheetDescription>
            </SheetHeader>
            <SheetPanel className="p-6 space-y-5">
                {!cotacao && !erroCotacao && (
                    <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Lendo o saldo na Asaas…</div>
                )}
                {erroCotacao && <p className="text-sm text-red-700 bg-red-50 rounded-[6px] p-3">{erroCotacao}</p>}

                {cotacao && (
                    <>
                        <dl className="grid grid-cols-[9rem_1fr] gap-x-4 gap-y-1.5 text-sm">
                            <dt className="text-gray-500">Saldo disponível</dt>
                            <dd className="text-gray-900 font-medium">{saldo == null ? '—' : formatMoney(saldo)}</dd>
                        </dl>

                        <div>
                            <label htmlFor="saque-destino" className="text-xs font-semibold text-slate-500">Conta de destino</label>
                            {cotacao.destinos.length === 0 ? (
                                <p className="mt-1.5 text-sm text-gray-700">
                                    Nenhuma outra conta bancária ativa nesta organização. Cadastre em Minha Organização › Contas, com a chave PIX.
                                </p>
                            ) : (
                                <select id="saque-destino" value={destinoId} onChange={e => setDestinoId(e.target.value)} className={INPUT}>
                                    {cotacao.destinos.map(d => (
                                        <option key={d.id} value={d.id}>{d.nome}{d.banco ? ` — ${d.banco}` : ''}</option>
                                    ))}
                                </select>
                            )}
                        </div>

                        {destino && (
                            <dl className="grid grid-cols-[9rem_1fr] gap-x-4 gap-y-1.5 text-sm">
                                <dt className="text-gray-500">Chave PIX</dt>
                                <dd className="text-gray-900">{destino.chave ?? '—'}</dd>
                                <dt className="text-gray-500">Titular esperado</dt>
                                <dd className="text-gray-900">{destino.titular ?? '—'}</dd>
                            </dl>
                        )}
                        {destino?.bloqueios.length ? (
                            <div className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-[6px] p-3">
                                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                                <ul className="space-y-1">{destino.bloqueios.map(b => <li key={b}>{b}</li>)}</ul>
                            </div>
                        ) : null}

                        <div>
                            <label htmlFor="saque-valor" className="text-xs font-semibold text-slate-500">Valor</label>
                            <div className="flex items-center gap-2">
                                <input
                                    id="saque-valor"
                                    inputMode="decimal"
                                    value={valorTexto}
                                    onChange={e => setValorTexto(e.target.value)}
                                    placeholder="0,00"
                                    className={INPUT}
                                />
                                <button
                                    type="button"
                                    onClick={() => saldo != null && setValorTexto(saldo.toFixed(2).replace('.', ','))}
                                    disabled={saldo == null || saldo <= 0}
                                    title={saldo == null ? 'Saldo não lido.' : saldo <= 0 ? 'Não há saldo para transferir.' : 'Preenche com o saldo inteiro.'}
                                    className="mt-1.5 h-9 px-3 shrink-0 border border-gray-200 rounded-[6px] text-[13px] font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Saldo todo
                                </button>
                            </div>
                        </div>

                        {erro && <p className="text-sm text-red-700 bg-red-50 rounded-[6px] p-3">{erro}</p>}
                    </>
                )}
            </SheetPanel>
            <SheetFooter>
                {motivo && cotacao && <span className="mr-auto text-xs text-gray-500 max-w-[60%]">{motivo}</span>}
                <button type="button" onClick={onClose} className="h-9 px-3.5 text-gray-500 hover:text-gray-700 font-medium text-[13px] transition-all">
                    Cancelar
                </button>
                <button
                    type="button"
                    onClick={enviar}
                    disabled={!cotacao || !!motivo || enviando}
                    title={motivo ?? (!cotacao ? 'Aguarde a leitura do saldo.' : undefined)}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
                    Transferir
                </button>
            </SheetFooter>
        </Sheet>
    );
}
