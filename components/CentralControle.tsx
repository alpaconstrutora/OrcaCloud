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
import { memoriaDoPlanoB } from '../utils/planoBPegajoso';
import {
    saudacaoPorHora, comoChamar, diaEmSaoPaulo, montarFila, itemEmDestaque, contagemDoDia,
    alertasDasFontes, type AlertasDoDia, type FontesDeAlerta,
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

const CentralControle: React.FC<Props> = ({ organizationId, userEmail = '', onNavigate }) => {
    const [fila, setFila] = React.useState<Fonte<ActionQueueItem[]>>(CARREGANDO);
    const [meuDia, setMeuDia] = React.useState<Fonte<MeuDia>>(CARREGANDO);
    const [alertas, setAlertas] = React.useState<AlertasDoDia>(CARREGANDO);
    const [scorecards, setScorecards] = React.useState<Fonte<ProjectScorecard[]>>(CARREGANDO);
    const [approvalConfig, setApprovalConfig] = React.useState<FinancialApprovalConfig[]>([]);
    const [approvalModal, setApprovalModal] = React.useState<{ item: ActionQueueItem; mode: 'approve' | 'reject' } | null>(null);
    const [carregando, setCarregando] = React.useState(true);
    // A vez do caixa: só a resposta da chamada única (ok ou falha), não os blocos do
    // plano B — esperar `carregando` segurava o caixa até o bloco mais lento (~16 s).
    const [esperandoChamadaUnica, setEsperandoChamadaUnica] = React.useState(true);
    // O mesmo, lido de forma SÍNCRONA pelo efeito do caixa: na troca de org o `load` da
    // nova liga a espera no mesmo commit em que o efeito do caixa roda, e o estado ainda
    // dizia `false` (render anterior) — o caixa da org nova saía junto com a chamada
    // única dela, disputando o banco (revisão do #538). O estado segue nas dependências
    // do efeito só para dispará-lo de novo quando a espera acaba.
    const esperandoChamadaUnicaRef = React.useRef(true);
    const esperarChamadaUnica = React.useCallback((sim: boolean) => {
        esperandoChamadaUnicaRef.current = sim;
        setEsperandoChamadaUnica(sim);
    }, []);
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
    // De que período é o gráfico na tela (gravado quando a busca dá certo).
    const caixaDoPeriodo = React.useRef<PeriodoCaixa | undefined>(undefined);
    // Cada "Atualizar" concluído é uma rodada; o <Realce> dos cartões marca o número
    // que mudou de uma rodada para a outra.
    const [rodada, setRodada] = React.useState(0);

    const profile = useStore(s => s.currentProfile);
    const organizations = useStore(s => s.organizations);
    const mod = useModulosPermitidos({ group: profile.group, email: userEmail || profile.email });
    const verFinanceiro = !!mod.financeiro;
    const verObras = !!mod.obras;

    // Cada `load` é uma carga. Resposta de carga velha (organização trocada,
    // Atualizar de novo) não pinta a tela — o plano B estica essa janela para ~16 s.
    const cargaAtual = React.useRef(0);
    // De que organização é o que está na tela. Org nova volta os cartões ao
    // esqueleto (como o caixa): no plano B, sem isso, a fila da empresa anterior
    // ficava até ~16 s — com botão Aprovar — debaixo do seletor da nova (REGRA #5).
    const orgNaTela = React.useRef<string | null | undefined>(undefined);
    // As fontes que geraram o cartão de alertas que está na tela. No plano B, o
    // Atualizar parte delas: cada fonte troca SÓ a própria parte quando chega. Sem
    // isso a 1ª a chegar substituía a lista inteira (os alertas das outras sumiam) e,
    // com reajustes e essa 1ª caídos, a Minha fila voltava ao esqueleto (17/11/2026).
    // Zerado na troca de org: alerta de outra empresa nunca entra na nova.
    const fontesDeAlertaNaTela = React.useRef<FontesDeAlerta>({});

    // `opcoes` pode chegar como o evento do clique (onTentarDeNovo={load}): só
    // `realcar === true` conta como rodada de "Atualizar".
    const load = React.useCallback(async (opcoes?: { realcar?: boolean }) => {
        const minha = ++cargaAtual.current;
        const vale = () => cargaAtual.current === minha;
        setCarregando(true);
        esperarChamadaUnica(true);
        if (orgNaTela.current !== organizationId) {
            orgNaTela.current = organizationId;
            fontesDeAlertaNaTela.current = {};
            setFila(CARREGANDO);
            setMeuDia(CARREGANDO);
            setAlertas(CARREGANDO);
            setScorecards(CARREGANDO);
        }

        // ── Uma chamada para as consultas pesadas ─────────────────────────
        // Até 24/09/2026 as OITO saíam juntas num `Promise.allSettled`, por
        // cima das ~17 requisições da casca do app — pico medido de 17 em voo.
        // `fn_central_controle_bootstrap` roda todas numa sessão só (e, desde
        // 11/11/2026, também o bloco `meu_dia`). As duas leituras de tabela
        // (reajuste e config de alçada) continuam soltas — são baratas.
        //
        // Erro comum de um bloco fica no bloco: a função SQL embrulha cada
        // consulta no próprio `BEGIN … EXCEPTION`, e cada cartão mostra o
        // próprio "Não carregou".
        //
        // Plano B pegajoso (17/11/2026): se a chamada única desta org caiu há menos
        // de 5 minutos, nem tenta — vai direto aos blocos (utils/planoBPegajoso.ts).
        const pular = memoriaDoPlanoB.pularChamadaUnica(organizationId);
        const [bootstrapR, reajusteR, approvalConfigR] = await Promise.allSettled([
            pular
                ? Promise.reject(new Error('plano B pegajoso: a chamada única caiu há menos de 5 minutos'))
                : centralControleService.bootstrap(organizationId),
            contractIndexService.listDueForReajuste(organizationId),
            financialApprovalService.listConfig(organizationId),
        ]);
        // A queda conta mesmo com esta carga descartada pela TROCA de org (a org dela
        // continua caindo). Descartada por carga mais nova da MESMA org, quem decide é a
        // mais nova: senão uma resposta velha ligava o pegajoso com a chamada única já de
        // volta (Atualizar + "Tentar de novo" sobrepostos — revisão do #538).
        if (!pular && bootstrapR.status === 'rejected' && (vale() || orgNaTela.current !== organizationId)) {
            memoriaDoPlanoB.marcarQueCaiu(organizationId);
        }
        if (!vale()) return;
        esperarChamadaUnica(false);

        // Config de alçadas — não crítica: sem ela o modal só usa rótulos padrão.
        if (approvalConfigR.status === 'fulfilled') setApprovalConfig(approvalConfigR.value);
        else console.error('[CentralControle] approval config:', approvalConfigR.reason);

        const paraFonte = <T,>(r: PromiseSettledResult<T>, nome: string): Fonte<T> => {
            if (r.status === 'fulfilled') return { estado: 'ok', data: r.value };
            console.error(`[CentralControle] ${nome}:`, r.reason);
            return { estado: 'erro' };
        };
        const logarSeCaiu = (r: PromiseSettledResult<unknown>, nome: string) => {
            if (r.status === 'rejected') console.error(`[CentralControle] ${nome}:`, r.reason);
        };
        logarSeCaiu(reajusteR, 'reajustes');

        // Alertas: os mesmos da Central antiga (alertas financeiros, divergências
        // de conciliação, gargalos de processo e reajustes vencidos) — montados em
        // `alertasDasFontes`. As "N transações aguardando aprovação" saíram: a
        // Minha fila já as lista.
        if (bootstrapR.status === 'fulfilled') {
            const painel = bootstrapR.value;
            const fonte = <T,>(chave: keyof CentralControleBootstrap): PromiseSettledResult<T> =>
                comoSettled(painel[chave] as never, String(chave)) as PromiseSettledResult<T>;
            const financial = fonte<FinancialAlert[]>('financial_alerts');
            const divergences = fonte<ReconciliationDivergences>('divergences');
            const bottlenecks = fonte<ProcessStepBottleneck[]>('bottlenecks');
            logarSeCaiu(financial, 'financial alerts');
            logarSeCaiu(divergences, 'divergences');
            logarSeCaiu(bottlenecks, 'bottlenecks');
            fontesDeAlertaNaTela.current = { financial, divergences, bottlenecks, reajustes: reajusteR };
            setAlertas(alertasDasFontes(fontesDeAlertaNaTela.current));
            setFila(paraFonte(fonte<ActionQueueItem[]>('action_queue'), 'action queue'));
            setMeuDia(paraFonte(fonte<MeuDia>('meu_dia'), 'meu dia'));
            setScorecards(paraFonte(fonte<ProjectScorecard[]>('scorecards'), 'scorecards'));
        } else {
            // ── Plano B (16/11/2026) ──────────────────────────────────────
            // A chamada única caiu inteira — estouro dos 8 s (o cancelamento não é
            // pego pelo EXCEPTION dos blocos: um bloco lento leva os sete) ou rede.
            // Pede os blocos um a um, cada um com o próprio limite, e pinta cada
            // cartão quando o dele chega. Só aqui: no caminho normal, seis RPCs
            // juntas é a rajada que o bootstrap resolveu — ou nos 5 minutos seguintes
            // a uma queda (pegajoso).
            // Planos: docs/planos/2026-11-16-central-blocos-isolados.md e
            // docs/planos/2026-11-17-central-menores-plano-b.md
            if (!pular) console.error('[CentralControle] chamada única caiu; pedindo por bloco:', bootstrapR.reason);
            const f = centralControleService.fontesSeparadas(organizationId);
            // Parte do que está na tela (Atualizar na mesma org); org nova parte do zero.
            const fontesAlerta: FontesDeAlerta = { ...fontesDeAlertaNaTela.current, reajustes: reajusteR };
            const assentar = <T,>(p: Promise<T>, aplicar: (r: PromiseSettledResult<T>) => void) =>
                p.then(
                    (value): PromiseSettledResult<T> => ({ status: 'fulfilled', value }),
                    (reason): PromiseSettledResult<T> => ({ status: 'rejected', reason }),
                ).then(r => { if (vale()) aplicar(r); });
            // O cartão de alertas sai do esqueleto com a 1ª fonte que chegar: a Minha
            // fila espera por ele e não pode ficar presa ao bloco mais lento.
            const alerta = <K extends 'financial' | 'divergences' | 'bottlenecks'>(chave: K, nome: string) =>
                (r: NonNullable<FontesDeAlerta[K]>) => {
                    logarSeCaiu(r, nome);
                    fontesAlerta[chave] = r;
                    fontesDeAlertaNaTela.current = { ...fontesAlerta };
                    setAlertas(alertasDasFontes(fontesDeAlertaNaTela.current));
                };
            await Promise.all([
                assentar(f.financial_alerts, alerta('financial', 'financial alerts')),
                assentar(f.divergences, alerta('divergences', 'divergences')),
                assentar(f.bottlenecks, alerta('bottlenecks', 'bottlenecks')),
                assentar(f.action_queue, r => setFila(paraFonte(r, 'action queue'))),
                assentar(f.meu_dia, r => setMeuDia(paraFonte(r, 'meu dia'))),
                assentar(f.scorecards, r => setScorecards(paraFonte(r, 'scorecards'))),
            ]);
            if (!vale()) return;
        }

        setCarregando(false);
        if (opcoes?.realcar === true) setRodada(r => r + 1);
    }, [organizationId, esperarChamadaUnica]);

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
    //
    // Geração das buscas do caixa: só a mais nova pinta (busca nova invalida as anteriores).
    // O efeito abaixo descarta também a pendente de OUTRA org ou OUTRO período — inclusive
    // a do "Tentar de novo" do cartão, que chama `carregarCaixa` fora do efeito: com troca
    // de org no meio, o saldo da empresa anterior pintava o cartão debaixo do seletor da
    // nova (REGRA #5; revisão do #538, 17/11/2026). A da MESMA org e período continua
    // valendo: o Atualizar não joga fora uma resposta certa (revisão do #546).
    const caixaAtual = React.useRef(0);
    const ultimaBuscaCaixa = React.useRef<{ org: string | null; periodo: PeriodoCaixa } | null>(null);
    const carregarCaixa = React.useCallback(() => {
        const minha = ++caixaAtual.current;
        const vale = () => caixaAtual.current === minha;
        ultimaBuscaCaixa.current = { org: organizationId, periodo: periodoCaixa };
        const mesmaOrg = caixaDaOrg.current === organizationId;
        setCaixa(c => (mesmaOrg && c.estado === 'ok' ? c : CARREGANDO));
        setCaixaTrocando(mesmaOrg);
        financialIntelligenceService.getCashflowProjection(organizationId, periodoCaixa)
            .then(pontos => {
                if (!vale()) return;
                caixaDaOrg.current = organizationId;
                caixaDoPeriodo.current = periodoCaixa;
                setCaixa({ estado: 'ok', data: pontos });
                setCaixaTrocando(false);
            })
            .catch(err => {
                console.error('[CentralControle] cashflow:', err);
                if (!vale()) return;
                // O erro também é DESTA org: sem gravar, a troca de org não levava o cartão
                // ao esqueleto e o "Não carregou." da anterior ficava na nova durante a
                // espera da chamada única dela (revisão final, 17/11/2026).
                caixaDaOrg.current = organizationId;
                setCaixa({ estado: 'erro' });
                setCaixaTrocando(false);
            });
    }, [organizationId, periodoCaixa]);

    // O caixa espera o bootstrap responder (abrir a tela, Atualizar, trocar de org):
    // as duas consultas juntas disputavam o banco e o bootstrap ficava ~1 s mais lento
    // (A/B em produção, 11/11/2026: 3,2–3,6 s junto × ~2,4 s sozinho). Trocar o
    // período não passa pelo bootstrap — busca na hora (com a chamada única em voo,
    // esmaece o gráfico e espera a vez). No plano B (bootstrap caído
    // ou pulado) o caixa sai junto com os blocos, sem esperar o mais lento (17/11/2026).
    // Trocar de org só passou a esperar de fato com o ref síncrono (revisão do #538):
    // antes o caixa da org nova saía junto com a chamada única dela.
    React.useEffect(() => {
        if (!podeCarregar || !verFinanceiro) return;
        // Busca pendente de outra org ou de outro período não vale mais (inclusive a do
        // "Tentar de novo"); a da mesma org e período segue valendo.
        const ultima = ultimaBuscaCaixa.current;
        if (ultima && (ultima.org !== organizationId || ultima.periodo !== periodoCaixa)) caixaAtual.current++;
        // Org nova: o gráfico na tela é de outra empresa — esqueleto já, mesmo esperando a vez.
        if (caixaDaOrg.current !== undefined && caixaDaOrg.current !== organizationId) setCaixa(CARREGANDO);
        if (esperandoChamadaUnicaRef.current) {
            // Período trocado com a chamada única em voo: o gráfico na tela é do período
            // anterior — esmaece até o novo chegar, como na troca de período normal. Não
            // busca já: disputaria o banco com a chamada única (revisão do #546).
            if (caixaDaOrg.current === organizationId && caixaDoPeriodo.current !== periodoCaixa) setCaixaTrocando(true);
            return;
        }
        carregarCaixa();
    }, [carregarCaixa, podeCarregar, verFinanceiro, esperandoChamadaUnica, organizationId, periodoCaixa]);

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
        // Alerta que caiu com outro de pé: o cartão está "ok", mas falta um pedaço.
        ...(alertas.estado === 'ok' ? alertas.faltou : []),
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
            // Recarrega para a tarefa voltar à fila — só se a tela ainda é da org em que
            // ela foi concluída. Trocada a org no meio, este `load` é o da org ANTERIOR:
            // repunha `orgNaTela` e pintava a org antiga debaixo do seletor novo (REGRA #5;
            // revisão do #538). A tarefa não está na tela da org nova: nada a repor.
            if (orgNaTela.current === organizationId) load();
        }
    }, [load, tirarDaFila, organizationId]);

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
                // O caixa vem sozinho quando o bootstrap termina (efeito acima).
                onAtualizar={() => { load({ realcar: true }); }}
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
