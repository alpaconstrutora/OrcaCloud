/**
 * Comunicados do investidor — o CRUD do gestor (16/11/2026, pedido "portais > portal do investidor >
 * aba comunicados : implementar CRUD"; plano docs/planos/2026-11-16-investidor-comunicados-crud.md).
 *
 * O que estes testes seguram:
 * - "Todas as organizações" (null) lista sem filtro — a RLS recorta (REGRA #5);
 * - gravar que a RLS barrou volta 0 linhas SEM erro: o serviço tem de acusar, senão a tela diz "salvo";
 * - comunicado com aceite/voto não muda nem some — o investidor confirmou AQUELE texto, e o
 *   `ON DELETE CASCADE` apagaria as respostas junto.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Resp = { data: unknown; error: unknown; count?: number | null };

const db = vi.hoisted(() => ({
    calls: [] as { table: string; ops: [string, unknown[]][] }[],
    /** respostas na ordem em que as consultas terminam */
    queue: [] as Resp[],
}));

vi.mock('../../lib/supabase', () => {
    const builder = (table: string) => {
        const entry = { table, ops: [] as [string, unknown[]][] };
        db.calls.push(entry);
        const q: Record<string, unknown> = {};
        for (const m of ['select', 'eq', 'in', 'order', 'not', 'insert', 'update', 'delete', 'is']) {
            q[m] = (...a: unknown[]) => { entry.ops.push([m, a]); return q; };
        }
        const next = () => Promise.resolve(db.queue.shift() ?? { data: [], error: null });
        q.single = () => next();
        q.maybeSingle = () => next();
        q.then = (ok: (r: unknown) => unknown, ko?: (e: unknown) => unknown) => next().then(ok, ko);
        return q;
    };
    return { supabase: { from: (t: string) => builder(t) } };
});

import { announcementsService, AnnouncementBlockedError } from '../../services/announcementsService';

const ops = (i: number) => db.calls[i].ops.map(([m]) => m);
const arg = (i: number, m: string) => db.calls[i].ops.find(([n]) => n === m)?.[1];

beforeEach(() => { db.calls = []; db.queue = []; });

describe('announcementsService.listAll', () => {
    it('"Todas" (null) não filtra por organização e conta as respostas de cada comunicado', async () => {
        db.queue.push(
            { data: [{ id: 'a1', organization_id: 'o1' }, { id: 'a2', organization_id: 'o2' }], error: null },
            { data: [{ announcement_id: 'a1', vote_option: null }, { announcement_id: 'a1', vote_option: 'sim' }], error: null },
        );
        const r = await announcementsService.listAll(null);
        expect(db.calls[0].table).toBe('investor_announcements');
        expect(ops(0)).not.toContain('eq');
        expect(r.find(a => a.id === 'a1')?.ack_count).toBe(2);
        expect(r.find(a => a.id === 'a2')?.ack_count).toBe(0);
    });

    it('com organização no topo, filtra por ela', async () => {
        db.queue.push({ data: [], error: null });
        await announcementsService.listAll('o1');
        expect(arg(0, 'eq')).toEqual(['organization_id', 'o1']);
    });
});

describe('announcementsService.create', () => {
    it('grava rascunho na organização escolhida e devolve com 0 respostas', async () => {
        db.queue.push({ data: { id: 'n1', organization_id: 'o1', title: 'T', published_at: null }, error: null });
        const r = await announcementsService.create('o1', { title: 'T', body: 'B', type: 'aviso', requires_acknowledgment: false }, false);
        expect(arg(0, 'insert')).toEqual([expect.objectContaining({ organization_id: 'o1', title: 'T', published_at: null })]);
        expect(r.ack_count).toBe(0);
    });

    it('"publicar já" grava com data de publicação', async () => {
        db.queue.push({ data: { id: 'n1', published_at: '2026-11-16T12:00:00Z' }, error: null });
        await announcementsService.create('o1', { title: 'T', body: 'B', type: 'aviso', requires_acknowledgment: false }, true);
        const linha = (arg(0, 'insert') as Record<string, unknown>[])[0];
        expect(typeof linha.published_at).toBe('string');
    });
});

describe('announcementsService.update', () => {
    it('recusa editar comunicado que já tem resposta', async () => {
        db.queue.push({ data: null, error: null, count: 1 });
        await expect(announcementsService.update('a1', { title: 'novo' })).rejects.toBeInstanceOf(AnnouncementBlockedError);
        expect(db.calls.some(c => c.ops.some(([m]) => m === 'update'))).toBe(false);
    });

    it('sem resposta: grava e devolve a linha', async () => {
        db.queue.push({ data: null, error: null, count: 0 }, { data: [{ id: 'a1', title: 'novo' }], error: null });
        const r = await announcementsService.update('a1', { title: 'novo' });
        expect(arg(1, 'update')).toEqual([{ title: 'novo' }]);
        expect(r.title).toBe('novo');
    });

    it('0 linhas gravadas (RLS) vira erro de permissão, não "salvo"', async () => {
        db.queue.push({ data: null, error: null, count: 0 }, { data: [], error: null });
        await expect(announcementsService.update('a1', { title: 'novo' })).rejects.toThrow(/dono ou um administrador/);
    });
});

describe('announcementsService.publish', () => {
    it('marca a data de publicação e devolve a linha', async () => {
        db.queue.push({ data: [{ id: 'a1', published_at: '2026-11-16T12:00:00Z' }], error: null });
        const r = await announcementsService.publish('a1');
        expect(Object.keys((arg(0, 'update') as Record<string, unknown>[])[0])).toEqual(['published_at']);
        expect(r.published_at).toBeTruthy();
    });

    it('0 linhas (RLS) vira erro de permissão', async () => {
        db.queue.push({ data: [], error: null });
        await expect(announcementsService.publish('a1')).rejects.toThrow(/dono ou um administrador/);
    });
});

describe('announcementsService.remove', () => {
    it('recusa excluir comunicado que já tem resposta (o CASCADE apagaria aceites e votos)', async () => {
        db.queue.push({ data: null, error: null, count: 3 });
        await expect(announcementsService.remove('a1')).rejects.toBeInstanceOf(AnnouncementBlockedError);
        expect(db.calls.some(c => c.ops.some(([m]) => m === 'delete'))).toBe(false);
    });

    it('sem resposta: exclui', async () => {
        db.queue.push({ data: null, error: null, count: 0 }, { data: [{ id: 'a1' }], error: null });
        await announcementsService.remove('a1');
        expect(ops(1)).toContain('delete');
        expect(arg(1, 'eq')).toEqual(['id', 'a1']);
    });

    it('0 linhas excluídas (RLS) vira erro de permissão', async () => {
        db.queue.push({ data: null, error: null, count: 0 }, { data: [], error: null });
        await expect(announcementsService.remove('a1')).rejects.toThrow(/dono ou um administrador/);
    });
});

describe('announcementsService.listResponses', () => {
    it('traz o nome do investidor de cada resposta', async () => {
        db.queue.push({ data: [{ id: 'k1', investor_id: 'i1', acknowledged_at: '2026-11-16T10:00:00Z', vote_option: 'sim', investors: { name: 'Tiago' } }], error: null });
        const r = await announcementsService.listResponses('a1');
        expect(r[0]).toMatchObject({ investor_name: 'Tiago', vote_option: 'sim' });
    });
});
