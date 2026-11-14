/**
 * Módulo ÒPURA Riscos — recortes e indicadores do Painel, numa fonte só.
 * Plano: docs/planos/2026-11-13-modulo-riscos.md (F1.9, CA11).
 *
 * CA11: "toda contagem do painel bate com a lista filtrada da aba Registro".
 * Por isso o número de cada cartão do Painel É `recortarRiscos(...).length` /
 * `acoesEmAtraso(...).length` — a mesma função que a aba Registro (e a aba Ações)
 * usa para filtrar quando o usuário clica no cartão. Não existe uma segunda conta
 * que possa divergir.
 */
import type { ProjectRisk, RiskAction, RiskMatrixConfig, RiskNivel } from '../types/risk';
import { RISK_MATRIZ_PADRAO, nivelDoRisco, pontuacaoVigente, riscoAtivo } from './riskScoring';

/** Data local "AAAA-MM-DD" — nunca `toISOString()` (em UTC-3 vira o dia seguinte depois das 21h). */
export function hojeLocalISO(agora: Date = new Date()): string {
    return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
}

/** Faixas da organização do risco; sem configuração gravada, as da especificação. */
export function faixasDe(faixasPorOrg: Record<string, RiskMatrixConfig>, organizationId: string): RiskMatrixConfig {
    return faixasPorOrg[organizationId] ?? RISK_MATRIZ_PADRAO;
}

/** Recortes do Painel que viram filtro na aba Registro. `''` = sem recorte. */
export type RecorteRisco = '' | 'ativos' | 'criticos' | 'sem_plano' | 'revisao_vencida';

export const ROTULO_RECORTE: Record<Exclude<RecorteRisco, ''>, string> = {
    ativos: 'Ativos',
    criticos: 'Críticos (ativos)',
    sem_plano: 'Ativos sem plano de ação',
    revisao_vencida: 'Revisão vencida',
};

/** Ação que ainda conta como plano: qualquer uma que não foi cancelada. */
export const acaoConta = (a: Pick<RiskAction, 'status'>) => a.status !== 'cancelada';

/** Tratamento em atraso: planejada ou em andamento com prazo anterior a hoje. */
export function acaoEmAtraso(a: Pick<RiskAction, 'status' | 'prazo'>, hoje: string): boolean {
    return (a.status === 'planejada' || a.status === 'em_andamento') && a.prazo < hoje;
}

export function acoesEmAtraso<T extends Pick<RiskAction, 'status' | 'prazo'>>(acoes: T[], hoje: string): T[] {
    return acoes.filter(a => acaoEmAtraso(a, hoje));
}

/** Revisão vencida: risco ativo com a próxima revisão antes de hoje. */
export function revisaoVencida(r: Pick<ProjectRisk, 'status' | 'proxima_revisao'>, hoje: string): boolean {
    return riscoAtivo(r) && r.proxima_revisao < hoje;
}

/** Ids de risco que têm pelo menos uma ação não cancelada. */
export function riscosComPlano(acoes: Pick<RiskAction, 'project_risk_id' | 'status'>[]): Set<string> {
    return new Set(acoes.filter(acaoConta).map(a => a.project_risk_id));
}

export interface ContextoRecorte {
    hoje: string;
    faixasPorOrg: Record<string, RiskMatrixConfig>;
    /** `riscosComPlano(acoes)` — calcule uma vez e passe. */
    comPlano: Set<string>;
}

/** Nível do risco com as faixas da organização dele (gatilho crítico escala — CA04). */
export function nivelNaOrg(r: ProjectRisk, faixasPorOrg: Record<string, RiskMatrixConfig>): RiskNivel | null {
    return nivelDoRisco(r, faixasDe(faixasPorOrg, r.organization_id));
}

export function passaNoRecorte(r: ProjectRisk, recorte: RecorteRisco, ctx: ContextoRecorte): boolean {
    switch (recorte) {
        case '': return true;
        case 'ativos': return riscoAtivo(r);
        case 'criticos': return riscoAtivo(r) && nivelNaOrg(r, ctx.faixasPorOrg) === 'critico';
        case 'sem_plano': return riscoAtivo(r) && !ctx.comPlano.has(r.id);
        case 'revisao_vencida': return revisaoVencida(r, ctx.hoje);
    }
}

export function recortarRiscos(riscos: ProjectRisk[], recorte: RecorteRisco, ctx: ContextoRecorte): ProjectRisk[] {
    return riscos.filter(r => passaNoRecorte(r, recorte, ctx));
}

/** Exposição: soma do valor esperado (probabilidade % × perda) dos riscos ATIVOS. Sem valor = não entra. */
export function exposicao(riscos: Pick<ProjectRisk, 'status' | 'valor_esperado'>[]): { total: number; comValor: number } {
    let total = 0;
    let comValor = 0;
    for (const r of riscos) {
        if (!riscoAtivo(r) || r.valor_esperado == null) continue;
        total += Number(r.valor_esperado);
        comValor++;
    }
    return { total: Math.round(total * 100) / 100, comValor };
}

/**
 * Os principais riscos ATIVOS: gatilho crítico primeiro, depois a maior pontuação
 * vigente (residual se houver, senão inerente); sem avaliação vai para o fim.
 * Empate: a revisão mais próxima primeiro (é a que pede olhar antes).
 */
export function principaisRiscos(riscos: ProjectRisk[], n = 10): ProjectRisk[] {
    return riscos.filter(riscoAtivo).sort((a, b) => {
        if (a.gatilho_critico !== b.gatilho_critico) return a.gatilho_critico ? -1 : 1;
        const pa = pontuacaoVigente(a) ?? -1;
        const pb = pontuacaoVigente(b) ?? -1;
        if (pa !== pb) return pb - pa;
        return a.proxima_revisao.localeCompare(b.proxima_revisao);
    }).slice(0, n);
}

/** Distribuição dos riscos ATIVOS por uma chave (fase, categoria), com quantos são críticos. */
export function distribuicao(
    riscos: ProjectRisk[],
    chave: (r: ProjectRisk) => string | null,
    faixasPorOrg: Record<string, RiskMatrixConfig>,
): { chave: string | null; total: number; criticos: number }[] {
    const mapa = new Map<string | null, { total: number; criticos: number }>();
    for (const r of riscos) {
        if (!riscoAtivo(r)) continue;
        const k = chave(r);
        const atual = mapa.get(k) ?? { total: 0, criticos: 0 };
        atual.total++;
        if (nivelNaOrg(r, faixasPorOrg) === 'critico') atual.criticos++;
        mapa.set(k, atual);
    }
    return [...mapa.entries()].map(([k, v]) => ({ chave: k, ...v })).sort((a, b) => b.total - a.total);
}
