// services/sync/writeBackImovib.ts
//
// Realimentação Empreendimento → Viabilidade (Imovib) que CRIA o que falta.
//
// O write-back antigo só atualizava instâncias que já tinham vínculo (imovib_instance_id) —
// então uma torre/unidade nascida no empreendimento nunca chegava ao estudo, e o botão
// "Enviar ao estudo" ficava permanentemente apagado. Aqui o empreendimento é a fonte: o que
// só existe nele é CRIADO no estudo (bloco e/ou instância) e ganha a proveniência de volta,
// para o próximo write-back reconhecer em vez de duplicar.
//
// Regra preservada do módulo: só estrutura (nome, pavimento, área, posição, orientação).
// NUNCA preço nem status de venda — a simulação do estudo permanece independente do
// realizado. Na criação, price/status entram no default do estudo (0 / DISPONÍVEL), não
// vêm do empreendimento.

import { imovibService } from '../imovibService';
import { empreendimentoService, loadTargetState } from '../empreendimentoService';
import { Empreendimento, EmpreendimentoTower, EmpreendimentoUnit } from '../../types/empreendimento';
import { ImovibUnitInstance, ImovibUnitInstanceInsert } from '../../types/imovib';

/** Um campo estrutural propagado ao estudo. `from` = valor atual no estudo (null na criação). */
export interface WriteBackFieldChange {
    field: string;
    label: string;
    from: unknown;
    to: unknown;
}

/** Uma unidade a enviar. `unitId` é a chave de seleção da UI. */
export interface WriteBackItem {
    unitId: string;
    unitName: string;
    towerId: string;
    towerName: string;
    kind: 'update' | 'create';
    /** Enviar esta unidade cria antes o bloco da torre no estudo (torre sem imovib_block_id). */
    createsBlock: boolean;
    instanceId?: string;
    changes: WriteBackFieldChange[];
}

export interface WriteBackResult {
    blocksCreated: number;
    instancesCreated: number;
    instancesUpdated: number;
}

const FIELD_LABELS: Record<string, string> = {
    name: 'Nome', floor: 'Pavimento', private_area: 'Área privativa',
    position_type: 'Posição', sun_orientation: 'Orientação solar',
};

/** Só os campos estruturais divergentes de uma unidade já vinculada. */
function updateChanges(u: EmpreendimentoUnit, inst: ImovibUnitInstance): WriteBackFieldChange[] {
    const out: WriteBackFieldChange[] = [];
    const push = (field: string, from: unknown, to: unknown) => out.push({ field, label: FIELD_LABELS[field], from, to });
    if (u.name && u.name !== inst.name) push('name', inst.name, u.name);
    if (u.floor != null && u.floor !== inst.floor) push('floor', inst.floor, u.floor);
    if (u.private_area != null && u.private_area !== inst.private_area) push('private_area', inst.private_area, u.private_area);
    if (u.position_type && u.position_type !== inst.position_type) push('position_type', inst.position_type, u.position_type);
    if (u.sun_orientation && u.sun_orientation !== inst.sun_orientation) push('sun_orientation', inst.sun_orientation, u.sun_orientation);
    return out;
}

/** Os valores estruturais que uma unidade nova leva ao estudo (from = null: não existe lá). */
function createChanges(u: EmpreendimentoUnit): WriteBackFieldChange[] {
    const out: WriteBackFieldChange[] = [];
    const push = (field: string, to: unknown) => { if (to != null && to !== '') out.push({ field, label: FIELD_LABELS[field], from: null, to }); };
    push('name', u.name);
    push('floor', u.floor);
    push('private_area', u.private_area);
    push('position_type', u.position_type);
    push('sun_orientation', u.sun_orientation);
    return out;
}

async function load(empreendimentoId: string): Promise<{
    empreendimento: Empreendimento;
    studyId: string;
    instanceById: Map<string, ImovibUnitInstance>;
    towers: EmpreendimentoTower[];
    units: EmpreendimentoUnit[];
}> {
    const empreendimento = await empreendimentoService.getById(empreendimentoId) as Empreendimento | null;
    if (!empreendimento) throw new Error('Empreendimento não encontrado.');
    if (!empreendimento.imovib_study_id) {
        throw new Error('Este empreendimento não está vinculado a um estudo de viabilidade (Imovib).');
    }
    const [instances, target] = await Promise.all([
        imovibService.getUnitInstances(empreendimento.imovib_study_id),
        loadTargetState(empreendimentoId),
    ]);
    return {
        empreendimento,
        studyId: empreendimento.imovib_study_id,
        instanceById: new Map(instances.map(i => [i.id, i])),
        towers: target.towers,
        units: target.units,
    };
}

