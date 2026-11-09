import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle, ArrowDownLeft, ArrowUpRight, Clock, FileDown, FileText, Hourglass,
    Landmark, Loader2, RefreshCw, Wallet,
} from 'lucide-react';
import { useOrgContext } from '../../hooks/useOrgContext';
import { useStore } from '../../store/useStore';
import { temAcessoTotal } from '../../lib/acessoTotal';
import {
    asaasContaService,
    type ContaAsaasResumo, type LinhaExtratoAsaas, type ResumoContaAsaas,
} from '../../services/asaasContaService';
import { exportService, type ExtratoAsaasExportRow } from '../../services/exportService';
import { ehTaxaAsaas, ordenarPeloSaldo, partirPeriodo, rotuloDoTipoAsaas } from '../../utils/asaasExtrato';
import { STATEMENT_STATUS_COLORS, STATEMENT_STATUS_LABELS } from '../reconciliation/tabelasDaConciliacao';
import type { BankTransactionStatus } from '../../types/financial';
import { KpiCard } from '../ui/KpiCard';
import StandardTable, { type StandardTableColumn } from '../ui/StandardTable';
import FilterPopover from '../ui/FilterPopover';
import { usePersistedState } from '../ui/TableUtils';
import { formatDateBR, formatMoney } from '../ui/Format';

/**
 * Financeiro › Tesouraria › Conta Asaas — saldo, a receber e extrato da conta
 * Asaas. Plano: docs/planos/2026-11-09-conta-asaas-tela-financeiro.md.
 *
 * Duas fontes no mesmo extrato:
 *  - a partir de `extrato_desde`: `bank_transactions` (importado pelo cron de
 *    hora em hora da Edge `asaas-conta`), com a situação na conciliação e o
 *    título que a linha liquidou;
 *  - antes disso: lido AO VIVO da Asaas e marcado "Só consulta" — não é gravado,
 *    para não jogar movimento de antes da integração na fila da Conciliação.
 *
 * A organização vem do topo (REGRA #5): "Todas" lista as contas Asaas de todas
 * as orgs que o usuário enxerga. Ler é de qualquer membro da org dona;
 * sincronizar é de proprietário/administrador (a Edge confere o mesmo).
 */

type Preset = 'mes' | 'mes_anterior' | '30d' | '90d' | 'ano' | 'personalizado';
type Recorte = 'todos' | 'entradas' | 'saidas' | 'taxas';

interface Linha extends LinhaExtratoAsaas {
    /** Posição cronológica (encadeamento do saldo) — desempata o mesmo dia. */
    ordem: number;
}

const COLUMNS: StandardTableColumn[] = [
    { key: 'data', label: 'Data', sortable: true, width: 110 },
    { key: 'tipo', label: 'Tipo', sortable: true, width: 210 },
    { key: 'descricao', label: 'Descrição', sortable: true, width: 320 },
    { key: 'titulo', label: 'Título vinculado', sortable: true, width: 260 },
    { key: 'entrada', label: 'Entrada', sortable: true, width: 130, align: 'right' },
    { key: 'saida', label: 'Saída', sortable: true, width: 130, align: 'right' },
    { key: 'saldo', label: 'Saldo após', sortable: true, width: 140, align: 'right' },
    { key: 'situacao', label: 'Situação', sortable: true, width: 190 },
];

const PRESETS: { value: Preset; label: string }[] = [
    { value: 'mes', label: 'Este mês' },
    { value: 'mes_anterior', label: 'Mês anterior' },
    { value: '30d', label: 'Últimos 30 dias' },
    { value: '90d', label: 'Últimos 90 dias' },
    { value: 'ano', label: 'Este ano' },
    { value: 'personalizado', label: 'Personalizado' },
];

const RECORTES: { value: Recorte; label: string }[] = [
    { value: 'todos', label: 'Todos' },
    { value: 'entradas', label: 'Entradas' },
    { value: 'saidas', label: 'Saídas' },
    { value: 'taxas', label: 'Taxas da Asaas' },
];

