/**
 * Leitura da matrícula por IA → itens da due diligence do estudo (imovib_land_checklist).
 * Plano: docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md, item 1.2.
 *
 * A Edge Function read-matricula devolve achados; cada um diz a que item dos 14 pertence
 * (`item_key`). Aqui só se decide o que gravar — função pura, testada em
 * __tests__/imovibDueDiligenceMatricula.test.ts.
 *
 * Regras (a IA pré-preenche, quem decide é o jurídico):
 *  - a IA NUNCA marca "ok" nem "não se aplica": achado "inconforme" vira "problema";
 *    "pendente"/"em análise" mantêm a situação atual do item;
 *  - a criticidade só sobe (a maior entre a atual e as dos achados);
 *  - a observação ganha uma linha por achado, sem apagar o que já estava escrito;
 *  - achado sem item conhecido cai no item "matricula".
 */
import type { ImovibLandChecklistItem } from '../types';

export type Criticidade = 'baixa' | 'media' | 'alta' | 'critica';

export interface AchadoDaMatricula {
    item_key?: string | null;
    title: string;
    description: string;
    criticidade: Criticidade;
    suggested_status: 'pendente' | 'em_analise' | 'inconforme';
    source_excerpt: string;
    confidence: number;
}

export interface AtualizacaoDoItem {
    id: string;
    item_key: string;
    campos: Pick<ImovibLandChecklistItem, 'criticidade' | 'notes' | 'ai_extracted' | 'ai_confidence' | 'ai_source_excerpt' | 'ai_extracted_at'>
        & Partial<Pick<ImovibLandChecklistItem, 'status'>>;
}

const ORDEM: Record<Criticidade, number> = { baixa: 0, media: 1, alta: 2, critica: 3 };
const maior = (a: Criticidade, b: Criticidade): Criticidade => (ORDEM[b] > ORDEM[a] ? b : a);

/** As chaves que a matrícula consegue informar — o enum do esquema da Edge Function. */
export const CHAVES_DA_MATRICULA = [
    'matricula', 'cadeia_dominial', 'onus_gravames', 'faixas_servidoes', 'restricao_ambiental', 'tombamento', 'certidoes_vendedores',
] as const;

export function atualizacoesDaMatricula(
    achados: AchadoDaMatricula[],
    itens: ImovibLandChecklistItem[],
    agoraIso: string,
): AtualizacaoDoItem[] {
    const porChave = new Map(itens.map(i => [i.item_key, i]));
    const grupos = new Map<string, AchadoDaMatricula[]>();
    for (const a of achados) {
        const chave = a.item_key && porChave.has(a.item_key) ? a.item_key : 'matricula';
        if (!porChave.has(chave)) continue;
        grupos.set(chave, [...(grupos.get(chave) ?? []), a]);
    }

    const out: AtualizacaoDoItem[] = [];
    for (const [chave, lista] of grupos) {
        const item = porChave.get(chave)!;
        const criticidade = lista.reduce<Criticidade>((c, a) => maior(c, a.criticidade), item.criticidade ?? 'media');
        const linhas = lista.map(a => `IA (${Math.round(a.confidence * 100)}%): ${a.title}: ${a.description}`);
        const notes = [item.notes?.trim(), ...linhas].filter(Boolean).join('\n');
        const confianca = Math.min(...lista.map(a => a.confidence));
        const campos: AtualizacaoDoItem['campos'] = {
            criticidade,
            notes,
            ai_extracted: true,
            ai_confidence: Number.isFinite(confianca) ? Math.max(0, Math.min(1, confianca)) : null,
            ai_source_excerpt: lista.map(a => a.source_excerpt).filter(Boolean).join(' | ') || null,
            ai_extracted_at: agoraIso,
        };
        if (lista.some(a => a.suggested_status === 'inconforme') && item.status !== 'problema') campos.status = 'problema';
        out.push({ id: item.id, item_key: chave, campos });
    }
    return out;
}

/** Item que trava gate do comitê (item 1.5): criticidade alta/crítica sem "ok" nem "não se aplica". */
export const itemDaDueDiligenceQueTrava = (i: Pick<ImovibLandChecklistItem, 'criticidade' | 'status'>) =>
    (i.criticidade === 'alta' || i.criticidade === 'critica') && i.status !== 'ok' && i.status !== 'nao_se_aplica';
