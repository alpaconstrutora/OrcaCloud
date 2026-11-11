import React from 'react';
import { financialIntelligenceService } from '../services/financialIntelligenceService';
import type { FinancialAlert, ProjectScorecard, CashflowProjectionPoint } from '../services/financialIntelligenceService';
import type { ActionQueueItem } from '../services/approvalService';
import { financialApprovalService } from '../services/financialApprovalService';
import type { FinancialApprovalConfig, ReconciliationDivergences } from '../types/financial';
import type { ProcessStepBottleneck } from '../types/process';
import { contractIndexService } from '../services/contractIndexService';
import { taskService } from '../services/taskService';
import { ApproveRejectModal } from './FinancialApprovalModule';
import {
    centralControleService, comoSettled,
    type CentralControleBootstrap, type MeuDia,
} from '../services/centralControleService';
import { useStore } from '../store/useStore';
import { useModulosPermitidos } from '../utils/modulosPermitidos';
import {
    saudacaoPorHora, comoChamar, diaEmSaoPaulo, montarFila, itemEmDestaque, contagemDoDia,
    type AlertaDoDia,
} from '../utils/meuDia';
import { Saudacao } from './central/Saudacao';
import { MinhaFila, type FiltroDaFila } from './central/MinhaFila';
import { CartaoContasSemana } from './central/CartaoContasSemana';
import { CartaoCaixa, type PeriodoCaixa } from './central/CartaoCaixa';
import { CartaoObras } from './central/CartaoObras';
import { CartaoConciliado } from './central/CartaoConciliado';
import { NumeroQueTroca } from './central/NumeroQueTroca';
import type { EstadoDoCartao } from './central/CartaoCentral';

/**
 * Central de Controle → tela "Bom dia" (11/11/2026).
 * Plano: docs/planos/2026-11-10-central-bom-dia.md · referência: reel do
 * CarePath AI ("Your morning, sorted.").
 *
 * Saudação + frase-resumo do que precisa de MIM hoje + barra "Seu dia"; pílulas
 * que filtram a Minha fila; grade com Contas a pagar (7 dias), Caixa projetado,
 * Obras e Extrato conciliado. Cada cartão carrega e falha sozinho. Um cartão só
 * aparece se o módulo para onde ele leva aparece no menu lateral
 * (`utils/modulosPermitidos`, a mesma regra do `Layout`).
 */
interface Props {
    organizationId: string | null;
    userEmail?: string;
    onNavigate: (view: string) => void;
}

/** Fonte do painel: ainda carregando, com erro, ou o dado. */
type Fonte<T> = { estado: 'carregando' } | { estado: 'erro' } | { estado: 'ok'; data: T };
const CARREGANDO = { estado: 'carregando' } as const;
/** Tempo da linha recolhendo (`.central-recolhe` em index.css) antes do item sair do estado. */
const SAIDA_MS = 220;

function estadoDe(f: Fonte<unknown>): EstadoDoCartao {
    return f.estado;
}

