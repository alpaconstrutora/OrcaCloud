import React from 'react';
import { Save, Loader2, CalendarClock } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import Button from '../ui/Button';
import type { ParcelaDoContrato } from '../../services/contractService';

/**
 * Suprimentos › Contratos › Financeiro › Parcelas: alterar à mão o VENCIMENTO de UMA
 * parcela. Plano: docs/planos/2026-10-24-contrato-alterar-vencimento-da-parcela.md.
 *
 * Irmão de `AlterarValorParcelaSheet`: a gravação é do pai (`onSalvar`), que chama
 * `contractService.updateFinancialEntry({ due_date })` e recarrega a lista. A parcela
 * fica marcada (`vencimento_manual`) e os syncs do contrato mantêm a data dela.
 */

const ORIGEM: Record<string, string> = {
    CONTRACT_AVISTA: 'À Vista', CONTRACT_PARCELADO: 'Parcela', CONTRACT_RECURRING: 'Recorrência', CONTRACT_MEASUREMENT: 'Medição',
};

const ROTULO = 'text-xs font-semibold text-slate-500';
const CAMPO = 'w-full h-9 px-3 bg-gray-50 border border-gray-100 rounded-[6px] text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';

/** R$ sempre com centavos — `fmtBRL` arredonda para inteiro, e aqui o centavo é o dado. */
const fmtBRL = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const dataBR = (iso: string | null | undefined) =>
    iso ? new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : '—';

/** "Vencimento alterado manualmente por Fulano em 24/10/2026 14:32" — usado também na célula da tabela. */
export function descreverVencimentoManual(p: Pick<ParcelaDoContrato,
    'vencimento_manual' | 'vencimento_manual_em' | 'vencimento_manual_por_nome' | 'vencimento_manual_anterior'>): string | null {
    if (!p.vencimento_manual) return null;
    const em = p.vencimento_manual_em ? new Date(p.vencimento_manual_em) : null;
    const quando = em
        ? `${em.toLocaleDateString('pt-BR')} ${em.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
        : null;
    const partes = [`Vencimento alterado manualmente por ${p.vencimento_manual_por_nome || 'usuário'}${quando ? ` em ${quando}` : ''}`];
    if (p.vencimento_manual_anterior) partes.push(`vencimento gerado pelo contrato: ${dataBR(p.vencimento_manual_anterior)}`);
    return partes.join(' · ');
}

interface Props {
    parcela: ParcelaDoContrato | null;
    onClose: () => void;
    /** Grava a nova data (AAAA-MM-DD). Lança erro com mensagem legível em caso de falha. */
    onSalvar: (parcela: ParcelaDoContrato, novaData: string) => Promise<void>;
}

const AlterarVencimentoParcelaSheet: React.FC<Props> = ({ parcela, onClose, onSalvar }) => {
    const atual = parcela?.transaction_date?.slice(0, 10) ?? '';
    const [data, setData] = React.useState<string>('');
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!parcela) return;
        setData(atual);
        setError(null);
        setSaving(false);
    }, [parcela?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!parcela) return null;

    const mudou = !!data && data !== atual;

    // Botão desligado sempre diz o motivo.
    const motivoDesligado = saving ? 'Salvando…'
        : !data ? 'Informe a nova data de vencimento.'
        : !mudou ? 'A data é a mesma da parcela — altere-a para salvar.'
        : undefined;

    const historico = descreverVencimentoManual(parcela);

    const handleSalvar = async () => {
        if (motivoDesligado) return;
        setError(null);
        setSaving(true);
        try {
            await onSalvar(parcela, data);
            onClose();
        } catch (e) {
            setError(e instanceof Error && e.message ? e.message : 'Não foi possível alterar o vencimento da parcela.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Sheet open={!!parcela} onClose={onClose} size="md" dirty={mudou && !saving}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>Alterar vencimento da parcela</SheetTitle>
                <SheetDescription>{parcela.description || ORIGEM[parcela.source_system] || 'Parcela do contrato'}</SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-6 space-y-6">
                {error && (
                    <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-[6px] text-sm text-red-600">{error}</div>
                )}

                {/* Contexto da decisão (UI_PATTERNS §6.2): o que está sendo alterado. */}
                <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                    <div className="space-y-1.5">
                        <dt className={ROTULO}>Vencimento atual</dt>
                        <dd className="text-sm text-gray-900">{dataBR(atual)}</dd>
                    </div>
                    <div className="space-y-1.5">
                        <dt className={ROTULO}>Origem</dt>
                        <dd className="text-sm text-gray-900">{ORIGEM[parcela.source_system] || parcela.source_system}</dd>
                    </div>
                    <div className="space-y-1.5">
                        <dt className={ROTULO}>Valor</dt>
                        <dd className="text-sm font-medium text-gray-900">{fmtBRL(Number(parcela.amount ?? 0))}</dd>
                    </div>
                </dl>

                {historico && (
                    <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-100 rounded-[6px] text-sm text-amber-800">
                        <CalendarClock className="w-4 h-4 mt-0.5 shrink-0" />
                        <span>{historico}.</span>
                    </div>
                )}

                <div className="space-y-1.5">
                    <label htmlFor="novo-vencimento-parcela" className={ROTULO}>Novo vencimento</label>
                    <input
                        id="novo-vencimento-parcela"
                        type="date"
                        autoFocus
                        value={data}
                        onChange={e => setData(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') void handleSalvar(); }}
                        className={CAMPO}
                    />
                    <p className="text-xs text-gray-500">
                        A parcela fica marcada como alterada manualmente: Lançar Financeiro e salvar os Dados Gerais não
                        sobrescrevem esta data. Contas a Pagar/Receber passa a cobrar no novo vencimento.
                    </p>
                </div>
            </SheetPanel>
            <SheetFooter>
                <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                <span className="inline-flex" title={motivoDesligado}>
                    <Button variant="primary" onClick={handleSalvar} disabled={!!motivoDesligado}>
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Salvar vencimento
                    </Button>
                </span>
            </SheetFooter>
        </Sheet>
    );
};

export default AlterarVencimentoParcelaSheet;