const SELECT = 'h-9 pl-3 pr-8 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer';
const DATA = 'h-9 px-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';
const BOTAO = 'flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] font-medium text-[13px] transition-all active:scale-95 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Período de cada atalho, em datas LOCAIS (o dia do usuário, não o de Greenwich). */
export function periodoDoPreset(preset: Exclude<Preset, 'personalizado'>, hoje: Date = new Date()): { inicio: string; fim: string } {
    const y = hoje.getFullYear();
    const m = hoje.getMonth();
    switch (preset) {
        case 'mes': return { inicio: iso(new Date(y, m, 1)), fim: iso(hoje) };
        case 'mes_anterior': return { inicio: iso(new Date(y, m - 1, 1)), fim: iso(new Date(y, m, 0)) };
        case '30d': return { inicio: iso(new Date(y, m, hoje.getDate() - 29)), fim: iso(hoje) };
        case '90d': return { inicio: iso(new Date(y, m, hoje.getDate() - 89)), fim: iso(hoje) };
        case 'ano': return { inicio: iso(new Date(y, 0, 1)), fim: iso(hoje) };
    }
}

function dataHora(isoTs: string | null | undefined): string {
    if (!isoTs) return '—';
    const d = new Date(isoTs);
    return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

function situacao(l: LinhaExtratoAsaas): { texto: string; cor: string } {
    if (l.historico) return { texto: 'Só consulta', cor: 'text-gray-500' };
    const s = (l.status ?? '') as BankTransactionStatus;
    return { texto: STATEMENT_STATUS_LABELS[s] ?? 'Pendente', cor: STATEMENT_STATUS_COLORS[s] ?? 'text-amber-700' };
}

const MOTIVO_NAO_GESTOR = 'Só proprietário ou administrador da organização dona da conta sincroniza o extrato.';

export default function ContaAsaasModule() {
    const { orgId } = useOrgContext();
    const group = useStore(s => s.currentProfile.group);
    const email = useStore(s => s.session?.user?.email);
    const organizations = useStore(s => s.organizations);

    const [contas, setContas] = useState<ContaAsaasResumo[]>([]);
    const [carregandoContas, setCarregandoContas] = useState(true);
    const [erroContas, setErroContas] = useState<string | null>(null);
    const [contaId, setContaId] = usePersistedState<string>('financeiro:conta-asaas:conta', '');

    const [preset, setPreset] = usePersistedState<Preset>('financeiro:conta-asaas:periodo', 'mes');
    const [inicioManual, setInicioManual] = usePersistedState<string>('financeiro:conta-asaas:inicio', '');
    const [fimManual, setFimManual] = usePersistedState<string>('financeiro:conta-asaas:fim', '');
    const [recorte, setRecorte] = usePersistedState<Recorte>('financeiro:conta-asaas:recorte', 'todos');

    const [resumo, setResumo] = useState<ResumoContaAsaas | null>(null);
    const [erroResumo, setErroResumo] = useState<string | null>(null);
    const [linhas, setLinhas] = useState<Linha[]>([]);
    const [carregandoExtrato, setCarregandoExtrato] = useState(false);
    const [erroExtrato, setErroExtrato] = useState<string | null>(null);
    const [erroHistorico, setErroHistorico] = useState<string | null>(null);
    const [historicoTruncado, setHistoricoTruncado] = useState(false);
    const [ocupado, setOcupado] = useState<null | 'saldo' | 'sincronizar'>(null);
    const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

    const conta = contas.find(c => c.payment_account_id === contaId) ?? contas[0] ?? null;

    const periodo = useMemo(() => {
        if (preset !== 'personalizado') return periodoDoPreset(preset);
        const padrao = periodoDoPreset('mes');
        return { inicio: inicioManual || padrao.inicio, fim: fimManual || padrao.fim };
    }, [preset, inicioManual, fimManual]);

    // Proprietário/administrador da org DONA da conta (a Edge confere o mesmo).
    const ehGestor = useMemo(() => {
        const e = (email || '').toLowerCase();
        if (String(group) === 'DESENVOLVEDOR' || temAcessoTotal(e)) return true;
        const org = organizations.find(o => o.id === conta?.organization_id);
        const membro = org?.members?.find(m => (m.email || '').toLowerCase() === e);
        return membro?.role === 'owner' || membro?.role === 'admin';
    }, [email, group, organizations, conta?.organization_id]);

    const carregarContas = useCallback(async () => {
        setCarregandoContas(true);
        setErroContas(null);
        try {
            setContas(await asaasContaService.contasAsaas(orgId));
        } catch (e) {
            setErroContas(e instanceof Error ? e.message : String(e));
        } finally {
            setCarregandoContas(false);
        }
    }, [orgId]);

    useEffect(() => { carregarContas(); }, [carregarContas]);

    // Saldo ao vivo + a receber. Falha não esvazia a tela: o saldo gravado
    // (última leitura do cron) continua nos cards, com a hora.
    const carregarResumo = useCallback(async (id: string) => {
        setErroResumo(null);
        try {
            const r = await asaasContaService.resumo(id);
            setResumo(r);
            setContas(prev => prev.map(c => c.payment_account_id === id ? { ...c, saldo: r.saldo, saldo_em: r.saldo_em } : c));
        } catch (e) {
            setResumo(null);
            setErroResumo(e instanceof Error ? e.message : String(e));
        }
    }, []);

    useEffect(() => {
        setResumo(null);
        if (conta) carregarResumo(conta.payment_account_id);
    }, [conta?.payment_account_id, carregarResumo]); // eslint-disable-line react-hooks/exhaustive-deps

    const carregarExtrato = useCallback(async (c: ContaAsaasResumo, inicio: string, fim: string) => {
        setCarregandoExtrato(true);
        setErroExtrato(null);
        setErroHistorico(null);
        setHistoricoTruncado(false);
        try {
            const { historico, gravado } = partirPeriodo({ inicio, fim, desde: c.extrato_desde });
            // O histórico depende da Asaas responder; falha nele vira aviso e
            // NÃO esconde o extrato gravado do mesmo período.
            const [doBanco, aoVivo] = await Promise.all([
                gravado ? asaasContaService.listarExtrato(c.payment_account_id, gravado.inicio, gravado.fim) : Promise.resolve([]),
                historico
                    ? asaasContaService.extratoConsulta(c.payment_account_id, historico.inicio, historico.fim).catch((e: unknown) => {
                        setErroHistorico(`O histórico antes de ${formatDateBR(c.extrato_desde)} não pôde ser lido na Asaas: ${e instanceof Error ? e.message : String(e)}`);
                        return null;
                    })
                    : Promise.resolve(null),
            ]);
            const doHistorico: LinhaExtratoAsaas[] = (aoVivo?.linhas ?? []).map(h => ({
                id: `asaas:${h.id}`, idAsaas: h.id, data: h.data, valor: h.valor, saldoApos: h.saldo_apos,
                tipo: h.tipo, descricao: h.descricao, status: null, titulo: null, historico: true,
            }));
            if (aoVivo?.truncado) setHistoricoTruncado(true);
            const cronologico = ordenarPeloSaldo([...doHistorico, ...doBanco].map(l => ({
                ...l, transaction_date: l.data, amount: Math.abs(l.valor), direction: l.valor < 0 ? 'DEBIT' : 'CREDIT', saldo_apos: l.saldoApos,
            })));
            setLinhas(cronologico.map((l, i) => ({
                id: l.id, idAsaas: l.idAsaas, data: l.data, valor: l.valor, saldoApos: l.saldoApos, tipo: l.tipo,
                descricao: l.descricao, status: l.status, titulo: l.titulo, historico: l.historico, ordem: i,
            })));
        } catch (e) {
            setLinhas([]);
            setErroExtrato(e instanceof Error ? e.message : String(e));
        } finally {
            setCarregandoExtrato(false);
        }
    }, []);

    useEffect(() => {
        if (conta) carregarExtrato(conta, periodo.inicio, periodo.fim);
        else setLinhas([]);
    }, [conta?.payment_account_id, conta?.extrato_desde, periodo.inicio, periodo.fim, carregarExtrato]); // eslint-disable-line react-hooks/exhaustive-deps

    async function atualizarSaldo() {
        if (!conta) return;
        setOcupado('saldo');
        setMsg(null);
        await carregarResumo(conta.payment_account_id);
        setOcupado(null);
    }

    async function sincronizar() {
        if (!conta) return;
        setOcupado('sincronizar');
        setMsg(null);
        try {
            const r = await asaasContaService.sincronizarExtrato(conta.payment_account_id);
            setMsg({
                tipo: 'ok',
                texto: `Extrato sincronizado (${r.janela.replace('..', ' a ')}): ${r.no_periodo} movimento(s) na Asaas, ${r.importadas} novo(s), ${r.vinculadas} ligado(s) a título.`,
            });
            await Promise.all([carregarContas(), carregarResumo(conta.payment_account_id)]);
            await carregarExtrato(conta, periodo.inicio, periodo.fim);
        } catch (e) {
            setMsg({ tipo: 'erro', texto: e instanceof Error ? e.message : String(e) });
        } finally {
            setOcupado(null);
        }
    }

    const visiveis = useMemo(() => linhas.filter(l => {
        if (recorte === 'entradas') return l.valor > 0;
        if (recorte === 'saidas') return l.valor < 0;
        if (recorte === 'taxas') return ehTaxaAsaas(l.tipo);
        return true;
    }), [linhas, recorte]);

    const linhasDeExportacao = (): ExtratoAsaasExportRow[] => [...visiveis].reverse().map(l => ({
        data: l.data,
        tipo: rotuloDoTipoAsaas(l.tipo),
        descricao: l.descricao ?? '',
        titulo: l.titulo ?? '',
        entrada: l.valor > 0 ? l.valor : null,
        saida: l.valor < 0 ? -l.valor : null,
        saldoApos: l.saldoApos,
        situacao: situacao(l).texto,
    }));
    const nomeArquivo = () => `extrato-asaas-${periodo.inicio}-a-${periodo.fim}`;
    const subtituloExportacao = () => `${conta?.nome ?? 'Conta Asaas'} | ${formatDateBR(periodo.inicio)} a ${formatDateBR(periodo.fim)}`;

    const saldoAtual = resumo?.saldo ?? conta?.saldo ?? null;
    const saldoEm = resumo?.saldo_em ?? conta?.saldo_em ?? null;
    const aReceber = resumo?.a_receber ?? null;
    const temHistorico = !!conta && periodo.inicio < conta.extrato_desde;

    if (carregandoContas) {
        return (
            <div className="text-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto" />
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-20">
            {/* 1. Título (§20) */}
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Conta Asaas</h1>
                <p className="text-gray-500 text-sm mt-1.5 font-medium">
                    {conta
                        ? `${conta.nome} · ${conta.env === 'production' ? 'Produção' : 'Sandbox'} · saldo lido em ${dataHora(saldoEm)}`
                        : 'Saldo, valores a receber e extrato da conta Asaas.'}
                </p>
            </div>

            {erroContas && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-[10px] text-sm text-red-700">{erroContas}</div>
            )}

            {!conta && !erroContas ? (
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm text-center py-16 px-6">
                    <Landmark className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-base font-semibold text-gray-700">Nenhuma conta Asaas ativa{orgId ? ' nesta organização' : ''}</p>
                    <p className="text-sm text-gray-500 mt-1">
                        Cadastre a chave de API em Minha Organização › Contas › editar conta › "Conta Asaas".
                    </p>
                </div>
            ) : conta && (
                <>
                    {/* 3. KPIs (§4) — não dependem do período */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                        <KpiCard
                            label="Saldo disponível"
                            value={saldoAtual == null ? '—' : formatMoney(saldoAtual)}
                            sub={resumo ? 'Lido agora na Asaas' : `Última leitura: ${dataHora(saldoEm)}`}
                            icon={<Wallet />}
                            color="blue"
                            title="Saldo da conta Asaas (GET /finance/balance). É o que pode ser transferido ou usado para pagar."
                        />
                        <KpiCard
                            label="Aguardando crédito"
                            value={aReceber ? formatMoney(aReceber.aguardandoCredito.valor) : '—'}
                            sub={aReceber ? `${aReceber.aguardandoCredito.quantidade} cobrança(s) paga(s), valor líquido` : undefined}
                            icon={<Hourglass />}
                            color="violet"
                            title="Cobranças confirmadas que a Asaas ainda vai creditar no saldo (ex.: cartão). Valor já sem a taxa."
                        />
                        <KpiCard
                            label="Cobranças em aberto"
                            value={aReceber ? formatMoney(aReceber.emAberto.valor) : '—'}
                            sub={aReceber ? `${aReceber.emAberto.quantidade} cobrança(s), valor bruto` : undefined}
                            icon={<Clock />}
                            color="amber"
                            title="Cobranças emitidas pela Asaas ainda não pagas (aguardando + vencidas). A taxa só sai no pagamento."
                        />
                        <KpiCard
                            label="Vencidas"
                            value={aReceber ? formatMoney(aReceber.vencidas.valor) : '—'}
                            sub={aReceber ? `${aReceber.vencidas.quantidade} cobrança(s)` : undefined}
                            icon={<AlertTriangle />}
                            color="red"
                            title="Parte das cobranças em aberto que já passou do vencimento."
                        />
                    </div>

                    {(erroResumo || resumo?.a_receber_erro || conta.ultimo_erro) && (
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-[10px] text-sm text-amber-800 flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                            <span>
                                {erroResumo
                                    ? `Não foi possível ler o saldo agora: ${erroResumo} Os cards mostram a última leitura gravada (${dataHora(conta.saldo_em)}).`
                                    : resumo?.a_receber_erro
                                        ? `Os valores a receber não vieram da Asaas (${resumo.a_receber_erro}) — aparecem zerados.`
                                        : `Último erro da conta (${dataHora(conta.ultimo_erro_em)}): ${conta.ultimo_erro}`}
                            </span>
                        </div>
                    )}

                    {/* 4. Toolbar de botões (§5.3) — escopo à esquerda, ações à direita */}
                    <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm">
                        <div className="flex flex-wrap items-center gap-2">
                            {contas.length > 1 && (
                                <select
                                    aria-label="Conta Asaas"
                                    value={conta.payment_account_id}
                                    onChange={e => setContaId(e.target.value)}
                                    className={SELECT}
                                >
                                    {contas.map(c => <option key={c.payment_account_id} value={c.payment_account_id}>{c.nome}</option>)}
                                </select>
                            )}
                            <select aria-label="Período" value={preset} onChange={e => setPreset(e.target.value as Preset)} className={SELECT}>
                                {PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                            </select>
                            <input
                                type="date"
                                aria-label="Início do período"
                                value={periodo.inicio}
                                max={periodo.fim}
                                onChange={e => { setInicioManual(e.target.value); setFimManual(periodo.fim); setPreset('personalizado'); }}
                                className={DATA}
                            />
                            <span className="text-sm text-gray-500">a</span>
                            <input
                                type="date"
                                aria-label="Fim do período"
                                value={periodo.fim}
                                min={periodo.inicio}
                                onChange={e => { setFimManual(e.target.value); setInicioManual(periodo.inicio); setPreset('personalizado'); }}
                                className={DATA}
                            />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={atualizarSaldo}
                                disabled={ocupado !== null}
                                title={ocupado ? 'Aguarde a operação em andamento.' : 'Lê o saldo e os valores a receber na Asaas agora.'}
                                className={`${BOTAO} bg-white text-gray-700 border border-gray-200 hover:bg-gray-50`}
                            >
                                {ocupado === 'saldo' ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <RefreshCw className="w-[15px] h-[15px]" />}
                                Atualizar saldo
                            </button>
                            <button
                                type="button"
                                onClick={sincronizar}
                                disabled={!ehGestor || ocupado !== null}
                                title={!ehGestor ? MOTIVO_NAO_GESTOR : ocupado ? 'Aguarde a operação em andamento.' : `Importa agora os movimentos novos (o automático roda de hora em hora). Importado até ${conta.extrato_sincronizado_ate ? formatDateBR(conta.extrato_sincronizado_ate) : '—'}.`}
                                className={`${BOTAO} bg-white text-gray-700 border border-gray-200 hover:bg-gray-50`}
                            >
                                {ocupado === 'sincronizar' ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <RefreshCw className="w-[15px] h-[15px]" />}
                                Sincronizar extrato
                            </button>
                            <button
                                type="button"
                                onClick={() => exportService.generateExtratoAsaasPDF(linhasDeExportacao(), { fileName: nomeArquivo(), title: 'Extrato Asaas', subtitulo: subtituloExportacao() })}
                                disabled={!visiveis.length}
                                title={!visiveis.length ? 'Não há movimentos no período para exportar.' : 'Exporta os movimentos que estão na tabela.'}
                                className={`${BOTAO} bg-white text-gray-700 border border-gray-200 hover:bg-gray-50`}
                            >
                                <FileText className="w-[15px] h-[15px] text-red-500" />
                                PDF
                            </button>
                            <button
                                type="button"
                                onClick={() => exportService.generateExtratoAsaasExcel(linhasDeExportacao(), { fileName: nomeArquivo() })}
                                disabled={!visiveis.length}
                                title={!visiveis.length ? 'Não há movimentos no período para exportar.' : 'Exporta os movimentos que estão na tabela.'}
                                className={`${BOTAO} bg-emerald-600 text-white hover:bg-emerald-700`}
                            >
                                <FileDown className="w-[15px] h-[15px]" />
                                Excel
                            </button>
                        </div>
                    </div>

                    {msg && (
                        <div className={`p-3 rounded-[10px] text-sm border ${msg.tipo === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
                            {msg.texto}
                        </div>
                    )}
                    {erroExtrato && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-[10px] text-sm text-red-700">{erroExtrato}</div>
                    )}
                    {erroHistorico && (
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-[10px] text-sm text-amber-800">{erroHistorico}</div>
                    )}
                    {temHistorico && (
                        <p className="text-xs text-gray-500">
                            Movimentos antes de {formatDateBR(conta.extrato_desde)} são lidos agora na Asaas e aparecem como "Só consulta": não ficam gravados nem entram na Conciliação.
                            {historicoTruncado && ' O período tem movimentos demais para uma leitura — mostramos os 3.000 primeiros; reduza o período para ver o resto.'}
                        </p>
                    )}

                    {/* 5. Tabela com toolbar acoplada (§5.2/§6.10) */}
                    <StandardTable<Linha>
                        storageKey="financeiro:conta-asaas:extrato"
                        columns={COLUMNS}
                        rows={visiveis}
                        rowKey={l => l.id}
                        loading={carregandoExtrato}
                        searchText={l => `${rotuloDoTipoAsaas(l.tipo)} ${l.descricao ?? ''} ${l.titulo ?? ''} ${l.idAsaas ?? ''}`}
                        searchPlaceholder="Buscar por tipo, descrição ou título…"
                        defaultSort={{ column: 'data', direction: 'desc' }}
                        filters={(
                            <FilterPopover<Recorte>
                                label="Movimento"
                                options={RECORTES}
                                value={recorte}
                                onChange={setRecorte}
                                allValue="todos"
                            />
                        )}
                        sortValue={(key, l) => {
                            switch (key) {
                                case 'data': return l.ordem;
                                case 'tipo': return rotuloDoTipoAsaas(l.tipo);
                                case 'descricao': return l.descricao ?? '';
                                case 'titulo': return l.titulo ?? '';
                                case 'entrada': return l.valor > 0 ? l.valor : null;
                                case 'saida': return l.valor < 0 ? -l.valor : null;
                                case 'saldo': return l.saldoApos;
                                case 'situacao': return situacao(l).texto;
                                default: return null;
                            }
                        }}
                        renderCell={(key, l) => {
                            switch (key) {
                                case 'data':
                                    return <span className="text-sm font-normal text-gray-600 whitespace-nowrap">{formatDateBR(l.data)}</span>;
                                case 'tipo':
                                    return (
                                        <span className="text-sm font-normal text-gray-700 flex items-center gap-1.5" title={l.tipo ?? undefined}>
                                            {l.valor < 0
                                                ? <ArrowUpRight className="w-3.5 h-3.5 text-red-500 shrink-0" />
                                                : <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                                            {rotuloDoTipoAsaas(l.tipo)}
                                        </span>
                                    );
                                case 'descricao':
                                    return <span className="text-sm font-normal text-gray-700" title={l.idAsaas ? `Id na Asaas: ${l.idAsaas}` : undefined}>{l.descricao || '—'}</span>;
                                case 'titulo':
                                    return <span className="text-sm font-normal text-gray-700">{l.titulo || '—'}</span>;
                                case 'entrada':
                                    return l.valor > 0 ? <span className="text-sm font-medium text-emerald-700 whitespace-nowrap">{formatMoney(l.valor)}</span> : null;
                                case 'saida':
                                    return l.valor < 0 ? <span className="text-sm font-medium text-red-600 whitespace-nowrap">{formatMoney(-l.valor)}</span> : null;
                                case 'saldo':
                                    return <span className="text-sm font-medium text-gray-800 whitespace-nowrap">{l.saldoApos == null ? '—' : formatMoney(l.saldoApos)}</span>;
                                case 'situacao': {
                                    const s = situacao(l);
                                    return <span className={`text-sm font-normal ${s.cor}`}>{s.texto}</span>;
                                }
                                default:
                                    return null;
                            }
                        }}
                        totaisPorColuna={(key, ls) => {
                            if (key === 'data') return <span className="text-xs font-semibold text-gray-500">Total</span>;
                            if (key === 'entrada') return <span className="text-sm font-medium text-emerald-700">{formatMoney(ls.reduce((s, l) => s + (l.valor > 0 ? l.valor : 0), 0))}</span>;
                            if (key === 'saida') return <span className="text-sm font-medium text-red-600">{formatMoney(ls.reduce((s, l) => s + (l.valor < 0 ? -l.valor : 0), 0))}</span>;
                            return null;
                        }}
                        empty={{
                            icon: <Landmark className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                            title: 'Nenhum movimento no período',
                            subtitle: recorte !== 'todos' ? 'Experimente o filtro "Todos" ou outro período.' : 'Escolha outro período.',
                        }}
                    />
                </>
            )}
        </div>
    );
}
