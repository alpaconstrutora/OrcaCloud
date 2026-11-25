import React, { useMemo, useState } from 'react';
import { Landmark, AlertCircle, Plus, Loader2, Check, X, Info } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { STALE } from '../../lib/queryClient';
import ActionIconButton from '../ui/ActionIconButton';
import StandardTable, { StandardTableColumn } from '../ui/StandardTable';
import { usePersistedState } from '../ui/TableUtils';
import { useConfirm } from '../ui/confirm';
import { useToast } from '../../hooks/useToast';
import { pisRatesService } from '../../services/pisRatesService';
import { cofinsRatesService } from '../../services/cofinsRatesService';
import type { AliquotaPorExercicio } from '../../services/aliquotaPorExercicioService';

/**
 * PIS e COFINS por exercício e regime — Configurações do Sistema › Tributos e
 * Impostos. Eram duas telas idênticas e só de leitura; desde 24/11/2026 uma só,
 * com edição para superadmin (plano docs/planos/2026-11-24-tributos-um-lugar-so.md).
 * Quem usa: os tributos das locações (taxPayableService.generateForDeal), pelo
 * regime da empresa dona do imóvel e o exercício mais recente ≤ ano da parcela.
 */
export type TributoPorExercicio = 'PIS' | 'COFINS';

const SERVICO = { PIS: pisRatesService, COFINS: cofinsRatesService };
const QUERY_KEY = { PIS: ['tax-pis-rates'], COFINS: ['tax-cofins-rates'] };
/** Os regimes que geram PIS/COFINS — Simples/MEI recolhem no DAS (REGIME_LABEL em taxPayableService). */
const REGIMES = ['Lucro Real', 'Lucro Presumido'];
const MOTIVO_SO_SUPERADMIN = 'Só o superadmin altera as tabelas oficiais — elas valem para todas as organizações.';
const NOVA = '__nova__';

const COLUMNS: StandardTableColumn[] = [
    { key: 'exercicio', label: 'Exercício', sortable: true, width: 140 },
    { key: 'regime', label: 'Regime tributário', sortable: true, width: 240 },
    { key: 'aliquota', label: 'Alíquota', sortable: true, width: 160, align: 'right' },
];

const fmtPct = (n: number) => `${Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })}%`;
const num = (s: string) => {
    const n = parseFloat(s.replace(',', '.'));
    return Number.isFinite(n) ? n : NaN;
};

interface Rascunho { id: string; exercicio: string; regime: string; aliquota: string }

const INPUT_CELULA = 'h-8 text-sm font-normal text-gray-900 border border-blue-400 rounded-[6px] px-2 outline-none focus:ring-2 focus:ring-blue-500/20';
const BOTAO_PRIMARIO = 'flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed';

interface Props {
    tributo: TributoPorExercicio;
    /** Superadmin (o banco recusa a gravação dos demais). */
    podeEditar: boolean;
}

