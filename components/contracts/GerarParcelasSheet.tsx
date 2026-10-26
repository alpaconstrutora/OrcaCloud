import React from 'react';
import { Loader2, ListPlus } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import Button from '../ui/Button';
import MoneyCentsInput from '../ui/MoneyCentsInput';
import { contractService, type ParcelaDoContrato } from '../../services/contractService';
import { supplierPaymentService } from '../../services/supplierPaymentService';
import type { Contract } from '../../types/contracts';
import { PERIODICIDADES_CONTRATO, type PeriodicidadeContrato } from '../../utils/contractInstallments';
import { planoDoGerador, vencimentoSugerido } from '../../utils/conferenciaParcelasContrato';
import { parcelaBaixada } from '../../utils/contratoParcelaVariavel';
import { hojeLocal } from '../../utils/baixaRecebivel';
import { destinoDasParcelas } from './CorrigirDivergenciaSheet';

/**
 * Contrato › Financeiro › Parcelas › "Gerar parcelas" (pedido de 26/10/2026).
 * Plano: docs/planos/2026-10-26-contrato-parcelas-conferencia-e-gerador.md (T3).
 *
 * Decisão do usuário: as parcelas PAGAS ficam; o saldo (Valor Atual − pago) vira N
 * parcelas novas que substituem as em aberto. Mesmo gerador dos Dados Gerais
 * (`gerarCronogramaContrato`), com prévia antes de gravar.
 */

const ROTULO = 'text-xs font-semibold text-slate-500';
const CAMPO = 'w-full h-9 px-3 bg-gray-50 border border-gray-100 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';
const fmtBRL = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dataBR = (iso: string | null | undefined) =>
    iso ? new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
const ASAAS_EM_CURSO = ['APPROVED', 'PENDING', 'SCHEDULED'];

interface Props {
    open: boolean;
    contrato: Contract;
    /** Valor Atual do contrato — o que as parcelas devem somar. */
    valorContrato: number;
    parcelas: ParcelaDoContrato[];
    onClose: () => void;
    onAplicado: (atualizado: Contract, mensagem: string) => Promise<void>;
}

