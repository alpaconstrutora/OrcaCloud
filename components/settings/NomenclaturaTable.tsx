import React from 'react';
import { Hash, RotateCcw, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import ActionIconButton from '../ui/ActionIconButton';
import { useOrgContext, useOrgWriteTarget, forEachTargetOrg, errorMessage, partialFailureNote } from '../../hooks/useOrgContext';
import { useConfirm } from '../ui/confirm';
import { useToast } from '../../hooks/useToast';
import {
    DOC_TYPE_CATALOG, MAIN_DOC_TYPES, ADVANCED_DOC_TYPES, getDocTypeDefault,
    listNumberingConfigs, saveNumberingConfig, resetNumberingConfig,
    formatDocumentNumber, ALL_VARIABLE_TOKENS,
    DocType, NumberingConfig, SlotToken, VariableToken,
} from '../../services/documentNumbering';

/**
 * Nomenclatura — Configurações do Sistema, tela única (fundida de 11 folhas
 * separadas em 2026-08-30, ver docs/planos/2026-08-30-nomenclatura-tabela-unica.md
 * e o plano original docs/planos/2026-08-17-nomenclatura-slots-configuravel.md).
 * Substitui `NumberingSettingsCard.tsx` (1 card por doc_type) por uma tabela
 * com uma linha por módulo.
 *
 * Decisões de produto que moldam este componente (2026-08-30):
 * - Prefixo é sempre o 1º segmento do número — não é mais posicionável entre
 *   os slots. Persistido como `slots[0] = 'PREFIX'` sempre; as 7 posições
 *   livres do usuário são `slots[1..7]`. Isso não muda `format.ts`/SQL, que já
 *   tratam prefixo vazio como "não entra no número".
 * - Separador e Dígitos do Sequencial viram UM controle para a página inteira
 *   (antes eram por doc_type). Ao carregar, usa o valor da primeira linha já
 *   configurada; ao salvar, aplica o valor único a TODAS as linhas.
 * - Todas as linhas oferecem as mesmas 9 variáveis (`ALL_VARIABLE_TOKENS`) —
 *   acabou o filtro por `supportedVariables` (catalog.ts não tem mais esse
 *   campo). "Unidade" saiu da lista (só o motor ainda entende, por
 *   compatibilidade com config já salva).
 *
 * Não tem busca/KPI/paginação/ações em lote (§5.3, §4 do guia de UI): é um
 * catálogo fixo de ~11 linhas, não uma lista a filtrar. Nenhuma coluna é
 * ordenável (§6.3) — cada célula é um seletor de configuração, não um valor
 * comparável.
 */

const TOKEN_LABEL: Record<VariableToken, string> = {
    EMPREENDIMENTO: 'Empreendimento',
    OBRA: 'Obra',
    CENTRO_CUSTO: 'Centro de Custo',
    ORGANIZACAO: 'Empresa',
    FORNECEDOR: 'Fornecedor',
    CLIENTE: 'Cliente',
    INVESTIDOR: 'Investidor',
    ORCAMENTO: 'Orçamento',
    PLANEJAMENTO: 'Planejamento',
    UNIDADE: 'Unidade', // não oferecido no seletor (ver ALL_VARIABLE_TOKENS) — só para configs antigas
};

/** Valores fictícios para a pré-visualização. */
const PREVIEW_VALUES: Record<VariableToken, string> = {
    EMPREENDIMENTO: 'RES01',
    OBRA: 'TR1',
    UNIDADE: '101',
    CLIENTE: 'CLI001',
    FORNECEDOR: 'FORN003',
    ORGANIZACAO: 'ORG001',
    CENTRO_CUSTO: 'CC004',
    INVESTIDOR: 'INV002',
    ORCAMENTO: 'ORC01',
    PLANEJAMENTO: 'PLN01',
};

const FREE_SLOTS = 7;

interface RowState {
    prefix: string;
    /** As 7 posições livres — slots[0] ('PREFIX') fica fora, é implícito. */
    freeSlots: SlotToken[];
}

const padFreeSlots = (slots: SlotToken[]): SlotToken[] => {
    const out = slots.slice(0, FREE_SLOTS);
    while (out.length < FREE_SLOTS) out.push('EMPTY');
    return out;
};

const rowFromConfig = (cfg: NumberingConfig): RowState => ({
    prefix: cfg.prefix,
    // slots[0] é sempre 'PREFIX' pelo padrão novo — descarta e usa o resto.
    freeSlots: padFreeSlots(cfg.slots.slice(1)),
});

const rowToConfig = (row: RowState, shared: { separator: '-' | '.'; seqPadding: number }): NumberingConfig => {
    const slots: SlotToken[] = ['PREFIX', ...row.freeSlots];
    while (slots.length > 1 && slots[slots.length - 1] === 'EMPTY') slots.pop();
    return { slots, prefix: row.prefix, separator: shared.separator, seqPadding: shared.seqPadding };
};

const ALL_DOC_TYPES: DocType[] = [...MAIN_DOC_TYPES, ...ADVANCED_DOC_TYPES];

const NomenclaturaTable: React.FC = () => {
    const { orgId } = useOrgContext();
    const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();
    const confirm = useConfirm();
    const { localToast, showToast } = useToast();

    const [rows, setRows] = React.useState<Partial<Record<DocType, RowState>>>({});
    const [shared, setShared] = React.useState<{ separator: '-' | '.'; seqPadding: number }>({ separator: '-', seqPadding: 4 });
    const [loading, setLoading] = React.useState(false);
    const [saving, setSaving] = React.useState(false);

    React.useEffect(() => {
        let cancelled = false;

        const applyDefaults = () => {
            const init: Partial<Record<DocType, RowState>> = {};
            ALL_DOC_TYPES.forEach(dt => { init[dt] = rowFromConfig(getDocTypeDefault(dt)); });
            if (!cancelled) {
                setRows(init);
                setShared({ separator: '-', seqPadding: 4 });
            }
        };

        if (!orgId) {
            // "Todas as organizações": não há uma config única para mostrar —
            // parte do default até o usuário salvar (aí escolhe o destino).
            applyDefaults();
            return;
        }

        setLoading(true);
        listNumberingConfigs(orgId)
            .then(cfgs => {
                if (cancelled) return;
                const init: Partial<Record<DocType, RowState>> = {};
                let sharedFromSaved: { separator: '-' | '.'; seqPadding: number } | null = null;
                ALL_DOC_TYPES.forEach(dt => {
                    const saved = cfgs[dt];
                    const cfg = saved ?? getDocTypeDefault(dt);
                    init[dt] = rowFromConfig(cfg);
                    if (saved && !sharedFromSaved) sharedFromSaved = { separator: saved.separator, seqPadding: saved.seqPadding };
                });
                setRows(init);
                setShared(sharedFromSaved ?? { separator: '-', seqPadding: 4 });
            })
            .catch(e => showToast(errorMessage(e, 'Erro ao carregar'), 'error'))
            .finally(() => { if (!cancelled) setLoading(false); });

        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orgId]);

    const setRowSlot = (dt: DocType, index: number, token: SlotToken) => {
        setRows(prev => {
            const row = prev[dt];
            if (!row) return prev;
            const nextSlots = [...row.freeSlots];
            nextSlots[index] = token;
            return { ...prev, [dt]: { ...row, freeSlots: nextSlots } };
        });
    };

    const setRowPrefix = (dt: DocType, prefix: string) => {
        setRows(prev => {
            const row = prev[dt];
            if (!row) return prev;
            return { ...prev, [dt]: { ...row, prefix } };
        });
    };

    const handleSave = async () => {
        const target = await resolveWriteOrg('all-allowed');
        if (!target) return;
        setSaving(true);
        try {
            let ok = 0;
            const failed: { error: unknown }[] = [];
            for (const dt of ALL_DOC_TYPES) {
                const row = rows[dt];
                if (!row) continue;
                const cfg = rowToConfig(row, shared);
                const res = await forEachTargetOrg(target, targetOrgId => saveNumberingConfig(targetOrgId, dt, cfg));
                ok += res.ok;
                failed.push(...res.failed);
            }
            if (ok === 0 && failed.length > 0) {
                showToast(errorMessage(failed[0]?.error, 'Erro ao salvar'), 'error');
                return;
            }
            showToast(
                failed.length
                    ? `Salvo (${ok} de ${ok + failed.length} gravações — ${partialFailureNote(failed)}).`
                    : 'Salvo!',
                'success',
            );
        } finally {
            setSaving(false);
        }
    };

    const handleResetRow = async (dt: DocType) => {
        if (!await confirm({ title: `Restaurar padrão de "${DOC_TYPE_CATALOG[dt].label}"?`, variant: 'warning', confirmLabel: 'Restaurar' })) return;
        const target = await resolveWriteOrg('all-allowed');
        if (!target) return;
        try {
            await forEachTargetOrg(target, targetOrgId => resetNumberingConfig(targetOrgId, dt));
            setRows(prev => ({ ...prev, [dt]: rowFromConfig(getDocTypeDefault(dt)) }));
            showToast('Restaurado ao padrão.', 'success');
        } catch (e) {
            showToast(errorMessage(e, 'Erro ao restaurar'), 'error');
        }
    };

    const renderRow = (dt: DocType) => {
        const row = rows[dt];
        if (!row) return null;
        const usedTokens = new Set(row.freeSlots.filter(t => t !== 'EMPTY'));
        const preview = formatDocumentNumber(rowToConfig(row, shared), PREVIEW_VALUES, 1);

        return (
            <tr key={dt} className="hover:bg-blue-50/50 transition-colors">
                <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-700 whitespace-nowrap">
                    {DOC_TYPE_CATALOG[dt].label}
                </td>
                <td className="px-6 py-2.5 border-r border-gray-100">
                    <input
                        type="text"
                        value={row.prefix}
                        onChange={e => setRowPrefix(dt, e.target.value)}
                        placeholder="—"
                        className="w-20 px-2 py-1 bg-gray-50 border border-gray-200 rounded text-sm font-normal focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                    />
                </td>
                {row.freeSlots.map((token, i) => (
                    <td key={i} className="px-6 py-2.5 border-r border-gray-100 min-w-[150px]">
                        <select
                            value={token}
                            onChange={e => setRowSlot(dt, i, e.target.value as SlotToken)}
                            className={`text-sm font-normal px-2 py-1 rounded border transition-all appearance-none cursor-pointer w-full ${
                                token !== 'EMPTY' ? 'text-gray-900 bg-gray-50 border-gray-100' : 'text-gray-400 bg-white border-dashed border-gray-200'
                            }`}
                        >
                            <option value="EMPTY">— vazio —</option>
                            {ALL_VARIABLE_TOKENS.map(v => (
                                <option key={v} value={v} disabled={usedTokens.has(v) && token !== v}>
                                    {TOKEN_LABEL[v]}
                                </option>
                            ))}
                        </select>
                    </td>
                ))}
                <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600 whitespace-nowrap">
                    {preview}
                </td>
                <td className="px-6 py-2.5 last:border-r-0">
                    <div className="flex items-center justify-end">
                        <ActionIconButton kind="settings" title="Restaurar padrão" icon={<RotateCcw className="w-4 h-4" />} onClick={() => handleResetRow(dt)} />
                    </div>
                </td>
            </tr>
        );
    };

    const tableHead = (
        <thead className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
            <tr>
                <th className="px-6 py-2 border-r border-gray-100 text-left whitespace-nowrap">Módulo</th>
                <th className="px-6 py-2 border-r border-gray-100 text-left">Prefixo</th>
                {Array.from({ length: FREE_SLOTS }).map((_, i) => (
                    <th key={i} className="px-6 py-2 border-r border-gray-100 text-left min-w-[150px]">Livre</th>
                ))}
                <th className="px-6 py-2 border-r border-gray-100 text-left whitespace-nowrap">Prévia</th>
                <th className="px-6 py-2 text-right">Ações</th>
            </tr>
        </thead>
    );

    return (
        <div className="bg-white rounded-[10px] shadow-sm border border-gray-100 p-6">
            <div className="flex items-start gap-4">
                <div className="p-3 bg-indigo-50 rounded-[10px]">
                    <Hash className="w-6 h-6 text-indigo-600" />
                </div>
                <div>
                    <h2 className="text-lg font-semibold text-gray-800">Nomenclatura</h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Monte o número de cada módulo escolhendo, para as posições livres, uma variável do sistema ou deixe vazio.
                        O Prefixo é sempre o 1º segmento do número; o sequencial reinicia para cada combinação diferente de variáveis.
                    </p>
                </div>
            </div>

            {/* Controle único de Separador/Dígitos — vale para TODAS as linhas da página. */}
            <div className="border-t border-gray-100 mt-4 pt-4 flex flex-wrap items-end gap-4">
                <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Separador</label>
                    <div className="flex h-9 bg-gray-50 border border-gray-200 rounded-[6px] overflow-hidden w-24">
                        {(['-', '.'] as const).map(sep => (
                            <button
                                key={sep}
                                type="button"
                                onClick={() => setShared(s => ({ ...s, separator: sep }))}
                                className={`flex-1 text-sm font-mono transition-colors ${shared.separator === sep ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
                            >
                                {sep}
                            </button>
                        ))}
                    </div>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Dígitos do Sequencial</label>
                    <input
                        type="number"
                        min={1}
                        max={9}
                        value={shared.seqPadding}
                        onChange={e => setShared(s => ({ ...s, seqPadding: Number(e.target.value) || 1 }))}
                        className="w-24 h-9 px-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                    />
                </div>
                <p className="text-xs text-gray-400 mb-2">Vale para todas as linhas abaixo — não é mais configurável por módulo.</p>
            </div>

            {loading ? (
                <div className="flex items-center gap-2 text-sm text-gray-400 mt-6"><Loader2 className="w-4 h-4 animate-spin" /> Carregando...</div>
            ) : (
                <div className="mt-6 space-y-8">
                    <div>
                        <div className="overflow-x-auto rounded-[10px] border border-gray-100">
                            <table className="w-full text-left border-collapse">
                                {tableHead}
                                <tbody className="divide-y divide-gray-200">
                                    {MAIN_DOC_TYPES.map(renderRow)}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div>
                        <h3 className="text-sm font-semibold text-gray-600 mb-2">CRM &amp; Negociações</h3>
                        <div className="overflow-x-auto rounded-[10px] border border-gray-100">
                            <table className="w-full text-left border-collapse">
                                {tableHead}
                                <tbody className="divide-y divide-gray-200">
                                    {ADVANCED_DOC_TYPES.map(renderRow)}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex justify-end mt-6">
                <button onClick={handleSave} disabled={saving || loading} className="flex items-center gap-1.5 h-9 px-3.5 bg-indigo-600 text-white rounded-[6px] hover:bg-indigo-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50">
                    {saving ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Hash className="w-[15px] h-[15px]" />}
                    {saving ? 'Salvando...' : 'Salvar'}
                </button>
            </div>

            {localToast && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
                    localToast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    {localToast.type === 'success' ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                    {localToast.message}
                </div>
            )}

            {orgTargetModal}
        </div>
    );
};

export default NomenclaturaTable;
