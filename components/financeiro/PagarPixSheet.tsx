import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Loader2, Zap } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { supplierPaymentService, type PixQuote, type DestinoPix, type PixPayResult } from '../../services/supplierPaymentService';
import { validarChavePix, TIPOS_CHAVE_PIX, type TipoChavePix } from '../../utils/pixKey';
import { validateCpfCnpj } from '../../lib/validators';
import { formatMoney, formatDateBR } from '../ui/Format';

interface Props {
    /** Org do TÍTULO (não a do topo): o portão confere a org do título. */
    organizationId: string;
    transactionId: string;
    onClose: () => void;
    onDone: (r: PixPayResult) => void;
}

const INPUT = 'mt-1.5 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all';
const ROTULO_ORIGEM: Record<PixQuote['favorecido']['origem'], string> = {
    fornecedor: 'Fornecedor', colaborador: 'Colaborador', socio: 'Sócio', avulso: 'Sem cadastro',
};
const AVULSO = '__avulso__';
const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

/**
 * Pagar um título por PIX pela conta Asaas (Fase 3 —
 * docs/planos/2026-10-16-asaas-pendencias-e-pix.md).
 *
 * A chave de CADASTRO nunca chega aqui inteira: o servidor manda a opção
 * mascarada e uma `ref`; no disparo ele relê a chave pela `ref`. Só a chave
 * digitada (avulso) sai do navegador — com teto próprio e nome/documento
 * obrigatórios. O servidor reaplica o portão (papel, alçada, tetos, piloto,
 * competência) — a lista que aparece aqui é a mesma que ele usa.
 */
