/**
 * Regra de leitura de uma caixa já conectada: quais remetentes viram boleto.
 *
 * Pedido de 16/10/2026: "criar opcao para o usuario escolher: ler somentes
 * remetentes cadastratos e o modelo atual". Antes, o modo só era escolhido ao
 * conectar — depois não havia onde trocar (nem "Reconectar" mostrava o campo).
 * Plano: docs/planos/2026-10-15-captura-boletos-por-email.md.
 */
import React, { useEffect, useState } from 'react';
import { Loader2, Info } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import {
    emailCaptureService, ROTULO_MODO, AJUDA_MODO, MODOS_OFERECIDOS,
    type ContaCaptura, type ModoCaptura,
} from '../../services/emailCaptureService';

interface Props {
    open: boolean;
    onClose: () => void;
    conta: ContaCaptura | null;
    onSalva: (conta: ContaCaptura) => void;
}

const EmailCaptureRegraSheet: React.FC<Props> = ({ open, onClose, conta, onSalva }) => {
    const [modo, setModo] = useState<ModoCaptura>('hibrido');
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);

    useEffect(() => {
        if (!open || !conta) return;
        setModo(conta.modo);
        setErro(null);
    }, [open, conta]);

    if (!open || !conta) return null;

    // Caixa num modo que a tela não oferece mais ("todos") continua aparecendo marcada.
    const opcoes = MODOS_OFERECIDOS.includes(conta.modo) ? MODOS_OFERECIDOS : [...MODOS_OFERECIDOS, conta.modo];
    const dirty = modo !== conta.modo;
    const motivoDesligado: string | null = salvando ? 'Salvando…' : !dirty ? 'Esta já é a regra da caixa.' : null;

    async function salvar() {
        if (motivoDesligado || !conta) return;
        setSalvando(true);
        setErro(null);
        try {
            await emailCaptureService.atualizarConta(conta.id, { modo });
            onSalva({ ...conta, modo });
            onClose();
        } catch (e) {
            setErro(e instanceof Error ? e.message : String(e));
        } finally {
            setSalvando(false);
        }
    }

    return (
        <Sheet open={open} onClose={onClose} size="md" dirty={dirty && !salvando}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>Regra de leitura</SheetTitle>
                <SheetDescription>{`Quais remetentes de ${conta.usuario} viram boleto.`}</SheetDescription>
            </SheetHeader>

            <SheetPanel className="px-6 py-5 space-y-8">
                <div className="space-y-3" role="radiogroup" aria-label="Quais remetentes ler">
                    {opcoes.map(m => (
                        <label key={m} className={`flex items-start gap-3 rounded-[10px] border px-4 py-3 cursor-pointer transition-colors ${modo === m ? 'border-blue-200 bg-blue-50/50' : 'border-gray-100 hover:bg-gray-50'}`}>
                            <input type="radio" name="ecap-regra" value={m} checked={modo === m} onChange={() => setModo(m)}
                                className="mt-0.5 w-4 h-4 text-blue-600 focus:ring-blue-500" />
                            <span className="space-y-0.5">
                                <span className="block text-sm font-medium text-gray-900">{ROTULO_MODO[m]}</span>
                                <span className="block text-xs text-gray-500">{AJUDA_MODO[m]}</span>
                            </span>
                        </label>
                    ))}
                </div>

                <div className="flex gap-2 rounded-[10px] border border-blue-100 bg-blue-50 px-3 py-2.5 text-xs text-blue-800">
                    <Info className="w-4 h-4 shrink-0 mt-px" />
                    <p>
                        Vale para as próximas leituras e para a busca por período em “Todos”. O que já entrou não muda.
                        Remetente escolhido numa busca por período é lido mesmo sem estar cadastrado.
                    </p>
                </div>

                {erro && (
                    <p className="rounded-[10px] border border-red-100 bg-red-50 px-3 py-2.5 text-sm text-red-700">{erro}</p>
                )}
            </SheetPanel>

            <SheetFooter>
                <button onClick={onClose} disabled={salvando} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px] disabled:opacity-50">
                    Cancelar
                </button>
                <button onClick={salvar} disabled={!!motivoDesligado} title={motivoDesligado ?? undefined}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                    {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
                    Salvar regra
                </button>
            </SheetFooter>
        </Sheet>
    );
};

export default EmailCaptureRegraSheet;