const AliquotaPorExercicioSettings: React.FC<Props> = ({ tributo, podeEditar }) => {
    const confirm = useConfirm();
    const queryClient = useQueryClient();
    const { localToast, showToast } = useToast();
    const servico = SERVICO[tributo];
    const [busca, setBusca] = usePersistedState<string>(`tributos:${tributo}:search`, '');
    const [edicao, setEdicao] = useState<Rascunho | null>(null);
    const [saving, setSaving] = useState(false);

    const { data: rates = [], isLoading } = useQuery({
        queryKey: QUERY_KEY[tributo],
        queryFn: servico.list,
        staleTime: STALE.slow,
    });

    const linhas = useMemo(() => (edicao?.id === NOVA
        ? [...rates, { id: NOVA, exercicio: Number(edicao.exercicio) || 0, regime_tributario: edicao.regime, aliquota: 0 }]
        : rates), [rates, edicao?.id]);

    const motivoOcupado = !podeEditar ? MOTIVO_SO_SUPERADMIN
        : saving ? 'Aguarde a gravação em andamento'
        : edicao ? 'Termine a edição da linha aberta (Enter grava, Esc cancela)' : null;

    const setDraft = (patch: Partial<Rascunho>) => setEdicao(e => (e ? { ...e, ...patch } : e));
    const iniciar = (r: AliquotaPorExercicio) => setEdicao({
        id: r.id, exercicio: String(r.exercicio), regime: r.regime_tributario, aliquota: String(r.aliquota),
    });
    const nova = () => {
        setBusca('');
        const ultimo = rates.reduce((m, r) => Math.max(m, r.exercicio), new Date().getFullYear() - 1);
        setEdicao({ id: NOVA, exercicio: String(ultimo + 1), regime: REGIMES[1], aliquota: '' });
    };

    const salvar = async () => {
        if (!edicao) return;
        const exercicio = Math.floor(Number(edicao.exercicio));
        const aliquota = num(edicao.aliquota);
        if (!Number.isFinite(exercicio) || exercicio < 2000 || exercicio > 2100) { showToast('Informe um exercício entre 2000 e 2100', 'error'); return; }
        if (!Number.isFinite(aliquota) || aliquota < 0 || aliquota > 100) { showToast('Informe uma alíquota entre 0% e 100%', 'error'); return; }
        const repetido = rates.some(r => r.id !== edicao.id && r.exercicio === exercicio && r.regime_tributario === edicao.regime);
        if (repetido) { showToast(`Já existe ${tributo} de ${exercicio} para ${edicao.regime}`, 'error'); return; }
        const campos = { exercicio, regime_tributario: edicao.regime, aliquota };
        setSaving(true);
        try {
            if (edicao.id === NOVA) await servico.create(campos);
            else await servico.update(edicao.id, campos);
            await queryClient.invalidateQueries({ queryKey: QUERY_KEY[tributo] });
            setEdicao(null);
            showToast(`Alíquota de ${tributo} gravada`, 'success');
        } catch (err) {
            showToast(err instanceof Error ? err.message : `Erro ao gravar a alíquota de ${tributo}`, 'error');
        } finally {
            setSaving(false);
        }
    };

    const excluir = async (r: AliquotaPorExercicio) => {
        const ok = await confirm({
            title: `Excluir ${tributo} de ${r.exercicio}?`,
            message: `${r.regime_tributario} · ${fmtPct(r.aliquota)}. As locações desse regime passam a usar o exercício anterior mais recente.`,
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        try {
            await servico.remove(r.id);
            await queryClient.invalidateQueries({ queryKey: QUERY_KEY[tributo] });
            showToast(`Alíquota de ${tributo} excluída`, 'success');
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Erro ao excluir a alíquota', 'error');
        }
    };

    const tecla = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') salvar();
        if (e.key === 'Escape') setEdicao(null);
    };

    const renderCell = (key: string, r: AliquotaPorExercicio) => {
        if (edicao?.id === r.id) {
            switch (key) {
                case 'exercicio': return (
                    <input type="number" min={2000} max={2100} step={1} autoFocus aria-label="Exercício"
                        value={edicao.exercicio} onChange={e => setDraft({ exercicio: e.target.value })} onKeyDown={tecla}
                        className={`w-24 ${INPUT_CELULA}`} />
                );
                case 'regime': return (
                    <select aria-label="Regime tributário" value={edicao.regime} onChange={e => setDraft({ regime: e.target.value })} onKeyDown={tecla}
                        className={`${INPUT_CELULA} bg-white cursor-pointer`}>
                        {REGIMES.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                );
                case 'aliquota': return (
                    <div className="flex items-center justify-end gap-1">
                        <input type="number" min={0} max={100} step="0.01" aria-label="Alíquota em %"
                            value={edicao.aliquota} onChange={e => setDraft({ aliquota: e.target.value })} onKeyDown={tecla}
                            className={`w-24 text-right ${INPUT_CELULA}`} />
                        <span className="text-sm font-normal text-gray-500">%</span>
                    </div>
                );
                default: return null;
            }
        }
        switch (key) {
            case 'exercicio': return <span className="text-sm font-normal text-gray-700">{r.exercicio}</span>;
            case 'regime': return <span className="text-sm font-normal text-gray-600">{r.regime_tributario}</span>;
            case 'aliquota': return <span className="block text-right text-sm font-medium text-gray-800">{fmtPct(r.aliquota)}</span>;
            default: return null;
        }
    };

    const acoes = (r: AliquotaPorExercicio) => {
        if (edicao?.id === r.id) {
            return (<>
                <ActionIconButton kind="edit" size="sm" title="Gravar (Enter)" onClick={salvar} disabled={saving}
                    icon={saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 text-emerald-600" />} />
                <ActionIconButton kind="edit" size="sm" title="Cancelar (Esc)" onClick={() => setEdicao(null)} disabled={saving}
                    icon={<X className="w-3.5 h-3.5" />} />
            </>);
        }
        return (<>
            <span className="inline-flex" title={motivoOcupado ?? 'Editar'}>
                <ActionIconButton kind="edit" size="sm" disabled={!!motivoOcupado} onClick={() => iniciar(r)} />
            </span>
            <span className="inline-flex" title={motivoOcupado ?? 'Excluir'}>
                <ActionIconButton kind="delete" size="sm" disabled={!!motivoOcupado} onClick={() => excluir(r)} />
            </span>
        </>);
    };

    return (
        <div className="bg-white rounded-[10px] shadow-sm border border-gray-100 p-6 space-y-6">
            <div className="flex items-start gap-4 flex-wrap">
                <div className="p-3 bg-indigo-50 rounded-[10px]">
                    <Landmark className="w-6 h-6 text-indigo-600" />
                </div>
                <div className="flex-1 min-w-[240px]">
                    <h2 className="text-lg font-semibold text-gray-800">{tributo} — Alíquotas por exercício</h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Alíquota do {tributo} por exercício e regime tributário. Usada nos tributos das locações, pelo regime da
                        empresa dona do imóvel.
                    </p>
                </div>
                <span className="inline-flex" title={motivoOcupado ?? (isLoading ? 'Carregando' : `Nova alíquota de ${tributo}`)}>
                    <button onClick={nova} disabled={!!motivoOcupado || isLoading} className={BOTAO_PRIMARIO}>
                        <Plus className="w-[15px] h-[15px]" />
                        Nova alíquota
                    </button>
                </span>
            </div>

            <StandardTable<AliquotaPorExercicio>
                storageKey={`tributos:${tributo}`}
                columns={COLUMNS}
                rows={linhas}
                rowKey={r => r.id}
                searchText={r => `${r.exercicio} ${r.regime_tributario} ${fmtPct(r.aliquota)}`}
                search={busca}
                onSearchChange={setBusca}
                searchPlaceholder={`Buscar alíquota de ${tributo}...`}
                sortValue={(key, r) => (key === 'exercicio' ? r.exercicio : key === 'regime' ? r.regime_tributario : key === 'aliquota' ? r.aliquota : null)}
                defaultSort={{ column: 'exercicio', direction: 'desc' }}
                renderCell={renderCell}
                rowClassName={r => (edicao?.id === r.id ? 'bg-blue-50/40' : '')}
                actions={{ width: 110, render: acoes }}
                loading={isLoading}
                empty={{
                    icon: <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                    title: `Nenhuma alíquota de ${tributo} cadastrada`,
                    subtitle: podeEditar ? 'Use "Nova alíquota".' : MOTIVO_SO_SUPERADMIN,
                }}
                footer={(
                    <div className="flex items-start gap-2 px-6 py-3 border-t border-gray-100">
                        <Info className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                        <p className="text-xs text-gray-500">
                            Tabela oficial, a mesma para todas as organizações. Sem linha para o ano da parcela, vale o exercício anterior
                            mais recente. Simples Nacional e MEI não geram {tributo} (recolhido no DAS).
                        </p>
                    </div>
                )}
            />

            {localToast && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
                    localToast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {localToast.message}
                </div>
            )}
        </div>
    );
};

export default AliquotaPorExercicioSettings;
