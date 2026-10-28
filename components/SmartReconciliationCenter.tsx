import React, { useState, useMemo } from 'react';
import {
    Zap, Check, X, RefreshCw, Settings2, Loader2,
    ShieldCheck, AlertCircle, ListChecks, Lightbulb,
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
import StandardTable, { type StandardTableColumn } from './ui/StandardTable';
import ActionIconButton from './ui/ActionIconButton';
import { usePersistedState } from './ui/TableUtils';
import Button from './ui/Button';

interface CandidateTx {
    id: string;
    description?: string;
    amount?: number;
    /** Bruto − tributos retidos pelo cliente (campo computado). */
    valor_esperado?: number | null;
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
    /** Abre a gaveta de Regras já preenchida (ex.: "Criar regra" do alerta de tarifas do Dashboard). */
    regraInicial?: RegraPreenchida | null;
    /** Avisa que `regraInicial` já abriu, para não reabrir a cada visita à aba. */
    onRegraInicialUsada?: () => void;
}

/** Uma linha da Central: um movimento do extrato, o melhor candidato e os demais. */
export interface LinhaSugestao {
    bankId: string;
    bank?: BankTx;
    sug: SuggestionRow;
    alternativas: SuggestionRow[];
}

/**
 * Colunas da tabela de sugestões. Os dois valores ficam lado a lado em volta da
 * Confiança — é a comparação que o conciliador faz — e o texto livre vai para o fim:
 * em tela estreita é ele que corta primeiro, e o `title` devolve o texto inteiro.
 * Visíveis: 1.065 px de dado + 40 da seleção + 160 de ações = 1.265 px, dentro dos
 * ~1.290 px úteis com a barra lateral aberta (senão "Conciliar" nasce fora da tela).
 * "Cliente/credor" nasce oculta: o pagador/favorecido já está na coluna Extrato, e o
 * nome do título só diverge quando o score já avisa ("Fornecedor similar").
 */
const COLUNAS_SUGESTAO: StandardTableColumn[] = [
    { key: 'data',        label: 'Data',               sortable: true, width: 120 },
    { key: 'extrato',     label: 'Extrato',            sortable: true, width: 185 },
    { key: 'valor',       label: 'Valor',              sortable: true, width: 150, align: 'right' },
    { key: 'confianca',   label: 'Confiança',          sortable: true, width: 120 },
    { key: 'previsto',    label: 'Valor previsto',     sortable: true, width: 165, align: 'right' },
    { key: 'vencimento',  label: 'Vencimento',         sortable: true, width: 130 },
    { key: 'lancamento',  label: 'Lançamento',         sortable: true, width: 195 },
    { key: 'contraparte', label: 'Cliente/credor',     sortable: true, width: 190, defaultHidden: true },
    { key: 'banco',       label: 'Descrição no banco', sortable: true, width: 230, defaultHidden: true },
    { key: 'bruto',       label: 'Valor bruto',        sortable: true, width: 130, align: 'right', defaultHidden: true },
    // Motivos = lista de critérios do score ("Valor exato · Data dentro de 4d · …") —
    // composta, sem valor único para ordenar (§6.3); a ordem por força é a Confiança.
    { key: 'motivos',     label: 'Motivos',            sortable: false, width: 300, defaultHidden: true },
];

/** O que o banco credita: líquido quando o cliente retém tributo, bruto quando não. */
const valorPrevisto = (c?: CandidateTx | null): number | null => c?.valor_esperado ?? c?.amount ?? null;
const contraparteDoTitulo = (c?: CandidateTx | null, direction?: 'CREDIT' | 'DEBIT'): string =>
    partyInfo(c?.entity_name || c?.party_name, c?.party_type, direction)?.name ?? '';
/** Pagador/favorecido quando o extrato tem; senão, a descrição do banco. */
const textoDoExtrato = (b?: BankTx): string => b?.counterparty_name || b?.description_normalized || b?.description_raw || '';
const motivosDe = (s: SuggestionRow): string[] => (s.reason || '').split(' · ').filter(Boolean);

/**
 * Separa um lote: cada lançamento só pode ser usado por UM movimento. O segundo
 * movimento que aponta para o mesmo título fica de fora — o banco o recusaria
 * (título já conciliado), e a tela não deve depender da recusa para acertar.
 */
export function separarTitulosRepetidos<T extends { sug: { candidate_internal_transaction_id: string | null } }>(
    alvos: T[],
): { aConciliar: T[]; repetidos: T[] } {
    const usados = new Set<string>();
    const aConciliar: T[] = [];
    const repetidos: T[] = [];
    for (const a of alvos) {
        const id = a.sug.candidate_internal_transaction_id;
        if (!id) continue;
        if (usados.has(id)) { repetidos.push(a); continue; }
        usados.add(id);
        aConciliar.push(a);
    }
    return { aConciliar, repetidos };
}

function valorParaOrdenar(key: string, l: LinhaSugestao): string | number | null {
    const c = l.sug.candidate_internal_transaction;
    switch (key) {
        case 'data':        return l.bank?.transaction_date ?? null;
        case 'extrato':     return textoDoExtrato(l.bank) || null;
        case 'valor':       return l.bank?.amount ?? null;
        case 'confianca':   return l.sug.confidence;
        case 'previsto':    return valorPrevisto(c);
        case 'vencimento':  return c?.due_date || c?.transaction_date || null;
        case 'contraparte': return contraparteDoTitulo(c, l.bank?.direction) || null;
        case 'lancamento':  return c?.description || null;
        case 'banco':       return l.bank?.description_raw || null;
        case 'bruto':       return c?.amount ?? null;
        default:            return null;
    }
}

/** Busca: os textos das duas pontas e os valores como aparecem na tela. */
function textoDeBusca(l: LinhaSugestao): string {
    const c = l.sug.candidate_internal_transaction;
    return [
        textoDoExtrato(l.bank), l.bank?.description_raw, contraparteDoTitulo(c, l.bank?.direction), c?.description,
        formatBRL(l.bank?.amount), formatBRL(valorPrevisto(c)), formatDate(l.bank?.transaction_date),
        formatDate(c?.due_date || c?.transaction_date),
        ...l.alternativas.map(a => `${a.candidate_internal_transaction?.description ?? ''} ${contraparteDoTitulo(a.candidate_internal_transaction, l.bank?.direction)}`),
    ].filter(Boolean).join(' ');
}

/** Quantas "regras sugeridas" a Central mostra de uma vez. */
const MAX_SUGERIDAS = 5;

const DEFAULT_SETTINGS = {
    value_tol_abs: 50, value_tol_pct: 3, encargos_tol_pct: 0.5,
    date_window_days: 10, auto_threshold: 100, suggestion_min: 40,
};

const SmartReconciliationCenter: React.FC<SmartReconciliationCenterProps> = ({
    organizationId, selectedAccountId, suggestions, bankTransactions, onConfirm, onReject, onReload,
    categories, clienteRegistros, credorRegistros, regraInicial, onRegraInicialUsada,
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

    React.useEffect(() => {
        if (!regraInicial) return;
        setPreenchida(regraInicial);
        setRegrasAberto(true);
        onRegraInicialUsada?.();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [regraInicial]);

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

    // Uma linha por movimento do extrato: o melhor candidato e, atrás dele, os demais.
    const linhas = useMemo<LinhaSugestao[]>(() => {
        const byBank = new Map<string, SuggestionRow[]>();
        for (const s of suggestions) {
            if (!s.candidate_internal_transaction_id) continue;
            const arr = byBank.get(s.bank_transaction_id) ?? [];
            arr.push(s); byBank.set(s.bank_transaction_id, arr);
        }
        const rows: LinhaSugestao[] = [];
        for (const [bankId, arr] of byBank) {
            arr.sort((a, b) => b.confidence - a.confidence);
            rows.push({ bankId, bank: bankMap.get(bankId), sug: arr[0], alternativas: arr.slice(1) });
        }
        return rows.sort((a, b) => b.sug.confidence - a.sug.confidence);
    }, [suggestions, bankMap]);

    const counts = useMemo(() => {
        const c = { high: 0, mid: 0, low: 0 };
        linhas.forEach(({ sug }) => { c[bandOf(sug.confidence)]++; });
        return c;
    }, [linhas]);

    // Estável (useMemo): a tabela volta para o topo quando a identidade de `rows` muda.
    const visible = useMemo(
        () => band === 'all' ? linhas : linhas.filter(({ sug }) => bandOf(sug.confidence) === band),
        [linhas, band],
    );

    // Busca controlada aqui (mesma chave que a tabela usaria sozinha, §3): a seleção
    // precisa saber quais linhas a busca está escondendo.
    const [busca, setBusca] = usePersistedState<string>('conciliacao:central:sugestoes:search', '');
    const filtradas = useMemo(() => {
        const termo = busca.trim().toLowerCase();
        return termo ? visible.filter(l => textoDeBusca(l).toLowerCase().includes(termo)) : visible;
    }, [visible, busca]);

    // Seleção em lote (§10) e linhas com os alternativos abertos. Linha que saiu da TELA
    // — conciliada, descartada, ou escondida pela busca/filtro de confiança — sai também
    // da seleção: "Conciliar selecionados" nunca age sobre linha que o usuário não está
    // vendo (guia §6.7: marcar o que não se vê é armadilha em ação de lote).
    const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
    const [abertos, setAbertos] = useState<Set<string>>(new Set());
    React.useEffect(() => {
        const ids = new Set(filtradas.map(l => l.bankId));
        setSelecionados(prev => {
            const next = new Set([...prev].filter(id => ids.has(id)));
            return next.size === prev.size ? prev : next;
        });
    }, [filtradas]);
    const alternarAbertos = (bankId: string) => setAbertos(prev => {
        const next = new Set(prev);
        if (next.has(bankId)) next.delete(bankId); else next.add(bankId);
        return next;
    });

    const run = async (key: string, fn: () => Promise<void>) => {
        setBusy(key);
        try { await fn(); } catch (e) { console.error('[Center]', e); showToast('Erro na ação', 'error'); }
        finally { setBusy(null); }
    };

    /** Concilia o movimento com um candidato — o melhor ou um alternativo. */
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

    /**
     * Concilia cada movimento com o seu melhor candidato, em sequência. Serve ao
     * "Conciliar selecionados" e ao "Conciliar alta confiança". Dois movimentos que
     * apontam para o MESMO título não vão juntos: o banco recusa título já conciliado
     * (aplicar_20271011007000), e a tela não deve depender da recusa para acertar.
     */
    const conciliarEmLote = (alvos: LinhaSugestao[]) =>
        run('bulk', async () => {
            const { aConciliar, repetidos } = separarTitulosRepetidos(alvos);
            let feitos = 0;
            const falhas: string[] = [];
            for (const l of aConciliar) {
                try {
                    await onConfirm(l.bankId, l.sug.candidate_internal_transaction_id!);
                    feitos++;
                } catch (e) {
                    falhas.push(`${formatDate(l.bank?.transaction_date)} ${formatBRL(l.bank?.amount)}`);
                    console.error('[Center] lote', e);
                }
            }
            const partes = [`${feitos} conciliação(ões) aplicada(s)`];
            if (repetidos.length > 0) partes.push(`${repetidos.length} ficou(aram) de fora por apontar(em) para um lançamento já usado neste lote — escolha outro candidato`);
            if (falhas.length > 0) partes.push(`${falhas.length} falhou(aram): ${falhas.join(', ')}`);
            showToast(partes.join('\n'), falhas.length > 0 || repetidos.length > 0 ? 'error' : 'success');
            setSelecionados(new Set());
            await onReload();
        });

    const confirmAllHigh = async () => {
        const highs = linhas.filter(({ sug }) => sug.confidence >= HIGH);
        if (highs.length === 0) return;
        // Concilia tudo de uma vez: antes era sem confirmação — um clique errado
        // gravava dezenas de vínculos (desfazer é um por um, em Conciliados).
        const ok = await confirmar({
            title: `Conciliar ${highs.length} sugestão(ões) de alta confiança?`,
            message: `Cada movimento do extrato é vinculado ao seu melhor candidato (score ≥ ${HIGH}%). Para desfazer, use a aba Conciliados, vínculo por vínculo.`,
            variant: 'warning',
            confirmLabel: `Conciliar ${highs.length}`,
        });
        if (!ok) return;
        await conciliarEmLote(highs);
    };

    const linhasSelecionadas = useMemo(() => linhas.filter(l => selecionados.has(l.bankId)), [linhas, selecionados]);
    const totalSelecionado = linhasSelecionadas.reduce((s, l) => s + (l.bank?.amount ?? 0), 0);

    const conciliarSelecionados = async () => {
        const n = linhasSelecionadas.length;
        if (n === 0) return;
        const ok = await confirmar({
            title: `Conciliar ${n} movimento(s) selecionado(s)?`,
            message: 'Cada movimento do extrato é vinculado ao seu melhor candidato (o que aparece na linha). Para desfazer, use a aba Conciliados, vínculo por vínculo.',
            variant: 'warning',
            confirmLabel: `Conciliar ${n}`,
        });
        if (!ok) return;
        await conciliarEmLote(linhasSelecionadas);
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
    /** Células da tabela — tipografia do §7: texto `font-normal`, `font-medium` só em valor. */
    const celula = (key: string, l: LinhaSugestao): React.ReactNode => {
        const c = l.sug.candidate_internal_transaction;
        const texto = (valor: string | null | undefined, cor = 'text-gray-700') => (
            <span className={`block truncate text-sm font-normal ${cor}`} title={valor || undefined}>{valor || '—'}</span>
        );
        switch (key) {
            case 'data':
                return <span className="text-sm font-normal text-gray-600 tabular-nums">{formatDate(l.bank?.transaction_date)}</span>;
            case 'extrato':
                return (
                    <span className="block truncate text-sm font-normal text-gray-700" title={l.bank?.description_raw || undefined}>
                        {textoDoExtrato(l.bank) || '—'}
                    </span>
                );
            case 'valor': {
                const credito = l.bank?.direction === 'CREDIT';
                return (
                    <span className={`text-sm font-medium tabular-nums whitespace-nowrap ${credito ? 'text-emerald-700' : 'text-red-600'}`}>
                        {credito ? '+ ' : '− '}{formatBRL(l.bank?.amount)}
                    </span>
                );
            }
            case 'confianca': {
                const bnd = bandOf(l.sug.confidence);
                const n = l.alternativas.length;
                return (
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                        <span className={`text-sm font-normal ${BAND_STYLE[bnd].text}`} title={[BAND_STYLE[bnd].label, ...motivosDe(l.sug)].join(' · ')}>
                            {l.sug.confidence}%
                        </span>
                        {n > 0 && (
                            <button
                                onClick={() => alternarAbertos(l.bankId)}
                                aria-expanded={abertos.has(l.bankId)}
                                title={abertos.has(l.bankId) ? 'Esconder os outros candidatos' : `Ver ${n} outro(s) candidato(s) para este movimento`}
                                className="text-sm font-normal text-blue-600 hover:text-blue-800 hover:underline"
                            >
                                · +{n}
                            </button>
                        )}
                    </span>
                );
            }
            case 'previsto': {
                const previsto = valorPrevisto(c);
                const comRetencao = c?.amount != null && previsto != null && Math.abs(previsto - c.amount) >= 0.005;
                return (
                    <span className="text-sm font-medium text-gray-800 tabular-nums" title={comRetencao ? `Bruto ${formatBRL(c?.amount)} — o cliente retém tributo` : undefined}>
                        {formatBRL(previsto)}
                    </span>
                );
            }
            case 'vencimento':
                return <span className="text-sm font-normal text-gray-600 tabular-nums">{formatDate(c?.due_date || c?.transaction_date)}</span>;
            case 'contraparte':
                return texto(contraparteDoTitulo(c, l.bank?.direction));
            case 'lancamento':
                return texto(c?.description);
            case 'banco':
                return texto(l.bank?.description_raw, 'text-gray-600');
            case 'bruto':
                return <span className="text-sm font-medium text-gray-800 tabular-nums">{formatBRL(c?.amount)}</span>;
            case 'motivos':
                return texto(motivosDe(l.sug).join(' · '), 'text-gray-600');
            default:
                return null;
        }
    };

    return (
        <div className="space-y-6 min-h-[500px]">
            {/* Sugestões — tabela padrão (§6.10): uma linha por movimento do extrato com o
                melhor candidato. Era uma pilha de cartões de três blocos (pedido de
                11/10/2026: "informações empilhadas dificultando visualização"). O <h1>
                "Central de Conciliação" do pai já diz onde o usuário está (§18). */}
            <StandardTable<LinhaSugestao>
                storageKey="conciliacao:central:sugestoes"
                columns={COLUNAS_SUGESTAO}
                rows={visible}
                rowKey={l => l.bankId}
                searchText={textoDeBusca}
                search={busca}
                onSearchChange={setBusca}
                searchPlaceholder="Buscar por contraparte, lançamento, descrição ou valor..."
                sortValue={valorParaOrdenar}
                renderCell={(key, l) => celula(key, l)}
                rowClassName={l => (selecionados.has(l.bankId) ? 'bg-blue-50/60' : '')}
                selection={{ selected: selecionados, onChange: setSelecionados }}
                renderExpanded={(l, colunas) => (abertos.has(l.bankId) && l.alternativas.length > 0 ? (
                    <tr className="bg-gray-50/60">
                        <td colSpan={colunas} className="px-6 py-3">
                            <p className="text-xs font-semibold text-gray-500 mb-2">
                                Outros candidatos para o movimento de {formatDate(l.bank?.transaction_date)} · {formatBRL(l.bank?.amount)}
                            </p>
                            <div className="overflow-x-auto rounded-[10px] border border-gray-100 bg-white">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-white text-gray-700 font-semibold text-sm border-b border-gray-200 whitespace-nowrap">
                                            <th className="px-6 py-2 border-r border-gray-100">Lançamento</th>
                                            <th className="px-6 py-2 border-r border-gray-100">Cliente/credor</th>
                                            <th className="px-6 py-2 border-r border-gray-100">Vencimento</th>
                                            <th className="px-6 py-2 border-r border-gray-100 text-right">Valor previsto</th>
                                            <th className="px-6 py-2 border-r border-gray-100">Confiança</th>
                                            <th className="px-6 py-2 border-r border-gray-100">Motivos</th>
                                            <th className="px-6 py-2 text-right">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {l.alternativas.map(alt => {
                                            const c = alt.candidate_internal_transaction;
                                            const bnd = bandOf(alt.confidence);
                                            return (
                                                <tr key={alt.id} className="hover:bg-blue-50/50 transition-colors">
                                                    <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-700">{c?.description || '—'}</td>
                                                    <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-700">{contraparteDoTitulo(c, l.bank?.direction) || '—'}</td>
                                                    <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600">{formatDate(c?.due_date || c?.transaction_date)}</td>
                                                    <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-medium text-gray-800 text-right tabular-nums">{formatBRL(valorPrevisto(c))}</td>
                                                    <td className={`px-6 py-2.5 border-r border-gray-100 text-sm font-normal ${BAND_STYLE[bnd].text}`}>{alt.confidence}%</td>
                                                    <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600">{motivosDe(alt).join(' · ') || '—'}</td>
                                                    <td className="px-6 py-2.5 text-right">
                                                        <button
                                                            onClick={() => confirm(alt)}
                                                            disabled={busy !== null}
                                                            title={busy !== null ? 'Aguarde a conciliação em andamento' : 'Conciliar o movimento com este lançamento'}
                                                            className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-[6px] transition-all disabled:opacity-50 inline-flex items-center gap-1"
                                                        >
                                                            {busy === alt.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                                            Conciliar
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </td>
                    </tr>
                ) : null)}
                actions={{
                    width: 160,
                    render: l => (
                        <>
                            <button
                                onClick={() => confirm(l.sug)}
                                disabled={busy !== null}
                                title={busy !== null ? 'Aguarde a conciliação em andamento' : 'Conciliar o movimento com o lançamento desta linha'}
                                className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-[6px] transition-all disabled:opacity-50 inline-flex items-center gap-1"
                            >
                                {busy === l.sug.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                Conciliar
                            </button>
                            <ActionIconButton
                                kind="delete"
                                tone="neutral"
                                icon={<X className="w-4 h-4" />}
                                title={busy !== null ? 'Aguarde a conciliação em andamento' : 'Descartar as sugestões deste movimento (voltam no próximo Reprocessar)'}
                                onClick={() => reject(l.sug)}
                                disabled={busy !== null}
                            />
                        </>
                    ),
                }}
                empty={{
                    icon: <Zap className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                    title: `Nenhuma sugestão ${band === 'all' ? 'para revisar' : 'nesta faixa'}`,
                    subtitle: 'Importe um extrato ou clique em Reprocessar para gerar sugestões.',
                }}
                filters={
                    <FilterPopover<Band>
                        label="Confiança"
                        value={band}
                        onChange={setBand}
                        allValue="all"
                        options={[
                            { value: 'all', label: `Todas (${linhas.length})` },
                            { value: 'high', label: `Alta (${counts.high})` },
                            { value: 'mid', label: `Média (${counts.mid})` },
                            { value: 'low', label: `Baixa (${counts.low})` },
                        ]}
                    />
                }
                toolbarTop={ultimaExecucao && (
                    // "Rodou?" respondido pela tela, não pelo banco de dados.
                    <p className={`px-1 text-sm ${ultimaExecucao.status === 'FAILED' ? 'text-red-600' : 'text-gray-500'}`}>
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
                toolbarRight={
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                            onClick={reprocess}
                            disabled={reprocessing || !selectedAccountId}
                            title={!selectedAccountId ? 'Selecione uma conta bancária' : reprocessing ? 'Reprocessando…' : 'Memória, regras e conciliação automática, nesta ordem'}
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
                            title={counts.high === 0 ? 'Nenhuma sugestão de alta confiança agora' : busy === 'bulk' ? 'Aguarde a conciliação em andamento' : `Conciliar as ${counts.high} sugestões com score ≥ ${HIGH}%`}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {busy === 'bulk' ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <ShieldCheck className="w-[15px] h-[15px]" />}
                            Conciliar alta confiança ({counts.high})
                        </button>
                    </div>
                }
            />

            {/* Barra de lote §10 — fixa no rodapé, fora do fluxo da lista */}
            {linhasSelecionadas.length > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 p-4 bg-blue-600 text-white rounded-[10px] shadow-lg shadow-blue-900/20">
                    <span className="flex-1 text-sm font-bold whitespace-nowrap">
                        {linhasSelecionadas.length} selecionado{linhasSelecionadas.length !== 1 ? 's' : ''}
                        <span className="ml-2 font-normal opacity-75">· {formatBRL(totalSelecionado)}</span>
                    </span>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={conciliarSelecionados}
                        disabled={busy !== null}
                        title={busy !== null ? 'Aguarde a conciliação em andamento' : 'Vincula cada movimento ao lançamento da sua linha'}
                        className="text-blue-700 border-none hover:bg-blue-50"
                    >
                        {busy === 'bulk' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        Conciliar selecionados
                    </Button>
                    <button
                        onClick={() => setSelecionados(new Set())}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-500 rounded-[6px] text-[13px] font-medium hover:bg-blue-400 transition-all active:scale-95"
                    >
                        <X className="w-3.5 h-3.5" />
                        Desmarcar
                    </button>
                </div>
            )}

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
                onCategoriasExcluidasMudaram={onReload}
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
