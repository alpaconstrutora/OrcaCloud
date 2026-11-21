import React from 'react';
import { ArrowRightLeft, Plus } from 'lucide-react';
import ActionIconButton from '../ui/ActionIconButton';
import { useConfirm } from '../ui/confirm';
import { catalogoDeUnidades, identidadeDaUnidade } from '../../lib/unidadeDeMedida';
import { CreatableCombobox } from '../ui/CreatableCombobox';
import { masterDataService, MasterUnit } from '../../services/masterDataService';
import NovaUnidadeForm from './NovaUnidadeForm';
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
 *
 * A unidade é escolhida do cadastro mestre (lista fixa + Dados Mestres › Unidades) num
 * combobox criável (guia §7.1.2): digitar uma que não existe oferece "Cadastrar", que abre
 * o formulário de unidade nova (21/11/2026, docs/planos/2026-11-21-unidade-de-medida-nova.md).
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

    const [cadastradas, setCadastradas] = React.useState<MasterUnit[]>([]);
    const [unidade, setUnidade] = React.useState<string | null>(null);
    const [unidadeTexto, setUnidadeTexto] = React.useState('');
    /** Símbolo da unidade nova em cadastro (null = formulário fechado). */
    const [novaUnidade, setNovaUnidade] = React.useState<string | null>(null);
    const [fator, setFator] = React.useState('');
    const [observacao, setObservacao] = React.useState('');
    const [salvando, setSalvando] = React.useState(false);

    React.useEffect(() => {
        if (!podeEditar) return;
        masterDataService.listUnits().then(setCadastradas).catch(() => setCadastradas([]));
    }, [podeEditar]);
    const catalogo = React.useMemo(() => catalogoDeUnidades(cadastradas), [cadastradas]);
    const opcoes = React.useMemo(
        () => catalogo.filter(u => u.codigo !== base).map(u => ({ id: u.codigo, name: u.codigo, nome: u.nome })),
        [catalogo, base],
    );
    // Texto digitado que é apelido de uma unidade da lista ("barra" = BR) já vale — nunca bloqueia (§7.1.2).
    const digitada = identidadeDaUnidade(unidadeTexto);
    const unidadeEscolhida = unidade ?? (digitada && opcoes.some(o => o.id === digitada) ? digitada : null);
    const fatorNum = Number(fator.replace(/\./g, '').replace(',', '.'));
    const motivoSemSalvar =
        !base ? 'O item não tem unidade reconhecida.'
        : !unidadeEscolhida ? (
            !unidadeTexto.trim() ? 'Escolha a unidade equivalente.'
            : digitada === base ? `${base} já é a unidade do item.`
            : `A unidade "${unidadeTexto.trim()}" não existe: cadastre-a pela lista.`
        )
        : !(fatorNum > 0) ? 'Informe um fator maior que zero.'
        : null;

    const salvar = async () => {
        if (motivoSemSalvar || !base || !unidadeEscolhida) return;
        setSalvando(true);
        try {
            await equivalenciaUnidadesService.salvar({ itemCode: code, unidadeBase: base, unidade: unidadeEscolhida, fator: fatorNum, observacao });
            setUnidade(null); setUnidadeTexto(''); setFator(''); setObservacao('');
            recarregar();
            notify('Equivalência salva.', 'success');
        } catch (e) {
            notify(`Erro ao salvar a equivalência: ${e instanceof Error ? e.message : 'erro desconhecido'}`, 'error');
        } finally {
            setSalvando(false);
        }
    };

    const escolher = (codigo: string) => { setUnidade(codigo); setUnidadeTexto(codigo); };
    const cadastrar = (texto: string) => {
        const id = identidadeDaUnidade(texto);
        if (id && opcoes.some(o => o.id === id)) escolher(id);
        else setNovaUnidade(texto.trim());
    };
    const unidadeCriada = (u: MasterUnit) => {
        setCadastradas(prev => [...prev, u]);
        setNovaUnidade(null);
        const id = identidadeDaUnidade(u.symbol);
        if (id) escolher(id);
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
                                    <span className="text-gray-500"> · 1 {e.unidadeBase} = {(1 / e.fator).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {e.unidade}</span>
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
                        <label className="block text-xs font-semibold text-slate-500" htmlFor="eq-unidade">1 unidade</label>
                        <div className="w-40">
                            <CreatableCombobox<{ id: string; name: string; nome?: string }>
                                id="eq-unidade"
                                value={unidadeTexto}
                                selectedId={unidade}
                                options={opcoes}
                                onSelect={o => escolher(o.id)}
                                onTextChange={t => { setUnidadeTexto(t); setUnidade(null); }}
                                onCreate={cadastrar}
                                getHint={o => o.nome}
                                placeholder="Escolha ou digite"
                                avisoNovo="Unidade nova — use Cadastrar na lista."
                                inputClassName="w-full h-9 pl-3 pr-8 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                            />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-500" htmlFor="eq-fator">= quantos {base}</label>
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
                        <label className="block text-xs font-semibold text-slate-500" htmlFor="eq-obs">Observação</label>
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

            {podeEditar && base && novaUnidade !== null && (
                <NovaUnidadeForm
                    key={novaUnidade}
                    existentes={catalogo.map(u => u.codigo)}
                    simboloInicial={novaUnidade}
                    onCriada={unidadeCriada}
                    onCancelar={() => setNovaUnidade(null)}
                    notify={notify}
                />
            )}
        </div>
    );
};

export default EquivalenciasDoItem;