const GerarParcelasSheet: React.FC<Props> = ({ open, contrato, valorContrato, parcelas, onClose, onAplicado }) => {
    const [qtd, setQtd] = React.useState(1);
    const [periodicidade, setPeriodicidade] = React.useState<PeriodicidadeContrato>('Mensal');
    const [primeiro, setPrimeiro] = React.useState('');
    const [entrada, setEntrada] = React.useState('');
    const [vencEntrada, setVencEntrada] = React.useState('');
    const [asaasEmCurso, setAsaasEmCurso] = React.useState<Set<string>>(new Set());
    const [verificando, setVerificando] = React.useState(false);
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const cronograma = React.useMemo(() => contrato.payment_schedule ?? [], [contrato.payment_schedule]);

    React.useEffect(() => {
        if (!open) return;
        const hoje = hojeLocal();
        const sugerido = vencimentoSugerido([], hoje);
        setQtd(1); setPeriodicidade('Mensal'); setPrimeiro(sugerido); setEntrada(''); setVencEntrada(hoje);
        setError(null); setSaving(false);
        const abertas = parcelas.filter(p => !parcelaBaixada(p) && p.status !== 'CANCELLED').map(p => p.id);
        if (!abertas.length) { setAsaasEmCurso(new Set()); setVerificando(false); return; }
        let vivo = true;
        setVerificando(true);
        supplierPaymentService.byTransactions(abertas)
            .then(mapa => {
                if (vivo) setAsaasEmCurso(new Set(Object.values(mapa)
                    .filter(sp => ASAAS_EM_CURSO.includes(sp.status) && sp.transaction_id)
                    .map(sp => sp.transaction_id as string)));
            })
            .catch(() => { if (vivo) setError('Não foi possível conferir os pagamentos Asaas das parcelas — feche e abra de novo.'); })
            .finally(() => { if (vivo) setVerificando(false); });
        return () => { vivo = false; };
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    const valorEntrada = entrada === '' ? 0 : Number(entrada) || 0;
    const plano = primeiro && qtd >= 1
        ? planoDoGerador(valorContrato, cronograma, parcelas, {
            parcelas: qtd, periodicidade, primeiroVencimento: primeiro, entrada: valorEntrada, vencimentoEntrada: vencEntrada || primeiro,
        }, asaasEmCurso)
        : { motivo: 'Informe o número de parcelas e o 1º vencimento.' };

    const pagas = parcelas.filter(p => parcelaBaixada(p) && p.status !== 'CANCELLED');
    const pago = pagas.reduce((s, p) => s + Number(p.original_amount ?? p.amount ?? 0), 0);
    const motivo = saving ? 'Gravando…'
        : verificando ? 'Verificando os pagamentos Asaas das parcelas…'
        : 'motivo' in plano ? plano.motivo : undefined;
    const novas = 'motivo' in plano ? [] : plano.cronograma.slice(plano.cronograma.length - (qtd + (valorEntrada > 0 ? 1 : 0)));
    const abertasSubstituidas = 'motivo' in plano ? 0 : plano.reescritas.length;

    const aplicar = async () => {
        if (motivo || 'motivo' in plano) return;
        setError(null);
        setSaving(true);
        try {
            const atualizado = await contractService.aplicarCronogramaCorrigido(contrato, plano.cronograma, plano.reescritas);
            await onAplicado(atualizado, `${novas.length} parcela(s) gerada(s) — elas entram em ${destinoDasParcelas(parcelas)}.`);
            onClose();
        } catch (e) {
            setError(e instanceof Error && e.message ? e.message : 'Não foi possível gerar as parcelas.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Sheet open={open} onClose={onClose} size="lg">
            <SheetHeader onClose={onClose}>
                <SheetTitle>Gerar parcelas</SheetTitle>
                <SheetDescription>
                    Valor do contrato {fmtBRL(valorContrato)} − pago {fmtBRL(pago)} = {fmtBRL(Math.max(0, valorContrato - pago))} a parcelar
                </SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-6 space-y-6">
                {error && <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-[6px] text-sm text-red-600">{error}</div>}

                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                    <div className="space-y-1.5">
                        <label htmlFor="gerar-qtd" className={ROTULO}>Nº de parcelas</label>
                        <input id="gerar-qtd" type="number" min={1} max={360} value={qtd}
                            onChange={e => setQtd(Math.max(1, Math.min(360, Math.floor(Number(e.target.value) || 1))))} className={CAMPO} />
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor="gerar-periodicidade" className={ROTULO}>Periodicidade</label>
                        <select id="gerar-periodicidade" value={periodicidade} onChange={e => setPeriodicidade(e.target.value as PeriodicidadeContrato)}
                            className={`${CAMPO} appearance-none cursor-pointer`}>
                            {PERIODICIDADES_CONTRATO.map(p => <option key={p.value} value={p.value}>{p.value}</option>)}
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor="gerar-primeiro" className={ROTULO}>1º vencimento</label>
                        <input id="gerar-primeiro" type="date" value={primeiro} onChange={e => setPrimeiro(e.target.value)} className={CAMPO} />
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor="gerar-entrada" className={ROTULO}>Entrada (opcional, R$)</label>
                        <MoneyCentsInput id="gerar-entrada" value={entrada} onChange={setEntrada} className={CAMPO} />
                    </div>
                    {valorEntrada > 0 && (
                        <div className="space-y-1.5">
                            <label htmlFor="gerar-venc-entrada" className={ROTULO}>Vencimento da entrada</label>
                            <input id="gerar-venc-entrada" type="date" value={vencEntrada} onChange={e => setVencEntrada(e.target.value)} className={CAMPO} />
                        </div>
                    )}
                </div>

                {motivo && !saving && (
                    <p className="px-3 py-2.5 bg-amber-50 border border-amber-100 rounded-[6px] text-sm text-amber-800">{motivo}</p>
                )}

                {!('motivo' in plano) && (
                    <div className="space-y-1.5">
                        <p className={ROTULO}>Prévia</p>
                        <p className="text-xs text-gray-500">
                            {pagas.length ? `${pagas.length} parcela(s) paga(s) ficam como estão. ` : ''}
                            {abertasSubstituidas ? `${abertasSubstituidas} em aberto serão substituídas.` : ''}
                        </p>
                        <div className="overflow-x-auto rounded-[10px] border border-gray-100">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-white text-gray-700 font-semibold text-xs border-b border-gray-200">
                                        <th className="px-3 py-2 border-r border-gray-100">#</th>
                                        <th className="px-3 py-2 border-r border-gray-100">Vencimento</th>
                                        <th className="px-3 py-2 text-right">Valor</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {novas.map((l, i) => (
                                        <tr key={i}>
                                            <td className="px-3 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600">{i + 1}</td>
                                            <td className="px-3 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-700">{dataBR(l.date)}</td>
                                            <td className="px-3 py-2.5 text-sm font-medium text-gray-800 text-right">{fmtBRL(Number(l.value))}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </SheetPanel>
            <SheetFooter>
                <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                <span className="inline-flex" title={motivo}>
                    <Button variant="primary" onClick={aplicar} disabled={!!motivo}>
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListPlus className="w-4 h-4" />}
                        Gerar parcelas
                    </Button>
                </span>
            </SheetFooter>
        </Sheet>
    );
};

export default GerarParcelasSheet;
