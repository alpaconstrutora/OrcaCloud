/**
 * Trava: as listas de estados de origem das RPCs do chamado (SQL) são as
 * mesmas de utils/warrantyLifecycle.ts (TS). Cada lista no SQL vem logo depois
 * de `-- origem: <CONSTANTE>`; mudar um lado sem o outro quebra aqui — a tela
 * ofereceria um botão que o banco recusa, ou esconderia um que o banco aceita.
 *
 * Uma RPC pode ser reescrita por migration posterior (ex.: close_warranty_claim
 * em 000500 e de novo em 000700): vale a ÚLTIMA migration que marca a constante.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ciclo from '../utils/warrantyLifecycle';

const MIGRATIONS = [
    'aplicar_20271011000500_garantia_ciclo_vida.sql',
    'aplicar_20271011000700_garantia_pendencias.sql',
];

function listasDe(sql: string): Map<string, string[][]> {
    const re = /--\s*origem:\s*(\w+)\s*\n[^\n]*?(?:NOT\s+)?IN\s*\(([^)]*)\)/g;
    const out = new Map<string, string[][]>();
    for (const m of sql.matchAll(re)) {
        const estados = [...m[2].matchAll(/'([A-Z_]+)'/g)].map(x => x[1]);
        out.set(m[1], [...(out.get(m[1]) ?? []), estados]);
    }
    return out;
}

/** Constante → listas da última migration (na ordem de MIGRATIONS) que a define. */
function listasVigentes(): Map<string, string[][]> {
    const vigentes = new Map<string, string[][]>();
    for (const f of MIGRATIONS) {
        const sql = readFileSync(join(__dirname, '..', 'supabase', 'migrations', f), 'utf-8');
        for (const [k, v] of listasDe(sql)) vigentes.set(k, v);
    }
    return vigentes;
}

describe('RPCs do ciclo de vida × utils/warrantyLifecycle.ts', () => {
    const doSql = listasVigentes();
    const NOMES = [
        'ESTADOS_TRIAGEM', 'ESTADOS_AGENDAR_VISITA', 'ESTADOS_QUE_VIRAM_VISITA',
        'ESTADOS_INICIAR_REPARO', 'ESTADOS_CONCLUIR_REPARO', 'ESTADOS_ENCERRAR', 'ESTADOS_REABRIR',
    ] as const;

    it('toda constante aparece marcada no SQL', () => {
        for (const n of NOMES) expect(doSql.has(n), n).toBe(true);
    });

    for (const n of NOMES) {
        it(`${n}: mesma lista no banco e na tela`, () => {
            const ts = [...(ciclo[n] as readonly string[])].sort();
            for (const lista of doSql.get(n) ?? []) expect([...lista].sort()).toEqual(ts);
        });
    }
});
