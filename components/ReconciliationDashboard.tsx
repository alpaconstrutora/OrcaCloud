import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Landmark, ShieldCheck, AlertTriangle, BookOpen,
    Check, X, Tag, Receipt, Scale, Building2, HardHat, ArrowRight,
} from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import { KpiCard } from './ui/KpiCard';
import MoneyCentsInput from './ui/MoneyCentsInput';
import { useConfirm } from './ui/confirm';
import InformarSaldoBancoSheet from './reconciliation/InformarSaldoBancoSheet';
import AjustarSaldoInicialSheet from './reconciliation/AjustarSaldoInicialSheet';
import { reconciliationDashboardService } from '../services/reconciliationDashboardService';
import { useToast } from '../hooks/useToast';
import type {
    ReconciliationDashboard as DashboardData, ReconciliationAccountBalance,
    ReconciliationConsolidated,
} from '../types/financial';
import { formatMoney as formatBRL, formatDateBR } from './ui/Format';
import {
    estadoDoSaldoBanco, resumoDoBanco, sugestoesDeAjuste, contaComMais, ROTULO_ORIGEM,
} from '../utils/conciliacaoSaldoBanco';
import { plural, textoDaDivergencia } from '../utils/conciliacaoTextos';

// Tolerância para considerar saldos "batendo" (centavos de arredondamento).
const EPS = 0.01;

/** Para onde um número do dashboard leva (passo 2 do plano: "todo número leva à ação"). */
export interface DestinoConciliacao {
    aba: 'center' | 'pending' | 'divergences' | 'anomalies';
    contaId?: string;
    /** Recorte de Pendentes vindo daqui — as MESMAS linhas que o alerta contou. */
    recorte?: 'tarifas' | 'sem-classificacao';
    /** Abre a gaveta de Regras da Central já preenchida. */
    regra?: 'tarifas';
}

