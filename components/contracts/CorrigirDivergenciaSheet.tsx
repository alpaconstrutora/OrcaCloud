import React from 'react';
import { Loader2, Check } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import Button from '../ui/Button';
import { contractService, type ParcelaDoContrato } from '../../services/contractService';
import { supplierPaymentService } from '../../services/supplierPaymentService';
import type { Contract, ContractAddendum, ContractInstallment } from '../../types/contracts';
import {
    baseParaCorrecao, motivoNaoAjustaContrato, motivoParaComplementar, novoValorOriginal, parcelaComplementar,
    planoDeDistribuicao, vencimentoSugerido, type Conferencia, type PlanoDeCronograma,
} from '../../utils/conferenciaParcelasContrato';
import { hojeLocal } from '../../utils/baixaRecebivel';

/**
 * Contrato › Financeiro › Parcelas › "Corrigir divergência" (pedido de 26/10/2026).
 * Plano: docs/planos/2026-10-26-contrato-parcelas-conferencia-e-gerador.md (T2).
 *
 * Três saídas, cada uma com a prévia ANTES de gravar: lançar a diferença numa parcela
 * nova, distribuí-la entre as abertas, ou ajustar o valor do contrato à soma das
 * parcelas. As regras (e as recusas, com o motivo) moram em
 * utils/conferenciaParcelasContrato; a gravação, em contractService.
 */

const ROTULO = 'text-xs font-semibold text-slate-500';
const CAMPO = 'w-full h-9 px-3 bg-gray-50 border border-gray-100 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';
const fmtBRL = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dataBR = (iso: string | null | undefined) =>
    iso ? new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : '—';

/** Pagamento Asaas em andamento (não concluído, não cancelado) — a parcela não se reescreve. */
const ASAAS_EM_CURSO = ['APPROVED', 'PENDING', 'SCHEDULED'];

type Opcao = 'complementar' | 'distribuir' | 'contrato';

/** Onde a parcela aparece: a alçada (aguardando aprovação) só vale para título a PAGAR. */
export const destinoDasParcelas = (parcelas: { direction?: string | null }[]) =>
    parcelas.some(p => p.direction === 'CREDIT') ? 'Contas a Receber' : 'Contas a Pagar, aguardando aprovação';

interface Props {
    open: boolean;
    contrato: Contract;
    conferencia: Conferencia;
    parcelas: ParcelaDoContrato[];
    aditivos: ContractAddendum[];
    onClose: () => void;
    /** Gravado: o pai troca o contrato e relê as parcelas (§22, sem recarregar a tela). */
    onAplicado: (atualizado: Contract, mensagem: string) => Promise<void>;
}

