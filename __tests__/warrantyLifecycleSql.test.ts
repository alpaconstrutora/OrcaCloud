/**
 * Trava: as listas de estados de origem das RPCs do chamado (SQL) são as
 * mesmas de utils/warrantyLifecycle.ts (TS). Cada lista no SQL vem logo depois
 * de `-- origem: <CONSTANTE>`; mudar um lado sem o outro quebra aqui — a tela
 * ofereceria um botão que o banco recusa, ou esconderia um que o banco aceita.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ciclo from '../utils/warrantyLifecycle';

const SQL = readFileSync(
    join(__dirname, '..', 'supabase', 'migrations', 'aplicar_20271011000500_garantia_ciclo_vida.sql'),
    'utf-8',
);

function listasDoSql(): Map<string, string[][]> {
    const re = /--\s*origem:\s*(\w+)\s*\n[^\n]*?(?:NOT\s+)?IN\s*\(([^)]*)\)/g;
    const out = new Map<string, string[][]>();
    for (const m of SQL.matchAll(re)) {
        const estados = [...m[2].matchAll(/'([A-Z_]+)'/g)].map(x => x[1]);
        out.set(m[1], [...(out.get(m[1]) ?? []), estados]);
    }
    return out;
}

describe('RPCs do ciclo de vida × utils/warrantyLifecycle.ts', () => {
    const doSql = listasDoSql();
    const NOMES = [
        'ESTADOS_TRIAGEM', 'ESTADOS_AGENDAR_VISITA', 'ESTADOS_QUE_VIRAM_VISITA',
        'ESTADOS_INICIAR_REPARO', 'ESTADOS_CONCLUIR_REPARO', 'ESTADOS_ENCERRAR',
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
