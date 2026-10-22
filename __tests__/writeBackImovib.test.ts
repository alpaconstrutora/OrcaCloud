import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Realimentação Empreendimento → Estudo de Viabilidade (Imovib).
 * Plano docs/planos/2026-10-12-imovib-viabilidade-correcoes.md, itens 4.1 e 4.3.
 */

const imovib = vi.hoisted(() => ({
    getStudyById: vi.fn(),
    getUnitInstances: vi.fn(),
    getBlocksByStudyId: vi.fn(),
    createBlock: vi.fn(),
    createUnitInstances: vi.fn(),
    updateUnitInstance: vi.fn(),
}));
const emp = vi.hoisted(() => ({
    getById: vi.fn(),
    updateTower: vi.fn(),
    updateUnit: vi.fn(),
    loadTargetState: vi.fn(),
}));

const audit = vi.hoisted(() => ({ record: vi.fn() }));

vi.mock('../services/imovibService', () => ({ imovibService: imovib }));
vi.mock('../services/empreendimentoAuditService', () => ({ empreendimentoAuditService: audit }));
vi.mock('../services/empreendimentoService', () => ({
    empreendimentoService: { getById: emp.getById, updateTower: emp.updateTower, updateUnit: emp.updateUnit },
    loadTargetState: emp.loadTargetState,
}));

import { applyWriteBackImovib, previewWriteBackImovib } from '../services/sync/writeBackImovib';

const EMP = { id: 'emp1', organization_id: 'org_spe', imovib_study_id: 'est1' };
const torre = (over = {}) => ({ id: 't1', name: 'Torre A', imovib_block_id: null, construction_cost_sqm: 3000, sales_price_sqm: 8000, ...over });
const unidade = (over = {}) => ({ id: 'u1', tower_id: 't1', name: 'Apto 101', floor: 1, private_area: 70, position_type: 'FRENTE', sun_orientation: 'NORTE', imovib_instance_id: null, ...over });

beforeEach(() => {
    vi.clearAllMocks();
    emp.getById.mockResolvedValue(EMP);
    imovib.getStudyById.mockResolvedValue({ id: 'est1', organization_id: 'org_spe' });
    imovib.getUnitInstances.mockResolvedValue([]);
    imovib.getBlocksByStudyId.mockResolvedValue([]);
    imovib.createBlock.mockResolvedValue({ id: 'bloco_novo' });
    imovib.createUnitInstances.mockResolvedValue([{ id: 'inst_nova' }]);
    emp.loadTargetState.mockResolvedValue({ towers: [torre()], units: [unidade()] });
});

describe('4.1 — estudo de outra organização bloqueia o envio', () => {
    it('apply recusa e não grava nada no estudo', async () => {
        imovib.getStudyById.mockResolvedValue({ id: 'est1', organization_id: 'org_alpa' });
        await expect(applyWriteBackImovib('emp1', ['u1'])).rejects.toThrow(/outra organização/);
        expect(imovib.createBlock).not.toHaveBeenCalled();
        expect(imovib.createUnitInstances).not.toHaveBeenCalled();
        expect(imovib.updateUnitInstance).not.toHaveBeenCalled();
        expect(emp.updateTower).not.toHaveBeenCalled();
        expect(emp.updateUnit).not.toHaveBeenCalled();
    });

    it('a prévia também recusa', async () => {
        imovib.getStudyById.mockResolvedValue({ id: 'est1', organization_id: 'org_alpa' });
        await expect(previewWriteBackImovib('emp1')).rejects.toThrow(/outra organização/);
    });

    it('mesma organização: cria bloco e instância e grava a proveniência', async () => {
        const r = await applyWriteBackImovib('emp1', ['u1']);
        expect(r).toMatchObject({ blocksCreated: 1, instancesCreated: 1, blocksAdopted: 0, instancesAdopted: 0 });
        expect(emp.updateTower).toHaveBeenCalledWith('t1', { imovib_block_id: 'bloco_novo' });
        expect(emp.updateUnit).toHaveBeenCalledWith('u1', { imovib_instance_id: 'inst_nova' });
    });
});

describe('o envio entra no Histórico (a aba Sincronização tira dali o "Último envio ao estudo")', () => {
    it('grava um evento publish/sync_imovib com o resultado', async () => {
        await applyWriteBackImovib('emp1', ['u1']);
        expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
            empreendimentoId: 'emp1', organizationId: 'org_spe', entityType: 'study_link', entityId: 'est1',
            action: 'publish', source: 'sync_imovib',
            metadata: expect.objectContaining({ unidadesSelecionadas: 1, blocksCreated: 1, instancesCreated: 1 }),
        }));
    });

    it('envio recusado (outra organização) não registra nada', async () => {
        imovib.getStudyById.mockResolvedValue({ id: 'est1', organization_id: 'org_alpa' });
        await expect(applyWriteBackImovib('emp1', ['u1'])).rejects.toThrow();
        expect(audit.record).not.toHaveBeenCalled();
    });
});

describe('4.3 — reenvio depois de falha no meio não duplica', () => {
    it('bloco criado numa rodada anterior e não vinculado é ADOTADO', async () => {
        // Rodada anterior: createBlock passou, updateTower falhou → bloco órfão no estudo.
        imovib.getBlocksByStudyId.mockResolvedValue([{ id: 'bloco_orfao', name: 'Torre A' }]);
        const r = await applyWriteBackImovib('emp1', ['u1']);
        expect(imovib.createBlock).not.toHaveBeenCalled();
        expect(emp.updateTower).toHaveBeenCalledWith('t1', { imovib_block_id: 'bloco_orfao' });
        expect(r.blocksAdopted).toBe(1);
        expect(r.blocksCreated).toBe(0);
    });

    it('instância criada e não vinculada é ADOTADA', async () => {
        emp.loadTargetState.mockResolvedValue({ towers: [torre({ imovib_block_id: 'b1' })], units: [unidade()] });
        imovib.getUnitInstances.mockResolvedValue([{ id: 'inst_orfa', block_id: 'b1', name: 'Apto 101' }]);
        const r = await applyWriteBackImovib('emp1', ['u1']);
        expect(imovib.createUnitInstances).not.toHaveBeenCalled();
        expect(emp.updateUnit).toHaveBeenCalledWith('u1', { imovib_instance_id: 'inst_orfa' });
        expect(r.instancesAdopted).toBe(1);
    });

    it('bloco de mesmo nome JÁ vinculado a outra torre não é adotado', async () => {
        emp.loadTargetState.mockResolvedValue({
            towers: [torre(), torre({ id: 't2', name: 'Torre A', imovib_block_id: 'bloco_da_t2' })],
            units: [unidade()],
        });
        imovib.getBlocksByStudyId.mockResolvedValue([{ id: 'bloco_da_t2', name: 'Torre A' }]);
        await applyWriteBackImovib('emp1', ['u1']);
        expect(imovib.createBlock).toHaveBeenCalledTimes(1);
    });
});