/** Link de ação de um número (guia §4.5): texto azul com seta, só quando há o que fazer. */
function LinkDeAcao({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
    return (
        <button type="button" onClick={onClick}
            className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900 hover:underline">
            {children} <ArrowRight className="w-3.5 h-3.5" />
        </button>
    );
}

/**
 * Limiares dos indicadores de destaque (guia §4.5): a cor só aparece por eles, e moram num
 * lugar só porque são hipótese de gestão — alguém vai querer mudá-los.
 * Passo 5 do plano docs/planos/2026-10-28-conciliacao-dashboard-confianca.md.
 */
const LIMIAR = {
    /** Conta cujo saldo não bate com o que o banco informa: alerta a partir da 1ª. */
    contasForaAlerta: 0,
    /** Conta sem saldo do banco (não dá para responder "bate?"): atenção a partir da 1ª. */
    contasSemSaldoAtencao: 0,
    /** Lançamentos do extrato a conciliar: atenção a partir do 1º. */
    pendentesAtencao: 0,
} as const;

interface ReconciliationDashboardProps {
    organizationId: string | null;
    /** "Posição em" ('YYYY-MM-DD'). Mora na barra de escopo da tela-mãe (passo 3 do plano):
     *  é o único controle que muda estes números, então é o único que a barra mostra aqui. */
    asOf: string;
    /** Muda a cada clique em Atualizar na barra. */
    recarga?: number;
    /** Para o ícone de Atualizar da barra girar enquanto carrega. */
    onCarregando?: (carregando: boolean) => void;
    /** Sem ele (uso fora da Conciliação), os números não ganham ação. */
    onIrPara?: (destino: DestinoConciliacao) => void;
}

/** Texto do erro do Supabase/rede, quando ele diz algo além do genérico. */
function detalheDoErro(e: unknown): string | null {
    const msg = (e as { message?: unknown })?.message;
    return typeof msg === 'string' && msg.trim() ? msg.trim() : null;
}

const ReconciliationDashboardView: React.FC<ReconciliationDashboardProps> = ({ organizationId, onIrPara, asOf, recarga = 0, onCarregando }) => {
    const { showToast } = useToast();
    const confirm = useConfirm();
    const [data, setData] = useState<DashboardData | null>(null);
    const [consolidated, setConsolidated] = useState<ReconciliationConsolidated | null>(null);
    const [loading, setLoading] = useState(false);
    // Falha da última carga. Com `data` ainda na tela, os números são de `data.as_of`, não
    // de `asOf` — a tela tem de dizer isso, senão mostra outra data como se fosse a pedida.
    const [erro, setErro] = useState<{ detalhe: string | null } | null>(null);
    // Trocar "Posição em" rápido dispara cargas em paralelo; só a última vale.
    const cargaRef = useRef(0);

    // Edição de saldo inicial inline
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editBalance, setEditBalance] = useState('');
    const [editDate, setEditDate] = useState('');
    const [saving, setSaving] = useState(false);
    const botoesEditar = useRef<Record<string, HTMLButtonElement | null>>({});
    // Fechar a confirmação (ou falhar ao salvar) deixa o foco no <body>: sem devolvê-lo ao
    // campo, Enter/Esc param de funcionar e a linha fica presa em edição (visto em produção).
    const edicaoRef = useRef<HTMLDivElement>(null);
    const focarCampoDoSaldo = () => requestAnimationFrame(() => edicaoRef.current?.querySelector('input')?.focus());

    // Saldo do banco (passo 2): as duas gavetas abrem por conta.
    const [informarContaId, setInformarContaId] = useState<string | null>(null);
    const [ajustarContaId, setAjustarContaId] = useState<string | null>(null);

    const load = useCallback(async () => {
        const carga = ++cargaRef.current;
        setLoading(true);
        setErro(null);
        try {
            const [d, cons] = await Promise.all([
                reconciliationDashboardService.getDashboard(organizationId, asOf),
                reconciliationDashboardService.getConsolidated(organizationId, asOf),
            ]);
            if (carga !== cargaRef.current) return;
            setData(d);
            setConsolidated(cons);
        } catch (e) {
            if (carga !== cargaRef.current) return;
            console.error('[ReconciliationDashboard]', e);
            setErro({ detalhe: detalheDoErro(e) });
        } finally {
            if (carga === cargaRef.current) setLoading(false);
        }
    }, [organizationId, asOf]);

    // `recarga` é o botão Atualizar da barra da tela-mãe: cada clique soma 1.
    useEffect(() => { load(); }, [load, recarga]);
    useEffect(() => { onCarregando?.(loading); }, [loading, onCarregando]);

    const startEdit = (acc: ReconciliationAccountBalance) => {
        setEditingId(acc.account_id);
        setEditBalance(String(acc.opening_balance ?? 0));
        setEditDate(acc.opening_balance_date ?? '');
    };

    const cancelEdit = () => {
        const id = editingId;
        setEditingId(null);
        setEditBalance('');
        setEditDate('');
        // A linha sai do modo edição e o foco ficaria no <body>: devolve ao lápis dela.
        if (id) requestAnimationFrame(() => botoesEditar.current[id]?.focus());
    };

    const saveEdit = async (acc: ReconciliationAccountBalance) => {
        if (editBalance === '-') {
            showToast('Digite o valor do saldo inicial depois do sinal de menos', 'error');
            return;
        }
        const novoSaldo = editBalance === '' ? 0 : Number(editBalance);
        // `undefined` na conta = a função do banco ainda não devolve a data (ver o tipo):
        // aí só se grava a data se a pessoa digitou uma; nunca NULL por não saber.
        const dataConhecida = acc.opening_balance_date !== undefined;
        const dataAtual = acc.opening_balance_date ?? null;
        const novaData = editDate || null;
        const dataParaGravar = dataConhecida ? novaData : (novaData ?? undefined);
        const mudouSaldo = Math.abs(novoSaldo - (acc.opening_balance ?? 0)) > EPS / 2;
        const mudouData = dataParaGravar !== undefined && dataParaGravar !== dataAtual;
        if (!mudouSaldo && !mudouData) { cancelEdit(); return; }

        const ok = await confirm({
            title: 'Alterar o saldo inicial?',
            variant: 'warning',
            confirmLabel: 'Alterar saldo inicial',
            message: (
                <div className="space-y-2 text-sm text-gray-700">
                    <p className="font-medium text-gray-900">{acc.account_name}</p>
                    <p className="tabular-nums">
                        Saldo inicial: {formatBRL(acc.opening_balance ?? 0)} → <span className="font-semibold text-gray-900">{formatBRL(novoSaldo)}</span>
                    </p>
                    {mudouData && (
                        <p className="tabular-nums">
                            Extrato a partir de: {dataAtual ? formatDateBR(dataAtual) : 'todo o extrato'} → <span className="font-semibold text-gray-900">{novaData ? formatDateBR(novaData) : 'todo o extrato'}</span>
                        </p>
                    )}
                    <p className="text-gray-600">O saldo bancário, o conciliado e a diferença desta conta são recalculados a partir daí, em todas as datas.</p>
                </div>
            ),
        });
        if (!ok) { focarCampoDoSaldo(); return; }

        setSaving(true);
        try {
            await reconciliationDashboardService.setOpeningBalance(acc.account_id, novoSaldo, dataParaGravar);
            showToast('Saldo inicial atualizado', 'success');
            cancelEdit();
            await load();
        } catch (e) {
            console.error('[ReconciliationDashboard] saveEdit', e);
            const detalhe = detalheDoErro(e);
            showToast(`Não foi possível salvar o saldo inicial${detalhe ? `: ${detalhe}` : ''}. O valor digitado continua no campo.`, 'error');
            focarCampoDoSaldo();
        } finally {
            setSaving(false);
        }
    };

    const teclaNaEdicao = (e: React.KeyboardEvent, acc: ReconciliationAccountBalance) => {
        if (e.key === 'Enter') { e.preventDefault(); if (!saving) void saveEdit(acc); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (!saving) cancelEdit(); }
    };

    const totals = data?.totals;
    const systemBalance = data?.system_balance ?? 0;
    const reconciledTotal = totals?.reconciled_balance ?? 0;
    const integrityGap = reconciledTotal - systemBalance;
    const hasIntegrityGap = Math.abs(integrityGap) > EPS;
    // Baixado NÃO é conferido no extrato: webhook do Asaas, boleto e sync comercial
    // também dão baixa. Enquanto houver baixado sem conferir, a diferença é esperada e o
    // alerta é âmbar; vermelho só quando nada a explica (utils/conciliacaoTextos).
    const ledger = data?.ledger;
    const divergencia = hasIntegrityGap ? textoDaDivergencia(integrityGap, ledger, formatBRL) : null;
    const fees = data?.fees ?? { value: 0, count: 0 };

    // Passo 2: saldo do banco e ação em cada número que preocupa.
    const contas = data?.accounts ?? [];
    const banco = resumoDoBanco(contas);
    const contaPendente = contaComMais(contas, 'pending_count');
    const contaSemClassificacao = contaComMais(contas, 'unclassified_count');
    const contaInformar = contas.find(c => c.account_id === informarContaId) ?? null;
    const contaAjustar = contas.find(c => c.account_id === ajustarContaId) ?? null;
    const estadoAjustar = contaAjustar ? estadoDoSaldoBanco(contaAjustar) : null;

    // Cartão principal: "bate com o banco?". A ação vai para a conta mais fora (a maior diferença)
    // ou, sem nenhuma fora, para a primeira sem saldo do banco.
    const estados = contas.map(c => ({ c, e: estadoDoSaldoBanco(c) }));
    const contaMaisFora = estados
        .filter(x => x.e.tipo === 'fora')
        .sort((a, b) => Math.abs((b.e as { diferenca: number }).diferenca) - Math.abs((a.e as { diferenca: number }).diferenca))[0]?.c ?? null;
    const contaSemSaldo = estados.find(x => x.e.tipo === 'sem')?.c ?? null;
    const tomBanco = banco.fora.length > LIMIAR.contasForaAlerta ? 'alerta'
        : banco.sem.length > LIMIAR.contasSemSaldoAtencao ? 'atencao' : 'neutro';
    const subBanco = [
        banco.fora.length > 0 ? `Não ${banco.fora.length === 1 ? 'bate' : 'batem'}: ${banco.fora.join(', ')}` : null,
        banco.sem.length > 0 ? `sem saldo do banco: ${banco.sem.join(', ')}` : null,
    ].filter(Boolean).join(' · ') || (banco.total > 0 ? 'Todas batem com o saldo que o banco informa' : 'Nenhuma conta bancária');
    const acaoBanco = contaMaisFora
        ? { label: `Ajustar ${contaMaisFora.account_name}`, onClick: () => setAjustarContaId(contaMaisFora.account_id) }
        : contaSemSaldo
            ? { label: `Informar saldo de ${contaSemSaldo.account_name}`, onClick: () => setInformarContaId(contaSemSaldo.account_id) }
            : null;

    const informarSaldo = async (data: string, saldo: number) => {
        if (!contaInformar) return;
        await reconciliationDashboardService.informarSaldoDoBanco(contaInformar.account_id, data, saldo);
        showToast(`Saldo do extrato de ${contaInformar.account_name} gravado`, 'success');
        await load();
    };

    const ajustarSaldoInicial = async (saldo: number, dataInicio: string | null) => {
        if (!contaAjustar) return;
        await reconciliationDashboardService.setOpeningBalance(contaAjustar.account_id, saldo, dataInicio);
        showToast(`Saldo inicial de ${contaAjustar.account_name} ajustado`, 'success');
        await load();
    };

    return (
        <div className="space-y-5 min-h-[500px]">
            {/* Sem dado ainda: nada de R$ 0,00 — zero aqui seria uma afirmação sobre o banco. */}
            {!data && !erro && (
                <div aria-busy="true" className="space-y-4">
                    <span className="sr-only" role="status">Carregando a conciliação…</span>
                    {/* Mesmo desenho do carregado: 2 destaques (o 1º ocupa 2/3) + faixa de 3. */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" aria-hidden="true">
                        {[0, 1].map(i => (
                            <div key={i} className={`bg-white rounded-xl border border-gray-200 px-4 py-3.5 animate-pulse ${i === 0 ? 'sm:col-span-2' : ''}`}>
                                <div className="h-3 w-28 bg-gray-100 rounded" />
                                <div className="h-6 w-36 bg-gray-100 rounded mt-2.5" />
                                <div className="h-3 w-48 bg-gray-100 rounded mt-2" />
                            </div>
                        ))}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" aria-hidden="true">
                        {[0, 1, 2].map(i => (
                            <div key={i} className="bg-white rounded-xl border border-gray-200 px-4 py-3 animate-pulse">
                                <div className="h-3 w-24 bg-gray-100 rounded" />
                                <div className="h-4 w-28 bg-gray-100 rounded mt-2" />
                            </div>
                        ))}
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3 animate-pulse" aria-hidden="true">
                        {[0, 1, 2].map(i => <div key={i} className="h-3 bg-gray-100 rounded" />)}
                    </div>
                </div>
            )}

            {erro && (
                <div role="alert" className="flex flex-wrap items-start justify-between gap-3 bg-white border border-red-200 rounded-xl px-4 py-3">
                    <div className="flex items-start gap-3 min-w-0">
                        <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-gray-700 min-w-0">
                            <p className="font-semibold text-gray-900">
                                Não foi possível carregar a posição em {formatDateBR(asOf)}.
                            </p>
                            {data && (
                                <p className="mt-0.5">Os números abaixo ainda são da posição em {formatDateBR(data.as_of)}.</p>
                            )}
                            {erro.detalhe && <p className="mt-0.5 text-gray-600 break-words">{erro.detalhe}</p>}
                        </div>
                    </div>
                    <button
                        onClick={load}
                        disabled={loading}
                        className="h-9 px-3.5 rounded-[6px] border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 shrink-0"
                    >
                        {loading ? 'Tentando…' : 'Tentar de novo'}
                    </button>
                </div>
            )}

            {data && (<>
            {/* Hierarquia (passo 5, guia §4.5): a pergunta da tela — "bate com o banco?" — é o
                número principal; "a conciliar" é o segundo. Os três saldos são contexto e vão
                numa faixa secundária neutra logo abaixo. A cor só aparece por LIMIAR. */}
            <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <KpiCard
                        destaque
                        className="sm:col-span-2"
                        label="Bate com o banco"
                        icon={<Landmark />}
                        value={`${banco.bate.length} de ${plural(banco.total, 'conta', 'contas')}`}
                        sub={subBanco}
                        title={subBanco}
                        tom={tomBanco}
                        acao={acaoBanco ?? undefined}
                    />
                    {/* Valor BRUTO pendente: a diferença líquida somava +1.000 com −1.000 e mostrava
                        R$ 0,00 em verde com "2 pendentes" embaixo. */}
                    <KpiCard
                        destaque
                        label="A conciliar"
                        icon={<AlertTriangle />}
                        value={formatBRL(totals?.pending_value ?? 0)}
                        sub={(totals?.pending_count ?? 0) > 0
                            ? `${plural(totals?.pending_count ?? 0, 'lançamento', 'lançamentos')} do extrato`
                            : 'Nada pendente no extrato'}
                        tom={(totals?.pending_count ?? 0) > LIMIAR.pendentesAtencao ? 'atencao' : 'neutro'}
                        acao={onIrPara && contaPendente ? {
                            label: `Conciliar ${contaPendente.account_name} na Central`,
                            onClick: () => onIrPara({ aba: 'center', contaId: contaPendente.account_id }),
                        } : undefined}
                    />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Não é o saldo que o banco informa (esse está no cartão acima e na coluna
                        "Saldo no banco"): é o que o app soma a partir do saldo inicial e do extrato. */}
                    <KpiCard size="sm" color="gray" icon={<Landmark />} label="Saldo pelo extrato"
                        value={formatBRL(totals?.bank_balance ?? 0)} sub="Saldo inicial + extrato importado" />
                    <KpiCard size="sm" color="gray" icon={<ShieldCheck />} label="Saldo conciliado"
                        value={formatBRL(reconciledTotal)} sub="Saldo inicial + o que já foi conciliado" />
                    <KpiCard size="sm" color="gray" icon={<BookOpen />} label="Saldo contábil"
                        value={formatBRL(systemBalance)} sub="Saldo inicial + lançamentos baixados no sistema"
                        title="Saldo inicial + lançamentos baixados no sistema, de qualquer origem (cobrança online, boleto, sync comercial ou conciliação)" />
                </div>
            </div>

            {/* Alertas */}
            {(hasIntegrityGap || (totals?.unclassified_count ?? 0) > 0 || fees.count > 0) && (
                <div className="space-y-2">
                    {/* Um bloco só: antes eram dois (o vermelho que a 2ª frase desmentia e a faixa
                        "N de M conferidos" sempre visível). Vermelho só quando nada explica a diferença. */}
                    {divergencia && (
                        <div className={`flex items-start gap-3 rounded-xl px-4 py-3 border ${
                            divergencia.tom === 'divergencia' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
                        }`}>
                            {divergencia.tom === 'divergencia'
                                ? <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
                                : <Scale className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" aria-hidden="true" />}
                            <div className={`text-sm ${divergencia.tom === 'divergencia' ? 'text-red-800' : 'text-amber-900'}`}>
                                <p className="font-semibold">{divergencia.titulo}</p>
                                <p className="mt-1">{divergencia.lado} {divergencia.explicacao}</p>
                                {onIrPara && (
                                    <p className="mt-1.5">
                                        <LinkDeAcao onClick={() => onIrPara({ aba: 'divergences' })}>Ver na aba Divergências</LinkDeAcao>
                                    </p>
                                )}
                            </div>
                        </div>
                    )}
                    {(totals?.unclassified_count ?? 0) > 0 && (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                            <Tag className="w-4 h-4 text-amber-500 flex-shrink-0" />
                            <p className="text-sm font-semibold text-amber-700">
                                {plural(totals?.unclassified_count ?? 0, 'lançamento do extrato pendente está', 'lançamentos do extrato pendentes estão')} sem classificação.
                            </p>
                            {onIrPara && contaSemClassificacao && (
                                <LinkDeAcao onClick={() => onIrPara({ aba: 'pending', contaId: contaSemClassificacao.account_id, recorte: 'sem-classificacao' })}>
                                    Classificar {contaSemClassificacao.account_name} em Pendentes
                                </LinkDeAcao>
                            )}
                        </div>
                    )}
                    {fees.count > 0 && (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-orange-50 border border-orange-100 rounded-xl px-4 py-3">
                            <Receipt className="w-4 h-4 text-orange-500 flex-shrink-0" />
                            <p className="text-sm font-semibold text-orange-700">
                                {plural(fees.count, 'possível tarifa bancária', 'possíveis tarifas bancárias')} sem lançamento —{' '}
                                <span className="font-black tabular-nums">{formatBRL(fees.value)}</span>.
                            </p>
                            {onIrPara && (
                                <>
                                    <LinkDeAcao onClick={() => onIrPara({ aba: 'pending', contaId: contaSemClassificacao?.account_id, recorte: 'tarifas' })}>
                                        Ver tarifas em Pendentes
                                    </LinkDeAcao>
                                    <LinkDeAcao onClick={() => onIrPara({ aba: 'center', contaId: contaSemClassificacao?.account_id, regra: 'tarifas' })}>
                                        Criar regra
                                    </LinkDeAcao>
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Tabela por conta */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-50">
                    <h5 className="text-xs font-black text-gray-400 uppercase tracking-widest">Por conta bancária</h5>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-50">
                                <th className="text-left  px-5 py-3">Conta</th>
                                <th className="text-right px-3 py-3">Saldo inicial</th>
                                <th className="text-right px-3 py-3">Saldo pelo extrato</th>
                                <th className="text-right px-3 py-3">Saldo no banco</th>
                                <th className="text-right px-3 py-3">Conciliado</th>
                                <th className="text-right px-3 py-3">A conciliar</th>
                                <th className="text-right px-3 py-3">Pendentes</th>
                                <th className="text-right px-5 py-3"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {(data?.accounts ?? []).map(acc => {
                                const isEditing = editingId === acc.account_id;
                                // "A conciliar" = valor bruto pendente, como o KPI (a diferença líquida
                                // escondia pendências de sinais opostos).
                                const aConciliar = acc.pending_value ?? 0;
                                const conciliada = (acc.pending_count ?? 0) === 0;
                                return (
                                    <tr key={acc.account_id} className="hover:bg-gray-50/50">
                                        <td className="px-5 py-3">
                                            <p className="text-sm font-normal text-gray-700">{acc.account_name}</p>
                                            {acc.bank_name && <p className="text-xs text-gray-400 font-medium">{acc.bank_name}</p>}
                                        </td>
                                        <td className="px-3 py-3 text-right">
                                            {isEditing ? (
                                                <div ref={edicaoRef} className="flex flex-col items-end gap-1">
                                                    <MoneyCentsInput
                                                        permitirNegativo
                                                        autoFocus
                                                        value={editBalance}
                                                        onChange={setEditBalance}
                                                        onKeyDown={e => teclaNaEdicao(e, acc)}
                                                        disabled={saving}
                                                        aria-label={`Saldo inicial de ${acc.account_name}`}
                                                        title="Digite só os números (os dois últimos são os centavos). Um “-” deixa o saldo negativo. Enter salva, Esc cancela."
                                                        className="w-32 px-2 py-1 rounded border border-gray-200 text-right text-sm text-gray-900 tabular-nums placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                    />
                                                    <input
                                                        type="date"
                                                        value={editDate}
                                                        onChange={e => setEditDate(e.target.value)}
                                                        onKeyDown={e => teclaNaEdicao(e, acc)}
                                                        disabled={saving}
                                                        aria-label={`Extrato de ${acc.account_name} conta a partir de`}
                                                        title="A partir de quando o extrato entra no saldo desta conta. Vazio = todo o extrato."
                                                        className="w-32 px-2 py-1 rounded border border-gray-200 text-right text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                    />
                                                </div>
                                            ) : (
                                                <span className="tabular-nums text-gray-600">{formatBRL(acc.opening_balance)}</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-3 text-right tabular-nums text-sm font-medium text-gray-800">{formatBRL(acc.bank_balance)}</td>
                                        <td className="px-3 py-3 text-right align-top">
                                            {(() => {
                                                const e = estadoDoSaldoBanco(acc);
                                                const informar = (rotulo: string) => (
                                                    <button type="button" onClick={() => setInformarContaId(acc.account_id)}
                                                        className="text-sm font-medium text-blue-700 hover:text-blue-900 hover:underline">
                                                        {rotulo}
                                                    </button>
                                                );
                                                if (e.tipo === 'sem') return informar('Informar saldo do extrato');
                                                return (
                                                    <div className="flex flex-col items-end gap-0.5">
                                                        <span className="tabular-nums text-sm font-medium text-gray-800">{formatBRL(e.saldo)}</span>
                                                        <span className="text-xs text-gray-500">em {formatDateBR(e.data)} · {ROTULO_ORIGEM[e.origem]}</span>
                                                        {e.tipo === 'bate' ? (
                                                            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                                                                <Check className="w-3.5 h-3.5" aria-hidden="true" /> bate
                                                            </span>
                                                        ) : (
                                                            <>
                                                                <span className="text-xs text-amber-800 tabular-nums">
                                                                    app calcula {formatBRL(e.calculado)}
                                                                </span>
                                                                <button type="button" onClick={() => setAjustarContaId(acc.account_id)}
                                                                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900 hover:underline">
                                                                    Ajustar <ArrowRight className="w-3 h-3" />
                                                                </button>
                                                            </>
                                                        )}
                                                        {/* OFX e Asaas se atualizam sozinhos; o digitado, a pessoa corrige. */}
                                                        {e.origem === 'MANUAL' && <span className="text-xs">{informar('Atualizar')}</span>}
                                                    </div>
                                                );
                                            })()}
                                        </td>
                                        <td className="px-3 py-3 text-right tabular-nums text-sm font-medium text-emerald-600">{formatBRL(acc.reconciled_balance)}</td>
                                        <td className={`px-3 py-3 text-right tabular-nums text-sm font-medium ${conciliada ? 'text-gray-300' : 'text-amber-600'}`}>
                                            {conciliada ? '—' : formatBRL(aConciliar)}
                                        </td>
                                        <td className="px-3 py-3 text-right">
                                            {acc.pending_count > 0 ? (
                                                <span className="text-sm font-normal text-amber-700">
                                                    {acc.pending_count}
                                                </span>
                                            ) : (
                                                <Check className="w-4 h-4 text-emerald-500 inline" />
                                            )}
                                        </td>
                                        <td className="px-5 py-3 text-right">
                                            {isEditing ? (
                                                <div className="flex items-center justify-end gap-1">
                                                    <button
                                                        onClick={() => saveEdit(acc)}
                                                        disabled={saving}
                                                        className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                                                        title={saving ? 'Salvando…' : 'Salvar (Enter)'}
                                                        aria-label={`Salvar saldo inicial de ${acc.account_name}`}
                                                    >
                                                        <Check className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={cancelEdit}
                                                        disabled={saving}
                                                        className="p-1.5 rounded-lg bg-gray-50 text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                                                        title={saving ? 'Salvando…' : 'Cancelar (Esc)'}
                                                        aria-label={`Cancelar edição do saldo inicial de ${acc.account_name}`}
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center justify-end gap-1.5">
                                                    {onIrPara && acc.pending_count > 0 && (
                                                        <button type="button"
                                                            onClick={() => onIrPara({ aba: 'pending', contaId: acc.account_id })}
                                                            aria-label={`Conciliar ${acc.account_name} em Pendentes`}
                                                            className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all">
                                                            Conciliar
                                                        </button>
                                                    )}
                                                    <ActionIconButton
                                                        ref={el => { botoesEditar.current[acc.account_id] = el; }}
                                                        kind="edit"
                                                        title={`Editar saldo inicial de ${acc.account_name}`}
                                                        aria-label={`Editar saldo inicial de ${acc.account_name}`}
                                                        onClick={() => startEdit(acc)}
                                                    />
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                            {!loading && (data?.accounts ?? []).length === 0 && (
                                <tr>
                                    <td colSpan={8} className="px-5 py-10 text-center text-sm text-gray-400 font-medium">
                                        Nenhuma conta bancária cadastrada. Cadastre em Minha Organização › Contas de Pagamento.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                        {(data?.accounts ?? []).length > 0 && totals && (
                            <tfoot>
                                <tr className="border-t-2 border-gray-100 bg-gray-50/50 font-black text-gray-900">
                                    <td className="px-5 py-3 text-xs uppercase tracking-widest text-gray-500">Total</td>
                                    <td className="px-3 py-3 text-right tabular-nums">{formatBRL(totals.opening_balance)}</td>
                                    <td className="px-3 py-3 text-right tabular-nums">{formatBRL(totals.bank_balance)}</td>
                                    {/* Sem total de "Saldo no banco": cada conta tem a sua data. */}
                                    <td className="px-3 py-3" />
                                    <td className="px-3 py-3 text-right tabular-nums text-emerald-600">{formatBRL(totals.reconciled_balance)}</td>
                                    <td className={`px-3 py-3 text-right tabular-nums ${totals.pending_count === 0 ? 'text-gray-300' : 'text-amber-600'}`}>
                                        {totals.pending_count === 0 ? '—' : formatBRL(totals.pending_value)}
                                    </td>
                                    <td className="px-3 py-3 text-right tabular-nums">{totals.pending_count}</td>
                                    <td className="px-5 py-3"></td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>
            </>)}

            <InformarSaldoBancoSheet
                open={!!contaInformar}
                conta={contaInformar ? { id: contaInformar.account_id, nome: contaInformar.account_name } : null}
                dataSugerida={asOf}
                atual={contaInformar && contaInformar.saldo_banco_origem === 'MANUAL' && contaInformar.saldo_banco != null && contaInformar.saldo_banco_data
                    ? { saldo: contaInformar.saldo_banco, data: contaInformar.saldo_banco_data } : null}
                onClose={() => setInformarContaId(null)}
                onSalvar={informarSaldo}
            />
            <AjustarSaldoInicialSheet
                open={!!contaAjustar && estadoAjustar?.tipo === 'fora'}
                conta={contaAjustar ? {
                    id: contaAjustar.account_id, nome: contaAjustar.account_name,
                    saldoInicial: contaAjustar.opening_balance ?? 0, dataInicial: contaAjustar.opening_balance_date ?? null,
                } : null}
                estado={estadoAjustar?.tipo === 'fora' ? estadoAjustar : null}
                sugestoes={contaAjustar ? sugestoesDeAjuste(contaAjustar) : null}
                onClose={() => setAjustarContaId(null)}
                onAplicar={ajustarSaldoInicial}
                onVerAnomalias={onIrPara ? () => { setAjustarContaId(null); onIrPara({ aba: 'anomalies' }); } : undefined}
            />

            {/* Consolidado por empresa (SPE) */}
            {consolidated && consolidated.by_empresa.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-50 flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-indigo-500" />
                        <h5 className="text-xs font-black text-gray-400 uppercase tracking-widest">
                            Por empresa
                        </h5>
                        <span className="text-xs text-gray-300 font-bold">
                            {plural(consolidated.totals.empresa_count, 'empresa', 'empresas')} · {plural(consolidated.totals.account_count, 'conta', 'contas')}
                        </span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-50">
                                    <th className="text-left  px-5 py-3">Empresa</th>
                                    <th className="text-right px-3 py-3">Contas</th>
                                    <th className="text-right px-3 py-3">Saldo pelo extrato</th>
                                    <th className="text-right px-3 py-3">Conciliado</th>
                                    <th className="text-right px-3 py-3">A conciliar</th>
                                    <th className="text-right px-5 py-3">Pendentes</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {consolidated.by_empresa.map(e => (
                                    <tr key={e.empresa_id ?? 'none'} className="hover:bg-gray-50/50">
                                        <td className="px-5 py-3 text-sm font-normal text-gray-700">{e.empresa_name}</td>
                                        <td className="px-3 py-3 text-right tabular-nums text-gray-500">{e.account_count}</td>
                                        <td className="px-3 py-3 text-right tabular-nums text-sm font-medium text-gray-800">{formatBRL(e.bank_balance)}</td>
                                        <td className="px-3 py-3 text-right tabular-nums text-sm font-medium text-emerald-600">{formatBRL(e.reconciled_balance)}</td>
                                        <td className={`px-3 py-3 text-right tabular-nums text-sm font-medium ${!e.pending_count ? 'text-gray-300' : 'text-amber-600'}`}>
                                            {!e.pending_count ? '—' : formatBRL(e.pending_value)}
                                        </td>
                                        <td className="px-5 py-3 text-right tabular-nums">{e.pending_count || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="border-t-2 border-gray-100 bg-gray-50/50 font-black text-gray-900">
                                    <td className="px-5 py-3 text-xs uppercase tracking-widest text-gray-500">Total</td>
                                    <td className="px-3 py-3 text-right tabular-nums">{consolidated.totals.account_count}</td>
                                    <td className="px-3 py-3 text-right tabular-nums">{formatBRL(consolidated.totals.bank_balance)}</td>
                                    <td className="px-3 py-3 text-right tabular-nums text-emerald-600">{formatBRL(consolidated.totals.reconciled_balance)}</td>
                                    <td className="px-3 py-3 text-right tabular-nums text-amber-600">{formatBRL(consolidated.totals.pending_value)}</td>
                                    <td className="px-5 py-3"></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            )}

            {/* Caixa realizado por obra */}
            {consolidated && consolidated.by_project.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-50 flex items-center gap-2">
                        <HardHat className="w-4 h-4 text-orange-500" />
                        <h5 className="text-xs font-black text-gray-400 uppercase tracking-widest">
                            Caixa realizado por obra
                        </h5>
                        <span className="text-xs text-gray-300 font-bold">lançamentos conciliados até a data</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-50">
                                    <th className="text-left  px-5 py-3">Obra</th>
                                    <th className="text-right px-3 py-3">Entradas</th>
                                    <th className="text-right px-3 py-3">Saídas</th>
                                    <th className="text-right px-5 py-3">Caixa Líquido</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {consolidated.by_project.map(p => (
                                    <tr key={p.project_id} className="hover:bg-gray-50/50">
                                        <td className="px-5 py-3 text-sm font-normal text-gray-700">{p.project_name}</td>
                                        <td className="px-3 py-3 text-right tabular-nums text-emerald-600">{formatBRL(p.credit)}</td>
                                        <td className="px-3 py-3 text-right tabular-nums text-red-600">{formatBRL(p.debit)}</td>
                                        <td className={`px-5 py-3 text-right tabular-nums text-sm font-medium ${p.net >= 0 ? 'text-gray-900' : 'text-red-600'}`}>{formatBRL(p.net)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ReconciliationDashboardView;
