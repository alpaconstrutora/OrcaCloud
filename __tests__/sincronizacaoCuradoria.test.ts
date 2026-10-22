import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Aba Sincronização × Curadoria (docs/planos/2026-10-20-empreendimento-aba-sincronizacao.md, item 1).
 *
 * O defeito: o ensaio contava todo conflito como "a atualizar". "Trazer" manda o conflito à
 * Curadoria SEM gravar, então na próxima abertura ele era contado de novo — e o rejeitado ficava
 * contado para sempre. Somava-se a isso o upsert `ignoreDuplicates`, que ignorava a proposta
 * aplicada/obsoleta de mesma identidade: o conflito de volta nunca mais chegava à Curadoria.
 */

// Banco falso só com o que o serviço usa: leitura por hash, update por id, upsert.
const banco = vi.hoisted(() => ({
    linhas: [] as Array<Record<string, unknown>>,
    updates: [] as Array<{ patch: Record<string, unknown>; id: unknown }>,
    upserts: [] as Array<Record<string, unknown>>,
}));

vi.mock('../lib/supabase', () => {
    const from = () => {
        const filtros: Record<string, unknown> = {};
        let patch: Record<string, unknown> | null = null;
        let linhasUpsert: Array<Record<string, unknown>> | null = null;
        const q: any = {
            select: () => q,
            eq: (col: string, v: unknown) => { filtros[col] = v; return q; },
            in: (_col: string, hashes: string[]) => Promise.resolve({
                data: banco.linhas.filter(l => hashes.includes(l.proposal_hash as string)),
                error: null,
            }),
            update: (p: Record<string, unknown>) => { patch = p; return q; },
            upsert: (rows: Array<Record<string, unknown>>) => { linhasUpsert = rows; return q; },
            then: (resolve: (v: unknown) => void) => {
                if (patch) banco.updates.push({ patch, id: filtros.id });
                if (linhasUpsert) {
                    // ON CONFLICT DO NOTHING pela identidade: só entra o hash que não existe.
                    const novas = linhasUpsert.filter(r => !banco.linhas.some(l => l.proposal_hash === r.proposal_hash));
                    banco.upserts.push(...novas);
                    return resolve({ data: novas.map((_, i) => ({ id: `nova_${i}` })), error: null });
                }
                return resolve({ data: null, error: null });
            },
        };
        return q;
    };
    return { supabase: { from } };
});
vi.mock('../services/empreendimentoAuditService', () => ({ empreendimentoAuditService: { record: vi.fn(), recordMany: vi.fn() } }));

import { empreendimentoProposalService } from '../services/empreendimentoProposalService';
import { relatorioDoPlano } from '../services/sync/relatorio';
import { proposalHash } from '../services/sync/hash';
import type { CanonicalSide, FieldChange, SyncPlan } from '../services/sync/types';
import type { Empreendimento } from '../types/empreendimento';

const conflito = (entityId: string, field: string, to: unknown, from: unknown = 1): FieldChange => ({
    entity: 'unit', entityId, field, label: field, group: 'estrutura', kind: 'conflict', origin: 'massa',
    from, to, sourceRef: {},
} as unknown as FieldChange);

const linha = (c: FieldChange, status: string, id = `p_${c.entityId}_${c.field}`) => ({
    id, origin: c.origin, entity: c.entity, entity_id: c.entityId, field: c.field, status,
    proposal_hash: proposalHash({ empreendimentoId: 'emp1', origin: c.origin, entity: c.entity, entityId: c.entityId, field: c.field, proposedValue: c.to }),
});

beforeEach(() => {
    banco.linhas = [];
    banco.updates = [];
    banco.upserts = [];
});

