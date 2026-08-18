import React from 'react';
import { Hash, RotateCcw, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useOrgContext, useOrgWriteTarget, forEachTargetOrg, errorMessage, partialFailureNote } from '../../hooks/useOrgContext';
import { useConfirm } from '../ui/confirm';
import {
    DOC_TYPE_CATALOG, getDocTypeDefault, getNumberingConfig, saveNumberingConfig, resetNumberingConfig,
    formatDocumentNumber, DocType, NumberingConfig, SlotToken, VariableToken,
} from '../../services/documentNumbering';

const TOKEN_LABEL: Record<VariableToken, string> = {
    EMPREENDIMENTO: 'Empreendimento',
    OBRA: 'Obra',
    UNIDADE: 'Unidade',
    CLIENTE: 'Cliente',
    FORNECEDOR: 'Fornecedor',
    ORGANIZACAO: 'Organização',
    CENTRO_CUSTO: 'Centro de Custo',
};

/** Valores fictícios para a pré-visualização — mesmo espírito do preview antigo (RES01/TR1). */
const PREVIEW_VALUES: Record<VariableToken, string> = {
    EMPREENDIMENTO: 'RES01',
    OBRA: 'TR1',
    UNIDADE: '101',
    CLIENTE: 'CLI001',
    FORNECEDOR: 'FORN003',
    ORGANIZACAO: 'ORG001',
    CENTRO_CUSTO: 'CC004',
};

const MAX_SLOTS = 8;

const padSlots = (slots: SlotToken[]): SlotToken[] => {
    const out = slots.slice(0, MAX_SLOTS);
    while (out.length < MAX_SLOTS) out.push('EMPTY');
    return out;
};

interface Props {
    docType: DocType;
}

/**
 * Card de configuração de UM documento em Configurações do Sistema ›
 * Nomenclatura. Substitui os 5 blocos quase idênticos que existiam em
 * `Settings.tsx` (um por documento) por um único componente parametrizado —
 * agora usado pelos 11 documentos ligados à Nomenclatura (pedido de
 * 2026-08-17).
 *
 * Segue REGRA #5: o seletor do topo manda. Com uma organização no contexto,
 * lê/grava direto nela. Em "Todas as organizações", oferece replicar a mesma
 * máscara em todas — mesmo padrão de PaymentTypesSettings.tsx.
 */