/** Dry-run: o que seria atualizado e o que seria criado no estudo, por unidade. */
export async function previewWriteBackImovib(empreendimentoId: string): Promise<WriteBackItem[]> {
    const { instanceById, towers, units } = await load(empreendimentoId);
    const towerById = new Map(towers.map(t => [t.id, t]));
    const items: WriteBackItem[] = [];

    for (const u of units) {
        const tower = towerById.get(u.tower_id);
        if (!tower) continue;
        const base = { unitId: u.id, unitName: u.name, towerId: tower.id, towerName: tower.name };

        if (u.imovib_instance_id) {
            const inst = instanceById.get(u.imovib_instance_id);
            if (!inst) continue; // órfão — instância sumiu do estudo, nunca reescreve
            const changes = updateChanges(u, inst);
            if (changes.length > 0) {
                items.push({ ...base, kind: 'update', createsBlock: false, instanceId: inst.id, changes });
            }
        } else {
            // Não vinculada: será criada no estudo. Se a torre não tem bloco, criar a unidade
            // implica criar o bloco antes.
            items.push({ ...base, kind: 'create', createsBlock: !tower.imovib_block_id, changes: createChanges(u) });
        }
    }
    return items;
}

/** Aplica o write-back só das unidades selecionadas, criando bloco/instância e gravando a proveniência. */
export async function applyWriteBackImovib(empreendimentoId: string, selectedUnitIds: string[]): Promise<WriteBackResult> {
    const { studyId, instanceById, towers, units } = await load(empreendimentoId);
    const selected = new Set(selectedUnitIds);
    const towerById = new Map(towers.map(t => [t.id, t]));
    const result: WriteBackResult = { blocksCreated: 0, instancesCreated: 0, instancesUpdated: 0 };

    // Cache do block_id por torre — vale para todas as unidades da mesma torre nesta rodada.
    const blockIdByTower = new Map<string, string>();
    for (const t of towers) if (t.imovib_block_id) blockIdByTower.set(t.id, t.imovib_block_id);

    for (const u of units) {
        if (!selected.has(u.id)) continue;
        const tower = towerById.get(u.tower_id);
        if (!tower) continue;

        if (u.imovib_instance_id) {
            // Update: só os campos estruturais divergentes.
            const inst = instanceById.get(u.imovib_instance_id);
            if (!inst) continue;
            const changes = updateChanges(u, inst);
            if (changes.length === 0) continue;
            const fields: Partial<ImovibUnitInstanceInsert> = {};
            for (const c of changes) (fields as any)[c.field] = c.to;
            await imovibService.updateUnitInstance(inst.id, fields);
            result.instancesUpdated++;
            continue;
        }

        // Create: garantir o bloco da torre primeiro.
        let blockId = blockIdByTower.get(tower.id);
        if (!blockId) {
            const block = await imovibService.createBlock({
                study_id: studyId,
                name: tower.name,
                construction_cost_sqm: tower.construction_cost_sqm ?? 0,
                sales_price_sqm: tower.sales_price_sqm ?? 0,
            });
            blockId = block.id;
            blockIdByTower.set(tower.id, blockId);
            await empreendimentoService.updateTower(tower.id, { imovib_block_id: blockId });
            result.blocksCreated++;
        }

        // Criar a instância — só estrutura. price/status ficam no default do estudo.
        const [created] = await imovibService.createUnitInstances([{
            study_id: studyId,
            block_id: blockId,
            name: u.name,
            floor: u.floor ?? 1,
            private_area: u.private_area ?? 0,
            position_type: u.position_type ?? 'LATERAL',
            sun_orientation: u.sun_orientation ?? 'NORTE',
            price: 0,
            status: 'DISPONÍVEL',
        }]);
        if (created) {
            await empreendimentoService.updateUnit(u.id, { imovib_instance_id: created.id });
            result.instancesCreated++;
        }
    }

    return result;
}
