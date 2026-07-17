// services/sync/diff.ts
//
// Classificação de UM campo nos três baldes (+ `same`). É o único lugar do sistema que
// decide "isto mudou?" — antes a resposta dependia de qual dos três comparadores
// desalinhados era chamado, e o do Imovib nem comparava (montava todos os campos sempre).

import { FieldSpec } from './fieldRegistry';
import { ChangeKind } from './types';

export type Classification = 'same' | ChangeKind;

const isNil = (v: unknown): boolean => v === null || v === undefined;

/** Vazio padrão: null/undefined/string em branco. NaN também — número que não é número. */
function defaultIsEmpty(v: unknown): boolean {
    if (isNil(v)) return true;
    if (typeof v === 'string') return v.trim() === '';
    if (typeof v === 'number') return Number.isNaN(v);
    return false;
}

export function isEmptyValue(v: unknown, spec: FieldSpec): boolean {
    return spec.isEmpty ? spec.isEmpty(v) : defaultIsEmpty(v);
}

/** Iguais? Numérico compara com a tolerância do spec; o resto é igualdade estrita. */
export function valuesEqual(a: unknown, b: unknown, spec: FieldSpec): boolean {
    if (spec.compare === 'numeric') {
        const na = typeof a === 'number' ? a : Number(a);
        const nb = typeof b === 'number' ? b : Number(b);
        if (Number.isNaN(na) || Number.isNaN(nb)) return isNil(a) && isNil(b);
        return Math.abs(na - nb) <= (spec.tolerance ?? 0);
    }
    if (isNil(a) && isNil(b)) return true;
    return a === b;
}

/**
 * O balde de um campo.
 *
 *   origem vazia          → 'same'      (a origem não tem opinião; nunca apaga o destino)
 *   destino vazio         → 'fill'      (aplica direto — não há nada para perder)
 *   iguais (± tolerância) → 'same'      (o que o mecanismo antigo não sabia ver)
 *   diferentes            → 'conflict'  (decisão humana)
 *
 * `from` = valor atual no Empreendimento · `to` = valor vindo da origem.
 */
export function classify(from: unknown, to: unknown, spec: FieldSpec): Classification {
    // Origem sem valor não propõe nada. Sem esta guarda, um campo que a origem não
    // preenche viraria proposta de apagar o dado do Empreendimento — o oposto de
    // "o Empreendimento é o centro da verdade".
    if (isEmptyValue(to, spec)) return 'same';
    if (isEmptyValue(from, spec)) return 'fill';
    return valuesEqual(from, to, spec) ? 'same' : 'conflict';
}
