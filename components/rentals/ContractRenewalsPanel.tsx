import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, AlertTriangle, History } from 'lucide-react';
import { contractRenewalService, RenewalMode, RenewalPreview } from '../../services/contractRenewalService';
import { contractService } from '../../services/contractService';
import { Contract, ContractAddendum } from '../../types';

interface Props {
    /** Contrato gerado a partir desta negociação. */
    contract: Contract;
    onNotify: (msg: string, type?: 'success' | 'error' | 'info') => void;
    /** Recarrega o contrato no pai (vigência e valor mudam ao renovar). */
    onChanged?: () => void;
}

/** Data BR por split — `new Date(iso)` retrocede um dia em UTC-3. */
const fmtDate = (iso?: string) => {
    if (!iso) return '—';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
};
const fmtCur = (n?: number) =>
    (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtMonth = (iso?: string) => {
    if (!iso) return '';
    const [y, m] = iso.slice(0, 10).split('-');
    return `${m}/${y}`;
};
/** +N meses − 1 dia em UTC puro (em UTC-3 o construtor local retrocede um dia). */
const fimApos = (inicio: string, meses: number) => {
    const [y, m, d] = inicio.slice(0, 10).split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCMonth(dt.getUTCMonth() + meses);
    dt.setUTCDate(dt.getUTCDate() - 1);
    return dt.toISOString().slice(0, 10);
};

const LABEL = 'text-xs font-black text-gray-400 uppercase tracking-widest px-1';
const INPUT = 'w-full px-6 py-4 bg-gray-50 border border-transparent focus:bg-white focus:border-purple-500 rounded-2xl outline-none font-bold text-gray-700 transition-all shadow-inner';

/**
 * Renovações DESTE contrato, dentro da negociação.
 *
 * É o único lugar onde se renova: a aba Renovações do módulo Locações é apenas
 * a fila do que está vencendo e manda para cá.
 *
 * Os campos são os MESMOS da aba "Dados do contrato" (vigência, periodicidade,
 * índice, valor) porque é exatamente isso que a renovação define: sem eles não
 * há como saber de onde até quando as parcelas do período novo serão geradas.
 */
const ContractRenewalsPanel: React.FC<Props> = ({ contract, onNotify, onChanged }) => {
    const [addendums, setAddendums] = useState<ContractAddendum[]>([]);
    const [chain, setChain] = useState<Contract[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [preview, setPreview] = useState<RenewalPreview | null>(null);

    // Formulário do período novo
    const [mode, setMode] = useState<RenewalMode>('ADITIVO');
    const [endDate, setEndDate] = useState('');
    const [cycle, setCycle] = useState('');
    const [dueDay, setDueDay] = useState('');
    const [index, setIndex] = useState('');
    const [valor, setValor] = useState('');
    const [notes, setNotes] = useState('');

    // O contrato VIGENTE da cadeia, não necessariamente o desta negociação: se a
    // renovação anterior foi por "novo contrato", o daqui está Encerrado e quem
    // vale é o último filho. Renovar o encerrado falharia.
    // (Renovar por ADITIVO não produz essa divergência — mantém o mesmo contrato
    // e a mesma negociação; é a via padrão.)
    const vigente = chain.length > 0 ? chain[chain.length - 1] : contract;
    const outroContrato = vigente.id !== contract.id;
    const semVigencia = !vigente.end_date;

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const cadeia = await contractRenewalService.getRenewalChain(contract.id);
            setChain(cadeia);
            // Aditivos de TODA a cadeia: com renovação mista (um contrato novo e
            // depois prorrogações nele), os aditivos ficam no filho, não neste.
            const ids = cadeia.length > 0 ? cadeia.map(c => c.id) : [contract.id];
            const listas = await Promise.all(ids.map(id => contractService.listAddendums(id)));
            setAddendums(listas.flat().filter(a => a.new_start_date));
        } catch (e) {
            onNotify(`Erro ao carregar renovações: ${e instanceof Error ? e.message : ''}`, 'error');
        } finally {
            setLoading(false);
        }
    }, [contract.id, onNotify]);

    useEffect(() => { load(); }, [load]);

    // Prévia (datas, reajuste sugerido, nº de parcelas). Recalcula quando o
    // usuário muda o término ou a via.
    const carregarPreview = useCallback(async () => {
        if (!vigente.end_date) { setPreview(null); return; }
        try {
            const p = await contractRenewalService.previewRenewal(vigente.id, {
                endDate: endDate || undefined,
                mode,
            });
            setPreview(p);
            if (!endDate) setEndDate(p.endDate);
            if (!cycle) setCycle(p.parent.billing_cycle || 'Mensal');
            if (!dueDay) setDueDay(String(p.parent.due_day ?? ''));
            if (!index) setIndex(p.parent.reajuste_index || 'IGP-M');
            if (!valor) setValor(p.newValue.toFixed(2));
        } catch (e) {
            setPreview(null);
            onNotify(e instanceof Error ? e.message : 'Não foi possível calcular a renovação.', 'error');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [vigente.id, vigente.end_date, endDate, mode]);

    useEffect(() => { if (!loading) carregarPreview(); }, [loading, carregarPreview]);

    const handleRenovar = async () => {
        if (!preview) return;
        setSaving(true);
        try {
            const parsed = valor ? Number(valor.replace(',', '.')) : undefined;
            const overrides = {
                ...(cycle ? { billing_cycle: cycle as Contract['billing_cycle'] } : {}),
                ...(dueDay ? { due_day: Number(dueDay) } : {}),
                ...(index ? { reajuste_index: index } : {}),
            };
            const base = {
                endDate: endDate || undefined,
                newValue: parsed && parsed > 0 ? parsed : undefined,
                notes: notes || undefined,
                inheritTerms: false,
                overrides,
            };

            if (mode === 'ADITIVO') {
                await contractRenewalService.renewByAddendum(vigente.id, base);
                onNotify('Aditivo de prorrogação gerado e parcelas do novo período criadas.', 'success');
            } else {
                await contractRenewalService.renewContract(vigente.id, base);
                onNotify('Novo contrato criado e o anterior encerrado.', 'success');
            }
            setNotes('');
            setEndDate('');
            setValor('');
            await load();
            onChanged?.();
        } catch (e) {
            onNotify(e instanceof Error ? e.message : 'Erro ao renovar o contrato.', 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-8">
            {/* Situação atual */}
            <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100">
                <p className="text-sm font-bold text-gray-800">
                    {outroContrato ? `Contrato vigente ${vigente.number}: ` : 'Vigência atual: '}
                    {fmtDate(vigente.start_date)} a {fmtDate(vigente.end_date)}
                </p>
                <p className="text-xs font-medium text-gray-500 mt-1">
                    Aluguel {fmtCur(vigente.current_value ?? vigente.original_value)}
                    {vigente.billing_cycle ? ` · ${vigente.billing_cycle.toLowerCase()}` : ''}
                    {vigente.due_day ? ` · todo dia ${vigente.due_day}` : ''}
                    {vigente.reajuste_index ? ` · reajuste por ${vigente.reajuste_index}` : ''}
                    {outroContrato ? ` · ${contract.number} foi encerrado por renovação` : ''}
                </p>
            </div>

            {semVigencia ? (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-4 text-sm">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>Preencha o fim da vigência em "Dados do contrato" para poder renovar.</span>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Via da renovação */}
                    <div className="space-y-2">
                        <label className={LABEL}>Como renovar</label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => setMode('ADITIVO')}
                                className={`text-left p-5 rounded-2xl border transition-all ${
                                    mode === 'ADITIVO' ? 'border-purple-500 bg-purple-50/60 ring-2 ring-purple-500/20' : 'border-gray-200 bg-white hover:border-gray-300'
                                }`}
                            >
                                <p className="text-sm font-bold text-gray-900">Aditivo de prorrogação</p>
                                <p className="text-xs font-medium text-gray-500 mt-1">
                                    Mantém o contrato {vigente.number} e esta negociação. Só estende a vigência.
                                </p>
                            </button>
                            <button
                                type="button"
                                onClick={() => setMode('NOVO_CONTRATO')}
                                className={`text-left p-5 rounded-2xl border transition-all ${
                                    mode === 'NOVO_CONTRATO' ? 'border-purple-500 bg-purple-50/60 ring-2 ring-purple-500/20' : 'border-gray-200 bg-white hover:border-gray-300'
                                }`}
                            >
                                <p className="text-sm font-bold text-gray-900">Novo contrato</p>
                                <p className="text-xs font-medium text-gray-500 mt-1">
                                    Cria {preview?.nextNumber ?? 'um contrato novo'} e encerra o {vigente.number}.
                                </p>
                            </button>
                        </div>
                    </div>

                    {/* Vigência do período novo — mesmos campos de "Dados do contrato",
                        porque é isso que define de onde até quando as parcelas nascem. */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className={LABEL}>Início da Vigência</label>
                            <div
                                className="w-full px-6 py-4 bg-gray-100 border border-transparent rounded-2xl font-bold text-gray-500"
                                title="Dia seguinte ao fim da vigência atual — evita sobreposição de parcelas."
                            >
                                {fmtDate(preview?.startDate)}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between px-1">
                                <label className={LABEL.replace(' px-1', '')}>Fim da Vigência</label>
                                <div className="flex items-center gap-2">
                                    {[12, 24, 36].map(m => (
                                        <button
                                            key={m}
                                            type="button"
                                            onClick={() => preview && setEndDate(fimApos(preview.startDate, m))}
                                            className="text-[11px] font-black uppercase tracking-widest text-purple-600 hover:text-purple-700"
                                        >
                                            {m}m
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <input
                                type="date"
                                value={endDate}
                                onChange={e => setEndDate(e.target.value)}
                                className={INPUT}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <label className={LABEL}>Periodicidade</label>
                            <select value={cycle} onChange={e => setCycle(e.target.value)} className={`${INPUT} cursor-pointer`}>
                                <option value="Mensal">Mensal</option>
                                <option value="Bimestral">Bimestral</option>
                                <option value="Semestral">Semestral</option>
                                <option value="Anual">Anual</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className={LABEL}>Dia de Vencimento</label>
                            <input type="number" min="1" max="31" value={dueDay}
                                onChange={e => setDueDay(e.target.value)} className={INPUT} />
                        </div>
                        <div className="space-y-2">
                            <label className={LABEL}>Índice de Reajuste</label>
                            <select value={index} onChange={e => setIndex(e.target.value)} className={`${INPUT} cursor-pointer`}>
                                <option value="IGP-M">IGP-M</option>
                                <option value="IPCA">IPCA</option>
                                <option value="INCC">INCC</option>
                                <option value="INCC-M">INCC-M</option>
                                <option value="CUB">CUB</option>
                                <option value="OUTROS">Outros</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className={LABEL}>Valor do Aluguel</label>
                            <input type="number" step="0.01" min="0" value={valor}
                                onChange={e => setValor(e.target.value)} className={INPUT} />
                            {preview?.index && (
                                <p className="text-[11px] font-medium text-gray-400 px-1">
                                    {preview.index.name} {fmtMonth(preview.index.baseMonth)} → {fmtMonth(preview.index.currentMonth)}
                                    {' · '}fator {preview.fator.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                                    {' · '}sugerido {fmtCur(preview.newValue)}
                                </p>
                            )}
                            {preview?.reajusteWarning && (
                                <p className="text-[11px] font-bold text-amber-600 px-1">{preview.reajusteWarning}</p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <label className={LABEL}>Observações</label>
                            <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
                                placeholder="Opcional" className={INPUT} />
                        </div>
                    </div>

                    {/* Impacto — o que exatamente vai acontecer no financeiro */}
                    {preview && (
                        <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 text-blue-800 rounded-2xl p-4 text-sm">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            {mode === 'ADITIVO' ? (
                                <span>
                                    O contrato {vigente.number} <strong>não</strong> será encerrado: a vigência passa a
                                    terminar em {fmtDate(endDate || preview.endDate)} e serão geradas{' '}
                                    {preview.installmentsToGenerate} parcela(s) de {fmtDate(preview.startDate)} até lá.
                                    Parcelas anteriores não são afetadas.
                                </span>
                            ) : (
                                <span>
                                    Será criado o contrato {preview.nextNumber} com parcelas próprias e o {vigente.number}
                                    {' '}será encerrado
                                    {preview.pendingToCancel > 0
                                        ? `, cancelando ${preview.pendingToCancel} parcela(s) futura(s) dele.`
                                        : '. Nenhuma parcela futura dele será cancelada.'}
                                </span>
                            )}
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={handleRenovar}
                        disabled={saving || !preview || !endDate}
                        className="flex items-center gap-3 px-8 py-4 bg-purple-600 text-white rounded-2xl font-black hover:bg-purple-700 transition-all active:scale-95 disabled:opacity-50"
                    >
                        <RefreshCw className={`w-5 h-5 ${saving ? 'animate-spin' : ''}`} />
                        {saving ? 'PROCESSANDO…' : mode === 'ADITIVO' ? 'GERAR ADITIVO' : 'CRIAR NOVO CONTRATO'}
                    </button>
                </div>
            )}

            {/* Histórico */}
            {loading ? (
                <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600 mx-auto"></div>
                </div>
            ) : addendums.length === 0 && chain.length <= 1 ? null : (
                <div className="space-y-2">
                    <label className={LABEL}>Histórico de renovações</label>
                    {addendums.map(ad => (
                        <div key={ad.id} className="flex items-start gap-3 p-4 rounded-2xl border border-gray-100">
                            <History className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-gray-800">
                                    Aditivo {ad.number}
                                    <span className={`ml-2 text-sm font-normal ${
                                        ad.status === 'Aprovado' ? 'text-emerald-600'
                                            : ad.status === 'Cancelado' ? 'text-red-600' : 'text-amber-600'}`}>
                                        {ad.status}
                                    </span>
                                </p>
                                <p className="text-xs font-medium text-gray-500 mt-0.5">
                                    {fmtDate(ad.new_start_date)} a {fmtDate(ad.new_end_date)} · {fmtCur(ad.new_value)}
                                    {ad.previous_value != null && ad.previous_value !== ad.new_value
                                        ? ` (era ${fmtCur(ad.previous_value)})` : ''}
                                    {ad.installments_generated ? ` · ${ad.installments_generated} parcela(s) geradas` : ''}
                                </p>
                            </div>
                        </div>
                    ))}
                    {chain.filter(c => c.id !== contract.id).map(c => (
                        <div key={c.id} className="flex items-start gap-3 p-4 rounded-2xl border border-gray-100">
                            <RefreshCw className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-gray-800">
                                    Contrato {c.number}
                                    <span className="ml-2 text-sm font-normal text-gray-500">{c.status}</span>
                                </p>
                                <p className="text-xs font-medium text-gray-500 mt-0.5">
                                    {fmtDate(c.start_date)} a {fmtDate(c.end_date)} · {fmtCur(c.current_value)}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ContractRenewalsPanel;
