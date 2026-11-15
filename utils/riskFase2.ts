/**
 * Módulo Riscos — Fase 2: regras puras (alçada, tipologia da obra, sugestão do catálogo).
 * Plano: docs/planos/2026-11-13-modulo-riscos.md (F2.3, F2.4).
 */
import type { ProjectRisk, RiskCatalogItem, RiskMatrixConfig, RiskTipologia } from '../types/risk';
import { RISK_MATRIZ_PADRAO, nivelDoRisco, riscoAtivo } from './riskScoring';

/**
 * F2.3 — exige aprovação quando a estratégia é ACEITAR ou o risco é CRÍTICO (gatilho ou pontuação ≥
 * limite da organização). `motivo` vai para a tela, que nunca mostra botão desligado sem dizer por quê.
 */
export function exigeAprovacao(
    r: Pick<ProjectRisk, 'estrategia' | 'gatilho_critico' | 'inerente_pontuacao' | 'residual_pontuacao' | 'status'>,
    faixas: RiskMatrixConfig = RISK_MATRIZ_PADRAO,
): { exige: boolean; motivo: string | null } {
    if (!riscoAtivo(r)) return { exige: false, motivo: null };
    const motivos: string[] = [];
    if (r.estrategia === 'aceitar') motivos.push('a estratégia é aceitar o risco');
    if (nivelDoRisco(r, faixas) === 'critico') motivos.push(r.gatilho_critico ? 'o risco tem gatilho crítico' : 'o risco é crítico pela pontuação');
    return motivos.length ? { exige: true, motivo: `Exige aprovação: ${motivos.join(' e ')}.` } : { exige: false, motivo: null };
}

/** Situação da alçada para a tela. */
export function situacaoDaAprovacao(
    r: Pick<ProjectRisk, 'approval_status' | 'estrategia' | 'gatilho_critico' | 'inerente_pontuacao' | 'residual_pontuacao' | 'status'>,
    faixas?: RiskMatrixConfig,
): 'nao_exige' | 'falta_enviar' | 'pendente' | 'aprovado' | 'reprovado' {
    const { exige } = exigeAprovacao(r, faixas);
    if (r.approval_status === 'PENDENTE') return 'pendente';
    if (r.approval_status === 'APROVADO') return 'aprovado';
    if (r.approval_status === 'REJEITADO') return exige ? 'reprovado' : 'nao_exige';
    return exige ? 'falta_enviar' : 'nao_exige';
}

/**
 * F2.4 — tipologia do risco a partir da obra. `projects.tipo_obra` usa outro vocabulário
 * (residencial_multifamiliar|casa|loja|sala|galpao|reforma|outro) e obra pública é
 * `settings.modalidade = 'publica'`. Sem correspondência = `null` (o usuário escolhe).
 */
export function tipologiaDaObra(tipoObra: string | null | undefined, modalidade?: string | null): RiskTipologia | null {
    if (modalidade === 'publica') return 'obra_publica';
    switch (tipoObra) {
        case 'residencial_multifamiliar':
        case 'casa': return 'residencial';
        case 'loja':
        case 'sala': return 'comercial';
        case 'galpao': return 'galpao_industrial';
        case 'reforma': return 'reforma';
        default: return null;
    }
}

export interface SugestaoDoCatalogo {
    item: RiskCatalogItem;
    /** Condições da obra que o item cita (motivo da sugestão). */
    condicoesQueBatem: string[];
}

/**
 * F2.4 — itens do catálogo da tipologia, ordenados por quantas condições da obra eles citam
 * (desempate: gatilho crítico primeiro, depois o código). Itens já usados na obra ficam de fora.
 * Sem tipologia escolhida, todos os itens entram; sem condição marcada, a ordem é gatilho + código.
 */
export function sugerirDoCatalogo(
    catalogo: RiskCatalogItem[],
    tipologia: RiskTipologia | null,
    condicoes: string[],
    jaUsadosNaObra: Set<string>,
): SugestaoDoCatalogo[] {
    const marcadas = new Set(condicoes);
    return catalogo
        .filter(i => i.ativo !== false && !jaUsadosNaObra.has(i.id))
        .filter(i => !tipologia || i.tipologias.length === 0 || i.tipologias.includes(tipologia))
        .map(item => ({ item, condicoesQueBatem: item.condicoes_sugestao.filter(c => marcadas.has(c)) }))
        .sort((a, b) =>
            b.condicoesQueBatem.length - a.condicoesQueBatem.length
            || Number(b.item.gatilho_critico) - Number(a.item.gatilho_critico)
            || a.item.codigo.localeCompare(b.item.codigo, 'pt-BR', { numeric: true }));
}

/** Rótulos das condições do catálogo (lista fechada de FORMATO.md). */
export const ROTULO_CONDICAO: Record<string, string> = {
    subsolo: 'Subsolo', escavacao_profunda: 'Escavação profunda', contencao: 'Contenção', terreno_inclinado: 'Terreno inclinado',
    nivel_agua_alto: 'Nível de água alto', proximo_curso_dagua: "Próximo a curso d'água", area_ambiental_sensivel: 'Área ambiental sensível',
    vizinhanca_proxima: 'Vizinhança próxima', edificacao_ocupada: 'Edificação ocupada', area_urbana_densa: 'Área urbana densa',
    estrutura_concreto: 'Estrutura de concreto', estrutura_metalica: 'Estrutura metálica', pre_moldado: 'Pré-moldado', protensao: 'Protensão',
    fundacao_profunda: 'Fundação profunda', grua_ou_guindaste: 'Grua ou guindaste', trabalho_em_altura: 'Trabalho em altura',
    espaco_confinado: 'Espaço confinado', demolicao: 'Demolição', edificacao_antiga: 'Edificação antiga',
    financiamento_bancario: 'Financiamento bancário', venda_na_planta: 'Venda na planta', locacao: 'Locação',
    contrato_publico: 'Contrato público', insumo_importado: 'Insumo importado', muitos_terceirizados: 'Muitos terceirizados',
    prazo_curto: 'Prazo curto', regiao_chuvosa: 'Região chuvosa', bim: 'BIM',
};
