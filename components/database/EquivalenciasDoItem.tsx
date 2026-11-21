import React from 'react';
import { ArrowRightLeft, Plus } from 'lucide-react';
import ActionIconButton from '../ui/ActionIconButton';
import { useConfirm } from '../ui/confirm';
import { identidadeDaUnidade, UNIDADES_DE_EQUIVALENCIA } from '../../lib/unidadeDeMedida';
import { equivalenciaUnidadesService } from '../../services/equivalenciaUnidadesService';
import { useEquivalencias } from '../../hooks/useEquivalencias';
import { equivalenciasValidas } from '../../utils/equivalenciaUnidades';

/**
 * EQUIVALÊNCIAS DO ITEM (21/11/2026) — Composições › Ver detalhes.
 * "o item 32, ACO CA-50, 6,3 MM, VERGALHAO com unidade KG, porem ele pode ser por m".
 *
 * Cadastro GLOBAL: todos veem; só o superadministrador edita (a RLS confere — o
 * `podeEditar` aqui só evita oferecer um botão que responderia 403).
 * Plano: docs/planos/2026-11-21-equivalencia-unidades.md.
 */
interface Props {
    code: string;
    unidadeDoItem: string;
    podeEditar: boolean;
    notify: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const fmtFator = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 6 });

export const EquivalenciasDoItem: React.FC<Props> = ({ code, unidadeDoItem, podeEditar, notify }) => {
    const confirm = useConfirm();
    const codes = React.useMemo(() => [code], [code]);
    const { equivalencias, recarregar } = useEquivalencias(codes);
    const base = identidadeDaUnidade(unidadeDoItem);
    const validas = equivalenciasValidas(code, unidadeDoItem, equivalencias);
    // Linhas gravadas para OUTRA unidade-base (o item mudou de unidade): ficam sem efeito.
    const semEfeito = (equivalencias.get(code) ?? []).filter(e => e.unidadeBase !== base);

    const [unidade, setUnidade] = React.useState('');
    const [fator, setFator] = React.useState('');
    const [observacao, setObservacao] = React.useState('');
    const [salvando, setSalvando] = React.useState(false);

    const opcoes = UNIDADES_DE_EQUIVALENCIA.filter(u => u !== base);
    const fatorNum = Number(fator.replace(/\./g, '').replace(',', '.'));
    const motivoSemSalvar =
        !base ? 'O item não tem unidade reconhecida.'
        : !unidade ? 'Escolha a unidade equivalente.'
        : !(fatorNum > 0) ? 'Informe um fator maior que zero.'
        : null;

    const salvar = async () => {
        if (motivoSemSalvar || !base) return;
        setSalvando(true);
        try {
            await equivalenciaUnidadesService.salvar({ itemCode: code, unidadeBase: base, unidade, fator: fatorNum, observacao });
            setUnidade(''); setFator(''); setObservacao('');
            recarregar();
            notify('Equivalência salva.', 'success');
        } catch (e) {
            notify(`Erro ao salvar a equivalência: ${e instanceof Error ? e.message : 'erro desconhecido'}`, 'error');
        } finally {
            setSalvando(false);
        }
    };

    const excluir = async (id: string, rotulo: string) => {
        const ok = await confirm({
            title: 'Excluir equivalência?',
            message: `${rotulo} deixa de valer no orçamento, em compras e na planta de todas as organizações.`,
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        try {
            await equivalenciaUnidadesService.excluir({ id, itemCode: code });
            recarregar();
            notify('Equivalência excluída.', 'success');
        } catch (e) {
            notify(`Erro ao excluir: ${e instanceof Error ? e.message : 'erro desconhecido'}`, 'error');
        }
    };

    if (!podeEditar && validas.length === 0) return null;

    return (
        <div className="mb-6 rounded-[10px] border border-gray-100 p-4 space-y-4">
            <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                <ArrowRightLeft className="w-4 h-4 text-blue-600" />
                <h4 className="text-sm font-semibold text-gray-900">Equivalência de unidades</h4>
                <span className="text-xs text-gray-500">— vale para orçamento, compras e planta, em todas as organizações</span>
            </div>

            {validas.length === 0 ? (
                <p className="text-sm text-gray-500">Nenhuma equivalência cadastrada. O item só é usado em {unidadeDoItem || '—'}.</p>
            ) : (
                <ul className="divide-y divide-gray-100">
                    {validas.map(e => {
                        const rotulo = `1 ${e.unidade} = ${fmtFator(e.fator)} ${e.unidadeBase}`;
                        return (
                            <li key={e.id} className="flex items-center justify-between gap-4 py-2">
                                <div className="text-sm text-gray-900">
                                    <span className="font-medium">{rotulo}</span>
                                    <span className="text-gray-500"> · 1 {e.unidadeBase} = {fmtFator(1 / e.fator)} {e.unidade}</span>
                                    {e.observacao && <span className="text-gray-500"> · {e.observacao}</span>}
                                </div>
                                {podeEditar && e.id && (
                                    <ActionIconButton kind="delete" size="sm" title="Excluir equivalência" onClick={() => excluir(e.id!, rotulo)} />
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}

            {podeEditar && semEfeito.length > 0 && (
                <p className="text-xs text-amber-700">
                    {semEfeito.length} equivalência(s) cadastrada(s) para a unidade {semEfeito.map(e => e.unidadeBase).filter((v, i, a) => a.indexOf(v) === i).join(', ')} não valem: o item hoje é {unidadeDoItem || 'sem unidade'}.
                </p>
            )}

            {podeEditar && base && (
                <div className="flex flex-wrap items-end gap-3">
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-500" htmlFor="eq-unidade">1 unidade</label>
                        <select
                            id="eq-unidade"
                            value={unidade}
                            onChange={e => setUnidade(e.target.value)}
                            className="h-9 w-28 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        >
                            <option value="">Escolha</option>
                            {opcoes.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-500" htmlFor="eq-fator">= quantos {base}</label>
                        <input
                            id="eq-fator"
                            inputMode="decimal"
                            value={fator}
                            onChange={e => setFator(e.target.value)}
                            placeholder="0,245"
                            className="h-9 w-32 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        />
                    </div>
                    <div className="space-y-1.5 flex-1 min-w-[200px]">
                        <label className="text-xs font-semibold text-slate-500" htmlFor="eq-obs">Observação</label>
                        <input
                            id="eq-obs"
                            value={observacao}
                            onChange={e => setObservacao(e.target.value)}
                            placeholder="Ex.: massa nominal NBR 7480"
                            className="h-9 w-full px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        />
                    </div>
                    <span className="inline-flex" title={motivoSemSalvar ?? undefined}>
                        <button
                            type="button"
                            onClick={salvar}
                            disabled={!!motivoSemSalvar || salvando}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                        >
                            <Plus className="w-[15px] h-[15px]" />
                            {salvando ? 'Salvando…' : 'Adicionar'}
                        </button>
                    </span>
                </div>
            )}
        </div>
    );
};

export default EquivalenciasDoItem;
