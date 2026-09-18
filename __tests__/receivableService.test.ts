import { describe, it, expect, vi } from 'vitest';

// O service importa o client do Supabase no topo; as funções puras não o usam.
vi.mock('../lib/supabase', () => ({ supabase: {} }));
vi.mock('../services/empreendimentoService', () => ({ empreendimentoService: {} }));

import { filtrarRecebiveis, aplicarStatusLocal } from '../services/receivableService';
import type { Receivable } from '../types/financial';

const C1 = 'dbb274e7-59e2-494a-bb5f-aba877c4330f';

function rec(over: Partial<Receivable>): Receivable {
    return {
        id: over.id ?? 'x',
        organization_id: 'org',
        source_system: 'MANUAL',
        transaction_date: '2026-09-01',
        due_date: '2026-09-10',
        amount: 100,
        direction: 'CREDIT',
        status: 'PENDING',
        business_status: 'PREVISTO',
        effective_status: 'PREVISTO',
        ...over,
    };
}

describe('filtrarRecebiveis — recorte em memória (busca e status sem ir ao servidor)', () => {
    const rows = [
        rec({ id: '1', party_name: 'Alpa Construtora', description: 'Parcela 1', effective_status: 'PREVISTO' }),
        rec({ id: '2', party_name: 'Fulano', description: 'Aluguel', project_name: 'Obra Norte', effective_status: 'VENCIDO' }),
        rec({ id: '3', party_name: 'Beltrano', description: 'Entrada', empreendimento_name: 'Residencial Sol', effective_status: 'RECEBIDO' }),
        rec({ id: '4', party_name: 'Sicrano', description: 'x', reference_id: `${C1}-p2026-09-10`, effective_status: 'PREVISTO' }),
    ];

    it('sem filtro devolve o MESMO array (sem cópia, para o memo da tela)', () => {
        expect(filtrarRecebiveis(rows, {})).toBe(rows);
        expect(filtrarRecebiveis(rows, { status: 'all', search: '   ' })).toBe(rows);
    });

    it('status recorta por effective_status', () => {
        expect(filtrarRecebiveis(rows, { status: 'VENCIDO' }).map(r => r.id)).toEqual(['2']);
        expect(filtrarRecebiveis(rows, { status: 'PREVISTO' }).map(r => r.id)).toEqual(['1', '4']);
    });

    it('busca casa cliente, descrição, obra, empreendimento e reference_id, sem caixa', () => {
        expect(filtrarRecebiveis(rows, { search: 'ALPA' }).map(r => r.id)).toEqual(['1']);
        expect(filtrarRecebiveis(rows, { search: 'aluguel' }).map(r => r.id)).toEqual(['2']);
        expect(filtrarRecebiveis(rows, { search: 'norte' }).map(r => r.id)).toEqual(['2']);
        expect(filtrarRecebiveis(rows, { search: 'residencial' }).map(r => r.id)).toEqual(['3']);
        expect(filtrarRecebiveis(rows, { search: C1.slice(0, 8) }).map(r => r.id)).toEqual(['4']);
    });

    it('busca e status combinam (E)', () => {
        expect(filtrarRecebiveis(rows, { search: 'a', status: 'RECEBIDO' }).map(r => r.id)).toEqual(['3']);
    });
});

describe('aplicarStatusLocal — espelho do updateStatus + CASE da view (§22)', () => {
    const HOJE = '2026-09-18';

    it('RECEBIDO concilia e fica RECEBIDO mesmo com vencimento passado', () => {
        const r = aplicarStatusLocal(rec({ due_date: '2020-01-01', effective_status: 'VENCIDO' }), 'RECEBIDO', HOJE)!;
        expect(r.status).toBe('CONCILIATED');
        expect(r.business_status).toBe('RECEBIDO');
        expect(r.effective_status).toBe('RECEBIDO');
    });

    it('CANCELADO sai da lista (a view exclui CANCELLED)', () => {
        expect(aplicarStatusLocal(rec({}), 'CANCELADO', HOJE)).toBeNull();
    });

    it('estorno (PREVISTO) com vencimento passado volta como VENCIDO, e PENDING', () => {
        const r = aplicarStatusLocal(rec({ due_date: '2026-09-01', status: 'CONCILIATED', business_status: 'RECEBIDO', effective_status: 'RECEBIDO' }), 'PREVISTO', HOJE)!;
        expect(r.status).toBe('PENDING');
        expect(r.effective_status).toBe('VENCIDO');
    });

    it('PREVISTO com vencimento futuro (ou hoje) fica PREVISTO', () => {
        expect(aplicarStatusLocal(rec({ due_date: '2026-12-01' }), 'PREVISTO', HOJE)!.effective_status).toBe('PREVISTO');
        expect(aplicarStatusLocal(rec({ due_date: HOJE }), 'EMITIDO', HOJE)!.effective_status).toBe('EMITIDO');
    });

    it('PARCIAL / RENEGOCIADO não mexem no status de conciliação e nunca viram VENCIDO', () => {
        const r = aplicarStatusLocal(rec({ due_date: '2020-01-01', status: 'CONCILIATED' }), 'PARCIAL', HOJE)!;
        expect(r.status).toBe('CONCILIATED');
        expect(r.effective_status).toBe('PARCIAL');
        expect(aplicarStatusLocal(rec({ due_date: '2020-01-01' }), 'RENEGOCIADO', HOJE)!.effective_status).toBe('RENEGOCIADO');
    });

    it('não muta a linha original', () => {
        const orig = rec({});
        aplicarStatusLocal(orig, 'RECEBIDO', HOJE);
        expect(orig.effective_status).toBe('PREVISTO');
    });
});
