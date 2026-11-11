// utils/meuDia.ts
// Regras puras da tela "Bom dia" (Central de Controle, 11/11/2026).
// Plano: docs/planos/2026-11-10-central-bom-dia.md (item 3).
//
// Nada aqui lê banco nem relógio por conta própria: a tela passa a hora e o
// "hoje" (que vem do banco, no fuso de São Paulo) — é o que deixa testar
// manhã/tarde/noite e "vencido" sem depender de quando o teste roda.
import type { ActionQueueItem } from '../services/approvalService';
import type { ContaDoDia, MeuDia, TarefaDoDia } from '../services/centralControleService';

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