function fBRL(v: number | null | undefined): string {
    return v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const CentralControle: React.FC<Props> = ({ organizationId, userEmail = '', onNavigate }) => {
    const [fila, setFila] = React.useState<Fonte<ActionQueueItem[]>>(CARREGANDO);
    const [meuDia, setMeuDia] = React.useState<Fonte<MeuDia>>(CARREGANDO);
    const [alertas, setAlertas] = React.useState<Fonte<AlertaDoDia[]>>(CARREGANDO);
    const [scorecards, setScorecards] = React.useState<Fonte<ProjectScorecard[]>>(CARREGANDO);
    const [approvalConfig, setApprovalConfig] = React.useState<FinancialApprovalConfig[]>([]);
    const [approvalModal, setApprovalModal] = React.useState<{ item: ActionQueueItem; mode: 'approve' | 'reject' } | null>(null);
    const [carregando, setCarregando] = React.useState(true);
    const [filtro, setFiltro] = React.useState<FiltroDaFila>('tudo');
    // Números sobem até o valor só na PRIMEIRA carga da tela; atualizar não anima.
    const [animar, setAnimar] = React.useState(true);

    const [periodoCaixa, setPeriodoCaixa] = React.useState<PeriodoCaixa>(90);
    const [caixa, setCaixa] = React.useState<Fonte<CashflowProjectionPoint[]>>(CARREGANDO);
    // Trocar 30/60/90 (ou atualizar) mantém o gráfico anterior esmaecido até o novo
    // chegar — sem voltar ao esqueleto. Organização nova volta ao esqueleto: o dado
    // velho é de outra empresa.
    const [caixaTrocando, setCaixaTrocando] = React.useState(false);
    const caixaDaOrg = React.useRef<string | null | undefined>(undefined);
    // Cada "Atualizar" concluído é uma rodada; o <Realce> dos cartões marca o número
    // que mudou de uma rodada para a outra.
    const [rodada, setRodada] = React.useState(0);

    const profile = useStore(s => s.currentProfile);
    const organizations = useStore(s => s.organizations);
    const mod = useModulosPermitidos({ group: profile.group, email: userEmail || profile.email });
    const verFinanceiro = !!mod.financeiro;
    const verObras = !!mod.obras;

    // `opcoes` pode chegar como o evento do clique (onTentarDeNovo={load}): só
    // `realcar === true` conta como rodada de "Atualizar".
    const load = React.useCallback(async (opcoes?: { realcar?: boolean }) => {
        setCarregando(true);

        // ── Uma chamada para as consultas pesadas ─────────────────────────
        // Até 24/09/2026 as OITO saíam juntas num `Promise.allSettled`, por
        // cima das ~17 requisições da casca do app — pico medido de 17 em voo.
        // `fn_central_controle_bootstrap` roda todas numa sessão só (e, desde
        // 11/11/2026, também o bloco `meu_dia`). As duas leituras de tabela
        // (reajuste e config de alçada) continuam soltas — são baratas.
        //
        // O isolamento por fonte NÃO se perdeu: a função SQL embrulha cada
        // consulta no próprio `BEGIN … EXCEPTION`, e cada cartão mostra o
        // próprio "Não carregou".
        const [bootstrapR, reajusteR, approvalConfigR] = await Promise.allSettled([
            centralControleService.bootstrap(organizationId),
            contractIndexService.listDueForReajuste(organizationId),
            financialApprovalService.listConfig(organizationId),
        ]);

        // Uma falha da chamada consolidada (rede, timeout) derruba todas as
        // fontes juntas — é o preço de trocar N round-trips por um.
        const painel = bootstrapR.status === 'fulfilled' ? bootstrapR.value : undefined;
        const falhaGeral = bootstrapR.status === 'rejected' ? bootstrapR.reason : undefined;
        const fonte = <T,>(chave: keyof CentralControleBootstrap): PromiseSettledResult<T> =>
            painel
                ? comoSettled(painel[chave] as never, String(chave)) as PromiseSettledResult<T>
                : { status: 'rejected', reason: falhaGeral ?? new Error('Painel indisponível.') };
        const paraFonte = <T,>(r: PromiseSettledResult<T>, nome: string): Fonte<T> => {
            if (r.status === 'fulfilled') return { estado: 'ok', data: r.value };
            console.error(`[CentralControle] ${nome}:`, r.reason);
            return { estado: 'erro' };
        };

        // Alertas: os mesmos da Central antiga (alertas financeiros, divergências
        // de conciliação, gargalos de processo e reajustes vencidos). As
        // "N transações aguardando aprovação" saíram: a Minha fila já as lista.
        const financialR = fonte<FinancialAlert[]>('financial_alerts');
        const divergenceR = fonte<ReconciliationDivergences>('divergences');
        const bottlenecksR = fonte<ProcessStepBottleneck[]>('bottlenecks');
        const lista: AlertaDoDia[] = [];
        let algumAlertaCarregou = false;
        if (financialR.status === 'fulfilled') {
            algumAlertaCarregou = true;
            financialR.value.forEach((a, i) => lista.push({
                id: `fin-${i}-${a.ref_id ?? a.title}`,
                severity: a.severity,
                title: a.title,
                description: a.project_name ? `${a.description} · ${a.project_name}` : a.description,
                amount: a.amount,
                view: 'financial-dashboard',
            }));
        } else console.error('[CentralControle] financial alerts:', financialR.reason);
        if (divergenceR.status === 'fulfilled') {
            algumAlertaCarregou = true;
            const d = divergenceR.value;
            if (d.counts.value_mismatch > 0) lista.push({ id: 'div-mismatch', severity: 'HIGH', view: 'bank-reconciliation', title: `${d.counts.value_mismatch} lançamento(s) com valor divergente`, description: `Banco × sistema não batem — apurado em ${d.as_of}` });
            if (d.counts.bank_without_internal > 0) lista.push({ id: 'div-bank', severity: 'MEDIUM', view: 'bank-reconciliation', title: `${d.counts.bank_without_internal} lançamento(s) do banco sem correspondência`, description: `Sem contrapartida no sistema — apurado em ${d.as_of}` });
            if (d.counts.internal_without_bank > 0) lista.push({ id: 'div-internal', severity: 'MEDIUM', view: 'bank-reconciliation', title: `${d.counts.internal_without_bank} lançamento(s) do sistema sem correspondência`, description: `Sem contrapartida no banco — apurado em ${d.as_of}` });
        } else console.error('[CentralControle] divergences:', divergenceR.reason);
        if (bottlenecksR.status === 'fulfilled') {
            algumAlertaCarregou = true;
            bottlenecksR.value.filter(b => b.overdue_count > 0).forEach(b => lista.push({
                id: `proc-${b.step_name}`, severity: 'HIGH', view: 'opura-processos',
                title: `${b.overdue_count} etapa(s) atrasada(s) em "${b.step_name}"`,
                description: `${b.active_count} ativa(s) no total nessa etapa`,
            }));
        } else console.error('[CentralControle] bottlenecks:', bottlenecksR.reason);
        if (reajusteR.status === 'fulfilled') {
            algumAlertaCarregou = true;
            reajusteR.value.forEach(c => lista.push({
                id: `reajuste-${c.id}`, severity: 'MEDIUM', view: 'contracts-reajuste',
                title: `Contrato ${c.number} com reajuste vencido`,
                description: `${c.reajuste_index} · venceu ${new Date(c.reajuste_proximo).toLocaleDateString('pt-BR')} · valor atual ${fBRL(c.current_value)}`,
                amount: c.current_value,
            }));
        } else console.error('[CentralControle] reajustes:', reajusteR.reason);
        setAlertas(algumAlertaCarregou ? { estado: 'ok', data: lista } : { estado: 'erro' });

        setFila(paraFonte(fonte<ActionQueueItem[]>('action_queue'), 'action queue'));
        setMeuDia(paraFonte(fonte<MeuDia>('meu_dia'), 'meu dia'));
        setScorecards(paraFonte(fonte<ProjectScorecard[]>('scorecards'), 'scorecards'));

        // Config de alçadas — não crítica: sem ela o modal só usa rótulos padrão.
        if (approvalConfigR.status === 'fulfilled') setApprovalConfig(approvalConfigR.value);
        else console.error('[CentralControle] approval config:', approvalConfigR.reason);

        setCarregando(false);
        if (opcoes?.realcar === true) setRodada(r => r + 1);
    }, [organizationId]);

    // ── C3: não competir com a casca do app ───────────────────────────────
    // As consultas deste painel são as mais pesadas da sessão e, até
    // 24/09/2026, saíam no MESMO instante em que a casca carregava projetos,
    // organizações, clientes, colaboradores e tarefas. `projectsLoading` nasce
    // `true` e só cai quando o carregamento mais pesado da casca termina. Não é
    // bloqueio de leitura por organização (REGRA #5): o painel carrega em
    // "Todas" igual, só espera a vez.
    const cascaCarregando = useStore(s => s.projectsLoading);
    const [podeCarregar, setPodeCarregar] = React.useState(false);

    React.useEffect(() => {
        if (podeCarregar) return;
        if (!cascaCarregando) { setPodeCarregar(true); return; }
        // Teto de 4 s: se a casca travar ou falhar, o painel não fica refém dela.
        const teto = setTimeout(() => setPodeCarregar(true), 4000);
        return () => clearTimeout(teto);
    }, [cascaCarregando, podeCarregar]);

    React.useEffect(() => { if (podeCarregar) load(); }, [load, podeCarregar]);

    // Depois da primeira carga, nada mais anima (atualizar, trocar de org ou de período).
    React.useEffect(() => {
        if (!carregando && animar) {
            const t = setTimeout(() => setAnimar(false), 900);
            return () => clearTimeout(t);
        }
    }, [carregando, animar]);

    // Caixa projetado: única fonte com parâmetro de período, por isso fora do
    // bootstrap. Espera o mesmo portão no primeiro carregamento.
    const carregarCaixa = React.useCallback(() => {
        let cancelado = false;
        const mesmaOrg = caixaDaOrg.current === organizationId;
        setCaixa(c => (mesmaOrg && c.estado === 'ok' ? c : CARREGANDO));
        setCaixaTrocando(mesmaOrg);
        financialIntelligenceService.getCashflowProjection(organizationId, periodoCaixa)
            .then(pontos => {
                if (cancelado) return;
                caixaDaOrg.current = organizationId;
                setCaixa({ estado: 'ok', data: pontos });
                setCaixaTrocando(false);
            })
            .catch(err => {
                console.error('[CentralControle] cashflow:', err);
                if (!cancelado) { setCaixa({ estado: 'erro' }); setCaixaTrocando(false); }
            });
        return () => { cancelado = true; };
    }, [organizationId, periodoCaixa]);

    React.useEffect(() => {
        if (!podeCarregar || !verFinanceiro) return;
        return carregarCaixa();
    }, [carregarCaixa, podeCarregar, verFinanceiro]);

    // ── Derivados ──────────────────────────────────────────────────────────
    const dadosMeuDia = meuDia.estado === 'ok' ? meuDia.data : null;
    const hoje = dadosMeuDia?.hoje ?? diaEmSaoPaulo(new Date().toISOString())!;
    const filaDoDia = React.useMemo(
        () => montarFila(fila.estado === 'ok' ? fila.data : [], dadosMeuDia, alertas.estado === 'ok' ? alertas.data : []),
        [fila, dadosMeuDia, alertas],
    );
    const destaque = React.useMemo(() => itemEmDestaque(filaDoDia, hoje), [filaDoDia, hoje]);
    const tudoCarregado = fila.estado !== 'carregando' && meuDia.estado !== 'carregando' && alertas.estado !== 'carregando';
    const contagem = tudoCarregado ? contagemDoDia(filaDoDia, dadosMeuDia) : null;
    const totalAprovacoesDaOrg = fila.estado === 'ok' ? fila.data.filter(i => i.approval_status === 'PENDENTE').length : 0;

    const estadoDaFila: EstadoDoCartao =
        !tudoCarregado ? 'carregando'
        : fila.estado === 'erro' && meuDia.estado === 'erro' && alertas.estado === 'erro' ? 'erro'
        : 'ok';
    const partesSemCarga = [
        fila.estado === 'erro' ? 'aprovações' : null,
        meuDia.estado === 'erro' ? 'tarefas e contas' : null,
        alertas.estado === 'erro' ? 'alertas' : null,
    ].filter((p): p is string => !!p);

    const hora = new Date().getHours();
    const nome = comoChamar(organizations, userEmail || profile.email);

    // ── Ações (estado local, §22: nada de recarregar o painel inteiro) ─────
    // O item resolvido primeiro SAI da fila (a linha recolhe, `saindo`) e só
    // então some do estado — e é aí que "Seu dia" avança um segmento. A
    // gravação no banco não espera a animação.
    const [saindo, setSaindo] = React.useState<ReadonlySet<string>>(() => new Set());
    const saidas = React.useRef<ReturnType<typeof setTimeout>[]>([]);
    React.useEffect(() => () => saidas.current.forEach(clearTimeout), []);
    const tirarDaFila = React.useCallback((chave: string, aplicar: () => void) => {
        setSaindo(s => new Set(s).add(chave));
        saidas.current.push(setTimeout(() => {
            aplicar();
            setSaindo(s => { const n = new Set(s); n.delete(chave); return n; });
        }, SAIDA_MS));
    }, []);

    const concluirTarefa = React.useCallback(async (id: string) => {
        tirarDaFila(`tarefa:${id}`, () => setMeuDia(m => m.estado !== 'ok' ? m : {
            estado: 'ok',
            data: {
                ...m.data,
                tarefas: {
                    pendentes: m.data.tarefas.pendentes.filter(t => t.id !== id),
                    qtd_pendentes: Math.max(0, m.data.tarefas.qtd_pendentes - 1),
                    concluidas_hoje: m.data.tarefas.concluidas_hoje + 1,
                },
            },
        }));
        try {
            await taskService.update(id, { status: 'done' });
        } catch (err) {
            console.error('[CentralControle] concluir tarefa:', err);
            load();
        }
    }, [load, tirarDaFila]);

    const aprovacaoFeita = React.useCallback((item: ActionQueueItem) => {
        setApprovalModal(null);
        tirarDaFila(`aprovacao:${item.entity}:${item.id}`, () => {
            setFila(f => f.estado !== 'ok' ? f : { estado: 'ok', data: f.data.filter(i => !(i.entity === item.entity && i.id === item.id)) });
            setMeuDia(m => m.estado !== 'ok' ? m : { estado: 'ok', data: { ...m.data, aprovacoes_hoje: m.data.aprovacoes_hoje + 1 } });
        });
    }, [tirarDaFila]);

    const pilulas: { chave: FiltroDaFila; rotulo: string; qtd: number | null }[] = [
        { chave: 'tudo', rotulo: 'Tudo', qtd: contagem?.pendentes ?? null },
        { chave: 'aprovacoes', rotulo: 'Aprovações', qtd: contagem?.aprovacoes ?? null },
        { chave: 'tarefas', rotulo: 'Tarefas', qtd: contagem?.tarefas ?? null },
        { chave: 'contas', rotulo: 'Contas de hoje', qtd: contagem?.contas ?? null },
        { chave: 'alertas', rotulo: 'Alertas', qtd: alertas.estado === 'ok' ? alertas.data.length : null },
    ];

    return (
        <div className="space-y-6 pb-20">
            <Saudacao
                saudacao={saudacaoPorHora(hora)}
                nome={nome}
                contagem={contagem}
                carregando={carregando}
                onAtualizar={() => { load({ realcar: true }); if (verFinanceiro) carregarCaixa(); }}
            />

            <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar a Minha fila">
                {pilulas.map(p => (
                    <button
                        key={p.chave}
                        type="button"
                        aria-pressed={filtro === p.chave}
                        onClick={() => setFiltro(p.chave)}
                        className={`h-8 px-3.5 inline-flex items-center gap-1.5 rounded-full border text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${filtro === p.chave ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                    >
                        {p.rotulo}
                        {p.qtd != null && <NumeroQueTroca valor={p.qtd} className={`text-xs ${filtro === p.chave ? 'text-blue-100' : 'text-gray-500'}`} />}
                    </button>
                ))}
            </div>

            {/* 3 colunas no desktop com a fila ocupando 2 linhas; abaixo de lg, uma
                coluna na ordem fila → contas → caixa → obras → conciliado. */}
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)] gap-6 items-stretch">
                <div className="lg:row-span-2 flex flex-col gap-3 min-w-0">
                    {estadoDaFila === 'ok' && partesSemCarga.length > 0 && (
                        <p role="status" className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-[6px] px-3 py-2">
                            Parte da fila não carregou ({partesSemCarga.join(', ')}).{' '}
                            <button type="button" onClick={() => load()} className="font-medium underline underline-offset-2 hover:text-amber-900">Tentar de novo</button>
                        </p>
                    )}
                    <MinhaFila
                        className="flex-1"
                        estado={estadoDaFila}
                        onTentarDeNovo={load}
                        fila={filaDoDia}
                        destaque={destaque}
                        saindo={saindo}
                        hoje={hoje}
                        filtro={filtro}
                        totalAprovacoesDaOrg={totalAprovacoesDaOrg}
                        qtdTarefas={dadosMeuDia?.tarefas.qtd_pendentes ?? filaDoDia.tarefas.length}
                        qtdContas={dadosMeuDia?.contas_hoje.qtd_pendentes ?? filaDoDia.contas.length}
                        onAprovar={item => setApprovalModal({ item, mode: 'approve' })}
                        onRejeitar={item => setApprovalModal({ item, mode: 'reject' })}
                        onConcluirTarefa={concluirTarefa}
                        onNavigate={onNavigate}
                    />
                </div>

                {verFinanceiro && (
                    <CartaoContasSemana estado={estadoDe(meuDia)} onTentarDeNovo={load} dados={dadosMeuDia?.contas_7_dias ?? null} animar={animar} rodada={rodada} onNavigate={onNavigate} />
                )}
                {verFinanceiro && (
                    <CartaoCaixa
                        estado={estadoDe(caixa)}
                        onTentarDeNovo={carregarCaixa}
                        pontos={caixa.estado === 'ok' ? caixa.data : []}
                        periodo={periodoCaixa}
                        onPeriodo={setPeriodoCaixa}
                        animar={animar}
                        trocando={caixaTrocando}
                        onNavigate={onNavigate}
                    />
                )}
                {verObras && (
                    <CartaoObras estado={estadoDe(scorecards)} onTentarDeNovo={load} scorecards={scorecards.estado === 'ok' ? scorecards.data : []} animar={animar} rodada={rodada} onNavigate={onNavigate} />
                )}
                {verFinanceiro && (
                    <CartaoConciliado estado={estadoDe(meuDia)} onTentarDeNovo={load} dados={dadosMeuDia?.conciliado ?? null} animar={animar} rodada={rodada} onNavigate={onNavigate} />
                )}
            </div>

            {/* Aprovar/rejeitar direto da fila — reaproveita o modal do FinancialApprovalModule,
                não duplica a lógica de dispatch por entidade nem os rótulos de alçada. */}
            {approvalModal && (
                <ApproveRejectModal
                    item={approvalModal.item}
                    mode={approvalModal.mode}
                    userEmail={userEmail}
                    config={approvalConfig}
                    onDone={() => aprovacaoFeita(approvalModal.item)}
                    onClose={() => setApprovalModal(null)}
                />
            )}
        </div>
    );
};

export default CentralControle;
