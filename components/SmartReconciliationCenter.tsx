import React, { useState, useMemo } from 'react';
import {
    Zap, Check, X, RefreshCw, Settings2, ArrowLeftRight, Loader2,
    Landmark, FileText, ShieldCheck, Building2, User, AlertCircle, ListChecks, Lightbulb,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { bankReconciliationService, type ReconciliationRuleRow } from '../services/bankReconciliationService';
import { reconciliationReprocessService, resumoDoReprocesso } from '../services/reconciliationReprocessService';
import { reconciliationMemoryService, type ClassificationMemory } from '../services/reconciliationMemoryService';
import { regrasSugeridasDaMemoria } from '../utils/reconciliationRules';
import RegrasSheet, { type RegraPreenchida } from './reconciliation/RegrasSheet';
import type { ClientOption } from './ClientSelect';
import type { SupplierOption } from './SupplierSelect';
import { useToast } from '../hooks/useToast';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from './ui/sheet';
import { FilterPopover } from './ui/FilterPopover';
import { useConfirm } from './ui/confirm';
import GroupMatchPanel from './GroupMatchPanel';
import { formatMoney as formatBRL, formatDateBR as formatDate } from './ui/Format';

interface CandidateTx {
    id: string;
    description?: string;
    amount?: number;
    entity_name?: string;
    party_name?: string;
    party_type?: 'SUPPLIER' | 'CLIENT' | string;
    due_date?: string;
    transaction_date?: string;
}

/** Rótulo + nome da contraparte, inferindo o tipo pela direção quando não há party_type. */
function partyInfo(name?: string | null, partyType?: string, direction?: 'CREDIT' | 'DEBIT') {
    if (!name) return null;
    const isClient = partyType ? partyType === 'CLIENT' : direction === 'CREDIT';
    return { label: isClient ? 'Cliente' : 'Fornecedor', name, isClient };
}
interface SuggestionRow {
    id: string;
    bank_transaction_id: string;
    candidate_internal_transaction_id: string | null;
    confidence: number;
    reason?: string;
    candidate_internal_transaction?: CandidateTx | null;
    [k: string]: unknown;
}
interface BankTx {
    id: string;
    description_raw?: string;
    description_normalized?: string;
    counterparty_name?: string;
    transaction_date: string;
    amount: number;
    direction: 'CREDIT' | 'DEBIT';
}

type Band = 'all' | 'high' | 'mid' | 'low';
const HIGH = 80, MID = 50;

function bandOf(conf: number): Exclude<Band, 'all'> {
    if (conf >= HIGH) return 'high';
    if (conf >= MID) return 'mid';
    return 'low';
}
// §8: status é texto colorido — sem pílula, fundo nem caixa alta.
const BAND_STYLE: Record<Exclude<Band, 'all'>, { label: string; text: string }> = {
    high: { label: 'Alta confiança', text: 'text-emerald-700' },
    mid:  { label: 'Média confiança', text: 'text-amber-700' },
    low:  { label: 'Baixa confiança', text: 'text-gray-500' },
};

interface SmartReconciliationCenterProps {
    organizationId: string;
    selectedAccountId: string | null;
    suggestions: SuggestionRow[];
    bankTransactions: BankTx[];
    onConfirm: (bankTxId: string, internalTxId: string) => Promise<void> | void;
    onReject: (bankTransactionId: string) => Promise<void> | void;
    onReload: () => Promise<void> | void;
    /** Para o painel de Regras (formulário): categorias e cadastros com id/nome. */
    categories: string[];
    clienteRegistros: ClientOption[];
    credorRegistros: SupplierOption[];
}

/** Quantas "regras sugeridas" a Central mostra de uma vez. */
const MAX_SUGERIDAS = 5;

const DEFAULT_SETTINGS = {
    value_tol_abs: 50, value_tol_pct: 3, encargos_tol_pct: 0.5,
    date_window_days: 10, auto_threshold: 100, suggestion_min: 40,
};

const SmartReconciliationCenter: React.FC<SmartReconciliationCenterProps> = ({
    organizationId, selectedAccountId, suggestions, bankTransactions, onConfirm, onReject, onReload,
    categories, clienteRegistros, credorRegistros,
}) => {
    // ⚠️ `localToast` PRECISA ser desenhado. A Central chamava showToast em nove
    // lugares e nunca renderizava nada: toda mensagem, de erro e de sucesso, era
    // jogada fora. Foi por isso que o usuário clicou em Reprocessar e a tela ficou
    // muda enquanto o console mostrava 22P02 — guia §13.
    const { localToast, showToast } = useToast();
    const confirmar = useConfirm();

    /** Última execução do motor nesta conta. Responde "rodou? quando? deu erro?" —
     *  a pergunta que em 06/09/2026 só o banco de dados sabia responder. */
    const [ultimaExecucao, setUltimaExecucao] = useState<{
        status: string; trigger: string; started_at: string; auto_matched: number;
        transfers_paired: number; suggestions: number; error_message: string | null;
    } | null>(null);

    const carregarUltimaExecucao = React.useCallback(async () => {
        if (!selectedAccountId) { setUltimaExecucao(null); return; }
        try {
            const r = await bankReconciliationService.ultimaExecucao(selectedAccountId);
            setUltimaExecucao((r as never) ?? null);
        } catch { setUltimaExecucao(null); }
    }, [selectedAccountId]);

    React.useEffect(() => { void carregarUltimaExecucao(); }, [carregarUltimaExecucao]);
    // ── Regras (antes: aba Regras) ─────────────────────────────────────────
    // Plano 2026-09-30-conciliacao-regras-absorvidas-pela-central. Regra é de UMA
    // organização: a da CONTA selecionada. A `organizationId` recebida vem vazia
    // com o topo em "Todas", então não serve para isto.
    const [orgDaConta, setOrgDaConta] = useState<string | null>(null);
    const [regras, setRegras] = useState<ReconciliationRuleRow[]>([]);
    const [sugeridas, setSugeridas] = useState<ClassificationMemory[]>([]);
    const [regrasAberto, setRegrasAberto] = useState(false);
    const [preenchida, setPreenchida] = useState<RegraPreenchida | null>(null);

    const carregarRegras = React.useCallback(async () => {
        if (!selectedAccountId) { setOrgDaConta(null); setRegras([]); setSugeridas([]); return; }
        try {
            const org = await bankReconciliationService.resolverOrganizacaoDaConta(selectedAccountId, organizationId);
            setOrgDaConta(org);
            if (!org) { setRegras([]); setSugeridas([]); return; }
            const [lista, candidatas] = await Promise.all([
                bankReconciliationService.listarRegras(org),
                reconciliationMemoryService.candidatasARegra(org, 5),
            ]);
            setRegras(lista);
            setSugeridas(regrasSugeridasDaMemoria(candidatas, lista));
        } catch (e) {
            console.error('[Center] regras', e);
            setRegras([]);
            setSugeridas([]);
        }
    }, [selectedAccountId, organizationId]);

    React.useEffect(() => { void carregarRegras(); }, [carregarRegras]);

    const aceitarSugestao = (c: ClassificationMemory) => {
        setPreenchida({
            name: `Classificação de ${c.party_name || c.counterparty_key}`,
            contem: c.counterparty_key,
            category: c.category ?? '',
            counterparty: c.party_name ?? '',
            direcao: c.party_type === 'CLIENT' ? 'CREDIT' : c.party_type === 'SUPPLIER' ? 'DEBIT' : '',
        });
        setRegrasAberto(true);
    };

    const [band, setBand] = useState<Band>('all');
    const [busy, setBusy] = useState<string | null>(null);
    const [reprocessing, setReprocessing] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [settings, setSettings] = useState(DEFAULT_SETTINGS);
    const [savingSettings, setSavingSettings] = useState(false);

    const bankMap = useMemo(() => {
        const m = new Map<string, BankTx>();
        bankTransactions.forEach(b => m.set(b.id, b));
        return m;
    }, [bankTransactions]);

    // Melhor sugestão por movimento bancário
    const bestPerBank = useMemo(() => {
        const byBank = new Map<string, SuggestionRow[]>();
        for (const s of suggestions) {
            if (!s.candidate_internal_transaction_id) continue;
            const arr = byBank.get(s.bank_transaction_id) ?? [];
            arr.push(s); byBank.set(s.bank_transaction_id, arr);
        }
        const rows: { sug: SuggestionRow; alt: number }[] = [];
        for (const arr of byBank.values()) {
            arr.sort((a, b) => b.confidence - a.confidence);
            rows.push({ sug: arr[0], alt: arr.length - 1 });
        }
        return rows.sort((a, b) => b.sug.confidence - a.sug.confidence);
    }, [suggestions]);

    const counts = useMemo(() => {
        const c = { high: 0, mid: 0, low: 0 };
        bestPerBank.forEach(({ sug }) => { c[bandOf(sug.confidence)]++; });
        return c;
    }, [bestPerBank]);

    const visible = useMemo(
        () => band === 'all' ? bestPerBank : bestPerBank.filter(({ sug }) => bandOf(sug.confidence) === band),
        [bestPerBank, band],
    );

    const run = async (key: string, fn: () => Promise<void>) => {
        setBusy(key);
        try { await fn(); } catch (e) { console.error('[Center]', e); showToast('Erro na ação', 'error'); }
        finally { setBusy(null); }
    };

    const confirm = (sug: SuggestionRow) =>
        run(sug.id, async () => {
            await onConfirm(sug.bank_transaction_id, sug.candidate_internal_transaction_id!);
            showToast('Conciliado', 'success');
        });

    const reject = (sug: SuggestionRow) =>
        run(sug.id, async () => {
            // Dispensa o movimento inteiro (todas as sugestões dele), não só o candidato exibido
            await onReject(sug.bank_transaction_id);
            showToast('Sugestões descartadas', 'success');
        });

    const confirmAllHigh = async () => {
        const n = bestPerBank.filter(({ sug }) => sug.confidence >= HIGH).length;
        if (n === 0) return;
        // Concilia tudo de uma vez: antes era sem confirmação — um clique errado
        // gravava dezenas de vínculos (desfazer é um por um, em Conciliados).
        const ok = await confirmar({
            title: `Conciliar ${n} sugestão(ões) de alta confiança?`,
            message: `Cada movimento do extrato é vinculado ao seu melhor candidato (score ≥ ${HIGH}%). Para desfazer, use a aba Conciliados, vínculo por vínculo.`,
            variant: 'warning',
            confirmLabel: `Conciliar ${n}`,
        });
        if (!ok) return;
        return run('bulk', async () => {
            const highs = bestPerBank.filter(({ sug }) => sug.confidence >= HIGH);
            for (const { sug } of highs) {
                await onConfirm(sug.bank_transaction_id, sug.candidate_internal_transaction_id!);
            }
            showToast(`${highs.length} conciliação(ões) de alta confiança aplicadas`, 'success');
            await onReload();
        });
    };

    const reprocess = async () => {
        if (!selectedAccountId) { showToast('Selecione uma conta bancária', 'error'); return; }
        setReprocessing(true);
        try {
            // Memória → regras → motor (antes: só o motor; memória e regras eram outros
            // dois botões em outros dois lugares). O toast diz de onde veio cada número,
            // e uma etapa que falhou aparece nele — não só no console.
            const r = await reconciliationReprocessService.reprocessarTudo(selectedAccountId, organizationId);
            await onReload();
            showToast(resumoDoReprocesso(r), r.erros.length > 0 ? 'error' : 'success');
        } catch (e) {
            // A mensagem REAL, não "Erro ao reprocessar". O texto genérico escondeu duas
            // vezes o mesmo defeito (22P02 por organização vazia): o botão parecia não
            // fazer nada, e sem o texto ninguém tinha como saber por quê. O erro do
            // PostgREST vem em `message`/`details`/`hint`, não em `Error.message`.
            console.error('[Center] reprocess', e);
            const err = e as { message?: string; details?: string; hint?: string; code?: string };
            const detalhe = [err?.message, err?.details, err?.hint].filter(Boolean).join(' · ')
                || (typeof e === 'string' ? e : JSON.stringify(e));
            showToast(`Não foi possível reprocessar: ${detalhe}${err?.code ? ` (${err.code})` : ''}`, 'error');
        } finally {
            setReprocessing(false);
            void carregarUltimaExecucao();
        }
    };

    // Tolerância é da organização da CONTA (a mesma das Regras). Com o topo em "Todas"
    // a `organizationId` recebida vem vazia: a leitura quebrava (22P02) e caía no padrão
    // sem avisar, e salvar falhava. Erro de leitura agora aparece.
    const openSettings = async () => {
        if (!orgDaConta) return;
        try {
            const { data, error } = await supabase
                .from('reconciliation_settings')
                .select('value_tol_abs, value_tol_pct, encargos_tol_pct, date_window_days, auto_threshold, suggestion_min')
                .eq('organization_id', orgDaConta)
                .maybeSingle();
            if (error) throw error;
            setSettings(data ? { ...DEFAULT_SETTINGS, ...data } : DEFAULT_SETTINGS);
        } catch (e) {
            console.error('[Center] openSettings', e);
            setSettings(DEFAULT_SETTINGS);
            showToast('Não foi possível ler as tolerâncias salvas — mostrando os valores padrão', 'error');
        }
        setShowSettings(true);
    };

    const saveSettings = async () => {
        if (!orgDaConta) return;
        setSavingSettings(true);
        try {
            const { error } = await supabase
                .from('reconciliation_settings')
                .upsert({ organization_id: orgDaConta, ...settings, updated_at: new Date().toISOString() }, { onConflict: 'organization_id' });
            if (error) throw error;
            showToast('Configuração salva (aplica no próximo reprocesso)', 'success');
            setShowSettings(false);
        } catch (e) {
            console.error('[Center] saveSettings', e);
            const err = e as { message?: string; code?: string };
            showToast(`Erro ao salvar as tolerâncias: ${err?.message ?? String(e)}${err?.code ? ` (${err.code})` : ''}`, 'error');
        } finally {
            setSavingSettings(false);
        }
    };

    const setNum = (k: keyof typeof settings) => (e: React.ChangeEvent<HTMLInputElement>) =>
        setSettings(s => ({ ...s, [k]: Number(e.target.value) }));

    const semConta = 'Selecione uma conta bancária: regras e tolerâncias são da organização dela';
    const label = 'text-xs font-semibold text-slate-500';

    return (
        <div className="space-y-6 min-h-[500px]">
            {/* Sugestões — §5.2: toolbar e lista no MESMO card. O <h1> "Central de
                Conciliação" do pai já diz onde o usuário está (§18): sem título repetido. */}
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-2 border-b border-gray-100 bg-white">
                    <div className="flex flex-col lg:flex-row gap-2.5 lg:items-center">
                        <div className="flex flex-wrap items-center gap-2.5 min-w-0 flex-1">
                            <FilterPopover<Band>
                                label="Confiança"
                                value={band}
                                onChange={setBand}
                                allValue="all"
                                options={[
                                    { value: 'all', label: `Todas (${bestPerBank.length})` },
                                    { value: 'high', label: `Alta (${counts.high})` },
                                    { value: 'mid', label: `Média (${counts.mid})` },
                                    { value: 'low', label: `Baixa (${counts.low})` },
                                ]}
                            />
                            {/* "Rodou?" respondido pela tela, não pelo banco de dados. */}
                            {ultimaExecucao && (
                                <p className={`text-sm min-w-0 ${ultimaExecucao.status === 'FAILED' ? 'text-red-600' : 'text-gray-500'}`}>
                                    {ultimaExecucao.status === 'FAILED' ? (
                                        <>
                                            A última execução, em {formatDate(ultimaExecucao.started_at)}, <span className="font-semibold">falhou</span>
                                            {ultimaExecucao.error_message ? `: ${ultimaExecucao.error_message}` : '.'}
                                        </>
                                    ) : ultimaExecucao.status === 'RUNNING' ? (
                                        <>Uma execução iniciada em {formatDate(ultimaExecucao.started_at)} não terminou.</>
                                    ) : (
                                        <>
                                            Última execução em {formatDate(ultimaExecucao.started_at)}
                                            {ultimaExecucao.trigger === 'IMPORT' ? ', após importar extrato' : ''}:{' '}
                                            {ultimaExecucao.auto_matched} conciliada(s) sozinha(s), {ultimaExecucao.transfers_paired} transferência(s),{' '}
                                            {ultimaExecucao.suggestions} sugestão(ões).
                                        </>
                                    )}
                                </p>
                            )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <button
                                onClick={reprocess}
                                disabled={reprocessing || !selectedAccountId}
                                title={selectedAccountId ? 'Memória, regras e conciliação automática, nesta ordem' : 'Selecione uma conta bancária'}
                                className="flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] text-[13px] font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 transition-all disabled:opacity-50"
                            >
                                <RefreshCw className={`w-[15px] h-[15px] ${reprocessing ? 'animate-spin' : ''}`} />
                                Reprocessar
                            </button>
                            <button
                                onClick={() => { setPreenchida(null); setRegrasAberto(true); }}
                                disabled={!selectedAccountId}
                                title={selectedAccountId ? 'Regras de classificação desta organização' : semConta}
                                className="flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] text-[13px] font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 transition-all disabled:opacity-50"
                            >
                                <ListChecks className="w-[15px] h-[15px]" />
                                Regras ({regras.length})
                            </button>
                            <button
                                onClick={openSettings}
                                disabled={!orgDaConta}
                                title={orgDaConta ? 'Tolerâncias da conciliação' : semConta}
                                className="h-9 w-9 flex items-center justify-center rounded-[6px] text-gray-500 bg-white border border-gray-200 hover:bg-gray-50 hover:text-gray-700 transition-all disabled:opacity-50"
                            >
                                <Settings2 className="w-4 h-4" />
                            </button>
                            <div className="hidden lg:block w-px h-6 bg-gray-200" />
                            {/* §17 — a única ação azul sólida da tela */}
                            <button
                                onClick={confirmAllHigh}
                                disabled={busy === 'bulk' || counts.high === 0}
                                title={counts.high === 0 ? 'Nenhuma sugestão de alta confiança agora' : `Conciliar as ${counts.high} sugestões com score ≥ ${HIGH}%`}
                                className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {busy === 'bulk' ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <ShieldCheck className="w-[15px] h-[15px]" />}
                                Conciliar alta confiança ({counts.high})
                            </button>
                        </div>
                    </div>
                </div>

                {visible.length === 0 ? (
                    <div className="text-center py-12">
                        <Zap className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma sugestão {band === 'all' ? 'para revisar' : 'nesta faixa'}</h3>
                        <p className="text-sm text-gray-500">Importe um extrato ou clique em Reprocessar para gerar sugestões.</p>
                    </div>
                ) : (
                    <div className="p-4 space-y-3 bg-gray-50/40">
                        {visible.map(({ sug, alt }) => {
                            const cand = sug.candidate_internal_transaction;
                            const bank = bankMap.get(sug.bank_transaction_id);
                            const bnd = bandOf(sug.confidence);
                            const reasons = (sug.reason || '').split(' · ').filter(Boolean);
                            const candParty = partyInfo(cand?.entity_name || cand?.party_name, cand?.party_type, bank?.direction);
                            const bankParty = bank?.counterparty_name
                                ? { label: bank.direction === 'CREDIT' ? 'Pagador' : 'Favorecido', name: bank.counterparty_name }
                                : null;
                            return (
                                <div key={sug.id} className="bg-white rounded-[10px] border border-gray-100 overflow-hidden">
                                    <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(200px,auto)_1fr]">
                                        {/* Sistema */}
                                        <div className="p-4 border-b lg:border-b-0 lg:border-r border-gray-100 min-w-0">
                                            <p className={`${label} flex items-center gap-1.5 mb-1`}><FileText className="w-3.5 h-3.5" /> Sistema</p>
                                            <p className="text-sm font-medium text-gray-900 truncate" title={cand?.description}>{cand?.description || '—'}</p>
                                            {candParty && (
                                                <p className={`text-sm flex items-center gap-1 mt-0.5 ${candParty.isClient ? 'text-emerald-700' : 'text-indigo-700'}`} title={`${candParty.label}: ${candParty.name}`}>
                                                    {candParty.isClient ? <User className="w-3.5 h-3.5 flex-shrink-0" /> : <Building2 className="w-3.5 h-3.5 flex-shrink-0" />}
                                                    <span className="truncate">{candParty.label}: {candParty.name}</span>
                                                </p>
                                            )}
                                            <p className="text-xs text-gray-500 mt-0.5">venc. {formatDate(cand?.due_date || cand?.transaction_date)}</p>
                                            <p className="text-sm font-semibold text-gray-900 tabular-nums mt-1">{formatBRL(cand?.amount)}</p>
                                        </div>

                                        {/* Centro: score + motivos — texto, sem pílula (§8) */}
                                        <div className="px-4 py-3 flex flex-col items-center justify-center gap-1 text-center border-b lg:border-b-0 border-gray-100">
                                            <ArrowLeftRight className="w-4 h-4 text-gray-400" />
                                            <p className={`text-sm font-semibold ${BAND_STYLE[bnd].text}`}>{sug.confidence}% · {BAND_STYLE[bnd].label}</p>
                                            {reasons.length > 0 && (
                                                <p className="text-xs text-gray-500 max-w-[260px]" title={reasons.join(' · ')}>
                                                    {reasons.slice(0, 4).join(' · ')}{reasons.length > 4 ? ` · +${reasons.length - 4}` : ''}
                                                </p>
                                            )}
                                        </div>

                                        {/* Extrato */}
                                        <div className="p-4 lg:border-l border-gray-100 min-w-0">
                                            <p className={`${label} flex items-center gap-1.5 mb-1`}><Landmark className="w-3.5 h-3.5" /> Extrato</p>
                                            <p className="text-sm font-medium text-gray-900 truncate" title={bank?.description_raw}>{bank?.description_normalized || bank?.description_raw || '—'}</p>
                                            {bankParty && (
                                                <p className="text-sm text-gray-600 flex items-center gap-1 mt-0.5" title={`${bankParty.label}: ${bankParty.name}`}>
                                                    <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
                                                    <span className="truncate">{bankParty.label}: {bankParty.name}</span>
                                                </p>
                                            )}
                                            <p className="text-xs text-gray-500 mt-0.5">{bank ? formatDate(bank.transaction_date) : '—'}</p>
                                            <p className={`text-sm font-semibold tabular-nums mt-1 ${bank?.direction === 'CREDIT' ? 'text-emerald-700' : 'text-red-600'}`}>{formatBRL(bank?.amount)}</p>
                                        </div>
                                    </div>

                                    {/* Ações — compactas; Conciliar em contorno para não competir com a primária (§17) */}
                                    <div className="flex items-center justify-between gap-2 px-4 py-2 border-t border-gray-100">
                                        <span className="text-xs text-gray-500">
                                            {alt > 0 ? `+${alt} candidato(s) alternativo(s)` : 'Melhor candidato'}
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => reject(sug)}
                                                disabled={busy === sug.id}
                                                title="Descarta todas as sugestões deste movimento (voltam no próximo Reprocessar)"
                                                className="flex items-center gap-1 h-8 px-3 rounded-[6px] text-[13px] font-medium text-gray-600 hover:bg-gray-100 transition-all disabled:opacity-50"
                                            >
                                                <X className="w-3.5 h-3.5" /> Descartar
                                            </button>
                                            <button
                                                onClick={() => confirm(sug)}
                                                disabled={busy === sug.id}
                                                className="flex items-center gap-1 h-8 px-3 rounded-[6px] text-[13px] font-medium text-blue-600 bg-white border border-blue-200 hover:bg-blue-50 transition-all disabled:opacity-50"
                                            >
                                                {busy === sug.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Conciliar
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Regras sugeridas pela memória: contraparte classificada ≥ 5 vezes, sem regra.
                "Revisar e criar" abre o formulário preenchido — nada é criado sem revisão. */}
            {sugeridas.length > 0 && (
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
                        <Lightbulb className="w-4 h-4 text-amber-500" />
                        <h3 className="text-sm font-semibold text-gray-900">Regras sugeridas</h3>
                        <span className="text-sm text-gray-500">· contrapartes que você já classificou várias vezes do mesmo jeito</span>
                    </div>
                    <ul className="divide-y divide-gray-100">
                        {sugeridas.slice(0, MAX_SUGERIDAS).map(c => (
                            <li key={c.id} className="flex items-center gap-4 px-4 py-2.5">
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm text-gray-900 truncate" title={c.counterparty_key}>
                                        Descrição contém "{c.counterparty_key}" → {c.category}
                                        {c.party_name ? ` · ${c.party_name}` : ''}
                                    </p>
                                    <p className="text-xs text-gray-500">{c.hits} classificações iguais</p>
                                </div>
                                <button
                                    onClick={() => aceitarSugestao(c)}
                                    className="h-9 px-3.5 rounded-[6px] text-[13px] font-medium text-blue-600 bg-white border border-blue-100 hover:bg-blue-50 transition-all shrink-0"
                                >
                                    Revisar e criar
                                </button>
                            </li>
                        ))}
                    </ul>
                    {sugeridas.length > MAX_SUGERIDAS && (
                        <p className="px-4 py-2 text-xs text-gray-500 border-t border-gray-100">
                            e mais {sugeridas.length - MAX_SUGERIDAS} — aparecem aqui conforme você cria as de cima.
                        </p>
                    )}
                </div>
            )}

            <RegrasSheet
                open={regrasAberto}
                onClose={() => { setRegrasAberto(false); setPreenchida(null); }}
                organizationId={orgDaConta}
                selectedAccountId={selectedAccountId}
                regras={regras}
                categories={categories}
                clienteRegistros={clienteRegistros}
                credorRegistros={credorRegistros}
                preenchida={preenchida}
                onChanged={carregarRegras}
            />

            {/* Conciliação agrupada (1 pagamento → N títulos e vice-versa) */}
            <GroupMatchPanel organizationId={organizationId} selectedAccountId={selectedAccountId} onReload={onReload} />

            {/* Tolerâncias — painel lateral (REGRA #4), malha §30 */}
            <Sheet open={showSettings} onClose={() => setShowSettings(false)} size="md">
                <SheetHeader onClose={() => setShowSettings(false)}>
                    <SheetTitle>Tolerâncias da conciliação</SheetTitle>
                    <SheetDescription>Ajustes do motor de score desta organização. Valem no próximo Reprocessar e na próxima importação.</SheetDescription>
                </SheetHeader>
                <SheetPanel className="p-6 space-y-8">
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                            <h3 className="text-sm font-semibold text-gray-900">Valor e data</h3>
                        </div>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                            {([
                                ['value_tol_abs', 'Tolerância de valor (R$)'],
                                ['value_tol_pct', 'Tolerância de valor (%)'],
                                ['encargos_tol_pct', 'Folga para encargos (%)'],
                                ['date_window_days', 'Janela de data (dias)'],
                            ] as [keyof typeof settings, string][]).map(([k, texto]) => (
                                <div key={k} className="space-y-1.5">
                                    <label htmlFor={`tol-${k}`} className={label}>{texto}</label>
                                    <input id={`tol-${k}`} type="number" value={settings[k]} onChange={setNum(k)} disabled={savingSettings}
                                        className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:opacity-50" />
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                            <h3 className="text-sm font-semibold text-gray-900">Score</h3>
                        </div>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                            {([
                                ['auto_threshold', 'Score para conciliar sozinho'],
                                ['suggestion_min', 'Score mínimo para sugerir'],
                            ] as [keyof typeof settings, string][]).map(([k, texto]) => (
                                <div key={k} className="space-y-1.5">
                                    <label htmlFor={`tol-${k}`} className={label}>{texto}</label>
                                    <input id={`tol-${k}`} type="number" value={settings[k]} onChange={setNum(k)} disabled={savingSettings}
                                        className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:opacity-50" />
                                </div>
                            ))}
                        </div>
                    </div>
                </SheetPanel>
                <SheetFooter>
                    <button onClick={() => setShowSettings(false)} disabled={savingSettings}
                        className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px] transition-all disabled:opacity-50">
                        Cancelar
                    </button>
                    <button onClick={saveSettings} disabled={savingSettings || !orgDaConta}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed">
                        {savingSettings && <Loader2 className="w-[15px] h-[15px] animate-spin" />}
                        Salvar tolerâncias
                    </button>
                </SheetFooter>
            </Sheet>

            {localToast && (
                <div
                    role="status"
                    aria-live="polite"
                    className={`fixed bottom-6 right-6 z-[300] flex items-start gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium max-w-lg ${
                        localToast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                    }`}
                >
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span className="whitespace-pre-wrap break-words">{localToast.message}</span>
                </div>
            )}
        </div>
    );
};

export default SmartReconciliationCenter;
