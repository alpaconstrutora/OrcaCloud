import React from 'react';
import { Camera, Loader2, X } from 'lucide-react';
import { useConfirm } from '../../ui/confirm';
import {
    montarLinhas, statusDoRecebimento, rotuloDoConfirmar, ErroDeRecebimento,
    type EntradaDoItem, type Problema, type StatusDoRecebimento,
} from '../../../lib/recebimento';
import type { FonteRecebimento, PedidoAberto, ResultadoDaConferencia } from '../../../services/recebimentoFonte';
import { Cabecalho } from './RecebimentoDetalhe';

/**
 * Conferência de um pedido no celular. A regra (saldo, parcial, divergência) é a de
 * lib/recebimento.ts — a mesma que a Edge aplica antes de gravar; aqui ela só faz a
 * prévia. O id da conferência nasce quando o formulário abre: reenviar depois de uma
 * queda de rede não duplica (a Edge devolve "já existia").
 */

type Falta = 'faltando' | 'quebrado' | 'depois';

interface Linha { recebida: string; falta: Falta; obs: string }

interface Props {
    fonte: FonteRecebimento;
    pedido: PedidoAberto;
    saldo: number[];
    onCancelar: () => void;
    onGravado: (r: ResultadoDaConferencia) => void;
    /** No computador o modal (`OrderReceiptModal`) já tem o título; aqui some o cabeçalho de celular. */
    semCabecalho?: boolean;
}

const COR_DA_PREVIA: Record<StatusDoRecebimento, string> = {
    Recebido: 'text-green-800', Parcial: 'text-amber-800', 'Divergência': 'text-red-600',
};
const qtd = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const numero = (s: string) => Number(s.replace(',', '.'));

