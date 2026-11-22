import React from 'react';
import { HandCoins } from 'lucide-react';
import Button from '../ui/Button';
import MoneyCentsInput from '../ui/MoneyCentsInput';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../ui/modal';
import { useToast } from '../../hooks/useToast';
import { errorMessage } from '../../hooks/useOrgContext';
import { formatCurrency } from '../../utils/financialMath';
import { supabase } from '../../lib/supabase';
import type { SpePartner } from '../../services/speService';

/**
 * "Distribuir resultado" na SPE (Fase D2 do plano docs/planos/2026-11-21-portal-do-investidor-consolidacao.md):
 * um valor total rateado pelas cotas, um lançamento de dividendo/distribuição por sócio no extrato, numa transação
 * no banco (fn_spe_distribuir_resultado). Antes o dividendo era lançado à mão, investidor por investidor.
 */

/** O rateio pela regra do banco: centavos por cota; a sobra do arredondamento vai para o maior sócio. */
export function rateioPorCotas(valor: number, socios: { id: string; ownership_pct: number }[]): { id: string; valor: number }[] {
    const com = socios.filter(s => Number(s.ownership_pct) > 0)
        .sort((a, b) => Number(a.ownership_pct) - Number(b.ownership_pct) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const soma = com.reduce((s, x) => s + Number(x.ownership_pct), 0);
    if (!(valor > 0) || soma <= 0) return [];
    const partes = com.map(s => ({ id: s.id, valor: Math.round(valor * Number(s.ownership_pct) / soma * 100) / 100 }));
    const resto = Math.round((Math.round(valor * 100) / 100 - partes.reduce((s, p) => s + p.valor, 0)) * 100) / 100;
    if (resto !== 0) partes[partes.length - 1].valor = Math.round((partes[partes.length - 1].valor + resto) * 100) / 100;
    return partes;
}

const hojeISO = () => new Date().toISOString().slice(0, 10);

const DistribuirResultadoPanel: React.FC<{
    speId: string;
    speName: string;
    semObra: boolean;
    partners: SpePartner[];
    onDistribuido?: () => void;
}> = ({ speId, speName, semObra, partners, onDistribuido }) => {
    const { showToast } = useToast();
    const [aberto, setAberto] = React.useState(false);
    const [valor, setValor] = React.useState<number | ''>('');
    const [tipo, setTipo] = React.useState<'distribuicao' | 'dividendo'>('distribuicao');
    const [data, setData] = React.useState(hojeISO());
    const [descricao, setDescricao] = React.useState('');
    const [gravando, setGravando] = React.useState(false);

    // id = investor_id: o banco desempata o rateio por ele (ORDER BY ownership_pct, investor_id).
    const socios = partners.map(p => ({ id: p.investor_id, nome: p.investor_name || '—', ownership_pct: Number(p.ownership_pct) }));
    const previa = rateioPorCotas(Number(valor) || 0, socios);
    const motivo = semObra ? 'A SPE não tem obra: vincule a obra para lançar no extrato dos sócios.'
        : socios.every(s => !(s.ownership_pct > 0)) ? 'Nenhum sócio com participação.' : undefined;

    const distribuir = async () => {
        setGravando(true);
        try {
            const { data: r, error } = await supabase.rpc('fn_spe_distribuir_resultado', {
                p_spe_id: speId, p_valor: Number(valor), p_tipo: tipo, p_data: data, p_descricao: descricao || null,
            });
            if (error) throw error;
            showToast(`${(r as { lancamentos?: number } | null)?.lancamentos ?? previa.length} lançamento(s) no extrato dos sócios.`, 'success');
            setAberto(false); setValor(''); setDescricao('');
            onDistribuido?.();
        } catch (e) {
            showToast(errorMessage(e, 'Não foi possível distribuir.'), 'error');
        } finally {
            setGravando(false);
        }
    };

    return (
        <>
            <span className="inline-flex" title={motivo}>
                <Button size="sm" variant="secondary" disabled={!!motivo} onClick={() => setAberto(true)}>
                    <HandCoins className="w-4 h-4" /> Distribuir resultado
                </Button>
            </span>
            <Modal open={aberto} onClose={() => setAberto(false)} size="lg">
                <ModalHeader title={`Distribuir resultado — ${speName}`} onClose={() => setAberto(false)} />
                <ModalBody className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <label className="space-y-1.5">
                            <span className="block text-xs font-semibold text-slate-500">Valor total (R$)</span>
                            <MoneyCentsInput aria-label="Valor total" value={valor} onChange={v => setValor(v === '' ? '' : Number(v))} className="w-full px-3 h-9 border border-gray-200 rounded-[6px] text-sm" />
                        </label>
                        <label className="space-y-1.5">
                            <span className="block text-xs font-semibold text-slate-500">Tipo</span>
                            <select aria-label="Tipo" value={tipo} onChange={e => setTipo(e.target.value as 'distribuicao' | 'dividendo')} className="w-full px-3 h-9 border border-gray-200 rounded-[6px] text-sm">
                                <option value="distribuicao">Distribuição de resultado</option>
                                <option value="dividendo">Dividendos</option>
                            </select>
                        </label>
                        <label className="space-y-1.5">
                            <span className="block text-xs font-semibold text-slate-500">Pago em</span>
                            <input type="date" aria-label="Pago em" value={data} onChange={e => setData(e.target.value)} className="w-full px-3 h-9 border border-gray-200 rounded-[6px] text-sm" />
                        </label>
                    </div>
                    <label className="block space-y-1.5">
                        <span className="block text-xs font-semibold text-slate-500">Descrição (opcional)</span>
                        <input value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Ex.: Resultado do 1º semestre" className="w-full px-3 h-9 border border-gray-200 rounded-[6px] text-sm" />
                    </label>
                    {previa.length > 0 && (
                        <table className="w-full text-sm" aria-label="Rateio pelas cotas">
                            <thead><tr className="text-left text-xs text-gray-500"><th className="py-1">Sócio</th><th className="py-1 text-right">%</th><th className="py-1 text-right">Valor</th></tr></thead>
                            <tbody className="divide-y divide-gray-50">
                                {previa.map(p => {
                                    const s = socios.find(x => x.id === p.id)!;
                                    return (
                                        <tr key={p.id}>
                                            <td className="py-1 text-gray-800">{s.nome}</td>
                                            <td className="py-1 text-right text-gray-600">{s.ownership_pct.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%</td>
                                            <td className="py-1 text-right font-medium text-gray-900">{formatCurrency(p.valor)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </ModalBody>
                <ModalFooter>
                    <Button variant="secondary" onClick={() => setAberto(false)}>Cancelar</Button>
                    <span className="inline-flex" title={!(Number(valor) > 0) ? 'Informe o valor total.' : undefined}>
                        <Button onClick={() => void distribuir()} disabled={gravando || !(Number(valor) > 0)}>
                            {gravando ? 'Lançando…' : 'Distribuir'}
                        </Button>
                    </span>
                </ModalFooter>
            </Modal>
        </>
    );
};

export default DistribuirResultadoPanel;