const dataHoraBR = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export default function PagarPixSheet({ organizationId, transactionId, onClose, onDone }: Props) {
    const [quote, setQuote] = useState<PixQuote | null>(null);
    const [erroQuote, setErroQuote] = useState<string | null>(null);
    const [escolha, setEscolha] = useState<string>('');
    const [tipo, setTipo] = useState<TipoChavePix | ''>('');
    const [chave, setChave] = useState('');
    const [nome, setNome] = useState('');
    const [documento, setDocumento] = useState('');
    const [agendar, setAgendar] = useState(false);
    const [data, setData] = useState('');
    const [confirmo, setConfirmo] = useState(false);
    const [enviando, setEnviando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);

    useEffect(() => {
        let vivo = true;
        supplierPaymentService.pixQuote(organizationId, transactionId)
            .then(q => {
                if (!vivo) return;
                setQuote(q);
                // Pré-seleciona a chave principal válida; sem cadastro, o modo digitado.
                const principal = q.opcoes.find(o => o.principal && !o.invalida) ?? q.opcoes.find(o => !o.invalida);
                setEscolha(principal ? principal.ref : AVULSO);
                if (!principal) {
                    setNome(q.favorecido.nome ?? '');
                    setDocumento(q.favorecido.documento ?? '');
                }
            })
            .catch(e => { if (vivo) setErroQuote(e instanceof Error ? e.message : String(e)); });
        return () => { vivo = false; };
    }, [organizationId, transactionId]);

    const avulso = escolha === AVULSO;
    const opcao = quote?.opcoes.find(o => o.ref === escolha) ?? null;
    const bloqueios = quote ? (avulso ? quote.bloqueios_avulso : quote.bloqueios) : [];
    const chaveDigitada = avulso ? validarChavePix(tipo || null, chave) : null;

    // Motivo do botão desabilitado — sempre dito (regra do produto).
    const motivo = useMemo(() => {
        if (!quote) return erroQuote ? 'Não foi possível carregar os dados do pagamento.' : 'Carregando…';
        if (bloqueios.length) return bloqueios[0];
        if (!escolha) return 'Escolha a chave PIX.';
        if (opcao?.invalida) return `Chave do cadastro inválida: ${opcao.invalida}`;
        if (opcao?.quarentena?.bloqueiaVoce) {
            return `Você alterou esta chave há menos de 24 h: outro administrador precisa enviar este PIX (ou aguarde até ${dataHoraBR(opcao.quarentena.liberaEm)}).`;
        }
        if (avulso) {
            if (!chaveDigitada?.ok) return chaveDigitada?.motivo ?? 'Informe a chave PIX.';
            if (!nome.trim()) return 'Informe o nome do favorecido.';
            if (!validateCpfCnpj(documento)) return 'Informe o CPF/CNPJ válido do favorecido.';
        }
        if (agendar && (!data || data <= hoje())) return 'Escolha uma data futura para o agendamento.';
        if (!confirmo) return 'Marque a confirmação do favorecido e do valor.';
        return null;
    }, [quote, erroQuote, bloqueios, escolha, opcao, avulso, chaveDigitada, nome, documento, agendar, data, confirmo]);

    async function enviar() {
        if (motivo || !quote) return;
        setEnviando(true);
        setErro(null);
        try {
            const destino: DestinoPix = avulso
                ? { avulso: { tipo: tipo as string, chave, nome: nome.trim(), documento } }
                : { ref: escolha };
            const r = await supplierPaymentService.pixPay(organizationId, transactionId, destino, agendar ? data : undefined);
            onDone(r);
        } catch (e) {
            setErro(e instanceof Error ? e.message : String(e));
            setEnviando(false);
        }
    }

    return (
        <Sheet open onClose={onClose} size="md" dirty={enviando}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>Pagar por PIX</SheetTitle>
                <SheetDescription>
                    {quote?.conta?.env === 'sandbox' ? 'Conta Asaas em SANDBOX — nenhum dinheiro real sai.' : 'Transferência PIX pela conta Asaas da organização.'}
                </SheetDescription>
            </SheetHeader>
            <SheetPanel className="p-6 space-y-5">
                {!quote && !erroQuote && (
                    <div className="flex items-center gap-2 text-sm text-gray-400"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>
                )}
                {erroQuote && <p className="text-sm text-red-700 bg-red-50 rounded-[6px] p-3">{erroQuote}</p>}

                {quote && (
                    <>
                        <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-1.5 text-sm">
                            <dt className="text-gray-500">Título</dt>
                            <dd className="text-gray-700">{quote.titulo.descricao ?? '—'}</dd>
                            <dt className="text-gray-500">Valor</dt>
                            <dd className="text-gray-900 font-medium">{formatMoney(quote.titulo.valor)}</dd>
                            <dt className="text-gray-500">Vencimento</dt>
                            <dd className="text-gray-700">{formatDateBR(quote.titulo.vencimento)}</dd>
                            <dt className="text-gray-500">Favorecido</dt>
                            <dd className="text-gray-700">
                                {quote.favorecido.nome ?? quote.titulo.credor ?? '—'}
                                <span className="ml-1.5 text-xs text-gray-400">{ROTULO_ORIGEM[quote.favorecido.origem]}</span>
                            </dd>
                        </dl>
                        {quote.favorecido.motivo && (
                            <p className="text-xs text-gray-500 bg-gray-50 rounded-[6px] p-2.5">{quote.favorecido.motivo}</p>
                        )}

                        <div>
                            <label className="text-xs font-semibold text-slate-500">Chave PIX</label>
                            <div className="mt-1.5 flex flex-col gap-2">
                                {quote.opcoes.map(o => (
                                    <label key={o.ref} className={`flex items-start gap-2.5 p-2.5 rounded-[6px] border text-sm cursor-pointer ${escolha === o.ref ? 'border-blue-500 bg-blue-50/40' : 'border-gray-200'} ${o.invalida ? 'opacity-70' : ''}`}>
                                        <input type="radio" name="chave-pix" checked={escolha === o.ref} onChange={() => setEscolha(o.ref)} className="mt-0.5" />
                                        <span className="min-w-0">
                                            <span className="block text-gray-800">{o.chaveMascarada} <span className="text-xs text-gray-400">{o.tipo ? TIPOS_CHAVE_PIX.find(t => t.value === o.tipo)?.label : 'tipo desconhecido'}</span></span>
                                            <span className="block text-xs text-gray-500">{o.rotulo}{o.titular ? ` · ${o.titular}` : ''}</span>
                                            {o.invalida && <span className="block text-xs text-red-600">{o.invalida}</span>}
                                            {o.titularDiferente && <span className="block text-xs text-amber-700">Titular diferente autorizado no cadastro</span>}
                                            {o.quarentena && (
                                                <span className={`block text-xs ${o.quarentena.bloqueiaVoce ? 'text-red-600' : 'text-amber-700'}`}>
                                                    {o.quarentena.bloqueiaVoce
                                                        ? `Você alterou esta chave em ${dataHoraBR(o.quarentena.alteradaEm)}: outro administrador precisa enviar (ou aguarde até ${dataHoraBR(o.quarentena.liberaEm)}).`
                                                        : `Chave alterada em ${dataHoraBR(o.quarentena.alteradaEm)} por ${o.quarentena.por} — confira com o favorecido antes de pagar.`}
                                                </span>
                                            )}
                                        </span>
                                    </label>
                                ))}
                                <label className={`flex items-center gap-2.5 p-2.5 rounded-[6px] border text-sm cursor-pointer ${avulso ? 'border-blue-500 bg-blue-50/40' : 'border-gray-200'}`}>
                                    <input type="radio" name="chave-pix" checked={avulso} onChange={() => setEscolha(AVULSO)} />
                                    <span className="text-gray-800">Digitar outra chave <span className="text-xs text-gray-400">(teto de PIX avulso)</span></span>
                                </label>
                            </div>
                        </div>

                        {avulso && (
                            <div className="space-y-3">
                                <div className="grid grid-cols-[9rem_1fr] gap-2">
                                    <div>
                                        <label className="text-xs font-semibold text-slate-500">Tipo</label>
                                        <select value={tipo} onChange={e => setTipo(e.target.value as TipoChavePix)} className={INPUT}>
                                            <option value="">Selecione…</option>
                                            {TIPOS_CHAVE_PIX.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs font-semibold text-slate-500">Chave</label>
                                        <input value={chave} onChange={e => setChave(e.target.value)} className={INPUT} autoComplete="off" />
                                    </div>
                                </div>
                                {chave && chaveDigitada && !chaveDigitada.ok && tipo && (
                                    <p className="text-xs text-red-600">{chaveDigitada.motivo}</p>
                                )}
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-xs font-semibold text-slate-500">Nome do favorecido</label>
                                        <input value={nome} onChange={e => setNome(e.target.value)} className={INPUT} />
                                    </div>
                                    <div>
                                        <label className="text-xs font-semibold text-slate-500">CPF/CNPJ do favorecido</label>
                                        <input value={documento} onChange={e => setDocumento(e.target.value)} className={INPUT} />
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                                <input type="checkbox" checked={agendar} onChange={e => setAgendar(e.target.checked)}
                                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                                Agendar para outra data
                            </label>
                            {agendar && (
                                <input type="date" value={data} min={hoje()} onChange={e => setData(e.target.value)} className={`${INPUT} max-w-[12rem]`} />
                            )}
                        </div>

                        {bloqueios.length > 0 && (
                            <div className="text-xs text-amber-800 bg-amber-50 rounded-[6px] p-3 space-y-1">
                                <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle className="w-3.5 h-3.5" /> Não é possível pagar agora</p>
                                <ul className="list-disc pl-5 space-y-0.5">
                                    {bloqueios.map(b => <li key={b}>{b}</li>)}
                                </ul>
                            </div>
                        )}

                        <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                            <input type="checkbox" checked={confirmo} onChange={e => setConfirmo(e.target.checked)}
                                className="w-4 h-4 mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                            Confirmo o favorecido e o valor de {formatMoney(quote.titulo.valor)}. O PIX não pode ser desfeito depois de concluído.
                        </label>

                        {erro && <p className="text-sm text-red-700 bg-red-50 rounded-[6px] p-3">{erro}</p>}
                    </>
                )}
            </SheetPanel>
            <SheetFooter>
                {motivo && quote && <span className="mr-auto text-xs text-gray-500 max-w-[60%]">{motivo}</span>}
                <button type="button" onClick={onClose} className="h-9 px-3.5 text-gray-500 hover:text-gray-700 font-medium text-[13px] transition-all">
                    Cancelar
                </button>
                <button
                    type="button"
                    onClick={enviar}
                    disabled={!!motivo || enviando}
                    title={motivo ?? undefined}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : (agendar ? <Check className="w-4 h-4" /> : <Zap className="w-4 h-4" />)}
                    {agendar ? 'Agendar PIX' : 'Enviar PIX'}
                </button>
            </SheetFooter>
        </Sheet>
    );
}
