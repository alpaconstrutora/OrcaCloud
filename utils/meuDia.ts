// utils/meuDia.ts
// Regras puras da tela "Bom dia" (Central de Controle, 11/11/2026).
// Plano: docs/planos/2026-11-10-central-bom-dia.md (item 3).
//
// Nada aqui lê banco nem relógio por conta própria: a tela passa a hora e o
// "hoje" (que vem do banco, no fuso de São Paulo) — é o que deixa testar
// manhã/tarde/noite e "vencido" sem depender de quando o teste roda.
import type { ActionQueueItem } from '../services/approvalService';
import type { ContaDoDia, MeuDia, TarefaDoDia } from '../services/centralControleService';
import type { FinancialAlert } from '../services/financialIntelligenceService';
import type { contractIndexService } from '../services/contractIndexService';
import type { ReconciliationDivergences } from '../types/financial';
import type { ProcessStepBottleneck } from '../types/process';

export type Saudacao = 'Bom dia' | 'Boa tarde' | 'Boa noite';

/** 5h–11h bom dia · 12h–17h boa tarde · 18h–4h boa noite. */
export function saudacaoPorHora(hora: number): Saudacao {
    if (hora >= 5 && hora < 12) return 'Bom dia';
    if (hora >= 12 && hora < 18) return 'Boa tarde';
    return 'Boa noite';
}

/**
 * Como chamar a pessoa: o primeiro nome do cadastro dela em alguma organização
 * (`organization_members.name`); sem nome, a parte do e-mail antes do ponto
 * ("bruna.pereira@…" → "Bruna"). Nome cadastrado como e-mail cai no mesmo caminho.
 */
export function comoChamar(
    organizacoes: ReadonlyArray<{ members?: ReadonlyArray<{ email?: string | null; name?: string | null }> | null }>,
    email: string | null | undefined,
): string | null {
    if (!email) return null;
    const alvo = email.toLowerCase();
    const nome = organizacoes
        .flatMap(o => o.members ?? [])
        .find(m => m.email?.toLowerCase() === alvo && m.name?.trim())?.name?.trim();
    // Nome com cara de login ("bruna.pereira") é cortado no ponto como o e-mail.
    const base = (nome && !nome.includes('@') ? nome.split(/\s+/)[0] : email.split('@')[0]).split(/[._]/)[0];
    if (!base) return null;
    return base.charAt(0).toLocaleUpperCase('pt-BR') + base.slice(1);
}

const DIA_SP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });

/** 'AAAA-MM-DD' no fuso de São Paulo. Data pura ('2026-11-11') passa direto. */
export function diaEmSaoPaulo(valor: string | null | undefined): string | null {
    if (!valor) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor;
    const d = new Date(valor);
    return Number.isNaN(d.getTime()) ? null : DIA_SP.format(d);
}

/** Dias corridos de `prazo` até `hoje` (positivo = atrasado). */
export function diasDeAtraso(prazo: string, hoje: string): number {
    return Math.round((Date.parse(`${hoje}T00:00:00Z`) - Date.parse(`${prazo}T00:00:00Z`)) / 86_400_000);
}

export interface AlertaDoDia {
    id: string;
    severity: 'HIGH' | 'MEDIUM' | 'LOW';
    title: string;
    description: string;
    amount?: number | null;
    view: string;
}

/** As quatro fontes do cartão de alertas. `undefined` = ainda não chegou. */
export interface FontesDeAlerta {
    financial?: PromiseSettledResult<FinancialAlert[]>;
    divergences?: PromiseSettledResult<ReconciliationDivergences>;
    bottlenecks?: PromiseSettledResult<ProcessStepBottleneck[]>;
    reajustes?: PromiseSettledResult<Awaited<ReturnType<typeof contractIndexService.listDueForReajuste>>>;
}