describe('classificarConflitos', () => {
    it('separa novo, pendente, rejeitado — e trata aplicado/obsoleto como novo', async () => {
        const novo = conflito('u1', 'bedrooms', 3);
        const pendente = conflito('u2', 'bedrooms', 2);
        const rejeitado = conflito('u3', 'bedrooms', 4);
        const aplicadoDeVolta = conflito('u4', 'bedrooms', 1);
        const obsoletoDeVolta = conflito('u5', 'bedrooms', 5);
        banco.linhas = [linha(pendente, 'pending'), linha(rejeitado, 'rejected'), linha(aplicadoDeVolta, 'applied'), linha(obsoletoDeVolta, 'superseded')];

        const r = await empreendimentoProposalService.classificarConflitos('emp1', [novo, pendente, rejeitado, aplicadoDeVolta, obsoletoDeVolta]);
        expect(r.novos.map(c => c.entityId)).toEqual(['u1', 'u4', 'u5']);
        expect(r.pendentes.map(c => c.entityId)).toEqual(['u2']);
        expect(r.rejeitados.map(c => c.entityId)).toEqual(['u3']);
    });

    it('valor proposto DIFERENTE do rejeitado é conflito novo (a origem mudou)', async () => {
        banco.linhas = [linha(conflito('u1', 'bedrooms', 3), 'rejected')];
        const r = await empreendimentoProposalService.classificarConflitos('emp1', [conflito('u1', 'bedrooms', 4)]);
        expect(r.novos).toHaveLength(1);
        expect(r.rejeitados).toHaveLength(0);
    });
});

describe('materializeConflicts', () => {
    it('reabre a proposta aplicada/obsoleta como pendente e não mexe na rejeitada', async () => {
        const aplicado = conflito('u1', 'bedrooms', 3, 2);
        const obsoleto = conflito('u2', 'bedrooms', 2, 1);
        const rejeitado = conflito('u3', 'bedrooms', 4);
        const novo = conflito('u4', 'bedrooms', 5);
        banco.linhas = [linha(aplicado, 'applied', 'p_apl'), linha(obsoleto, 'superseded', 'p_obs'), linha(rejeitado, 'rejected', 'p_rej')];

        const n = await empreendimentoProposalService.materializeConflicts('emp1', 'org1', [aplicado, obsoleto, rejeitado, novo]);

        expect(banco.updates.map(u => u.id).sort()).toEqual(['p_apl', 'p_obs']);
        const reaberta = banco.updates.find(u => u.id === 'p_apl')!.patch;
        expect(reaberta).toMatchObject({ status: 'pending', current_value: 2, decided_at: null, applied_value: null });
        expect(banco.upserts.map(r => r.entity_id)).toEqual(['u4']);
        expect(n).toBe(3); // 2 reabertas + 1 nova
    });
});

describe('relatorioDoPlano', () => {
    const lado = { origin: 'massa', empreendimento: { id: 'emp1' } as unknown as Empreendimento, towers: [], commonAreaCandidates: [], liveTowerSourceIds: new Set(), liveUnitSourceIds: new Set(), warnings: [] } as unknown as CanonicalSide;
    const fill = { ...conflito('u9', 'private_area', 70), kind: 'fill' } as FieldChange;
    const plano = (conflicts: FieldChange[]): SyncPlan => ({
        empreendimentoId: 'emp1', towerCreates: [], unitCreates: [], fills: [fill], conflicts,
        orphanTowers: [], orphanUnits: [], adoptions: [], commonAreaCreates: [], warnings: [],
    } as unknown as SyncPlan);

    it('"a atualizar" conta só o que é gravado (fills); conflitos ficam à parte', () => {
        const c = [conflito('u1', 'bedrooms', 3), conflito('u2', 'bedrooms', 2), conflito('u3', 'bedrooms', 4)];
        const r = relatorioDoPlano(lado, plano(c), { novos: [c[0]], pendentes: [c[1]], rejeitados: [c[2]] });
        expect(r.unitsUpdated).toBe(1); // só u9, do fill
        expect(r.conflitosNovos).toBe(1);
        expect(r.conflitosNaCuradoria).toBe(1);
        expect(r.conflitosRejeitados).toBe(1);
    });

    it('repassa "sem versão publicada" da origem', () => {
        expect(relatorioDoPlano({ ...lado, semVersaoPublicada: true } as CanonicalSide, plano([])).semVersaoPublicada).toBe(true);
        expect(relatorioDoPlano(lado, plano([])).semVersaoPublicada).toBe(false);
    });

    it('conflito pendente ou rejeitado não é trabalho: com eles só, nada a trazer', () => {
        const c = [conflito('u1', 'bedrooms', 3)];
        const semFill = { ...plano(c), fills: [] } as SyncPlan;
        const r = relatorioDoPlano(lado, semFill, { novos: [], pendentes: c, rejeitados: [] });
        const total = r.towersCreated + r.towersUpdated + r.unitsCreated + r.unitsUpdated + (r.conflitosNovos ?? 0);
        expect(total).toBe(0);
        expect(r.conflitosNaCuradoria).toBe(1);
    });
});
