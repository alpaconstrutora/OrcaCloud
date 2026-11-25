/**
 * Empresa herdada do empreendimento (locador dos documentos + regime tributário).
 * Achado em 25/11/2026: o locador consultava empreendimento_units.empreendimento_id,
 * coluna que não existe — 400 engolido, herança nunca funcionava. Caminho certo:
 * unidade (rental_property_id ou commercial_property_id) → tower_id →
 * empreendimento_towers.empreendimento_id → empreendimentos.company_id.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Linha = Record<string, unknown>;
let unidades: Linha[] = [];
let erroUnidades: { message: string } | null = null;
const consultas: string[] = [];
const TORRES: Record<string, Linha> = { t1: { empreendimento_id: 'e1' } };
const EMPREENDIMENTOS: Record<string, Linha> = { e1: { company_id: 'empresa-do-empreendimento' } };

function table(name: string) {
    const filtros: Record<string, unknown> = {};
    const b: Record<string, unknown> = {};
    Object.assign(b, {
        select: (cols: string) => { consultas.push(`${name}.${cols}`); return b; },
        eq: (col: string, v: unknown) => { filtros[col] = v; return b; },
        limit: () => b,
        maybeSingle: async () => {
            const id = filtros.id as string;
            if (name === 'empreendimento_towers') return { data: TORRES[id] ?? null, error: null };
            if (name === 'empreendimentos') return { data: EMPREENDIMENTOS[id] ?? null, error: null };
            return { data: null, error: null };
        },
        then: (resolve: (v: unknown) => void) => {
            const [col, v] = Object.entries(filtros)[0] ?? [];
            resolve({ data: erroUnidades ? null : unidades.filter(u => u[col as string] === v), error: erroUnidades });
        },
    });
    return b;
}
vi.mock('../lib/supabase', () => ({ supabase: { from: (n: string) => table(n) } }));

import { empresaDoEmpreendimentoDoImovel } from '../services/empresaDoEmpreendimento';

beforeEach(() => { unidades = []; erroUnidades = null; consultas.length = 0; });

describe('empresaDoEmpreendimentoDoImovel', () => {
    it('imóvel de locação (rental_property_id) → torre → empreendimento → empresa', async () => {
        unidades = [{ rental_property_id: 'p1', tower_id: 't1' }];
        expect(await empresaDoEmpreendimentoDoImovel('p1')).toBe('empresa-do-empreendimento');
        // nunca pede a coluna que não existe
        expect(consultas.some(c => c.includes('empreendimento_units.empreendimento_id'))).toBe(false);
    });

    it('imóvel de venda (commercial_property_id) também herda', async () => {
        unidades = [{ commercial_property_id: 'p2', tower_id: 't1' }];
        expect(await empresaDoEmpreendimentoDoImovel('p2')).toBe('empresa-do-empreendimento');
    });

    it('imóvel fora de empreendimento: null (quem chama segue para o próximo degrau)', async () => {
        expect(await empresaDoEmpreendimentoDoImovel('p9')).toBeNull();
        expect(await empresaDoEmpreendimentoDoImovel(null)).toBeNull();
    });

    it('erro na consulta: null, sem lançar', async () => {
        erroUnidades = { message: 'falhou' };
        expect(await empresaDoEmpreendimentoDoImovel('p1')).toBeNull();
    });
});