function fBRL(v: number | null | undefined): string {
    return v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Estado do cartão de alertas. `faltou`: fontes que CAÍRAM (não as que ainda não
 *  chegaram), com o nome que o aviso "Parte da fila não carregou (…)" mostra. */
export type AlertasDoDia =
    | { estado: 'carregando' }
    | { estado: 'erro' }
    | { estado: 'ok'; data: AlertaDoDia[]; faltou: string[] };

/**
 * Os alertas do dia (os mesmos da Central antiga: financeiros, divergências de
 * conciliação, gargalos de processo e reajustes vencidos), a partir do que já
 * chegou. Basta UMA fonte para o cartão sair do esqueleto — no plano B elas chegam
 * uma a uma, e a Minha fila (que espera os alertas) não pode ficar presa ao bloco
 * mais lento. Todas caídas = erro; nenhuma chegou ainda = carregando. A que caiu
 * com outra de pé vai para `faltou`: sem isso, o gestor vê a fila sem os alertas
 * financeiros e conclui que não há nenhum.
 */
export function alertasDasFontes(f: FontesDeAlerta): AlertasDoDia {
    const lista: AlertaDoDia[] = [];
    let algumChegou = false;
    if (f.financial?.status === 'fulfilled') {
        algumChegou = true;
        f.financial.value.forEach((a, i) => lista.push({
            id: `fin-${i}-${a.ref_id ?? a.title}`,
            severity: a.severity,
            title: a.title,
            description: a.project_name ? `${a.description} · ${a.project_name}` : a.description,
            amount: a.amount,
            view: 'financial-dashboard',
        }));
    }
    if (f.divergences?.status === 'fulfilled') {
        algumChegou = true;
        const d = f.divergences.value;
        if (d.counts.value_mismatch > 0) lista.push({ id: 'div-mismatch', severity: 'HIGH', view: 'bank-reconciliation', title: `${d.counts.value_mismatch} lançamento(s) com valor divergente`, description: `Banco × sistema não batem — apurado em ${d.as_of}` });
        if (d.counts.bank_without_internal > 0) lista.push({ id: 'div-bank', severity: 'MEDIUM', view: 'bank-reconciliation', title: `${d.counts.bank_without_internal} lançamento(s) do banco sem correspondência`, description: `Sem contrapartida no sistema — apurado em ${d.as_of}` });
        if (d.counts.internal_without_bank > 0) lista.push({ id: 'div-internal', severity: 'MEDIUM', view: 'bank-reconciliation', title: `${d.counts.internal_without_bank} lançamento(s) do sistema sem correspondência`, description: `Sem contrapartida no banco — apurado em ${d.as_of}` });
    }
    if (f.bottlenecks?.status === 'fulfilled') {
        algumChegou = true;
        f.bottlenecks.value.filter(b => b.overdue_count > 0).forEach(b => lista.push({
            id: `proc-${b.step_name}`, severity: 'HIGH', view: 'opura-processos',
            title: `${b.overdue_count} etapa(s) atrasada(s) em "${b.step_name}"`,
            description: `${b.active_count} ativa(s) no total nessa etapa`,
        }));
    }
    if (f.reajustes?.status === 'fulfilled') {
        algumChegou = true;
        f.reajustes.value.forEach(c => lista.push({
            id: `reajuste-${c.id}`, severity: 'MEDIUM', view: 'contracts-reajuste',
            title: `Contrato ${c.number} com reajuste vencido`,
            description: `${c.reajuste_index} · venceu ${new Date(c.reajuste_proximo).toLocaleDateString('pt-BR')} · valor atual ${fBRL(c.current_value)}`,
            amount: c.current_value,
        }));
    }
    if (algumChegou) {
        const nomes: [keyof FontesDeAlerta, string][] = [
            ['financial', 'alertas financeiros'], ['divergences', 'divergências de conciliação'],
            ['bottlenecks', 'gargalos de processo'], ['reajustes', 'reajustes de contrato'],
        ];
        const faltou = nomes.filter(([k]) => f[k]?.status === 'rejected').map(([, nome]) => nome);
        return { estado: 'ok', data: lista, faltou };
    }
    const pendente = !f.financial || !f.divergences || !f.bottlenecks || !f.reajustes;
    return pendente ? { estado: 'carregando' } : { estado: 'erro' };
}

export type ItemDaFila =
    | { tipo: 'aprovacao'; chave: string; prazo: string | null; valor: number; aprovacao: ActionQueueItem }
    | { tipo: 'tarefa'; chave: string; prazo: string | null; valor: null; tarefa: TarefaDoDia }
    | { tipo: 'conta'; chave: string; prazo: string | null; valor: number; conta: ContaDoDia }
    | { tipo: 'alerta'; chave: string; prazo: null; valor: number | null; alerta: AlertaDoDia };

export interface FilaDoDia {
    aprovacoes: ItemDaFila[];
    tarefas: ItemDaFila[];
    contas: ItemDaFila[];
    alertas: ItemDaFila[];
}

const ORDEM_SEVERIDADE = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;

/**
 * Os quatro grupos da Minha fila. Aprovação "espera por mim" = PENDENTE (rascunho
 * ainda não foi enviado) e dentro da minha alçada (`pode_aprovar` — nível sem
 * aprovador cadastrado vale para todos). Alertas: todos, os de alta prioridade
 * primeiro — reajuste, gargalo e divergência moram aqui desde a tela nova.
 */
export function montarFila(fila: readonly ActionQueueItem[], meuDia: MeuDia | null, alertas: readonly AlertaDoDia[]): FilaDoDia {
    return {
        aprovacoes: fila
            .filter(i => i.approval_status === 'PENDENTE' && i.pode_aprovar !== false)
            .map(i => ({ tipo: 'aprovacao' as const, chave: `aprovacao:${i.entity}:${i.id}`, prazo: diaEmSaoPaulo(i.due_date), valor: Number(i.amount) || 0, aprovacao: i })),
        tarefas: (meuDia?.tarefas.pendentes ?? [])
            .map(t => ({ tipo: 'tarefa' as const, chave: `tarefa:${t.id}`, prazo: diaEmSaoPaulo(t.due_date), valor: null, tarefa: t })),
        contas: (meuDia?.contas_hoje.pendentes ?? [])
            .map(c => ({ tipo: 'conta' as const, chave: `conta:${c.id}`, prazo: diaEmSaoPaulo(c.due_date), valor: Number(c.amount) || 0, conta: c })),
        alertas: [...alertas]
            .sort((a, b) => ORDEM_SEVERIDADE[a.severity] - ORDEM_SEVERIDADE[b.severity])
            .map(a => ({ tipo: 'alerta' as const, chave: `alerta:${a.id}`, prazo: null, valor: a.amount ?? null, alerta: a })),
    };
}

/**
 * O item em destaque: o vencido há mais tempo; sem vencido, o que vence hoje de
 * maior valor; sem nenhum, um alerta de alta prioridade; senão o de prazo mais
 * próximo. `null` quando a fila está vazia.
 */
export function itemEmDestaque(fila: FilaDoDia, hoje: string): ItemDaFila | null {
    const comPrazo = [...fila.aprovacoes, ...fila.tarefas, ...fila.contas];
    const vencidos = comPrazo.filter(i => i.prazo && i.prazo < hoje)
        .sort((a, b) => (a.prazo! < b.prazo! ? -1 : a.prazo! > b.prazo! ? 1 : (b.valor ?? 0) - (a.valor ?? 0)));
    if (vencidos.length) return vencidos[0];
    const deHoje = comPrazo.filter(i => i.prazo === hoje).sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0));
    if (deHoje.length) return deHoje[0];
    const alerta = fila.alertas.find(i => i.tipo === 'alerta' && i.alerta.severity === 'HIGH');
    if (alerta) return alerta;
    const futuros = comPrazo.filter(i => i.prazo).sort((a, b) => (a.prazo! < b.prazo! ? -1 : 1));
    return futuros[0] ?? comPrazo[0] ?? fila.alertas[0] ?? null;
}

