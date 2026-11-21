/**
 * Riscos do estudo (imovib_risks) — rótulos e faixa de severidade num lugar só.
 * Plano: docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md, item 1.1.
 *
 * A faixa é a do módulo Riscos (utils/riskScoring.ts, RISK_MATRIZ_PADRAO): antes havia
 * cinco faixas diferentes (Imovib 8/15, Oportunidade 6/12/20, Comitê 20, Dossiê 12).
 */
import type { ImovibRisk } from '../types';
import { nivelDaPontuacao, COR_CELULA_NIVEL, COR_TEXTO_NIVEL } from '../utils/riskScoring';
import type { RiskNivel } from '../types/risk';

export const ROTULO_DA_CATEGORIA: Record<ImovibRisk['category'], string> = {
    fundiario: 'Fundiário',
    juridico: 'Jurídico',
    ambiental: 'Ambiental',
    urbanistico: 'Urbanístico',
    tecnico: 'Técnico',
    mercado: 'Mercado',
    financeiro: 'Financeiro',
    tributario: 'Tributário',
    societario: 'Societário',
    reputacional: 'Reputacional',
    prazo: 'Prazo',
    vendas: 'Vendas',
    construcao: 'Construção',
    outro: 'Outro',
};

/** Rótulo da categoria, também das versões congeladas antes de 21/11/2026 ('legal' virou 'juridico'). */
export const rotuloDaCategoria = (c: string): string =>
    (ROTULO_DA_CATEGORIA as Record<string, string>)[c] ?? (c === 'legal' ? 'Jurídico' : c);

export const ROTULO_DA_SITUACAO: Record<ImovibRisk['status'], string> = {
    aberto: 'Aberto',
    em_mitigacao: 'Em mitigação',
    mitigado: 'Mitigado',
    aceito: 'Aceito',
    materializado: 'Materializado',
    encerrado: 'Encerrado',
};

export const rotuloDaSituacao = (s: string): string => (ROTULO_DA_SITUACAO as Record<string, string>)[s] ?? s;

export const ROTULO_DA_TENDENCIA: Record<NonNullable<ImovibRisk['tendencia']>, string> = {
    subindo: 'Subindo',
    estavel: 'Estável',
    descendo: 'Descendo',
};

/** Severidade = probabilidade × impacto (1 a 25). */
export const severidade = (r: Pick<ImovibRisk, 'probability' | 'impact'>) => r.probability * r.impact;

export const nivelDoRiscoDoEstudo = (r: Pick<ImovibRisk, 'probability' | 'impact'>): RiskNivel => nivelDaPontuacao(severidade(r));

/** Pílula da severidade (cartão) e célula do mapa — cores do módulo Riscos. */
export const corDaSeveridade = (s: number) => {
    const n = nivelDaPontuacao(s);
    return `${COR_CELULA_NIVEL[n]} ${COR_TEXTO_NIVEL[n]}`;
};

/** Risco que ainda pesa: não mitigado, não aceito, não encerrado. Materializado pesa (virou problema). */
export const riscoEmAberto = (r: Pick<ImovibRisk, 'status'>) => r.status === 'aberto' || r.status === 'em_mitigacao' || r.status === 'materializado';

/** O que trava gate do comitê: nível alto ou crítico e ainda em aberto. */
export const riscoQueTrava = (r: Pick<ImovibRisk, 'probability' | 'impact' | 'status'>) => {
    const n = nivelDoRiscoDoEstudo(r);
    return riscoEmAberto(r) && (n === 'alto' || n === 'critico');
};