/** Linhas do cronograma com a marca do que muda — a prévia das opções de cronograma. */
function PreviaDoCronograma({ antes, depois }: { antes: ContractInstallment[]; depois: ContractInstallment[] }) {
    const soma = depois.reduce((s, l) => s + Number(l.value || 0), 0);
    return (
        <div className="space-y-1.5">
            <p className={ROTULO}>Prévia do cronograma</p>
            <div className="overflow-x-auto rounded-[10px] border border-gray-100">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-white text-gray-700 font-semibold text-xs border-b border-gray-200">
                            <th className="px-3 py-2 border-r border-gray-100">#</th>
                            <th className="px-3 py-2 border-r border-gray-100">Vencimento</th>
                            <th className="px-3 py-2 border-r border-gray-100 text-right">Antes</th>
                            <th className="px-3 py-2 text-right">Depois</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {depois.map((l, i) => {
                            const a = antes[i];
                            const mudou = !a || Math.abs(Number(a.value) - Number(l.value)) >= 0.005 || a.date !== l.date;
                            return (
                                <tr key={i}>
                                    <td className="px-3 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600">{i + 1}</td>
                                    <td className="px-3 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-700">{dataBR(l.date)}</td>
                                    <td className="px-3 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600 text-right">{a ? fmtBRL(Number(a.value)) : '—'}</td>
                                    <td className={`px-3 py-2.5 text-sm text-right ${mudou ? 'font-medium text-blue-700' : 'font-medium text-gray-800'}`}>
                                        {fmtBRL(Number(l.value))}{!a ? ' (nova)' : ''}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <p className="text-xs text-gray-500">Soma das parcelas passa a {fmtBRL(soma)}.</p>
        </div>
    );
}

const CorrigirDivergenciaSheet: React.FC<Props> = ({ open, contrato, conferencia, parcelas, aditivos, onClose, onAplicado }) => {
    const [opcao, setOpcao] = React.useState<Opcao>('complementar');
    const [vencimento, setVencimento] = React.useState('');
    const [asaasEmCurso, setAsaasEmCurso] = React.useState<Set<string>>(new Set());
    // Até a leitura do Asaas voltar, nada grava (a recusa por pagamento em andamento depende dela).
    const [verificando, setVerificando] = React.useState(false);
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const cronograma = React.useMemo(() => contrato.payment_schedule ?? [], [contrato.payment_schedule]);
    const base = React.useMemo(() => baseParaCorrecao(contrato, cronograma, parcelas), [contrato, cronograma, parcelas]);

    React.useEffect(() => {
        if (!open) return;
        setOpcao(conferencia.saldo > 0 ? 'complementar' : 'distribuir');
        setVencimento(vencimentoSugerido(base.cronograma, hojeLocal()));
        setError(null);
        setSaving(false);
        const abertas = parcelas.filter(p => p.status === 'PENDING').map(p => p.id);
        if (!abertas.length) { setAsaasEmCurso(new Set()); setVerificando(false); return; }
        let vivo = true;
        setVerificando(true);
        supplierPaymentService.byTransactions(abertas)
            .then(mapa => {
                if (!vivo) return;
                setAsaasEmCurso(new Set(Object.values(mapa)
                    .filter(sp => ASAAS_EM_CURSO.includes(sp.status) && sp.transaction_id)
                    .map(sp => sp.transaction_id as string)));
            })
            .catch(() => { if (vivo) setError('Não foi possível conferir os pagamentos Asaas das parcelas — feche e abra de novo.'); })
            .finally(() => { if (vivo) setVerificando(false); });
        return () => { vivo = false; };
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    const aditivosConf = aditivos.map(a => ({ number: a.number, value_impact: Number(a.value_impact || 0), status: a.status }));

    // Plano de cada opção — o mesmo cálculo da prévia é o que grava.
    const motivoComplemento = motivoParaComplementar(contrato, cronograma, parcelas, asaasEmCurso);
    const planoComplementar: PlanoDeCronograma = motivoComplemento ? { motivo: motivoComplemento } : conferencia.saldo > 0
        ? (vencimento
            ? { cronograma: parcelaComplementar(base.cronograma, conferencia.saldo, vencimento), reescritas: [] }
            : { motivo: 'Informe o vencimento da parcela.' })
        : { motivo: 'As parcelas excedem o contrato — não há diferença a lançar. Use "Distribuir" ou "Ajustar o valor do contrato".' };
    const planoDistribuir = planoDeDistribuicao(base.cronograma, base.parcelas, conferencia.saldo, asaasEmCurso);
    const motivoContrato = motivoNaoAjustaContrato(contrato, conferencia, aditivosConf, parcelas, asaasEmCurso);
    const novoOriginal = novoValorOriginal(conferencia, aditivosConf);

    const motivo = saving ? 'Gravando…'
        : verificando ? 'Verificando os pagamentos Asaas das parcelas…'
        : opcao === 'complementar' ? ('motivo' in planoComplementar ? planoComplementar.motivo : undefined)
        : opcao === 'distribuir' ? ('motivo' in planoDistribuir ? planoDistribuir.motivo : undefined)
        : motivoContrato ?? undefined;

    const aplicar = async () => {
        if (motivo) return;
        setError(null);
        setSaving(true);
        try {
            if (opcao === 'contrato') {
                const atualizado = await contractService.ajustarValorDoContrato(contrato, novoOriginal);
                await onAplicado(atualizado, `Valor Original ajustado para ${fmtBRL(novoOriginal)}.`);
            } else {
                const plano = (opcao === 'complementar' ? planoComplementar : planoDistribuir) as { cronograma: ContractInstallment[]; reescritas: string[] };
                const atualizado = await contractService.aplicarCronogramaCorrigido(contrato, plano.cronograma, plano.reescritas);
                await onAplicado(atualizado, opcao === 'complementar'
                    ? `Parcela de ${fmtBRL(conferencia.saldo)} lançada — ela entra em ${destinoDasParcelas(parcelas)}.`
                    : `Diferença distribuída entre as parcelas em aberto — as alteradas entram de novo em ${destinoDasParcelas(parcelas)}.`);
            }
            onClose();
        } catch (e) {
            setError(e instanceof Error && e.message ? e.message : 'Não foi possível corrigir a divergência.');
        } finally {
            setSaving(false);
        }
    };

    const radio = (valor: Opcao, titulo: string, texto: string) => (
        <label className={`flex items-start gap-3 p-3 rounded-[10px] border cursor-pointer transition-colors ${opcao === valor ? 'border-blue-300 bg-blue-50' : 'border-gray-100 hover:bg-gray-50'}`}>
            <input type="radio" name="opcao-divergencia" className="mt-1" checked={opcao === valor} onChange={() => setOpcao(valor)} />
            <span>
                <span className="block text-sm font-medium text-gray-900">{titulo}</span>
                <span className="block text-xs text-gray-500 mt-0.5">{texto}</span>
            </span>
        </label>
    );

    const descricaoSaldo = conferencia.saldo > 0
        ? `Faltam ${fmtBRL(conferencia.saldo)} em parcelas`
        : `As parcelas excedem o contrato em ${fmtBRL(-conferencia.saldo)}`;

    return (
        <Sheet open={open} onClose={onClose} size="lg">
            <SheetHeader onClose={onClose}>
                <SheetTitle>Corrigir divergência</SheetTitle>
                <SheetDescription>
                    {descricaoSaldo} · contrato {fmtBRL(conferencia.valorContrato)} · parcelas {fmtBRL(conferencia.somaParcelas)}
                </SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-6 space-y-6">
                {error && <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-[6px] text-sm text-red-600">{error}</div>}

                <div className="space-y-2">
                    {radio('complementar', 'Lançar uma parcela com a diferença',
                        conferencia.aditivosSemParcela.length
                            ? `Caminho natural aqui: ${conferencia.aditivosSemParcela.map(a => `${a.numero} (${fmtBRL(a.valor)})`).join(', ')} mudou o valor do contrato e não virou parcela.`
                            : 'Uma parcela nova com o valor que falta, no vencimento escolhido.')}
                    {radio('distribuir', 'Distribuir a diferença entre as parcelas em aberto',
                        'Partes iguais (centavos na última). Pagas não mudam; o vencimento de cada uma fica como está.')}
                    {radio('contrato', 'Ajustar o valor do contrato à soma das parcelas',
                        'Muda o Valor Original; os aditivos ficam como estão.')}
                </div>

                {opcao === 'complementar' && conferencia.saldo > 0 && (
                    <div className="space-y-1.5">
                        <label htmlFor="venc-complemento" className={ROTULO}>Vencimento da parcela</label>
                        <input id="venc-complemento" type="date" value={vencimento} onChange={e => setVencimento(e.target.value)} className={CAMPO} />
                    </div>
                )}

                {opcao !== 'contrato' && motivo && !saving && (
                    <p className="px-3 py-2.5 bg-amber-50 border border-amber-100 rounded-[6px] text-sm text-amber-800">{motivo}</p>
                )}
                {opcao === 'complementar' && !('motivo' in planoComplementar) && (
                    <PreviaDoCronograma antes={base.cronograma} depois={planoComplementar.cronograma} />
                )}
                {opcao === 'distribuir' && !('motivo' in planoDistribuir) && (
                    <PreviaDoCronograma antes={base.cronograma} depois={planoDistribuir.cronograma} />
                )}

                {opcao === 'contrato' && (motivoContrato
                    ? <p className="px-3 py-2.5 bg-amber-50 border border-amber-100 rounded-[6px] text-sm text-amber-800">{motivoContrato}</p>
                    : (
                        <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                            <div className="space-y-1.5">
                                <dt className={ROTULO}>Valor Original</dt>
                                <dd className="text-sm text-gray-900">{fmtBRL(Number(contrato.original_value ?? 0))} → <span className="font-medium text-blue-700">{fmtBRL(novoOriginal)}</span></dd>
                            </div>
                            <div className="space-y-1.5">
                                <dt className={ROTULO}>Valor Atual</dt>
                                <dd className="text-sm text-gray-900">{fmtBRL(conferencia.valorContrato)} → <span className="font-medium text-blue-700">{fmtBRL(conferencia.somaParcelas)}</span></dd>
                            </div>
                        </dl>
                    ))}
            </SheetPanel>
            <SheetFooter>
                <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                <span className="inline-flex" title={motivo}>
                    <Button variant="primary" onClick={aplicar} disabled={!!motivo}>
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        Aplicar correção
                    </Button>
                </span>
            </SheetFooter>
        </Sheet>
    );
};

export default CorrigirDivergenciaSheet;
