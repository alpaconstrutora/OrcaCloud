// services/sync/planner.ts
//
// O planner ÚNICO. Casa o lado canônico (origem) com o estado do Empreendimento (destino)
// pelas colunas de proveniência, e classifica cada campo do registry num balde.
//
// Função pura: recebe origem + destino, devolve o plano. Não toca no banco — o que permite
// testá-lo com fixtures e, principalmente, garantir que preview e apply usem O MESMO plano
// (antes cada um recalculava o seu, e o usuário confirmava um número que não era o aplicado).

import { EmpreendimentoTower, EmpreendimentoTowerInsert, EmpreendimentoUnitInsert } from '../../types/empreendimento';
import { classify } from './diff';
import { specsFor } from './fieldRegistry';
import {
    CanonicalSide, CanonicalTower, CanonicalUnit, FieldChange, PROVENANCE,
    SyncPlan, TargetState, TowerCreate, UnitCreate,
} from './types';

export interface PlanOptions {
    /**
     * Descarta a proteção do estado comercial local (preço/status) — o checkbox
     * "Sobrescrever também status e preço" do SyncFromStudyModal.
     *
     * Existe só enquanto a inbox de curadoria não existe: hoje um campo comercial divergente
     * é sobrescrito ou preservado por uma heurística global. Quando o usuário puder decidir
     * campo a campo, esta opção e a heurística somem juntas.
     */
    overwriteCommercialState?: boolean;
}

/** Nome da torre nova: próxima letra livre. Só na criação — depois o nome é do usuário. */
function nextTowerName(taken: Set<string>): string {
    for (let i = 0; i < 26; i++) {
        const candidate = `Torre ${String.fromCharCode(65 + i)}`;
        if (!taken.has(candidate.toUpperCase())) return candidate;
    }
    return `Torre ${taken.size + 1}`;
}

/**
 * Estado comercial local = o Empreendimento já sabe algo que o estudo não sabe.
 * Heurística herdada (empreendimentoService:946-948), preservada nesta fase.
 */
function hasLocalCommercial(existing: { status?: string; price?: number | null; commercial_property_id?: string | null }): boolean {
    return existing.status !== 'DISPONIVEL' || existing.price != null || !!existing.commercial_property_id;
}

/** Monta o insert de uma unidade nova: campos do diff + os create-only da origem. */
function unitInsert(cu: CanonicalUnit): Omit<EmpreendimentoUnitInsert, 'tower_id'> {
    return { status: 'DISPONIVEL', ...cu.fields, ...cu.createOnly } as Omit<EmpreendimentoUnitInsert, 'tower_id'>;
}

