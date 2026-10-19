import React from 'react';
import { Save, Loader2, PencilLine } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import Button from '../ui/Button';
import MoneyCentsInput from '../ui/MoneyCentsInput';
import type { ParcelaDoContrato } from '../../services/contractService';

/**
 * Suprimentos › Contratos › Financeiro › Parcelas: alterar à mão o valor de UMA parcela.
 * Plano: docs/planos/2026-10-19-contrato-alterar-valor-da-parcela.md.
 *
 * O campo é o valor BRUTO da parcela (o desconto, se houver, continua aplicado — o
 * líquido aparece logo abaixo). A gravação é do pai (`onSalvar`): ele chama
 * `contractService.updateFinancialEntry`, recarrega a lista e pergunta se o valor do
 * contrato acompanha.
 */

const ORIGEM: Record<string, string> = {
    CONTRACT_AVISTA: 'À Vista', CONTRACT_PARCELADO: 'Parcela', CONTRACT_RECURRING: 'Recorrência', CONTRACT_MEASUREMENT: 'Medição',
};

const ROTULO = 'text-xs font-semibold text-slate-500';
const CAMPO = 'w-full h-9 px-3 bg-gray-50 border border-gray-100 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';

/** R$ sempre com centavos — `fmtBRL` arredonda para inteiro, e aqui o centavo é o dado. */
const fmtBRL = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const dataBR = (iso: string | null | undefined) =>
    iso ? new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : '—';

/** "Alterado por Fulano em 19/10/2026 14:32" — usado também na célula da tabela. */
export function descreverAlteracaoManual(p: Pick<ParcelaDoContrato,
    'valor_manual' | 'valor_manual_em' | 'valor_manual_por_nome' | 'valor_manual_anterior'>): string | null {
    if (!p.valor_manual) return null;
    const em = p.valor_manual_em ? new Date(p.valor_manual_em) : null;
    const quando = em
        ? `${em.toLocaleDateString('pt-BR')} ${em.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
        : null;
    const partes = [`Alterado manualmente por ${p.valor_manual_por_nome || 'usuário'}${quando ? ` em ${quando}` : ''}`];
    if (p.valor_manual_anterior != null) partes.push(`valor gerado pelo contrato: ${fmtBRL(Number(p.valor_manual_anterior))}`);
    return partes.join(' · ');
}

interface Props {
    parcela: ParcelaDoContrato | null;
    onClose: () => void;
    /** Grava o novo valor bruto. Lança erro com mensagem legível em caso de falha. */
    onSalvar: (parcela: ParcelaDoContrato, novoValor: number) => Promise<void>;
}

const AlterarValorParcelaSheet: React.FC<Props> = ({ parcela, onClose, onSalvar }) => {
    const bruto = parcela ? Number(parcela.original_amount ?? parcela.amount ?? 0) : 0;
    const [valor, setValor] = React.useState<string>('');
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!parcela) return;
        setValor(bruto ? bruto.toFixed(2) : '');
        setError(null);
        setSaving(false);
    }, [parcela?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!parcela) return null;

    const novo = valor === '' ? NaN : Number(valor);
    const mudou = Number.isFinite(novo) && Math.abs(novo - bruto) >= 0.005;
    const temDesconto = !!parcela.discount_type && !!parcela.discount_amount;
    const desconto = !temDesconto || !Number.isFinite(novo) ? 0
        : parcela.discount_type === 'PERCENT' ? (novo * Number(parcela.discount_amount)) / 100
        : Number(parcela.discount_amount);
    const liquido = Number.isFinite(novo) ? Math.max(0, novo - desconto) : 0;

    // Botão desligado sempre diz o motivo.
    const motivoDesligado = saving ? 'Salvando…'
        : !Number.isFinite(novo) || novo <= 0 ? 'Informe um valor maior que zero.'
        : !mudou ? 'O valor é o mesmo da parcela — altere-o para salvar.'
        : undefined;

    const historico = descreverAlteracaoManual(parcela);

    const handleSalvar = async () => {
        if (motivoDesligado) return;
        setError(null);
        setSaving(true);
        try {
            await onSalvar(parcela, Math.round(novo * 100) / 100);
            onClose();
        } catch (e) {
            setError(e instanceof Error && e.message ? e.message : 'Não foi possível alterar o valor da parcela.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Sheet open={!!parcela} onClose={onClose} size="md" dirty={mudou && !saving}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>Alterar valor da parcela</SheetTitle>
                <SheetDescription>{parcela.description || ORIGEM[parcela.source_system] || 'Parcela do contrato'}</SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-6 space-y-6">
                {error && (
                    <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-[6px] text-sm text-red-600">{error}</div>
                )}

                {/* Contexto da decisão (UI_PATTERNS §6.2): o que está sendo alterado. */}
                <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                    <div className="space-y-1.5">
                        <dt className={ROTULO}>Vencimento</dt>
                        <dd className="text-sm text-gray-900">{dataBR(parcela.transaction_date)}</dd>
                    </div>
                    <div className="space-y-1.5">
                        <dt className={ROTULO}>Origem</dt>
                        <dd className="text-sm text-gray-900">{ORIGEM[parcela.source_system] || parcela.source_system}</dd>
                    </div>
                    <div className="space-y-1.5">
                        <dt className={ROTULO}>Valor atual</dt>
                        <dd className="text-sm font-medium text-gray-900">{fmtBRL(bruto)}</dd>
                    </div>
                    {temDesconto && (
                        <div className="space-y-1.5">
                            <dt className={ROTULO}>Desconto</dt>
                            <dd className="text-sm text-gray-900">
                                {parcela.discount_type === 'PERCENT' ? `${Number(parcela.discount_amount)}%` : fmtBRL(Number(parcela.discount_amount))}
                            </dd>
                        </div>
                    )}
                </dl>

                {historico && (
                    <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-100 rounded-[6px] text-sm text-amber-800">
                        <PencilLine className="w-4 h-4 mt-0.5 shrink-0" />
                        <span>{historico}.</span>
                    </div>
                )}

                <div className="space-y-1.5">
                    <label htmlFor="novo-valor-parcela" className={ROTULO}>Novo valor (R$)</label>
                    <MoneyCentsInput
                        id="novo-valor-parcela"
                        autoFocus
                        value={valor}
                        onChange={setValor}
                        onKeyDown={e => { if (e.key === 'Enter') void handleSalvar(); }}
                        className={CAMPO}
                    />
                    {temDesconto && Number.isFinite(novo) && (
                        <p className="text-xs text-gray-500">Com o desconto, o valor a pagar fica {fmtBRL(liquido)}.</p>
                    )}
                    <p className="text-xs text-gray-500">
                        A parcela fica marcada como alterada manualmente: Lançar Financeiro, salvar os Dados Gerais e o
                        reajuste não sobrescrevem este valor.
                    </p>
                </div>
            </SheetPanel>
            <SheetFooter>
                <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                <span className="inline-flex" title={motivoDesligado}>
                    <Button variant="primary" onClick={handleSalvar} disabled={!!motivoDesligado}>
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Salvar valor
                    </Button>
                </span>
            </SheetFooter>
        </Sheet>
    );
};

export default AlterarValorParcelaSheet;
