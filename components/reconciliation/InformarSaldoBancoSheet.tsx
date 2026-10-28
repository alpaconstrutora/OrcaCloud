import React, { useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import MoneyCentsInput from '../ui/MoneyCentsInput';
import { formatMoney, formatDateBR } from '../ui/Format';
import { hojeLocal } from '../../utils/baixaRecebivel';

/**
 * "Informar saldo do extrato" — para a conta cujo banco não chega ao app em OFX nem pela API
 * (as duas Sicredi em 28/10/2026). A pessoa lê o saldo no extrato e digita com a data.
 * Plano: docs/planos/2026-10-28-conciliacao-dashboard-confianca.md (passo 2, item 2.2).
 */

interface Props {
    open: boolean;
    conta: { id: string; nome: string } | null;
    /** Data que abre preenchida ("Posição em" da tela). */
    dataSugerida: string;
    /** Quando já há saldo digitado, abre com ele (corrigir em vez de começar do zero). */
    atual?: { saldo: number; data: string } | null;
    onClose: () => void;
    onSalvar: (data: string, saldo: number) => Promise<void>;
}

const label = 'text-xs font-semibold text-slate-500';
const field = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:opacity-50';

const InformarSaldoBancoSheet: React.FC<Props> = ({ open, conta, dataSugerida, atual, onClose, onSalvar }) => {
    const [data, setData] = useState(dataSugerida);
    const [saldo, setSaldo] = useState('');
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setData(atual?.data ?? dataSugerida);
        setSaldo(atual ? String(atual.saldo) : '');
        setErro(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, conta?.id]);

    const hoje = hojeLocal();
    const falta =
        !data ? 'Escolha a data do saldo'
        : data > hoje ? 'A data não pode ser depois de hoje'
        : saldo === '' || saldo === '-' ? 'Digite o saldo que aparece no extrato'
        : null;

    async function salvar() {
        if (falta || !conta) return;
        setSalvando(true);
        setErro(null);
        try {
            await onSalvar(data, Number(saldo));
            onClose();
        } catch (e: unknown) {
            setErro((e as { message?: string })?.message ?? String(e));
        } finally {
            setSalvando(false);
        }
    }

    return (
        <Sheet open={open} onClose={onClose} size="md" dirty={!salvando && saldo !== '' && saldo !== String(atual?.saldo ?? '')}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>Informar saldo do extrato</SheetTitle>
                <SheetDescription>{conta?.nome}</SheetDescription>
            </SheetHeader>

            <SheetPanel className="p-6 space-y-8">
                <p className="text-sm text-gray-700">
                    Digite o saldo que o extrato do banco mostra no fim do dia escolhido. O app compara com o
                    saldo que ele calcula para a mesma data.
                </p>

                {erro && (
                    <div role="alert" className="flex items-start gap-2 p-3 rounded-[10px] bg-red-50 border border-red-200 text-red-700 text-sm">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <span>Não foi possível gravar: {erro}</span>
                    </div>
                )}

                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                    <div className="space-y-1.5">
                        <label htmlFor="saldo-banco-data" className={label}>Data do saldo</label>
                        <input id="saldo-banco-data" type="date" value={data} max={hoje}
                            onChange={e => setData(e.target.value)} disabled={salvando} className={field} />
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor="saldo-banco-valor" className={label}>Saldo no extrato</label>
                        <MoneyCentsInput id="saldo-banco-valor" permitirNegativo autoFocus value={saldo} onChange={setSaldo}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void salvar(); } }}
                            disabled={salvando} className={`${field} text-right tabular-nums`} />
                        <p className="text-xs text-gray-500">Só os números; um “-” deixa negativo.</p>
                    </div>
                </div>

                {atual && (
                    <p className="text-xs text-gray-500">
                        Já informado: {formatMoney(atual.saldo)} em {formatDateBR(atual.data)}. Gravar outra data acrescenta;
                        a mesma data corrige.
                    </p>
                )}
            </SheetPanel>

            <SheetFooter>
                {falta && <span className="text-xs text-gray-500 mr-auto">{falta}</span>}
                <button onClick={onClose} disabled={salvando} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px] transition-all disabled:opacity-50">
                    Cancelar
                </button>
                <button
                    onClick={salvar}
                    disabled={salvando || !!falta}
                    title={falta ?? undefined}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    {salvando && <Loader2 className="w-[15px] h-[15px] animate-spin" />}
                    Gravar saldo
                </button>
            </SheetFooter>
        </Sheet>
    );
};

export default InformarSaldoBancoSheet;