export function buildPlan(side: CanonicalSide, target: TargetState, opts: PlanOptions = {}): SyncPlan {
    const { towerKey, unitKey } = PROVENANCE[side.origin];

    const plan: SyncPlan = {
        empreendimentoId: side.empreendimento.id,
        origin: side.origin,
        builtAt: new Date().toISOString(),
        towerCreates: [], unitCreates: [], commonAreaCreates: [],
        fills: [], conflicts: [],
        orphanTowers: [], orphanUnits: [],
        preservedUnitNames: [],
        warnings: [...side.warnings],
    };

    const towerBySource = new Map<string, EmpreendimentoTower>();
    for (const t of target.towers) {
        const src = t[towerKey];
        if (src) towerBySource.set(src, t);
    }
    const unitBySource = new Map(
        target.units.filter(u => u[unitKey]).map(u => [u[unitKey] as string, u]),
    );

    const takenNames = new Set(target.towers.map(t => t.name.trim().toUpperCase()));
    const towerSpecs = specsFor(side.origin, 'tower');
    const unitSpecs = specsFor(side.origin, 'unit');

    for (const ct of side.towers) {
        const existingTower = towerBySource.get(ct.sourceId);

        if (!existingTower) {
            // ── Torre nova: tudo é `create`, nada a decidir ──────────────────
            const name = (ct.createOnly.name as string) ?? nextTowerName(takenNames);
            takenNames.add(name.trim().toUpperCase());

            const units = ct.units.length > 0
                ? ct.units.map(unitInsert)
                : (ct.typologyFallback?.units ?? []);
            if (ct.units.length === 0 && ct.typologyFallback) plan.warnings.push(ct.typologyFallback.warning);

            plan.towerCreates.push({
                sourceId: ct.sourceId,
                insert: {
                    empreendimento_id: side.empreendimento.id,
                    ...ct.fields, ...ct.createOnly, name,
                    sort_order: target.towers.length + plan.towerCreates.length,
                } as EmpreendimentoTowerInsert,
                units,
            });
            continue;
        }

        // ── Torre existente: diff campo a campo ─────────────────────────────
        pushFieldChanges(plan, {
            entity: 'tower', entityId: existingTower.id, origin: side.origin,
            existing: existingTower as unknown as Record<string, unknown>,
            proposed: ct.fields,
            specs: towerSpecs,
            sourceRef: { [towerKey]: ct.sourceId },
        });

        const towerUnits = target.units.filter(u => u.tower_id === existingTower.id);

        if (ct.units.length === 0 && ct.typologyFallback) {
            // Fallback só regenera torre vazia — senão duplicaria o que já existe.
            if (towerUnits.length === 0) {
                plan.warnings.push(ct.typologyFallback.warning);
                for (const insert of ct.typologyFallback.units) {
                    plan.unitCreates.push({ towerId: existingTower.id, insert });
                }
            } else {
                plan.warnings.push(ct.typologyFallback.warningIfHasUnits);
            }
            continue;
        }

        for (const cu of ct.units) {
            const existingUnit = unitBySource.get(cu.sourceId);
            if (!existingUnit) {
                plan.unitCreates.push({ towerId: existingTower.id, insert: unitInsert(cu) });
                continue;
            }

            // Proteção do estado comercial local (some junto com a heurística na inbox).
            const skipCommercial = !opts.overwriteCommercialState && hasLocalCommercial(existingUnit);
            const specs = skipCommercial ? unitSpecs.filter(s => s.group !== 'comercial') : unitSpecs;

            pushFieldChanges(plan, {
                entity: 'unit', entityId: existingUnit.id, origin: side.origin,
                existing: existingUnit as unknown as Record<string, unknown>,
                proposed: cu.fields,
                specs,
                sourceRef: { [unitKey]: cu.sourceId },
            });

            // Só reporta "preservada" se o comercial realmente divergia — senão a tela
            // acusaria proteção onde não havia o que proteger.
            if (skipCommercial && commercialWouldChange(existingUnit as unknown as Record<string, unknown>, cu, unitSpecs)) {
                plan.preservedUnitNames.push(existingUnit.name);
            }
        }
    }

    // Áreas comuns: só as que ainda não existem (casadas por nome, como antes).
    const existingAreaNames = new Set(target.commonAreas.map(a => (a.name || '').toLowerCase()));
    for (const cand of side.commonAreaCandidates) {
        const key = (cand.name || '').toLowerCase();
        if (existingAreaNames.has(key)) continue;
        existingAreaNames.add(key);
        plan.commonAreaCreates.push(cand);
    }

    // Órfãos: proveniência que sumiu da origem. Reportados, NUNCA auto-deletados.
    plan.orphanTowers = target.towers.filter(t => t[towerKey] && !side.liveTowerSourceIds.has(t[towerKey] as string));
    plan.orphanUnits = target.units.filter(u => u[unitKey] && !side.liveUnitSourceIds.has(u[unitKey] as string));

    return plan;
}

function commercialWouldChange(existing: Record<string, unknown>, cu: CanonicalUnit, allSpecs: ReturnType<typeof specsFor>): boolean {
    return allSpecs
        .filter(s => s.group === 'comercial')
        .some(s => classify(existing[s.field], cu.fields[s.field], s) === 'conflict');
}

function pushFieldChanges(plan: SyncPlan, args: {
    entity: 'tower' | 'unit';
    entityId: string;
    origin: CanonicalSide['origin'];
    existing: Record<string, unknown>;
    proposed: Record<string, unknown>;
    specs: ReturnType<typeof specsFor>;
    sourceRef: Record<string, string>;
}): void {
    for (const spec of args.specs) {
        const from = args.existing[spec.field];
        const to = args.proposed[spec.field];
        const kind = classify(from, to, spec);
        if (kind === 'same') continue;

        const change: FieldChange = {
            entity: args.entity,
            entityId: args.entityId,
            field: spec.field,
            label: spec.label,
            group: spec.group,
            kind,
            origin: args.origin,
            from, to,
            sourceRef: args.sourceRef,
        };
        (kind === 'fill' ? plan.fills : plan.conflicts).push(change);
    }
}

/** Um objeto de update por entidade, a partir das mudanças escolhidas. */
export function changesToUpdates(changes: FieldChange[]): Map<string, { entity: 'tower' | 'unit'; fields: Record<string, unknown> }> {
    const byEntity = new Map<string, { entity: 'tower' | 'unit'; fields: Record<string, unknown> }>();
    for (const c of changes) {
        if (c.entity !== 'tower' && c.entity !== 'unit') continue;
        const cur = byEntity.get(c.entityId) ?? { entity: c.entity, fields: {} };
        cur.fields[c.field] = c.to;
        byEntity.set(c.entityId, cur);
    }
    return byEntity;
}