const ConferenciaForm: React.FC<Props> = ({ fonte, pedido, saldo, onCancelar, onGravado, semCabecalho = false }) => {
    const confirm = useConfirm();
    const [receiptId] = React.useState(() => crypto.randomUUID());
    const indices = React.useMemo(() => pedido.itens.map((_, i) => i).filter(i => saldo[i] > 0), [pedido.itens, saldo]);
    const [linhas, setLinhas] = React.useState<Record<number, Linha>>(() =>
        Object.fromEntries(indices.map(i => [i, { recebida: String(saldo[i]), falta: 'faltando' as Falta, obs: '' }])));
    const [notas, setNotas] = React.useState('');
    const [foto, setFoto] = React.useState<File | null>(null);
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);
    const fotoRef = React.useRef<HTMLInputElement>(null);

    const mudar = (i: number, patch: Partial<Linha>) => setLinhas(prev => ({ ...prev, [i]: { ...prev[i], ...patch } }));

    const entradas: EntradaDoItem[] = indices.map(i => {
        const l = linhas[i];
        const recebida = numero(l.recebida);
        const falta = Number.isFinite(recebida) && recebida < saldo[i];
        return {
            indice: i,
            recebida,
            problema: falta && l.falta !== 'depois' ? (l.falta as Problema) : null,
            restoDepois: falta && l.falta === 'depois',
            obs: l.obs.trim() || null,
        };
    });

    // Prévia pela MESMA regra da Edge; entrada inválida vira o motivo do botão desligado.
    let previa: StatusDoRecebimento | null = null;
    let motivo: string | null = null;
    try {
        previa = statusDoRecebimento(montarLinhas(pedido.itens, saldo, entradas));
    } catch (e) {
        motivo = e instanceof ErroDeRecebimento ? e.message : 'Confira as quantidades.';
    }

    const confirmar = async () => {
        if (!previa) return;
        if (previa !== 'Recebido') {
            const ok = await confirm({
                title: previa === 'Parcial' ? 'Registrar recebimento parcial?' : 'Registrar com divergência?',
                message: previa === 'Parcial'
                    ? 'O pedido continua a receber: o que falta fica como saldo para a próxima conferência.'
                    : 'O que faltou ou chegou quebrado vira divergência para o comprador resolver com o fornecedor.',
                variant: 'warning',
                confirmLabel: previa === 'Parcial' ? 'Registrar parcial' : 'Registrar divergência',
            });
            if (!ok) return;
        }
        setSalvando(true);
        setErro(null);
        try {
            const r = await fonte.receber({ orderId: pedido.id, receiptId, versao: pedido.versao, itens: entradas, notas: notas.trim() || null, foto });
            onGravado(r);
        } catch (e) {
            setErro(e instanceof Error && e.message ? e.message : 'Não foi possível registrar. Tente de novo.');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className="space-y-6 pb-6">
            {!semCabecalho && (
                <Cabecalho titulo="Conferir e receber" subtitulo={[pedido.numero, pedido.fornecedor].filter(Boolean).join(' · ')} onVoltar={onCancelar} />
            )}

            <ul className="space-y-3">
                {indices.map(i => {
                    const it = pedido.itens[i];
                    const l = linhas[i];
                    const recebida = numero(l.recebida);
                    const falta = Number.isFinite(recebida) && recebida < saldo[i];
                    const idCampo = `receber-qtd-${i}`;
                    return (
                        <li key={i} className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-4 space-y-3">
                            <div>
                                <p className="text-sm font-medium text-gray-900">{it.description || it.code || `Item ${i + 1}`}</p>
                                <p className="text-xs text-gray-500">
                                    {saldo[i] < it.quantity ? `Saldo a receber: ${qtd(saldo[i])} de ${qtd(it.quantity)}` : `Pedido: ${qtd(it.quantity)}`} {it.unit || ''}
                                </p>
                            </div>
                            <div className="space-y-1.5">
                                <label htmlFor={idCampo} className="block text-xs font-semibold text-slate-500">Quantidade recebida</label>
                                <input id={idCampo} type="text" inputMode="decimal" value={l.recebida}
                                    onChange={e => mudar(i, { recebida: e.target.value })}
                                    className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 tabular-nums placeholder:text-gray-400" />
                            </div>
                            {falta && (
                                <fieldset className="space-y-1.5">
                                    <legend className="block text-xs font-semibold text-slate-500 mb-1.5">
                                        Faltaram {qtd(saldo[i] - recebida)} {it.unit || ''}. O que aconteceu?
                                    </legend>
                                    {([
                                        ['depois', 'O resto vem depois'],
                                        ['faltando', 'Faltou (divergência)'],
                                        ['quebrado', 'Chegou quebrado (divergência)'],
                                    ] as [Falta, string][]).map(([v, rot]) => (
                                        <label key={v} className="flex items-center gap-2 min-h-9 text-sm text-gray-800">
                                            <input type="radio" name={`receber-falta-${i}`} checked={l.falta === v} onChange={() => mudar(i, { falta: v })}
                                                className="w-4 h-4 text-blue-600" />
                                            {rot}
                                        </label>
                                    ))}
                                    {l.falta !== 'depois' && (
                                        <input type="text" value={l.obs} onChange={e => mudar(i, { obs: e.target.value })} maxLength={500}
                                            aria-label={`Observação do item ${i + 1}`} placeholder="Observação (opcional)"
                                            className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400" />
                                    )}
                                </fieldset>
                            )}
                        </li>
                    );
                })}
            </ul>

            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-4 space-y-4">
                <div className="space-y-1.5">
                    <span className="block text-xs font-semibold text-slate-500">Foto do comprovante de entrega (opcional)</span>
                    {foto ? (
                        <div className="flex items-center gap-3">
                            <span className="min-w-0 flex-1 text-sm text-gray-900 truncate">{foto.name}</span>
                            <button type="button" onClick={() => { setFoto(null); if (fotoRef.current) fotoRef.current.value = ''; }} title="Tirar a foto"
                                className="flex items-center justify-center h-9 w-9 rounded-[6px] text-gray-500 hover:bg-gray-100">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    ) : (
                        <button type="button" onClick={() => fotoRef.current?.click()}
                            className="w-full flex items-center justify-center gap-1.5 h-11 px-3 bg-white border border-dashed border-gray-300 text-gray-700 rounded-[6px] hover:bg-gray-50 font-medium text-[13px]">
                            <Camera className="w-4 h-4" /> Tirar foto
                        </button>
                    )}
                    <input ref={fotoRef} type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Foto do comprovante"
                        onChange={e => setFoto(e.target.files?.[0] ?? null)} />
                </div>
                <div className="space-y-1.5">
                    <label htmlFor="receber-notas" className="block text-xs font-semibold text-slate-500">Observação (opcional)</label>
                    <textarea id="receber-notas" rows={2} value={notas} onChange={e => setNotas(e.target.value)} maxLength={2000}
                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 resize-none" />
                </div>
            </div>

            {erro && <p role="alert" className="text-sm font-medium text-red-700 bg-red-50 rounded-[6px] px-3 py-2">{erro}</p>}

            <div className="space-y-2">
                {previa && (
                    <p className="text-sm text-gray-700">
                        Vai ficar como <span className={`font-normal ${COR_DA_PREVIA[previa]}`}>{previa === 'Parcial' ? 'recebimento parcial' : previa.toLowerCase()}</span>.
                    </p>
                )}
                <span className="block" title={motivo ?? (salvando ? 'Registrando…' : undefined)}>
                    <button type="button" onClick={confirmar} disabled={!previa || salvando}
                        className="w-full flex items-center justify-center gap-2 h-11 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-sm active:scale-[0.99] transition-all disabled:opacity-50 disabled:pointer-events-none">
                        {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
                        {previa ? rotuloDoConfirmar(previa) : 'Confirmar recebimento'}
                    </button>
                </span>
                {motivo && <p className="text-xs text-red-700">{motivo}</p>}
            </div>
        </div>
    );
};

export default ConferenciaForm;
