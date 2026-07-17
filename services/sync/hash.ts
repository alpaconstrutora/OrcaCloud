// services/sync/hash.ts
//
// Hash de IDENTIDADE de uma proposta de campo. Usado só como chave de deduplicação no unique
// index de empreendimento_field_proposals — não é segurança, é "esta proposta já existe?".
//
// Ponto crucial do desenho: este hash é computado SÓ AQUI, no cliente, e NUNCA recalculado no
// servidor. O plano original previa recalcular um hash em plpgsql para detectar obsolescência,
// e marcava a canonicalização TS≡SQL como o maior risco (62.40 vs 62.4 faria toda proposta
// nascer obsoleta). Ao manter o hash exclusivamente no TS, esse risco desaparece: só precisa
// ser determinístico DENTRO do TS, o que String(value) já garante.
//
// FNV-1a 64-bit: síncrono (não precisa await na materialização nem nos testes), sem deps, e
// mais que suficiente para distinguir valores propostos dentro do escopo já estreito da chave
// (empreendimento + origem + entidade + campo).

import { SyncEntity, SyncOrigin } from './types';

/**
 * Canonicaliza um valor para a string que entra no hash. Determinístico: o mesmo valor sempre
 * dá a mesma string. `String(64.10)` já é `"64.1"`, então não há divergência 64.40/64.4.
 */
function canonical(value: unknown): string {
    if (value === null || value === undefined) return '∅'; // ∅
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '∅';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    return String(value).trim();
}

/** FNV-1a 64-bit sobre uma string UTF-16 (code units). Retorna hex de 16 dígitos. */
function fnv1a64(str: string): string {
    const PRIME = 0x100000001b3n;
    const MASK = 0xffffffffffffffffn;
    let hash = 0xcbf29ce484222325n;
    for (let i = 0; i < str.length; i++) {
        hash ^= BigInt(str.charCodeAt(i));
        hash = (hash * PRIME) & MASK;
    }
    return hash.toString(16).padStart(16, '0');
}

/**
 * Identidade de uma proposta: mesma origem propondo o mesmo valor para o mesmo campo da mesma
 * entidade = mesmo hash. O `` separa os campos para "a|bc" não colidir com "ab|c".
 */
export function proposalHash(args: {
    empreendimentoId: string;
    origin: SyncOrigin;
    entity: SyncEntity;
    entityId: string;
    field: string;
    proposedValue: unknown;
}): string {
    const parts = [
        args.empreendimentoId, args.origin, args.entity, args.entityId, args.field,
        canonical(args.proposedValue),
    ];
    return fnv1a64(parts.join(''));
}
