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
import type { ProjectRisk, ProjectRiskInput, RiskAction, RiskEvent, RiskMatrixConfig, RiskNivel, RiskSinal } from '../types/risk';
import { RISK_MATRIZ_PADRAO, nivelDoRisco, pontuacaoVigente, riscoAtivo } from './riskScoring';
import { situacaoDaAprovacao } from './riskFase2';
import { niveisAprovadosNaRodada } from './situacaoAprovacaoTitulo';

/** Data local "AAAA-MM-DD" — nunca `toISOString()` (em UTC-3 vira o dia seguinte depois das 21h). */
export function hojeLocalISO(agora: Date = new Date()): string {
    return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
}

/** Faixas da organização do risco; sem configuração gravada, as da especificação. */
export function faixasDe(faixasPorOrg: Record<string, RiskMatrixConfig>, organizationId: string): RiskMatrixConfig {
    return faixasPorOrg[organizationId] ?? RISK_MATRIZ_PADRAO;
}

/** Recortes do Painel que viram filtro na aba Registro. `''` = sem recorte. */
export type RecorteRisco = '' | 'ativos' | 'criticos' | 'sem_plano' | 'revisao_vencida' | 'com_sinal' | 'materializados';

export const ROTULO_RECORTE: Record<Exclude<RecorteRisco, ''>, string> = {
    ativos: 'Ativos',
    criticos: 'Críticos (ativos)',
    sem_plano: 'Ativos sem plano de ação',
    revisao_vencida: 'Revisão vencida',
    com_sinal: 'Ativos com sinal nos vínculos',
    materializados: 'Materializados',
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
    /**
     * Fase 2 (F2.5): ids de risco com pelo menos um sinal nos vínculos — `riscosComSinal(sinais)`.
     * Opcional: sem ela (sinais ainda não carregados, ou a função do banco indisponível) ninguém tem sinal.
     */
    comSinal?: Set<string>;
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
        case 'com_sinal': return riscoAtivo(r) && !!ctx.comSinal?.has(r.id);
        case 'materializados': return r.status === 'materializado';
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

// ── Fase 2 (15/11/2026) — sinais, perdas e alçada (F2.1, F2.3, F2.5) ─────────────

/** Ids de risco com pelo menos um sinal (`fn_risk_sinais`). Entra no `ContextoRecorte.comSinal`. */
export function riscosComSinal(sinais: Pick<RiskSinal, 'project_risk_id'>[]): Set<string> {
    return new Set(sinais.map(s => s.project_risk_id));
}

/** Sinais agrupados por risco — a coluna "Sinais" do Registro e a aba Vínculos da ficha leem daqui. */
export function sinaisPorRisco<T extends Pick<RiskSinal, 'project_risk_id'>>(sinais: T[]): Map<string, T[]> {
    const mapa = new Map<string, T[]>();
    for (const s of sinais) {
        const lista = mapa.get(s.project_risk_id);
        if (lista) lista.push(s); else mapa.set(s.project_risk_id, [s]);
    }
    return mapa;
}

/** Gravidade mais alta de uma lista de sinais; `null` = sem sinal. */
export function gravidadeMaxima(sinais: Pick<RiskSinal, 'gravidade'>[] | undefined): RiskSinal['gravidade'] | null {
    if (!sinais?.length) return null;
    return sinais.some(s => s.gravidade === 'alta') ? 'alta' : 'media';
}

/**
 * Perdas realizadas (F2.1): soma do `impacto_financeiro` das ocorrências — UM valor por
 * ocorrência, mesmo afetando várias dimensões (nunca multiplica). Sem valor = não entra.
 * `comValor` diz quantas ocorrências compõem a soma (a base do número, §4.1).
 */
export function perdasRealizadas(ocorrencias: Pick<RiskEvent, 'impacto_financeiro'>[]): { total: number; comValor: number } {
    let total = 0;
    let comValor = 0;
    for (const o of ocorrencias) {
        if (o.impacto_financeiro == null) continue;
        total += Number(o.impacto_financeiro);
        comValor++;
    }
    return { total: Math.round(total * 100) / 100, comValor };
}

/** Situação da alçada que pede ação na aba Aprovações (o resto — não exige, aprovado — fica fora). */
export type SituacaoNaFila = 'pendente' | 'falta_enviar' | 'reprovado';

export const ROTULO_SITUACAO_ALCADA: Record<SituacaoNaFila, string> = {
    pendente: 'Aguardando aprovação',
    falta_enviar: 'Exige aprovação, não enviado',
    reprovado: 'Reprovado',
};

/**
 * Fila da aba Aprovações (F2.3): riscos PENDENTES e os que exigem aprovação e ainda não
 * foram enviados (ou foram reprovados). Classifica com as faixas da organização de cada risco.
 */
export function riscosParaAprovacao(
    riscos: ProjectRisk[],
    faixasPorOrg: Record<string, RiskMatrixConfig>,
): { risco: ProjectRisk; situacao: SituacaoNaFila }[] {
    const fila: { risco: ProjectRisk; situacao: SituacaoNaFila }[] = [];
    for (const r of riscos) {
        const s = situacaoDaAprovacao(r, faixasDe(faixasPorOrg, r.organization_id));
        if (s === 'pendente' || s === 'falta_enviar' || s === 'reprovado') fila.push({ risco: r, situacao: s });
    }
    return fila;
}

/**
 * Nível que está esperando aprovação agora, e de quantos. Só a RODADA atual conta (depois da
 * última reprovação), a mesma regra do `approvalService.approve`.
 */
export function nivelPendenteDaAlcada(r: Pick<ProjectRisk, 'approval_chain' | 'approval_required_levels'>): { nivel: 1 | 2; de: number } {
    const de = r.approval_required_levels === 2 ? 2 : 1;
    const aprovados = niveisAprovadosNaRodada((r.approval_chain ?? []) as Parameters<typeof niveisAprovadosNaRodada>[0]);
    return { nivel: de === 2 && aprovados.includes(1) ? 2 : 1, de };
}

/** Ficha de risco novo em branco (Módulo Riscos e "Levar ao Módulo Riscos" do Imovib). */
export function fichaVazia(base: Pick<ProjectRiskInput, 'owner_user_id' | 'owner_nome'>): ProjectRiskInput {
    return {
        catalog_id: null, catalog_codigo: null, catalog_versao: null, category_id: null, tipo: 'ameaca',
        titulo: '', causa: '', evento: '', consequencia: '', tags: [], dimensoes: [],
        escopo: 'obra', empreendimento_id: null, project_id: null, contract_id: null,
        frente: null, localizacao: null, fase: null, partes_afetadas: null,
        avaliador_user_id: null, aprovador_user_id: null,
        data_identificacao: hojeLocalISO(), proxima_revisao: '',
        controles_existentes: null, estrategia: null, plano_resposta: null, contingencia: null, justificativa_aceite: null,
        status: 'identificado', encerramento_motivo: null, gatilho_critico: false, gatilho_motivo: null,
        sst_document_tipo: null, sst_document_id: null,
        ...base,
    };
}
