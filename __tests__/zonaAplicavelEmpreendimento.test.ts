/**
 * Zona aplicável do empreendimento (plano docs/planos/2026-10-26-zona-aplicavel-do-empreendimento.md).
 *
 * Pedido: "como seleciono um item do mapa regulatorio?" → "a+b juntos". O empreendimento
 * marca UMA zona como a que vale (índice único parcial no banco); a importação pode
 * SUBSTITUIR as zonas atuais, e aí as antigas saem em lote.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Chamada = { tabela: string; op: string; args: unknown[] }[];
const { chamadas, falharEm, audit } = vi.hoisted(() => ({
    chamadas: [] as Chamada[],
    falharEm: { op: '' as string },
    audit: { record: vi.fn(async () => undefined), recordMany: vi.fn(async () => undefined), recordDiff: vi.fn(async () => undefined) },
}));

// Builder encadeável que grava a cadeia inteira de cada consulta e resolve como o PostgREST.
vi.mock('../lib/supabase', () => ({
    supabase: {
        from: (tabela: string) => {
            const cadeia: Chamada = [];
            chamadas.push(cadeia);
            const b: Record<string, unknown> = {};
            for (const op of ['select', 'update', 'delete', 'insert', 'eq', 'neq', 'in', 'order', 'maybeSingle', 'single']) {
                b[op] = (...args: unknown[]) => { cadeia.push({ tabela, op, args }); return b; };
            }
            b.then = (ok: (r: unknown) => unknown) => {
                const erro = cadeia.some(c => c.op === falharEm.op) ? { message: 'recusado' } : null;
                return Promise.resolve({ data: null, error: erro }).then(ok);
            };
            return b;
        },
    },
}));
vi.mock('../services/empreendimentoAuditService', () => ({ empreendimentoAuditService: audit }));

import { empreendimentoService } from '../services/empreendimentoService';

const ops = (c: Chamada) => c.map(x => x.op);
const argsDe = (c: Chamada, op: string) => c.find(x => x.op === op)?.args;

beforeEach(() => {
    chamadas.length = 0;
    falharEm.op = '';
    vi.clearAllMocks();
});

describe('marcarZonaAplicavel', () => {
    it('desmarca a atual ANTES de marcar a nova (o índice único recusaria duas marcadas)', async () => {
        await empreendimentoService.marcarZonaAplicavel('emp-1', 'z-nova', 'org-1');

        const updates = chamadas.filter(c => c[0]?.tabela === 'empreendimento_regulatory_zones' && ops(c).includes('update'));
        expect(updates).toHaveLength(2);
        const [desmarca, marca] = updates;
        expect(argsDe(desmarca, 'update')).toEqual([{ aplicavel: false }]);
        expect(desmarca).toEqual(expect.arrayContaining([
            expect.objectContaining({ op: 'eq', args: ['empreendimento_id', 'emp-1'] }),
            expect.objectContaining({ op: 'eq', args: ['aplicavel', true] }),
        ]));
        expect(argsDe(marca, 'update')).toEqual([{ aplicavel: true }]);
        expect(marca).toEqual(expect.arrayContaining([expect.objectContaining({ op: 'eq', args: ['id', 'z-nova'] })]));
    });

    it('null só desmarca', async () => {
        await empreendimentoService.marcarZonaAplicavel('emp-1', null, 'org-1');
        const updates = chamadas.filter(c => ops(c).includes('update'));
        expect(updates).toHaveLength(1);
        expect(argsDe(updates[0], 'update')).toEqual([{ aplicavel: false }]);
    });

    it('fica no Histórico do empreendimento', async () => {
        await empreendimentoService.marcarZonaAplicavel('emp-1', 'z-nova', 'org-1');
        expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
            empreendimentoId: 'emp-1', organizationId: 'org-1', entityType: 'regulatory_zone', entityId: 'z-nova',
        }));
    });

    it('recusa do banco vira erro (a tela desfaz a marca)', async () => {
        falharEm.op = 'update';
        await expect(empreendimentoService.marcarZonaAplicavel('emp-1', 'z-nova', 'org-1')).rejects.toThrow(/recusado/);
    });
});

describe('deleteRegulatoryZones (lote)', () => {
    it('175 zonas: apaga em pedaços de 100 e registra UM insert de auditoria', async () => {
        const ids = Array.from({ length: 175 }, (_, i) => `z${i}`);
        await empreendimentoService.deleteRegulatoryZones(ids, { empreendimentoId: 'emp-1', organizationId: 'org-1' });

        const deletes = chamadas.filter(c => ops(c).includes('delete'));
        expect(deletes).toHaveLength(2);
        expect((argsDe(deletes[0], 'in') as [string, string[]])[1]).toHaveLength(100);
        expect((argsDe(deletes[1], 'in') as [string, string[]])[1]).toHaveLength(75);
        expect(audit.recordMany).toHaveBeenCalledTimes(1);
        expect((audit.recordMany.mock.calls[0] as unknown as [unknown[]])[0]).toHaveLength(175);
    });

    it('lista vazia: não toca no banco', async () => {
        await empreendimentoService.deleteRegulatoryZones([], { empreendimentoId: 'emp-1', organizationId: 'org-1' });
        expect(chamadas).toHaveLength(0);
    });
});
