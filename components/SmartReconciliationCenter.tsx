import React, { useState, useMemo } from 'react';
import {
    Sparkles, Zap, Check, X, RefreshCw, Settings2, ArrowLeftRight,
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
import { Modal, ModalHeader, ModalBody, ModalFooter } from './ui/modal';
import GroupMatchPanel from './GroupMatchPanel';
import Button from './ui/Button';
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
const BAND_STYLE: Record<Exclude<Band, 'all'>, { label: string; chip: string }> = {
    high: { label: 'Alta confiança', chip: 'bg-emerald-50 text-emerald-700' },
    mid:  { label: 'Média confiança', chip: 'bg-amber-50 text-amber-700' },
    low:  { label: 'Baixa confiança', chip: 'bg-gray-100 text-gray-500' },
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

    const confirmAllHigh = () =>
        run('bulk', async () => {
            const highs = bestPerBank.filter(({ sug }) => sug.confidence >= HIGH);
            for (const { sug } of highs) {
                await onConfirm(sug.bank_transaction_id, sug.candidate_internal_transaction_id!);
            }
            showToast(`${highs.length} conciliação(ões) de alta confiança aplicadas`, 'success');
            await onReload();
        });

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

    const openSettings = async () => {
        try {
            const { data } = await supabase
                .from('reconciliation_settings')
                .select('value_tol_abs, value_tol_pct, encargos_tol_pct, date_window_days, auto_threshold, suggestion_min')
                .eq('organization_id', organizationId)
                .maybeSingle();
            setSettings(data ? { ...DEFAULT_SETTINGS, ...data } : DEFAULT_SETTINGS);
        } catch { setSettings(DEFAULT_SETTINGS); }
        setShowSettings(true);
    };

    const saveSettings = async () => {
        setSavingSettings(true);
        try {
            const { error } = await supabase
                .from('reconciliation_settings')
                .upsert({ organization_id: organizationId, ...settings, updated_at: new Date().toISOString() }, { onConflict: 'organization_id' });
            if (error) throw error;
            showToast('Configuração salva (aplica no próximo reprocesso)', 'success');
            setShowSettings(false);
        } catch (e) {
            console.error('[Center] saveSettings', e);
            showToast('Erro ao salvar configuração', 'error');
        } finally {
            setSavingSettings(false);
        }
    };

    const setNum = (k: keyof typeof settings) => (e: React.ChangeEvent<HTMLInputElement>) =>
        setSettings(s => ({ ...s, [k]: Number(e.target.value) }));

    return (
        <div className="space-y-4 min-h-[500px]">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-1">
                <h4 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    Central Inteligente
                </h4>
                <div className="flex items-center gap-2">
                    <button
                        onClick={confirmAllHigh}
                        disabled={busy === 'bulk' || counts.high === 0}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-button font-black hover:bg-emerald-700 disabled:opacity-40"
                    >
                        <ShieldCheck className="w-3.5 h-3.5" /> Conciliar alta confiança ({counts.high})
                    </button>
                    <button
                        onClick={reprocess}
                        disabled={reprocessing || !selectedAccountId}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-button font-bold hover:border-blue-200 hover:text-blue-600 disabled:opacity-50"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${reprocessing ? 'animate-spin' : ''}`} /> Reprocessar
                    </button>
                    <button
                        onClick={() => { setPreenchida(null); setRegrasAberto(true); }}
                        disabled={!selectedAccountId}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-button font-bold hover:border-blue-200 hover:text-blue-600 disabled:opacity-50"
                        title={selectedAccountId ? 'Regras de classificação desta organização' : 'Selecione uma conta bancária: as regras são da organização dela'}
                    >
                        <ListChecks className="w-3.5 h-3.5" /> Regras ({regras.length})
                    </button>
                    <button onClick={openSettings} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:text-blue-600 hover:border-blue-200" title="Tolerâncias">
                        <Settings2 className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* "Rodou?" passa a ser respondido pela tela, não pelo banco de dados. */}
            {ultimaExecucao && (
                <p className={`text-sm px-1 ${ultimaExecucao.status === 'FAILED' ? 'text-red-600' : 'text-gray-500'}`}>
                    {ultimaExecucao.status === 'FAILED' ? (
                        <>
                            A última execução, em {formatDate(ultimaExecucao.started_at)}, <strong className="font-semibold">falhou</strong>
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

            {/* Filtro por banda (exceção) */}
            <div className="flex flex-wrap items-center gap-2 px-1">
                {([
                    ['all', `Todas (${bestPerBank.length})`],
                    ['high', `Alta (${counts.high})`],
                    ['mid', `Média (${counts.mid})`],
                    ['low', `Baixa (${counts.low})`],
                ] as [Band, string][]).map(([b, label]) => (
                    <button
                        key={b}
                        onClick={() => setBand(b)}
                        className={`px-3 py-1.5 rounded-lg text-button font-black transition-all ${band === b ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
                    >
                        {label}
                    </button>
                ))}
                <span className="text-xs text-gray-400 font-medium ml-1">Valide as exceções — as de alta confiança podem ir em lote.</span>
            </div>

            {/* Cards de revisão lado-a-lado */}
            <div className="space-y-3">
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
                        <div key={sug.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-0">
                                {/* Sistema */}
                                <div className="p-4 border-b lg:border-b-0 lg:border-r border-gray-50">
                                    <div className="flex items-center gap-1.5 text-xs font-black text-gray-400 uppercase tracking-widest mb-1">
                                        <FileText className="w-3.5 h-3.5" /> Sistema
                                    </div>
                                    <p className="text-sm font-bold text-gray-800 truncate" title={cand?.description}>{cand?.description || '—'}</p>
                                    {candParty && (
                                        <p className={`text-xs font-bold flex items-center gap-1 mt-0.5 ${candParty.isClient ? 'text-emerald-600' : 'text-indigo-600'}`} title={`${candParty.label}: ${candParty.name}`}>
                                            {candParty.isClient ? <User className="w-3 h-3 flex-shrink-0" /> : <Building2 className="w-3 h-3 flex-shrink-0" />}
                                            <span className="truncate">{candParty.label}: {candParty.name}</span>
                                        </p>
                                    )}
                                    <p className="text-xs text-gray-400 font-medium">venc. {formatDate(cand?.due_date || cand?.transaction_date)}</p>
                                    <p className="text-sm font-black text-gray-900 tabular-nums mt-1">{formatBRL(cand?.amount)}</p>
                                </div>

                                {/* Centro: score + motivos */}
                                <div className="px-4 py-3 flex flex-col items-center justify-center gap-1.5 bg-gradient-to-b from-purple-50/40 to-indigo-50/40 min-w-[200px]">
                                    <ArrowLeftRight className="w-4 h-4 text-purple-400" />
                                    <span className={`px-2.5 py-1 rounded-full text-xs font-black ${BAND_STYLE[bnd].chip}`}>{sug.confidence}% · {BAND_STYLE[bnd].label}</span>
                                    <div className="flex flex-wrap gap-1 justify-center mt-1">
                                        {reasons.slice(0, 4).map((r, i) => (
                                            <span key={i} className="text-[9px] font-semibold text-gray-500 bg-white border border-gray-100 rounded-full px-2 py-0.5" title={r}>
                                                {r.length > 38 ? r.slice(0, 38) + '…' : r}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                {/* Extrato */}
                                <div className="p-4 border-t lg:border-t-0 lg:border-l border-gray-50">
                                    <div className="flex items-center gap-1.5 text-xs font-black text-gray-400 uppercase tracking-widest mb-1">
                                        <Landmark className="w-3.5 h-3.5" /> Extrato
                                    </div>
                                    <p className="text-sm font-bold text-gray-800 truncate" title={bank?.description_raw}>{bank?.description_normalized || bank?.description_raw || '—'}</p>
                                    {bankParty && (
                                        <p className="text-xs font-bold text-gray-600 flex items-center gap-1 mt-0.5" title={`${bankParty.label}: ${bankParty.name}`}>
                                            <Building2 className="w-3 h-3 flex-shrink-0" />
                                            <span className="truncate">{bankParty.label}: {bankParty.name}</span>
                                        </p>
                                    )}
                                    <p className="text-xs text-gray-400 font-medium">{bank ? formatDate(bank.transaction_date) : '—'}</p>
                                    <p className={`text-sm font-black tabular-nums mt-1 ${bank?.direction === 'CREDIT' ? 'text-emerald-600' : 'text-red-600'}`}>{formatBRL(bank?.amount)}</p>
                                </div>
                            </div>

                            {/* Ações */}
                            <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-gray-50 bg-gray-50/40">
                                <span className="text-xs text-gray-400 font-medium">
                                    {alt > 0 ? `+${alt} candidato(s) alternativo(s)` : 'Melhor candidato'}
                                </span>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => reject(sug)}
                                        disabled={busy === sug.id}
                                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-button font-bold hover:bg-gray-200 disabled:opacity-50"
                                    >
                                        <X className="w-3.5 h-3.5" /> Descartar
                                    </button>
                                    <button
                                        onClick={() => confirm(sug)}
                                        disabled={busy === sug.id}
                                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-purple-600 text-white text-button font-black hover:bg-purple-700 disabled:opacity-50"
                                    >
                                        <Check className="w-3.5 h-3.5" /> Conciliar
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}

                {visible.length === 0 && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-12 text-center">
                        <Zap className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                        <p className="text-sm font-bold text-gray-400">Nenhuma sugestão nesta faixa.</p>
                        <p className="text-xs text-gray-400 mt-1">Importe um extrato ou clique em “Reprocessar” para gerar sugestões.</p>
                    </div>
                )}
            </div>

            {/* Regras sugeridas pela memória: contraparte classificada ≥ 5 vezes, sem regra.
                "Aceitar" abre o formulário preenchido — nada é criado sem revisão. */}
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

            {/* Conciliação agrupada (match parcial / agrupado) */}
            <GroupMatchPanel organizationId={organizationId} selectedAccountId={selectedAccountId} onReload={onReload} />

            {/* Modal de tolerâncias */}
            <Modal open={showSettings} onClose={() => setShowSettings(false)} size="md">
                <ModalHeader
                    title="Tolerâncias da conciliação"
                    description="Ajustes do motor de score. Aplicam ao reprocessar / próxima importação."
                    icon={<div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center"><Settings2 className="w-5 h-5 text-blue-600" /></div>}
                    onClose={() => setShowSettings(false)}
                />
                <ModalBody className="grid grid-cols-2 gap-4">
                    {([
                        ['value_tol_abs', 'Tolerância valor (R$)'],
                        ['value_tol_pct', 'Tolerância valor (%)'],
                        ['encargos_tol_pct', 'Folga encargos (%)'],
                        ['date_window_days', 'Janela de data (dias)'],
                        ['auto_threshold', 'Score auto-conciliação'],
                        ['suggestion_min', 'Score mínimo sugestão'],
                    ] as [keyof typeof settings, string][]).map(([k, label]) => (
                        <div key={k}>
                            <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">{label}</label>
                            <input
                                type="number"
                                value={settings[k]}
                                onChange={setNum(k)}
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    ))}
                </ModalBody>
                <ModalFooter>
                    <button onClick={() => setShowSettings(false)} className="px-4 py-2 rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-100">Cancelar</button>
                    <Button onClick={saveSettings} disabled={savingSettings}>Salvar</Button>
                </ModalFooter>
            </Modal>

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