export interface ContagemDoDia {
    aprovacoes: number;
    tarefas: number;
    contas: number;
    /** Só os de alta prioridade contam como "precisa de você". */
    alertas: number;
    pendentes: number;
    feitos: number;
    /** feitos + pendentes */
    total: number;
}

/**
 * "Seu dia: N de X". Feitos = aprovações que eu dei hoje + tarefas que concluí
 * hoje + contas pagas hoje. Alerta não tem "feito": entra só como pendente.
 * Tarefas e contas usam a contagem do banco, não o tamanho da lista (que vem
 * cortada em 20).
 */
export function contagemDoDia(fila: FilaDoDia, meuDia: MeuDia | null): ContagemDoDia {
    const aprovacoes = fila.aprovacoes.length;
    const tarefas = meuDia?.tarefas.qtd_pendentes ?? fila.tarefas.length;
    const contas = meuDia?.contas_hoje.qtd_pendentes ?? fila.contas.length;
    const alertas = fila.alertas.filter(i => i.tipo === 'alerta' && i.alerta.severity === 'HIGH').length;
    const pendentes = aprovacoes + tarefas + contas + alertas;
    const feitos = meuDia ? meuDia.aprovacoes_hoje + meuDia.tarefas.concluidas_hoje + meuDia.contas_hoje.pagas_hoje : 0;
    return { aprovacoes, tarefas, contas, alertas, pendentes, feitos, total: feitos + pendentes };
}

function plural(n: number, um: string, varios: string): string {
    return `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;
}

function juntar(partes: string[]): string {
    return partes.length <= 1 ? (partes[0] ?? '') : `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`;
}

/** "12 itens precisam de você hoje: 3 aprovações, 1 tarefa e 8 contas vencendo hoje." — só as partes ≠ 0. */
export function fraseResumo(c: ContagemDoDia): string {
    if (c.pendentes === 0) return 'Nada esperando por você hoje.';
    const partes = [
        c.aprovacoes ? plural(c.aprovacoes, 'aprovação', 'aprovações') : null,
        c.tarefas ? plural(c.tarefas, 'tarefa', 'tarefas') : null,
        c.contas ? plural(c.contas, 'conta vencendo hoje', 'contas vencendo hoje') : null,
        c.alertas ? plural(c.alertas, 'alerta de alta prioridade', 'alertas de alta prioridade') : null,
    ].filter((p): p is string => !!p);
    const cabeca = c.pendentes === 1 ? '1 item precisa de você hoje' : `${c.pendentes.toLocaleString('pt-BR')} itens precisam de você hoje`;
    return partes.length > 1 ? `${cabeca}: ${juntar(partes)}.` : `${cabeca}: ${partes[0]}.`;
}

/** % de linhas de extrato conciliadas (30 dias) e a variação em pontos sobre os 30 anteriores. */
export function percentualConciliado(c: MeuDia['conciliado']): { pct: number | null; base: number; variacao: number | null } {
    const base = c.conciliadas + c.pendentes;
    const baseAnterior = c.conciliadas_anterior + c.pendentes_anterior;
    const pct = base > 0 ? (c.conciliadas / base) * 100 : null;
    const pctAnterior = baseAnterior > 0 ? (c.conciliadas_anterior / baseAnterior) * 100 : null;
    return { pct, base, variacao: pct != null && pctAnterior != null ? pct - pctAnterior : null };
}