const NumberingSettingsCard: React.FC<Props> = ({ docType }) => {
    const catalog = DOC_TYPE_CATALOG[docType];
    const { orgId } = useOrgContext();
    const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();
    const confirm = useConfirm();

    const [config, setConfig] = React.useState<NumberingConfig>(() => getDocTypeDefault(docType));
    const [loading, setLoading] = React.useState(false);
    const [saving, setSaving] = React.useState(false);
    const [status, setStatus] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);

    React.useEffect(() => {
        let cancelled = false;
        if (!orgId) {
            // "Todas as organizações": não há uma config única para mostrar —
            // parte do default até o usuário salvar (aí escolhe o destino).
            setConfig(getDocTypeDefault(docType));
            return;
        }
        setLoading(true);
        getNumberingConfig(orgId, docType)
            .then(cfg => { if (!cancelled) setConfig(cfg); })
            .catch(e => { if (!cancelled) setStatus({ message: errorMessage(e, 'Erro ao carregar'), type: 'error' }); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [orgId, docType]);

    const slots = padSlots(config.slots);
    const usedTokens = new Set(slots.filter(t => t !== 'EMPTY'));

    const setSlot = (index: number, token: SlotToken) => {
        const next = [...slots];
        next[index] = token;
        // Trim EMPTY do fim para não persistir um array cheio de vazios.
        while (next.length > 0 && next[next.length - 1] === 'EMPTY') next.pop();
        setConfig(c => ({ ...c, slots: next }));
    };

    const preview = formatDocumentNumber(config, PREVIEW_VALUES, 1);

    const handleSave = async () => {
        const target = await resolveWriteOrg('all-allowed');
        if (!target) return;
        setSaving(true);
        try {
            const { ok, failed } = await forEachTargetOrg(target, targetOrgId =>
                saveNumberingConfig(targetOrgId, docType, config));
            if (ok === 0) {
                setStatus({ message: errorMessage(failed[0]?.error, 'Erro ao salvar'), type: 'error' });
                return;
            }
            setStatus({
                message: failed.length
                    ? `Salvo em ${ok} de ${ok + failed.length} organizações (${partialFailureNote(failed)}).`
                    : (ok > 1 ? `Salvo em ${ok} organizações.` : 'Salvo!'),
                type: 'success',
            });
        } finally {
            setSaving(false);
            setTimeout(() => setStatus(null), 4000);
        }
    };

    const handleReset = async () => {
        if (!await confirm({ title: 'Restaurar padrão desta máscara?', variant: 'warning', confirmLabel: 'Restaurar' })) return;
        const target = await resolveWriteOrg('all-allowed');
        if (!target) return;
        setSaving(true);
        try {
            await forEachTargetOrg(target, targetOrgId => resetNumberingConfig(targetOrgId, docType));
            setConfig(getDocTypeDefault(docType));
            setStatus({ message: 'Restaurado ao padrão.', type: 'success' });
        } finally {
            setSaving(false);
            setTimeout(() => setStatus(null), 4000);
        }
    };

    return (
        <div className="bg-white rounded-[10px] shadow-sm border border-gray-100 p-6">
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                    <div className="p-3 bg-indigo-50 rounded-[10px]">
                        <Hash className="w-6 h-6 text-indigo-600" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-gray-800">{catalog.label}</h2>
                        <p className="text-sm text-gray-500 mt-1">
                            Monte o número escolhendo, para cada posição, uma variável, o prefixo ou deixe vazio.
                            O sequencial reinicia para cada combinação diferente de variáveis.
                        </p>
                    </div>
                </div>
                <button onClick={handleReset} disabled={saving} className="flex items-center gap-1.5 text-button text-gray-700 hover:text-gray-900 transition-colors shrink-0 disabled:opacity-50">
                    <RotateCcw className="w-3.5 h-3.5" /> Padrão
                </button>
            </div>

            {loading ? (
                <div className="flex items-center gap-2 text-sm text-gray-400 mt-6"><Loader2 className="w-4 h-4 animate-spin" /> Carregando...</div>
            ) : (
                <div className="border-t border-gray-100 pt-6 mt-4 space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Posições do número (esquerda → direita, antes do sequencial)</label>
                        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                            {slots.map((token, i) => (
                                <select
                                    key={i}
                                    value={token}
                                    onChange={e => setSlot(i, e.target.value as SlotToken)}
                                    className="w-full px-2 py-2.5 bg-gray-50 border border-gray-200 rounded-[6px] text-xs font-mono focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                                >
                                    <option value="EMPTY">— vazio —</option>
                                    <option value="PREFIX" disabled={usedTokens.has('PREFIX') && token !== 'PREFIX'}>Prefixo</option>
                                    {catalog.supportedVariables.map(v => (
                                        <option key={v} value={v} disabled={usedTokens.has(v) && token !== v}>
                                            {TOKEN_LABEL[v]}
                                        </option>
                                    ))}
                                </select>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Prefixo</label>
                            <input
                                type="text"
                                value={config.prefix}
                                onChange={e => setConfig(c => ({ ...c, prefix: e.target.value }))}
                                disabled={!usedTokens.has('PREFIX')}
                                placeholder="PC"
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-mono focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all disabled:opacity-50"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Separador</label>
                            <div className="flex h-[46px] bg-gray-50 border border-gray-200 rounded-[6px] overflow-hidden">
                                {(['-', '.'] as const).map(sep => (
                                    <button
                                        key={sep}
                                        type="button"
                                        onClick={() => setConfig(c => ({ ...c, separator: sep }))}
                                        className={`flex-1 text-sm font-mono transition-colors ${config.separator === sep ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
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
                                value={config.seqPadding}
                                onChange={e => setConfig(c => ({ ...c, seqPadding: Number(e.target.value) || 1 }))}
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-mono focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                            />
                        </div>
                    </div>

                    <div className="bg-gray-50 border border-gray-200 rounded-[6px] px-4 py-3">
                        <span className="block text-xs font-semibold text-slate-500 mb-1.5">Pré-visualização</span>
                        <span className="font-mono text-sm text-gray-700">{preview}</span>
                    </div>

                    {status && (
                        <p className={`text-xs flex items-center gap-1.5 ${status.type === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>
                            {status.type === 'error' ? <AlertCircle className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5" />}
                            {status.message}
                        </p>
                    )}
                </div>
            )}

            <div className="flex justify-end mt-4">
                <button onClick={handleSave} disabled={saving || loading} className="flex items-center gap-1.5 h-9 px-3.5 bg-indigo-600 text-white rounded-[6px] hover:bg-indigo-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50">
                    {saving ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Hash className="w-[15px] h-[15px]" />}
                    {saving ? 'Salvando...' : 'Salvar'}
                </button>
            </div>

            {orgTargetModal}
        </div>
    );
};

export default NumberingSettingsCard;
