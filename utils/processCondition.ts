// Condição por etapa do motor de Processos — avaliador PURO (sem supabase).
// Passo 4 de docs/planos/2026-09-28-torre-p2p-processos.md.
//
// A condição decide se a etapa ENTRA NO CAMINHO da instância. Não é a faixa
// de valor da alçada (essa continua no approvalService); é o "compra ≤ R$ 5 mil
// não passa pelo diretor" do PRD, sem gateway BPMN.
//
// Regra da casa aplicada aqui: **nunca pular por falta de dado**. Condição nula,
// campo ausente no contexto ou valor não comparável → a etapa executa. Pular
// uma aprovação porque o pedido não tinha valor carregado seria o portão se
// autoaprovando — o oposto do que quem modelou o processo quis.

import type { ProcessCondition, ProcessConditionContext, ProcessConditionField, ProcessConditionOp } from '../types/process';

export const CONDITION_FIELD_LABEL: Record<ProcessConditionField, string> = {
    amount: 'Valor',
    project_id: 'Obra',
    supplier_id: 'Fornecedor',
};

export const CONDITION_OP_LABEL: Record<ProcessConditionOp, string> = {
    gt: '>', gte: '≥', lt: '<', lte: '≤', eq: '=', neq: '≠', in: 'em',
};

/** Operadores que fazem sentido para cada campo (a UI oferece só estes). */
export const CONDITION_OPS_BY_FIELD: Record<ProcessConditionField, ProcessConditionOp[]> = {
    amount: ['gt', 'gte', 'lt', 'lte', 'eq', 'neq'],
    project_id: ['eq', 'neq', 'in'],
    supplier_id: ['eq', 'neq', 'in'],
};

const NUMERICOS: ProcessConditionOp[] = ['gt', 'gte', 'lt', 'lte'];

function comoNumero(v: unknown): number | null {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'string' && v.trim() !== '') {
        const n = Number(v.replace(',', '.'));
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

/**
 * `true` = a etapa executa. Só devolve `false` quando a condição é válida, o
 * contexto TEM o campo e a comparação de fato falha.
 */
export function avaliarCondicao(
    condition: ProcessCondition | null | undefined,
    ctx: ProcessConditionContext,
): boolean {
    if (!condition || !condition.field || !condition.op) return true;

    const atual = ctx[condition.field];
    if (atual === undefined || atual === null || atual === '') return true;

    if (NUMERICOS.includes(condition.op)) {
        const a = comoNumero(atual);
        const b = comoNumero(condition.value);
        if (a === null || b === null) return true; // não comparável → não pula
        switch (condition.op) {
            case 'gt':  return a > b;
            case 'gte': return a >= b;
            case 'lt':  return a < b;
            case 'lte': return a <= b;
        }
    }

    if (condition.op === 'in') {
        const lista = Array.isArray(condition.value) ? condition.value : [condition.value];
        if (lista.length === 0) return true;
        return lista.map(String).includes(String(atual));
    }

    // eq / neq — compara como texto (uuid, ou número normalizado)
    const na = comoNumero(atual);
    const nb = comoNumero(condition.value);
    const iguais = (na !== null && nb !== null) ? na === nb : String(atual) === String(condition.value);
    return condition.op === 'eq' ? iguais : !iguais;
}

/** Texto curto para a UI: "Valor > 30000", "Obra = <id>", "Fornecedor em 2 itens". */
export function descreverCondicao(condition: ProcessCondition | null | undefined): string | null {
    if (!condition || !condition.field || !condition.op) return null;
    const campo = CONDITION_FIELD_LABEL[condition.field] ?? condition.field;
    const op = CONDITION_OP_LABEL[condition.op] ?? condition.op;
    if (condition.op === 'in') {
        const n = Array.isArray(condition.value) ? condition.value.length : 1;
        return `${campo} ${op} ${n} ${n === 1 ? 'item' : 'itens'}`;
    }
    const valor = condition.field === 'amount' && comoNumero(condition.value) !== null
        ? comoNumero(condition.value)!.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        : String(condition.value);
    return `${campo} ${op} ${valor}`;
}

/** Valida o objeto antes de gravar; devolve a mensagem do problema ou null. */
export function validarCondicao(condition: Partial<ProcessCondition> | null | undefined): string | null {
    if (!condition) return null;
    if (!condition.field || !(condition.field in CONDITION_FIELD_LABEL)) return 'Campo da condição inválido.';
    if (!condition.op || !CONDITION_OPS_BY_FIELD[condition.field].includes(condition.op)) return 'Operador não vale para este campo.';
    if (condition.op === 'in') {
        if (!Array.isArray(condition.value) || condition.value.length === 0) return 'Lista da condição vazia.';
        return null;
    }
    if (condition.value === undefined || condition.value === null || condition.value === '') return 'Valor da condição vazio.';
    if (condition.field === 'amount' && comoNumero(condition.value) === null) return 'Valor da condição precisa ser numérico.';
    return null;
}
