/**
 * "Levar ao Módulo Riscos" (Fase 7.6 de docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md).
 *
 * O risco nasce no estudo de viabilidade (imovib_risks). Quando o empreendimento segue, ele passa a ser
 * gerido no Módulo Riscos (project_risks): dono, revisão, ações, avaliações. Aqui só a tradução — pura,
 * sem I/O; quem grava é `imovibService.levarRiscoAoModulo`.
 */
import type { ImovibRisk } from '../types/imovib';
import type { ProjectRiskInput, RiskDimensao, RiskEvaluationInput, RiskStatus } from '../types/risk';
import { fichaVazia, hojeLocalISO } from './riskPainel';
import { rotuloDaCategoria } from '../constants/imovibRiscos';

/** Categoria do estudo → código da categoria do Módulo Riscos (risk_categories) e dimensão do impacto. */
export const CATEGORIA_NO_MODULO: Record<ImovibRisk['category'], { codigo: string; dimensao: RiskDimensao }> = {
    fundiario: { codigo: 'R02', dimensao: 'juridica' },
    juridico: { codigo: 'R11', dimensao: 'juridica' },
    ambiental: { codigo: 'R04', dimensao: 'ambiental' },
    urbanistico: { codigo: 'R03', dimensao: 'juridica' },
    tecnico: { codigo: 'R06', dimensao: 'qualidade' },
    mercado: { codigo: 'R20', dimensao: 'financeira' },
    financeiro: { codigo: 'R09', dimensao: 'financeira' },
    tributario: { codigo: 'R10', dimensao: 'financeira' },
    societario: { codigo: 'R23', dimensao: 'juridica' },
    reputacional: { codigo: 'R23', dimensao: 'reputacional' },
    prazo: { codigo: 'R08', dimensao: 'prazo' },
    vendas: { codigo: 'R20', dimensao: 'financeira' },
    construcao: { codigo: 'R15', dimensao: 'operacional' },
    outro: { codigo: 'R01', dimensao: 'operacional' },
};

const SITUACAO_NO_MODULO: Record<Exclude<ImovibRisk['status'], 'encerrado'>, RiskStatus> = {
    aberto: 'identificado',
    em_mitigacao: 'em_tratamento',
    mitigado: 'monitorado',
    aceito: 'monitorado',
    materializado: 'materializado',
};

export interface DestinoNoModulo {
    organizationId: string;
    empreendimentoId: string | null;
    /** Obra do empreendimento: com ela o risco vai com escopo "obra"; sem ela, "empreendimento". */
    obraId: string | null;
    ownerUserId: string;
    ownerNome: string | null;
    /** id da categoria do Módulo Riscos pelo código (R01…); ausente = sem categoria. */
    categoriaPorCodigo: Record<string, string>;
    nomeDoEstudo: string;
}

/** Por que este risco não pode ir (null = pode). */
export function motivoParaNaoLevar(r: Pick<ImovibRisk, 'status'> & { project_risk_id?: string | null }, empreendimentoId: string | null | undefined): string | null {
    if (r.project_risk_id) return 'Este risco já está no Módulo Riscos.';
    if (r.status === 'encerrado') return 'Risco encerrado no estudo não vai para o Módulo Riscos.';
    if (!empreendimentoId) return 'O estudo não está vinculado a um empreendimento: o Módulo Riscos registra por empreendimento ou obra.';
    return null;
}

const daquiA30Dias = (hoje: string): string => {
    const d = new Date(`${hoje}T12:00:00`);
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
};

/** A ficha do Módulo Riscos e a avaliação inerente (mesma probabilidade × impacto do estudo). */
export function riscoParaOModulo(r: ImovibRisk, destino: DestinoNoModulo, hoje: string = hojeLocalISO()): { ficha: ProjectRiskInput; avaliacao: RiskEvaluationInput } {
    if (r.status === 'encerrado') throw new Error('Risco encerrado no estudo não vai para o Módulo Riscos.');
    const { codigo, dimensao } = CATEGORIA_NO_MODULO[r.category] ?? CATEGORIA_NO_MODULO.outro;
    const descricao = r.description.trim();
    const aceito = r.status === 'aceito';
    const ficha: ProjectRiskInput = {
        ...fichaVazia({ owner_user_id: destino.ownerUserId, owner_nome: destino.ownerNome }),
        category_id: destino.categoriaPorCodigo[codigo] ?? null,
        titulo: descricao.length > 120 ? `${descricao.slice(0, 117)}…` : descricao,
        evento: descricao,
        causa: r.causa?.trim() || descricao,
        consequencia: r.consequencia?.trim() || `Impacto ${rotuloDaCategoria(r.category).toLowerCase()} no empreendimento (avaliado no estudo).`,
        dimensoes: [dimensao],
        tags: ['estudo de viabilidade'],
        escopo: destino.obraId ? 'obra' : 'empreendimento',
        project_id: destino.obraId,
        empreendimento_id: destino.obraId ? null : destino.empreendimentoId,
        fase: 'viabilidade',
        partes_afetadas: r.owner?.trim() || null,
        data_identificacao: hoje,
        proxima_revisao: r.prazo && r.prazo >= hoje ? r.prazo : daquiA30Dias(hoje),
        controles_existentes: r.mitigation?.trim() || null,
        plano_resposta: r.mitigation?.trim() || null,
        contingencia: r.contingencia?.trim() || null,
        estrategia: aceito ? 'aceitar' : r.mitigation?.trim() ? 'mitigar' : null,
        justificativa_aceite: aceito ? `Aceito no estudo de viabilidade "${destino.nomeDoEstudo}".` : null,
        status: SITUACAO_NO_MODULO[r.status as keyof typeof SITUACAO_NO_MODULO] ?? 'identificado',
    };
    const avaliacao: RiskEvaluationInput = {
        tipo: 'inerente',
        metodo: 'matriz_5x5',
        probabilidade: r.probability,
        impactos: { [dimensao]: r.impact },
        probabilidade_pct: null,
        perda_estimada: null,
        atraso_dias: null,
        premissas: null,
        justificativa: `Avaliação do estudo de viabilidade "${destino.nomeDoEstudo}".`,
        evidencia_url: null,
        evidencia_document_id: null,
        avaliado_por_nome: destino.ownerNome,
    };
    return { ficha, avaliacao };
}
